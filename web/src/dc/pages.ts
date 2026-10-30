import "server-only";
import { notFound } from "next/navigation";
import { ROUTES, type RouteDef } from "@/boards/gen/routes";
import { loadBoard, type BoardId, type LoadedBoard } from "@/boards/gen/registry";
import { api, ApiError, safe } from "@/lib/api";
import type { Article, ArticleCard, Layout } from "@/lib/types";
import { bindArticleCards, bindArticleDetail, bindLogin, bindLogout, esc, replaceText } from "./bind";
import type { EnhancerId } from "./enhancers";
import { bindContent, bindEditor, bindStaffHeader } from "./admin-bind";
import { bindMarketDetail, bindQuotes } from "./market-bind";
import type { Quote } from "@/lib/types";
import { adminApi, type AdminArticle } from "@/lib/admin";
import type { SessionUser } from "@/lib/session";

export interface Match {
  route: RouteDef;
  params: Record<string, string>;
}

export function matchRoute(segments: string[]): Match | null {
  for (const r of ROUTES) {
    const parts = r.path.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    parts.forEach((p, i) => {
      const seg = decodeURIComponent(segments[i]!);
      if (p.startsWith("[") && p.endsWith("]")) params[p.slice(1, -1)] = seg;
      else if (p !== seg) ok = false;
    });
    if (ok) return { route: r, params };
  }
  return null;
}

/** Board yang dipakai untuk perangkat ini (dengan cadangan bila desain hanya ada satu versi). */
export function pickBoard(route: RouteDef, layout: Layout): BoardId {
  if (route.admin) return route.admin;
  return (layout === "app" ? route.app ?? route.web : route.web ?? route.app)!;
}

export interface Prepared {
  board: LoadedBoard;
  boardId: BoardId;
  html: string;
  title: string;
  description?: string;
  enhance: EnhancerId[];
  ctx: Record<string, string>;
}

function dedupe(list: (ArticleCard | null | undefined)[]): ArticleCard[] {
  const seen = new Set<string>();
  const out: ArticleCard[] = [];
  for (const a of list) {
    if (a && !seen.has(a.slug)) {
      seen.add(a.slug);
      out.push(a);
    }
  }
  return out;
}

const KNOWN_SYMBOLS = ["BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "GOTO", "ANTM", "ADRO", "UNVR", "ICBP", "INDF", "IHSG", "LQ45", "BTC", "ETH", "BTCUSD", "ETHUSD", "XAUUSD", "USDIDR"];
const SYMBOL_ALIAS: Record<string, string> = { BTC: "BTCUSD", ETH: "ETHUSD" };

/** Baris pasar yang menautkan ke contoh BBCA diarahkan ke simbolnya masing-masing. */
function bindSymbolLinks(html: string): string {
  return html.replace(/<a\b([^>]*?)href="\/market\/BBCA"([^>]*)>([\s\S]*?)<\/a>/g, (whole, pre: string, post: string, inner: string) => {
    const segs = [...inner.matchAll(/>([^<]+)</g)].map((m) => m[1]!.trim());
    const sym = segs.find((t) => KNOWN_SYMBOLS.includes(t));
    if (!sym || sym === "BBCA") return whole;
    return `<a${pre}href="/market/${SYMBOL_ALIAS[sym] ?? sym}"${post}>${inner}</a>`;
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_STATUS = new Set(["review", "scheduled", "revision", "breaking", "draft", "published", "archived"]);

export async function prepare(m: Match, layout: Layout, search: Record<string, string>, user: SessionUser | null = null): Promise<Prepared> {
  const boardId = pickBoard(m.route, layout);
  const board = await loadBoard(boardId);
  let html = board.html;
  let title = board.title;
  let description: string | undefined;
  const enhance: EnhancerId[] = [];
  const ctx: Record<string, string> = {};
  const path = m.route.path;

  // Harga live (Twelve Data lewat API) untuk semua angka pasar di halaman mana pun.
  const quotes = new Map<string, Quote>();
  if (board.kind !== "admin") {
    const ins = await safe(api.instruments(), { data: [] });
    const qs = ins.data.length ? await safe(api.quotes(ins.data.map((i) => i.symbol)), { data: [] }) : { data: [] };
    for (const it of qs.data) if (it.quote) quotes.set(it.instrument.symbol, it.quote);
  }

  // Daftar artikel nyata untuk semua kartu berita di halaman mana pun.
  const home = await safe(api.home(), { top_story: null, latest: [], most_read: [], sections: [] });
  const all = dedupe([home.top_story, ...home.latest, ...home.sections.flatMap((s) => s.articles), ...home.most_read]);

  if (path === "/berita/[slug]") {
    let a: Article;
    try {
      a = await api.article(m.params.slug!);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
    html = bindArticleDetail(html, a);
    const related = await safe(api.related(a.slug), { data: [] });
    html = bindArticleCards(html, dedupe([...related.data, ...all]).filter((x) => x.slug !== a.slug));
    title = a.title;
    description = a.excerpt;
  } else if (path === "/kategori/[slug]") {
    const cats = await safe(api.categories(), { data: [] });
    const cat = cats.data.find((c) => c.slug === m.params.slug);
    if (!cat) notFound();
    const list = await safe(api.articles({ category: cat.slug, limit: 30 }), { data: [] });
    html = html.replace(/(<h1\b[^>]*>)\s*Saham\s*(<\/h1>)/, (_x, o: string, c: string) => `${o}${esc(cat.name)}${c}`);
    html = replaceText(html, "Terbaru di Saham", `Terbaru di ${cat.name}`);
    html = bindArticleCards(html, list.data.length ? list.data : all);
    title = cat.name;
    description = cat.description;
  } else if (path === "/market/[symbol]") {
    const sym = m.params.symbol!.toUpperCase();
    const info = await safe(api.instrument(sym), null);
    if (!info) notFound();
    if (sym !== "BBCA") {
      // Label pendek ala desain (BTC, ETH, XAU, USD/IDR) agar muat di avatar & tabel.
      const short = ({ BTCUSD: "BTC", ETHUSD: "ETH", XAUUSD: "XAU", USDIDR: "USD/IDR" } as Record<string, string>)[sym] ?? sym;
      html = replaceText(html, "BBCA", short);
      html = html.split("Bank Central Asia Tbk").join(esc(info.instrument.name));
      html = html.split("Berita terkait BBCA").join(`Berita terkait ${esc(sym)}`);
    }
    html = bindArticleCards(html, dedupe([...info.news, ...all]));
    if (info.quote) {
      const candles = await safe(api.candles(sym, "1day", 100), { symbol: sym, interval: "1day", data: [] });
      html = bindMarketDetail(html, board.kind === "app" ? "app" : "web", info.instrument, info.quote, candles.data);
    }
    title = `${sym} · ${info.instrument.name}`;
  } else {
    html = bindArticleCards(html, all);
  }
  html = bindSymbolLinks(html);
  html = bindQuotes(html, quotes);

  // Form masuk memanggil API sungguhan.
  if (boardId === "app-03") {
    html = bindLogin(html, "nadia.putri@email.com", "Masuk");
    enhance.push("login");
    ctx.next = search.next ?? "/";
  } else if (boardId === "web-login" && path === "/masuk") {
    html = bindLogin(html, "nadia.putri@email.com", "Masuk");
    enhance.push("login");
    ctx.next = search.next ?? "/";
  } else if (boardId === "admin-login") {
    html = bindLogin(html, "andi@oceanbird.id", "Lanjut");
    enhance.push("login");
    ctx.next = search.next?.startsWith("/admin") ? search.next : "/admin";
    ctx.requireRole = "admin,editor,author";
  }
  // Panel redaksi: data nyata untuk "Tulis artikel" & "Konten".
  if (board.kind === "admin") html = bindStaffHeader(html, user);
  const role = user?.role ?? "reader";
  if (boardId === "admin-editor") {
    const id = search.id && UUID.test(search.id) ? search.id : "";
    const [cats, ins, article] = await Promise.all([
      safe(api.categories(), { data: [] }),
      safe(api.instruments(), { data: [] }),
      id ? adminApi.article(id) : Promise.resolve(null),
    ]);
    if (id && !article) notFound();
    html = bindEditor(html, { article, categories: cats.data, instruments: ins.data, role });
    enhance.push("editor");
    if (article) ctx.id = article.id;
    title = article ? `Edit: ${article.title}` : "Tulis artikel";
  } else if (boardId === "admin-content") {
    const status = CONTENT_STATUS.has(search.status ?? "") ? search.status! : "review";
    const list = (await adminApi.articles(status)) ?? { data: [], counts: {} };
    let selected: AdminArticle | null = null;
    if (search.id && UUID.test(search.id)) selected = list.data.find((x) => x.id === search.id) ?? (await adminApi.article(search.id));
    selected ??= list.data[0] ?? null;
    html = bindContent(html, { list, status, selected, role });
    enhance.push("content");
  }

  html = bindLogout(html);
  if (html.includes("data-logout")) enhance.push("logout");

  return { board, boardId, html, title, description, enhance, ctx };
}

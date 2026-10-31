import "server-only";
import { notFound } from "next/navigation";
import { ROUTES, type RouteDef } from "@/boards/gen/routes";
import { loadBoard, type BoardId, type LoadedBoard } from "@/boards/gen/registry";
import { api, ApiError, safe } from "@/lib/api";
import type { Article, ArticleCard, Layout } from "@/lib/types";
import { bindArticleCards, bindArticleDetail, bindLogin, bindLogout, esc, replaceText } from "./bind";
import type { EnhancerId } from "./enhancers";
import { bindContent, bindEditor, bindStaffHeader } from "./admin-bind";
import { bindAccount, bindLoginExtras, bindRegisterApp, bindRegisterWeb, bindVerify, type OtpMode } from "./auth-bind";
import { bindSearchApp, bindSearchWeb } from "./search-bind";
import { bindAnalysisPage, bindArticleAI, bindMarketAICard, bindPlusReadAI } from "./ai-bind";
import { bindCryptoVolume, bindDataCredits, bindLiveChart, bindMarketDetail, bindQuotes, bindTradingView, LIVE_CHART, TV_SYMBOL } from "./market-bind";
import { bindDetail, hideFakeStatusBar } from "./detail-bind";
import type { Candle, Quote } from "@/lib/types";
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

const KNOWN_SYMBOLS = ["BBCA", "BBRI", "BMRI", "BBNI", "TLKM", "ASII", "GOTO", "ANTM", "ADRO", "UNVR", "ICBP", "INDF", "IHSG", "LQ45", "BTC", "ETH", "SOL", "BTCUSD", "ETHUSD", "SOLUSD", "XAUUSD", "USDIDR", "EUR/IDR", "SGD/IDR", "XAU/USD", "USD/IDR"];
const SYMBOL_ALIAS: Record<string, string> = { BTC: "BTCUSD", ETH: "ETHUSD", SOL: "SOLUSD", "EUR/IDR": "EURIDR", "SGD/IDR": "SGDIDR", "XAU/USD": "XAUUSD", "USD/IDR": "USDIDR" };

/** Baris pasar yang menautkan ke contoh BBCA diarahkan ke simbolnya masing-masing. */
function bindSymbolLinks(html: string): string {
  return html.replace(/<a\b([^>]*?)href="\/market\/BBCA"([^>]*)>([\s\S]*?)<\/a>/g, (whole, pre: string, post: string, inner: string) => {
    const segs = [...inner.matchAll(/>([^<]+)</g)].map((m) => m[1]!.trim());
    const sym = segs.find((t) => KNOWN_SYMBOLS.includes(t));
    if (!sym || sym === "BBCA") return whole;
    return `<a${pre}href="/market/${SYMBOL_ALIAS[sym] ?? sym}"${post}>${inner}</a>`;
  });
}

/** Hanya tautan internal yang boleh dipakai sebagai tujuan setelah masuk (cegah open redirect). */
export function safeNext(v: string | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
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
    const [related, ai] = await Promise.all([safe(api.related(a.slug), { data: [] }), api.articleAI(a.slug)]);
    html = bindArticleAI(html, a, ai);
    html = bindArticleDetail(html, a);
    if (!ai) enhance.push("ai");
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
    // Label pendek ala desain (BTC, ETH, XAU, USD/IDR) agar muat di avatar & tabel.
    const short = ({ BTCUSD: "BTC", ETHUSD: "ETH", SOLUSD: "SOL", BNBUSD: "BNB", XRPUSD: "XRP", DOGEUSD: "DOGE", XAUUSD: "XAU", USDIDR: "USD/IDR", EURIDR: "EUR/IDR", SGDIDR: "SGD/IDR" } as Record<string, string>)[sym] ?? sym;
    if (sym !== "BBCA") {
      html = replaceText(html, "BBCA", short);
      html = html.split("Bank Central Asia Tbk").join(esc(info.instrument.name));
      for (const t of ["Berita terkait BBCA", "Semua berita BBCA", "Layout BBCA", "Buat BBCA"]) html = html.split(t).join(esc(t.replace("BBCA", short)));
    }
    html = bindArticleCards(html, dedupe([...info.news, ...all]));
    const [candleRes, mai] = await Promise.all([
      info.quote ? safe(api.candles(sym, "1day", 260), { symbol: sym, interval: "1day", data: [] }) : Promise.resolve({ data: [] as Candle[] }),
      board.kind === "app" ? api.marketAI(sym) : Promise.resolve(null),
    ]);
    const candles = candleRes.data;
    if (board.kind === "app") {
      html = bindMarketAICard(html, sym, mai);
      if (!mai) enhance.push("ai");
    }
    if (info.quote) html = bindMarketDetail(html, board.kind === "app" ? "app" : "web", info.instrument, info.quote, candles);
    html = bindDetail(html, board.kind === "app" ? "app" : "web", { inst: info.instrument, quote: info.quote, candles, short });
    // Grafik interaktif tanpa logo (Lightweight Charts) dengan data nyata: kripto real-time dari Binance,
    // emas & valas dari Twelve Data. Saham IDX memakai widget TradingView sampai ada sumber data IDX.
    const tv = TV_SYMBOL[sym];
    if (LIVE_CHART.has(sym)) {
      html = bindLiveChart(html, board.kind === "app" ? "app" : "web", info.instrument, info.quote);
      enhance.push("lwchart");
    } else if (tv) {
      html = bindTradingView(html, board.kind === "app" ? "app" : "web", tv);
      enhance.push("tvchart");
    }
    title = `${sym} · ${info.instrument.name}`;
  } else if (path === "/cari") {
    const q = (search.q ?? "").trim().slice(0, 80);
    const [res, ins] = await Promise.all([q ? safe(api.search(q), null) : Promise.resolve(null), q ? Promise.resolve({ data: [] }) : safe(api.instruments(), { data: [] })]);
    const data = { q, res, quotes, popular: { instruments: ins.data.slice(0, 6), articles: home.latest.slice(0, 6) } };
    html = board.kind === "app" ? bindSearchApp(html, data) : bindSearchWeb(html, data);
    enhance.push("search");
    title = q ? `Cari “${q}”` : "Cari";
  } else if (path === "/plus/baca" || path === "/plus/analisis") {
    // Analisis AI lengkap untuk berita (?a=slug) atau instrumen (?symbol=BTCUSD); bawaan: berita utama terbaru.
    const symbol = (search.symbol ?? "").toUpperCase();
    if (path === "/plus/analisis" && /^[A-Z0-9]{2,12}$/.test(symbol)) {
      const info = await safe(api.instrument(symbol), null);
      if (!info) notFound();
      const ai = await api.marketAI(symbol);
      html = bindAnalysisPage(html, ai, { kind: "market", title: `${info.instrument.symbol} · ${info.instrument.name}`, href: `/market/${symbol}`, symbol });
      title = `Analisis AI ${symbol}`;
    } else {
      const slug = search.a && /^[a-z0-9-]{1,200}$/.test(search.a) ? search.a : (home.top_story ?? all[0])?.slug;
      const a = slug ? await safe(api.article(slug), null) : null;
      if (a) {
        const ai = await api.articleAI(a.slug);
        if (path === "/plus/baca") {
          html = bindPlusReadAI(html, a, ai);
          html = bindArticleDetail(html, a);
        } else {
          html = bindAnalysisPage(html, ai, { kind: "article", title: a.title, href: `/berita/${a.slug}`, image: a.cover_url, slug: a.slug });
        }
        title = `Analisis AI · ${a.title}`;
      }
    }
    if (path === "/plus/baca") html = bindArticleCards(html, all);
    enhance.push("ai");
  } else {
    html = bindArticleCards(html, all);
  }
  html = bindSymbolLinks(html);
  html = bindQuotes(html, quotes);
  html = bindCryptoVolume(html, quotes);
  html = bindDataCredits(html);

  // Form masuk memanggil API sungguhan.
  const nextUrl = safeNext(search.next);
  if (boardId === "app-03" || (boardId === "web-login" && path === "/masuk")) {
    html = bindLogin(html, "nadia.putri@email.com", "Masuk");
    html = bindLoginExtras(html);
    enhance.push("login", "auth");
    ctx.next = nextUrl;
  } else if (path === "/daftar") {
    html = boardId === "app-24" ? bindRegisterApp(html) : bindRegisterWeb(html);
    enhance.push("auth");
    ctx.next = nextUrl;
  } else if (boardId === "app-04") {
    const email = (search.email ?? "").trim().toLowerCase();
    const mode: OtpMode = search.mode === "login" || search.mode === "reset" ? search.mode : "signup";
    html = bindVerify(html, { email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : "", mode, next: nextUrl });
    enhance.push("auth");
    title = mode === "reset" ? "Atur ulang kata sandi" : "Verifikasi kode";
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

  if (user && board.kind !== "admin") html = bindAccount(html, user);
  if (board.kind === "app") html = hideFakeStatusBar(html);
  html = bindLogout(html);
  if (html.includes("data-logout")) enhance.push("logout");

  return { board, boardId, html, title, description, enhance, ctx };
}

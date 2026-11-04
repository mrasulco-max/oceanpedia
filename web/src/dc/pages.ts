import "server-only";
import { notFound, redirect } from "next/navigation";
import { ROUTES, type RouteDef } from "@/boards/gen/routes";
import { loadBoard, type BoardId, type LoadedBoard } from "@/boards/gen/registry";
import { api, ApiError, safe } from "@/lib/api";
import type { Article, ArticleCard, Layout } from "@/lib/types";
import { bindArticleCards, bindArticleDetail, bindLogin, bindLogout, esc, replaceText } from "./bind";
import type { EnhancerId } from "./enhancers";
import { bindContent, bindEditor, bindStaffHeader, type Staff } from "./admin-bind";
import { bindRoles } from "./rbac-bind";
import { bindCategories, bindCategoryForm, catIcons } from "./cms-bind";
import { bindActivity, bindComments, bindMedia } from "./mod-bind";
import { bindAds, bindTwoFactor, bindUsers, bindMarket, bindSymbol, MARKET_TABS, type FeedStatus } from "./ops-bind";
import { bindAccount, bindStaffExpired, bindStaffForgot, bindStaffReset, bindLoginExtras, bindRegisterApp, bindRegisterWeb, bindVerify, type OtpMode } from "./auth-bind";
import { bindSearchApp, bindSearchWeb } from "./search-bind";
import { bindProfileApp, bindProfileWeb, bindSettingsApp, settingsState } from "./profile-bind";
import { getAlerts, getBookmarks, getNotifications, getUnread, getProfile, getSessions, getWatchlist, meGetJSON } from "@/lib/me";
import { bindAdSlots, removeAdSlots, bindAlert, bindAuthor, bindTopic, bindArticleSocialApp, bindArticleSocialWeb, bindCalendarApp, bindCalendarWeb, bindNotifications, bindSaved, bindWatchlistApp, bindWatchlistWeb } from "./reader-bind";
import { bindDashboard, bindScreener, bindLivePublic, bindNewsletterPublic, bindShorts, bindLiveAdmin, bindVersions, feedPanel, newsletterPanel, replaceBody, reportsPanel, searchPanel, settingsPanel, shortsAdminPanel, type ShortRow } from "./newsroom-bind";
import { bindCheckout, bindPaid, bindPlusPlans, bindReceipt, bindWaiting, type BillInfo, type CheckoutCfg, type SubInfo } from "./plus-bind";
import { bindAnalysisPage, bindArticleAI, bindMarketAICard, bindPlusReadAI } from "./ai-bind";
import { bindCryptoVolume, bindDataCredits, bindMarketApp, bindLiveChart, bindMarketDetail, bindQuotes, bindTradingView, LIVE_CHART, TV_SYMBOL } from "./market-bind";
import { bindDetail, hideFakeStatusBar } from "./detail-bind";
import { bindCoinLogos } from "./kit";
import { bindContentExtras, bindDetailCards, bindLiveExtras, deAlur, requestsPanel } from "./admin-wire-bind";
import { bindAds as bindAdsPage, bindAuthorExtras, bindCacheClear, bindCategoryExtras, bindHelp, bindMarketWebExtras, bindPrivacy, bindRetry, bindStudent } from "./wire-bind";
import type { Candle, Quote } from "@/lib/types";
import { adminApi, type AdminArticle } from "@/lib/admin";
import { hasPlus, sessionToken, type SessionUser } from "@/lib/session";

/** Tombol melayang "Asisten AI" (khusus Plus) di halaman yang paling sering dibuka. */
const AI_FAB_PATHS = new Set(["/", "/market", "/market/[symbol]", "/berita/[slug]", "/watchlist"]);
function aiFab(app: boolean): string {
  const bottom = app ? "calc(92px + env(safe-area-inset-bottom))" : "24px";
  return `<a href="/ai" data-ai-fab aria-label="Buka Asisten AI" style="position: fixed; right: 16px; bottom: ${bottom}; z-index: 40; display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 999px; background: linear-gradient(110deg,#2563EB 0%,#4285F4 50%,#2563EB 100%); color: #FFFFFF; font-size: 14px; font-weight: 500; text-decoration: none; box-shadow: 0 8px 24px rgba(37,99,235,.35)"><span aria-hidden="true">✦</span>Asisten AI</a>`;
}

/** Footer web: semua tautan menuju halaman nyata; ikon media sosial tanpa akun resmi disembunyikan. */
const FOOT_CAT: Record<string, string> = { Saham: "/kategori/saham", Komoditas: "/kategori/komoditas", Crypto: "/kategori/crypto", Forex: "/kategori/forex", Ekonomi: "/kategori/ekonomi", Analisis: "/kategori/analisis" };
const FOOT_MKT: Record<string, string> = { "Saham IDX": "/screener?urut=saham", Crypto: "/screener?urut=crypto", Forex: "/screener?urut=forex", Komoditas: "/screener?urut=komoditas", "Kalender ekonomi": "/kalender", Screener: "/screener" };
const FOOT_ETC: Record<string, string> = { "Tentang kami": "/tentang", Redaksi: "/tentang#redaksi", "Pasang iklan": "/iklan", Karier: "mailto:help@jalaexplorer.com?subject=Karier%20OceanBird", Kontak: "/bantuan#kontak", "Pusat bantuan": "/bantuan", "Pedoman media siber": "/legal#syarat", "Syarat &amp; Ketentuan": "/legal#syarat", "Kebijakan Privasi": "/legal#privasi", Disclaimer: "/legal#disclaimer" };
export function bindFooter(html: string): string {
  const fs = html.lastIndexOf("<footer");
  if (fs < 0) return html;
  let f = html.slice(fs);
  f = f.replace(/<a [^>]*aria-label="(Instagram|X|YouTube|LinkedIn|Facebook|TikTok)"[^>]*href="#"[^>]*>[\s\S]*?<\/a>|<a [^>]*href="#"[^>]*aria-label="(Instagram|X|YouTube|LinkedIn|Facebook|TikTok)"[^>]*>[\s\S]*?<\/a>/g, "");
  // Kolom "Market" dulu (label Crypto/Forex/Komoditas juga ada di kolom Kategori).
  f = f.replace(/(<strong[^>]*>Market<\/strong>)([\s\S]*?)(<\/div>)/, (_m, a: string, body: string, c: string) => a + body.replace(/<a([^>]*)href="#"([^>]*)>([^<]+)<\/a>/g, (x, p1: string, p2: string, lab: string) => (FOOT_MKT[lab] ? `<a${p1}href="${FOOT_MKT[lab]}"${p2}>${lab}</a>` : x)) + c);
  f = f.replace(/<a([^>]*)href="#"([^>]*)>([^<]+)<\/a>/g, (x, p1: string, p2: string, lab: string) => {
    const to = FOOT_CAT[lab] ?? FOOT_ETC[lab] ?? FOOT_MKT[lab];
    return to ? `<a${p1}href="${to}"${p2}>${lab}</a>` : x;
  });
  return html.slice(0, fs) + f;
}

/** Lembar bagikan & tombol bagikan: kanal nyata + tautan halaman ini (ditangani enhancer "share"). */
export function bindShare(html: string, url: string): string {
  const CH: Record<string, string> = { WhatsApp: "wa", Telegram: "tg", X: "x", "Salin tautan": "copy" };
  let h = html.replace(/<button onClick="\{\{ (f\d+) \}\}"(?![^>]*data-sh-share)([^>]*)>((?:(?!<\/button>)[\s\S])*?)(WhatsApp|Telegram|X|Salin tautan)<\/button>/g, (_m, f: string, a: string, inner: string, lab: string) => `<button onClick="{{ ${f} }}" data-share="${CH[lab]}"${a}>${inner}${lab}</button>`);
  h = h.split(">oceanpedia.id/berita/ihsg-menguat-perbankan<").join(`>${esc(url.replace(/^https?:\/\//, ""))}<`);
  // Web: tombol bagikan & salin tautan.
  h = h.replace(/<a href="#" aria-label="Bagikan"/g, '<a href="#" data-share="native" aria-label="Bagikan"').replace(/<a href="#" aria-label="Salin tautan"/g, '<a href="#" data-share="copy" aria-label="Salin tautan"');
  h = h.replace(/<button onClick="\{\{ share \}\}"/g, '<button onClick="{{ share }}" data-share="native"');
  return h;
}

/** Ikon lonceng di header: angka/titik merah hanya bila ada notifikasi belum dibaca. */
export function bindBell(html: string, unread: number, href: string): string {
  return html.replace(/<a [^>]*aria-label="Notifikasi(?:, \d+ baru)?"[^>]*>[\s\S]*?<\/a>/g, (a) => {
    let h = a.replace(/href="#"/, `href="${href}"`).replace(/aria-label="Notifikasi(?:, \d+ baru)?"/, unread ? `aria-label="Notifikasi, ${unread} baru"` : 'aria-label="Notifikasi"');
    // Lencana angka (aplikasi) dan titik merah (web/admin).
    h = h.replace(/(<span style="position: absolute;[^"]*border-radius: 999px;[^"]*">)\d+(<\/span>)/, unread ? `$1${unread > 99 ? "99+" : unread}$2` : "");
    if (!unread) h = h.replace(/<span style="position: absolute;[^"]*width: 8px; height: 8px;[^"]*"><\/span>/, "");
    return h;
  });
}

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

  const token = user ? await sessionToken() : undefined;
  const plus = hasPlus(user);
  if (path === "/berita/[slug]") {
    let a: Article;
    try {
      a = await api.article(m.params.slug!, token ? { token } : undefined);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
    const [related, ai] = await Promise.all([safe(api.related(a.slug), { data: [] }), plus ? api.articleAI(a.slug, token) : Promise.resolve(null)]);
    html = bindArticleAI(html, a, ai, !plus);
    html = bindArticleDetail(html, a);
    if (plus && !ai) enhance.push("ai");
    html = bindArticleCards(html, dedupe([...related.data, ...all]).filter((x) => x.slug !== a.slug));
    {
      const [cm, rx, bms] = await Promise.all([
        safe(api.comments(a.slug), { data: [] }),
        safe(api.reactions(a.slug), { data: [] }),
        user ? getBookmarks() : Promise.resolve(null),
      ]);
      const reactions: Record<string, number> = {};
      for (const r of rx.data) reactions[r.kind] = r.count;
      const social = { loggedIn: !!user, me: user ? { name: user.full_name, email: user.email } : null, comments: cm.data, reactions, bookmarked: !!bms?.some((b) => b.slug === a.slug), slug: a.slug };
      html = board.kind === "app" ? bindArticleSocialApp(html, social) : bindArticleSocialWeb(html, social);
      if (board.kind === "app" && social.bookmarked) ctx.state = JSON.stringify({ u: { u1: [true] } });
      enhance.push("reader");
    }
    title = a.title;
    description = a.excerpt;
  } else if (path === "/penulis/[slug]") {
    let r: Awaited<ReturnType<typeof api.author>>;
    try {
      r = await api.author(m.params.slug!);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
    html = bindAuthor(html, { author: r.author, articles: r.articles });
    const fst = await safe(api.followStat("author", r.author.slug, token), { following: false, followers: 0 });
    html = bindAuthorExtras(html, { slug: r.author.slug, followers: fst.followers, following: fst.following, loggedIn: !!user, app: board.kind === "app" });
    if (board.kind === "app") ctx.state = JSON.stringify({ u: { u6: [fst.following], u7: [fst.following] } });
    title = r.author.name;
    description = r.author.bio || `${r.author.name} · ${r.author.title}`;
  } else if (path === "/topik/[slug]") {
    let r: Awaited<ReturnType<typeof api.topic>>;
    try {
      r = await api.topic(m.params.slug!);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
    const syms = r.topic.symbols ?? [];
    const [ins, qs, pr] = await Promise.all([
      syms.length ? safe(api.instruments(), { data: [] }) : Promise.resolve({ data: [] }),
      syms.length ? safe(api.quotes(syms), { data: [] }) : Promise.resolve({ data: [] }),
      user ? getProfile() : Promise.resolve(null),
    ]);
    const following = !!pr?.profile.topics.some((t) => t.slug === r.topic.slug);
    html = bindTopic(html, {
      topic: { ...r.topic, following },
      articles: r.articles,
      quotes: syms.map((sym) => ({ inst: ins.data.find((i) => i.symbol === sym) ?? qs.data.find((q) => q.instrument.symbol === sym)?.instrument, quote: qs.data.find((q) => q.instrument.symbol === sym)?.quote ?? null })).filter((x): x is { inst: NonNullable<typeof x.inst>; quote: typeof x.quote } => !!x.inst),
      related: r.topic.related ?? [],
      loggedIn: !!user,
    });
    if (board.kind === "app") ctx.state = JSON.stringify({ u: { u7: [following] } });
    enhance.push("reader");
    title = `#${r.topic.name}`;
    description = `Berita dan analisis terbaru seputar ${r.topic.name}.`;
  } else if (path === "/kategori/[slug]") {
    const cats = await safe(api.categories(), { data: [] });
    const cat = cats.data.find((c) => c.slug === m.params.slug);
    if (!cat) notFound();
    const cursor = search.sebelum && !Number.isNaN(Date.parse(search.sebelum)) ? search.sebelum : "";
    const [list, fst] = await Promise.all([
      safe(api.articles({ category: cat.slug, limit: 30, cursor }), { data: [], next_cursor: null }),
      safe(api.followStat("category", cat.slug, token), { following: false, followers: 0 }),
    ]);
    html = html.replace(/(<h1\b[^>]*>)\s*Saham\s*(<\/h1>)/, (_x, o: string, c: string) => `${o}${esc(cat.name)}${c}`);
    html = replaceText(html, "Terbaru di Saham", `Terbaru di ${cat.name}`);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    html = bindCategoryExtras(html, { slug: cat.slug, followers: fst.followers, following: fst.following, loggedIn: !!user, total: cat.article_count, today: list.data.filter((a) => new Date(new Date(a.published_at).getTime() + 7 * 3600_000).toISOString().slice(0, 10) === today).length, nextCursor: list.next_cursor ?? null, cursor: cursor || null, app: board.kind === "app" });
    if (board.kind === "app") ctx.state = JSON.stringify({ u: { u3: [fst.following] } });
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
      board.kind === "app" && plus ? api.marketAI(sym, token) : Promise.resolve(null),
    ]);
    const candles = candleRes.data;
    if (board.kind === "app") {
      html = bindMarketAICard(html, sym, mai, !plus);
      if (plus && !mai) enhance.push("ai");
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
  } else if (path === "/akun" || path === "/pengaturan") {
    // Profil & pengaturan: data akun asli (halaman ini wajib masuk).
    const [pr, sessions] = await Promise.all([getProfile(), path === "/pengaturan" ? getSessions() : Promise.resolve([])]);
    if (pr) {
      if (boardId === "app-20") html = bindProfileApp(html, pr.profile);
      else if (boardId === "web-akun") html = bindProfileWeb(html, pr.profile, pr.alert_limit);
      else if (boardId === "app-21") {
        html = bindSettingsApp(html, pr.profile, sessions);
        ctx.state = settingsState(pr.profile);
      }
      enhance.push("profile");
    }
    html = bindArticleCards(html, all);
    title = path === "/akun" ? "Akun" : "Pengaturan";
  } else if (path === "/live") {
    const live = await api.live().catch(() => null);
    html = bindLivePublic(html, live, board.kind === "app");
    title = live ? `Live: ${live.title}` : "Live";
  } else if (path === "/short") {
    const list = await safe(api.shorts(token), { data: [] });
    const cur = list.data.find((x) => x.id === search.v) ?? list.data[0];
    const cm = cur ? await safe(api.shortComments(cur.id, token), { data: [] }) : { data: [] };
    html = bindShorts(html, list.data, search.v ?? "", board.kind === "app", { loggedIn: !!user, me: user?.full_name ?? "", comments: cm.data, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "" });
    if (board.kind === "app" && cur) ctx.state = JSON.stringify({ u: { u6: [cur.liked], u7: [cur.saved] } });
    enhance.push("reader", "shorts");
    title = "Ocean Short";
  } else if (path === "/newsletter") {
    html = bindNewsletterPublic(html, { email: user?.email ?? "", status: search.berhenti === "ok" || search.berhenti === "invalid" ? search.berhenti : null });
    enhance.push("reader");
    title = "Newsletter";
  } else if (path === "/plus") {
    const [plans, sub] = await Promise.all([safe(api.plans(), { data: [], tax_rate: 0.11 }), user ? meGetJSON<{ data: SubInfo | null }>("/v1/billing/subscription") : Promise.resolve(null)]);
    html = bindPlusPlans(html, { plans: plans.data, sub: sub?.data ?? null, tax: plans.tax_rate });
    const stu = user ? await meGetJSON<{ status: string; verified: boolean }>("/v1/me/student") : null;
    html = bindStudent(html, { loggedIn: !!user, status: stu?.status ?? "", verified: !!stu?.verified });
    enhance.push("plus");
    title = "Ocean Pedia Plus";
  } else if (path === "/plus/checkout") {
    const plans = await safe(api.plans(), { data: [], tax_rate: 0.11 });
    const want = ["student", "essential", "corporate"].includes(search.plan ?? "") ? search.plan! : "essential";
    const monthly = plans.data.find((p) => p.code === want) ?? plans.data.find((p) => p.code === "essential");
    if (!monthly) notFound();
    const yearly = plans.data.find((p) => p.code === `${monthly.code}_yearly`) ?? null;
    const pr = user ? await getProfile() : null;
    const cfg: CheckoutCfg = {
      monthly: { code: monthly.code, name: monthly.name, price: monthly.price_amount, seats: monthly.min_seats },
      yearly: yearly ? { code: yearly.code, price: yearly.price_amount } : null,
      tax: plans.tax_rate,
      promo: monthly.code === "essential" ? { code: "PLUSBARU", first: 9900 } : null,
      loggedIn: !!user,
    };
    html = bindCheckout(html, cfg, { email: pr?.profile.email ?? user?.email ?? "", phone: pr?.profile.phone ?? null, features: monthly.features });
    ctx.plus = JSON.stringify(cfg);
    ctx.state = JSON.stringify({ promo: !!cfg.promo, method: 0 });
    enhance.push("plus");
    title = `Checkout ${monthly.name}`;
  } else if (path === "/plus/menunggu-pembayaran" || path === "/plus/berhasil" || path === "/plus/email" || path === "/plus/whatsapp") {
    if (!user) redirect(`/masuk?next=${encodeURIComponent(path + (search.inv ? `?inv=${search.inv}` : ""))}`);
    const id = /^[0-9a-f-]{36}$/.test(search.inv ?? "") ? search.inv! : null;
    let bill = id ? await meGetJSON<BillInfo>(`/v1/billing/invoices/${id}`) : null;
    if (!bill) {
      const list = (await meGetJSON<{ data: BillInfo[] }>("/v1/billing/invoices"))?.data ?? [];
      bill = (path === "/plus/menunggu-pembayaran" ? list.find((b) => b.status === "open") : list.find((b) => b.status === "paid")) ?? list[0] ?? null;
    }
    if (!bill) redirect("/plus");
    if (path === "/plus/menunggu-pembayaran" && bill.status === "paid") redirect(`/plus/berhasil?inv=${bill.id}`);
    const pr = await getProfile();
    const me = { name: pr?.profile.full_name ?? user.full_name ?? "", email: pr?.profile.email ?? user.email, phone: pr?.profile.phone ?? null };
    if (path === "/plus/menunggu-pembayaran") {
      html = bindWaiting(html, bill);
      const left = bill.pay_expires_at ? Math.max(0, Math.floor((new Date(bill.pay_expires_at).getTime() - Date.now()) / 1000)) : 0;
      ctx.state = JSON.stringify({ left });
    } else if (path === "/plus/berhasil") html = bindPaid(html, bill, me);
    else html = bindReceipt(html, bill, me);
    ctx.inv = bill.id;
    ctx.invStatus = bill.status;
    enhance.push("plus");
    title = path === "/plus/menunggu-pembayaran" ? "Menunggu pembayaran" : `Invoice ${bill.number}`;
  } else if (path === "/plus/baca" || path === "/plus/analisis") {
    // Analisis AI lengkap untuk berita (?a=slug) atau instrumen (?symbol=BTCUSD); bawaan: berita utama terbaru.
    // Khusus pelanggan Plus: tamu diminta masuk, akun gratis diarahkan ke halaman paket.
    if (!plus) redirect(user ? "/plus?fitur=ai" : `/masuk?next=${encodeURIComponent(path + (search.a ? `?a=${search.a}` : search.symbol ? `?symbol=${search.symbol}` : ""))}`);
    const symbol = (search.symbol ?? "").toUpperCase();
    if (path === "/plus/analisis" && /^[A-Z0-9]{2,12}$/.test(symbol)) {
      const info = await safe(api.instrument(symbol), null);
      if (!info) notFound();
      const ai = await api.marketAI(symbol, token);
      html = bindAnalysisPage(html, ai, { kind: "market", title: `${info.instrument.symbol} · ${info.instrument.name}`, href: `/market/${symbol}`, symbol });
      title = `Analisis AI ${symbol}`;
    } else {
      const slug = search.a && /^[a-z0-9-]{1,200}$/.test(search.a) ? search.a : (home.top_story ?? all[0])?.slug;
      const a = slug ? await safe(api.article(slug, { token }), null) : null;
      if (a) {
        const ai = await api.articleAI(a.slug, token);
        if (path === "/plus/baca") {
          html = bindPlusReadAI(html, a, ai);
          html = bindArticleDetail(html, a);
          const [cm, rx, bms] = await Promise.all([safe(api.comments(a.slug), { data: [] }), safe(api.reactions(a.slug), { data: [] }), user ? getBookmarks() : Promise.resolve(null)]);
          const reactions: Record<string, number> = {};
          for (const r of rx.data) reactions[r.kind] = r.count;
          const social = { loggedIn: !!user, me: user ? { name: user.full_name, email: user.email } : null, comments: cm.data, reactions, bookmarked: !!bms?.some((b) => b.slug === a.slug), slug: a.slug };
          html = bindArticleSocialApp(html, social);
          enhance.push("reader");
        } else {
          html = bindAnalysisPage(html, ai, { kind: "article", title: a.title, href: `/berita/${a.slug}`, image: a.cover_url, slug: a.slug });
        }
        title = `Analisis AI · ${a.title}`;
      }
    }
    if (path === "/plus/baca") html = bindArticleCards(html, all);
    enhance.push("ai");
  } else if (path === "/watchlist") {
    const items = user ? (await getWatchlist()) ?? [] : [];
    const [alerts, pr, qs, news, sparks] = await Promise.all([
      user ? getAlerts() : Promise.resolve([]),
      user ? getProfile() : Promise.resolve(null),
      items.length ? safe(api.quotes(items.map((i) => i.symbol)), { data: [] }) : Promise.resolve({ data: [] }),
      items.length ? safe(api.articles({ symbols: items.map((i) => i.symbol).join(","), limit: 6 }), { data: [] }) : Promise.resolve({ data: [] }),
      Promise.all(items.slice(0, 20).map(async (i) => [i.symbol, (await safe(api.candles(i.symbol, "1day", 8), { symbol: i.symbol, interval: "1day", data: [] })).data.map((c) => c.c)] as [string, number[]])),
    ]);
    const qm = new Map(quotes);
    for (const it of qs.data) if (it.quote) qm.set(it.instrument.symbol, it.quote);
    const d = { loggedIn: !!user, items, quotes: qm, alerts: alerts ?? [], sparks: new Map(sparks), news: news.data, alertLimit: pr?.alert_limit ?? 3 };
    html = board.kind === "app" ? bindWatchlistApp(html, d) : bindWatchlistWeb(html, d);
    enhance.push("reader");
    title = "Watchlist";
  } else if (path === "/alert") {
    const ins = await safe(api.instruments(), { data: [] });
    const wl = user ? (await getWatchlist()) ?? [] : [];
    const want = (search.symbol ?? wl[0]?.symbol ?? "BBCA").toUpperCase();
    const inst = ins.data.find((i) => i.symbol === want) ?? ins.data.find((i) => i.symbol === "BBCA") ?? ins.data[0];
    if (!inst) notFound();
    const [qs, cs, alerts, pr] = await Promise.all([
      safe(api.quotes([inst.symbol]), { data: [] }),
      safe(api.candles(inst.symbol, "1day", 30), { symbol: inst.symbol, interval: "1day", data: [] }),
      user ? getAlerts() : Promise.resolve([]),
      user ? getProfile() : Promise.resolve(null),
    ]);
    html = bindAlert(html, {
      loggedIn: !!user,
      inst,
      quote: qs.data[0]?.quote ?? quotes.get(inst.symbol) ?? null,
      closes: cs.data.map((c) => c.c),
      alerts: alerts ?? [],
      limit: pr?.alert_limit ?? 3,
      email: pr?.profile.email ?? "",
      phone: pr?.profile.phone ?? null,
      plan: !!pr?.profile.plan,
      instruments: ins.data,
    });
    enhance.push("reader");
    title = `Price alert ${inst.symbol}`;
  } else if (path === "/tersimpan") {
    const [bms, savedShorts] = user ? await Promise.all([getBookmarks(), meGetJSON<{ data: ShortRow[] }>("/v1/me/shorts/saved")]) : [null, null];
    html = bindSaved(html, { loggedIn: !!user, items: bms ?? [], shorts: savedShorts?.data ?? [] });
    enhance.push("reader");
    title = "Tersimpan";
  } else if (path === "/notifikasi") {
    const n = user ? await getNotifications() : null;
    html = bindNotifications(html, { loggedIn: !!user, list: n?.data ?? [], counts: n?.counts ?? {} });
    if (n && !n.unread) ctx.state = JSON.stringify({ read: true });
    enhance.push("reader");
    title = "Notifikasi";
  } else if (path === "/screener") {
    const ins = await safe(api.instruments(), { data: [] });
    const syms = ins.data.map((i) => i.symbol);
    const qs = syms.length ? await safe(api.quotes(syms.slice(0, 60)), { data: [] }) : { data: [] };
    const qm = new Map(quotes);
    for (const it of qs.data) if (it.quote) qm.set(it.instrument.symbol, it.quote);
    const tab = ["gainer", "loser", "saham", "crypto", "forex", "komoditas"].includes(search.urut ?? "") ? search.urut! : "gainer";
    html = bindScreener(html, ins.data.map((i) => ({ symbol: i.symbol, name: i.name, asset_class: i.asset_class, exchange: i.exchange, currency: i.currency, price: qm.get(i.symbol)?.price ?? null, change: qm.get(i.symbol)?.change_percent ?? null, closes: [] })), tab);
    title = "Screener & Top Movers";
  } else if (path === "/kalender") {
    const wib = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
    const today = wib(new Date());
    const sel = /^\d{4}-\d{2}-\d{2}$/.test(search.d ?? "") ? search.d! : today;
    const selDate = new Date(`${sel}T12:00:00+07:00`);
    const dow = (selDate.getUTCDay() + 6) % 7;
    const week = Array.from({ length: 7 }, (_, i) => wib(new Date(selDate.getTime() + (i - dow) * 86400000)));
    const [ev, rem] = await Promise.all([safe(api.eventsWeek(week[0]!), { data: [] }), user ? meGetJSON<{ data: string[] }>("/v1/me/reminders") : Promise.resolve(null)]);
    const d = { week, selected: sel, events: ev.data, reminders: new Set(rem?.data ?? []), loggedIn: !!user, country: ["ID", "US", "CN", "high"].includes(search.negara ?? "") ? search.negara! : "" };
    if (board.kind === "app") {
      html = bindCalendarApp(html, d);
      const idx = week.indexOf(sel);
      ctx.state = JSON.stringify({ u: { u1: week.map((_, i) => i === idx) } });
    } else {
      html = bindCalendarWeb(html, { ...d, prevWeek: wib(new Date(selDate.getTime() - 7 * 86400000)), nextWeek: wib(new Date(selDate.getTime() + 7 * 86400000)) });
    }
    enhance.push("reader");
    title = "Kalender Ekonomi";
  } else {
    html = bindArticleCards(html, all);
  }
  if (path === "/market" && board.kind === "app") {
    const ins = await safe(api.instruments(), { data: [] });
    html = bindMarketApp(html, ins.data, quotes);
    enhance.push("mkt");
  }
  html = bindSymbolLinks(html);
  html = bindQuotes(html, quotes);
  html = bindCryptoVolume(html, quotes);
  html = bindDataCredits(html);
  if (board.kind !== "admin" && plus) {
    // Pelanggan Plus: tanpa iklan + tombol cepat Asisten AI.
    html = removeAdSlots(html);
    if (AI_FAB_PATHS.has(path)) html += aiFab(board.kind === "app");
  } else if (board.kind !== "admin" && html.includes('role="complementary" aria-label="Iklan ')) {
    const pageKey = path === "/" ? "home" : path.startsWith("/berita/") ? "article" : path.startsWith("/kategori/") ? "category" : path === "/legal" ? "legal" : "other";
    const slots = await safe(api.ads(board.kind === "app" ? "app" : "web", pageKey), { data: [] });
    html = bindAdSlots(html, slots.data);
    if (html.includes("data-ad-imp") && !enhance.includes("reader")) enhance.push("reader");
  }

  // Admin: sub-menu Konten mendapat tab "Ocean Short".
  if (board.kind === "admin" && html.includes('href="/admin/live"')) {
    const onShort = boardId === "admin-live" && search.tab === "short";
    const ON = "flex: none; min-height: 42px; display: flex; align-items: center; font-size: 14px; font-weight: 500; color: #2F74EB; border-bottom: 2px solid #4285F4";
    const OFF = "flex: none; min-height: 42px; display: flex; align-items: center; font-size: 14px; font-weight: 400; color: #5F6B7D; border-bottom: 2px solid transparent";
    html = html.replace(/<a href="\/admin\/live"( aria-current=page)? style="[^"]*">Breaking &(?:amp;)? live<\/a>/, (m) =>
      (onShort ? `<a href="/admin/live" style="${OFF}">Breaking &amp; live</a>` : m) + `<a href="/admin/live?tab=short"${onShort ? " aria-current=page" : ""} style="${onShort ? ON : OFF}">Ocean Short</a>`,
    );
  }

  // Logo crypto & emas pada lencana simbol.
  html = bindCoinLogos(html);

  // Fitur pembaca lain yang dulu hanya tiruan desain.
  if (path === "/market" && board.kind === "web") html = bindMarketWebExtras(html, !!user);
  if (path === "/offline" || boardId === "web-error") html = bindRetry(html);
  if (path === "/bantuan") html = bindHelp(html);
  if (path === "/iklan") html = bindAdsPage(html, await safe(api.publicStats(), { articles: 0, views: 0, newsletter: 0, readers: 0 }));
  if (path === "/legal" && board.kind === "app") html = bindPrivacy(html, !!user);
  if (path === "/pengaturan") html = bindCacheClear(html);
  if (path === "/") html = html.replace(/<a href="#" role="tab" aria-selected="true"/, '<a href="/" role="tab" aria-selected="true"');
  if (path === "/watchlist") html = html.replace(/<a class="wl" href="#"([^>]*)>Lihat semua/, '<a class="wl" href="/market"$1>Lihat semua');
  if (/data-(follow|wl-sym|reload|faq-|adq|student|privacy|cache-clear)/.test(html)) enhance.push("wire");
  if (board.kind === "web") html = bindFooter(html);

  // Bagikan: tautan kanonis halaman ini (halaman Plus membagikan artikel/aset publiknya).
  if (/data-share|>WhatsApp<\/button>|aria-label="Bagikan"|\{\{ share \}\}/.test(html)) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://oceanpedia-web.vercel.app").replace(/\/$/, "");
    let canon = m.route.path.replace(/\[(\w+)\]/g, (_x, k: string) => encodeURIComponent(m.params[k] ?? ""));
    if (path.startsWith("/plus/") && search.a) canon = `/berita/${encodeURIComponent(search.a)}`;
    else if (path.startsWith("/plus/") && search.symbol) canon = `/market/${encodeURIComponent(search.symbol)}`;
    else if (path === "/short" && search.v) canon = `/short?v=${encodeURIComponent(search.v)}`;
    html = bindShare(html, site + canon);
    ctx.shareUrl = site + canon;
    ctx.shareTitle = title;
    if (html.includes("data-share=")) enhance.push("share");
  }

  // Lencana lonceng: jumlah notifikasi belum dibaca yang sebenarnya (bukan angka contoh desain).
  if (html.includes('aria-label="Notifikasi')) {
    const unread = board.kind === "admin" ? (user ? ((await adminApi.feed())?.urgent ?? 0) : 0) : user ? await getUnread() : 0;
    html = bindBell(html, unread, board.kind === "admin" ? "/admin/notifikasi" : "/notifikasi");
  }

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
  } else if (boardId === "admin-login-forgot") {
    html = bindStaffForgot(html);
    enhance.push("auth");
    ctx.resetUrl = "/admin/masuk/sandi-baru";
    title = "Lupa kata sandi";
  } else if (boardId === "admin-login-forgot-sent") {
    redirect(`/admin/masuk/sandi-baru${search.email ? `?email=${encodeURIComponent(search.email)}` : ""}`);
  } else if (boardId === "admin-login-locked") {
    redirect("/admin/masuk");
  } else if (boardId === "admin-login-reset") {
    const email = /^[^\s@]+@[^\s@]+$/.test(search.email ?? "") ? search.email!.toLowerCase() : "";
    html = bindStaffReset(html, email);
    ctx.email = email;
    enhance.push("auth");
    title = "Kata sandi baru";
  } else if (boardId === "admin-login-expired") {
    html = bindStaffExpired(html);
    title = "Sesi berakhir";
  } else if (boardId === "admin-login-2-f-a") {
    const email = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(search.email ?? "") ? search.email! : "";
    if (!email) redirect("/admin/masuk");
    html = bindTwoFactor(html, { email, next: search.next?.startsWith("/admin") ? search.next : "/admin" });
    enhance.push("twofa");
    title = "Verifikasi 2 langkah";
  } else if (boardId === "admin-login") {
    html = bindLogin(html, "andi@oceanbird.id", "Lanjut");
    enhance.push("login");
    ctx.next = search.next?.startsWith("/admin") ? search.next : "/admin";
    ctx.requireStaff = "1";
  }
  // Panel redaksi: data nyata untuk "Tulis artikel" & "Konten".
  if (board.kind === "admin") html = bindStaffHeader(html, user);
  const who: Staff = { id: user?.id ?? "", perms: new Set(user?.permissions ?? []) };
  if (boardId === "admin-editor") {
    const id = search.id && UUID.test(search.id) ? search.id : "";
    const [cats, ins, article] = await Promise.all([
      safe(api.categories(), { data: [] }),
      safe(api.instruments(), { data: [] }),
      id ? adminApi.article(id) : Promise.resolve(null),
    ]);
    if (id && !article) notFound();
    html = bindEditor(html, { article, categories: cats.data, instruments: ins.data, who });
    enhance.push("editor");
    if (article) ctx.id = article.id;
    title = article ? `Edit: ${article.title}` : "Tulis artikel";
  } else if (boardId === "admin-content") {
    const status = CONTENT_STATUS.has(search.status ?? "") ? search.status! : "review";
    const list = (await adminApi.articles(status)) ?? { data: [], counts: {} };
    let selected: AdminArticle | null = null;
    if (search.id && UUID.test(search.id)) selected = list.data.find((x) => x.id === search.id) ?? (await adminApi.article(search.id));
    selected ??= list.data[0] ?? null;
    html = bindContent(html, { list, status, selected, who });
    enhance.push("content");
  } else if (boardId === "admin-overview") {
    const d = await adminApi.dashboard();
    if (d) html = bindDashboard(html, { stats: d.stats, review: d.review, quota: d.quota_daily, me: user?.full_name ?? "" });
    title = "Dashboard";
  } else if (boardId === "admin-versions") {
    const id = search.id && UUID.test(search.id) ? search.id : "";
    if (!id) redirect("/admin/konten");
    const v = await adminApi.versions(id);
    if (!v) notFound();
    html = bindVersions(html, { article: v.article, list: v.data, cmp: search.cmp && UUID.test(search.cmp) ? search.cmp : null });
    enhance.push("newsroom");
    title = `Riwayat versi · ${v.article.title}`;
  } else if (boardId === "admin-live" && search.tab === "short") {
    const filter = ["pending", "visible", "hidden"].includes(search.komentar ?? "") ? search.komentar! : "";
    const [sl, sc] = await Promise.all([adminApi.shorts(), adminApi.shortComments(filter)]);
    if (!sl) notFound();
    const tabBtn = (href: string, label: string) => `<a href="${href}" style="min-height: 44px; display: inline-flex; align-items: center; padding: 0 18px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; color: #0B0B0F; font-size: 14px">${label}</a>`;
    html = replaceBody(html, shortsAdminPanel(sl.data, sc?.data ?? [], filter), { subtitle: "Ocean Short · video, suka, komentar, bagikan", actions: tabBtn("/admin/live", "← Breaking &amp; live blog") + tabBtn("/short", "Lihat halaman Short") });
    html = html.replace(/(<h1[^>]*>)[^<]*(<\/h1>)/, "$1Ocean Short$2");
    enhance.push("newsroom");
    title = "Ocean Short";
  } else if (boardId === "admin-live") {
    const st = await adminApi.live();
    if (!st) notFound();
    html = bindLiveAdmin(html, st);
    enhance.push("newsroom");
    title = "Breaking & live blog";
  } else if (boardId === "admin-newsletter") {
    const [st, recent] = await Promise.all([adminApi.newsletter(search.q ?? ""), adminApi.articles("published")]);
    if (!st) notFound();
    html = replaceBody(html, newsletterPanel(st, (recent?.data ?? []).slice(0, 20).map((a) => ({ id: a.id, title: a.title }))), { subtitle: `${st.stats.active} pelanggan aktif · edisi dikirim lewat email transaksional`, actions: "" });
    enhance.push("newsroom");
    title = "Newsletter";
  } else if (boardId === "admin-notif") {
    const f = await adminApi.feed();
    const kind = ["all", "content", "market", "ads", "comments", "users", "system"].includes(search.tipe ?? "") ? search.tipe! : "all";
    html = replaceBody(html, feedPanel(f?.data ?? [], kind), { subtitle: `${f?.urgent ?? 0} butuh tindakan · diperbarui saat halaman dibuka`, actions: "" });
    title = "Notifikasi";
  } else if (boardId === "admin-reports") {
    const r = await adminApi.reports();
    if (!r) notFound();
    html = replaceBody(html, reportsPanel(r), { subtitle: "30 hari terakhir · pendapatan, audiens, redaksi, dan iklan", actions: "" });
    title = "Laporan";
  } else if (boardId === "admin-search" || boardId === "admin-search-results") {
    const q = (search.q ?? "").trim().slice(0, 80);
    if (boardId === "admin-search") redirect(`/admin/cari/hasil${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const r = q ? await adminApi.search(q) : { query: q, data: [] };
    html = replaceBody(html, searchPanel(q, r?.data ?? []), { subtitle: q ? `${r?.data.length ?? 0} hasil untuk “${q}”` : "Cari artikel, pengguna, dan simbol" });
    title = q ? `Cari: ${q}` : "Cari";
  } else if (boardId === "admin-settings") {
    const st = await adminApi.settings();
    if (!st) notFound();
    html = replaceBody(html, settingsPanel(st), { subtitle: "Status integrasi & tautan pengaturan modul" });
    title = "Pengaturan";
  } else if (boardId === "admin-roles") {
    const [rbac, cats] = await Promise.all([adminApi.rbac(), safe(api.categories(), { data: [] })]);
    if (!rbac) notFound();
    html = bindRoles(html, { rbac, categories: cats.data });
    enhance.push("rbac");
  } else if ((boardId === "admin-users" || boardId === "admin-ads") && search.tab === "permintaan") {
    const kind = boardId === "admin-ads" ? "ad" : ["student", "privacy", "ad"].includes(search.jenis ?? "") ? search.jenis! : "";
    const r = await adminApi.requests(kind);
    if (!r) notFound();
    const base = boardId === "admin-ads" ? "/admin/iklan?tab=permintaan" : "/admin/pengguna?tab=permintaan";
    const open = r.data.filter((x) => x.status === "new" || x.status === "pending").length;
    html = replaceBody(html, requestsPanel(r.data, boardId === "admin-ads" ? "ad" : kind, base), { subtitle: `${open} menunggu tindakan · verifikasi Student, permintaan data pribadi (UU PDP), dan kerja sama iklan`, actions: `<a href="${boardId === "admin-ads" ? "/admin/iklan" : "/admin/pengguna"}" style="min-height: 44px; display: flex; align-items: center; padding: 0 18px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px">← Kembali</a>` });
    enhance.push("newsroom");
    title = "Permintaan masuk";
  } else if (boardId === "admin-users") {
    const tab = ["reader", "staff", "reported", "blocked"].includes(search.tab ?? "") ? search.tab! : "reader";
    const q = (search.q ?? "").slice(0, 80);
    const [list, detail] = await Promise.all([adminApi.users(tab, q), search.id && UUID.test(search.id) ? adminApi.user(search.id) : Promise.resolve(null)]);
    if (!list) notFound();
    const first = !detail && list.data[0] ? await adminApi.user(list.data[0].id) : null;
    html = bindUsers(html, {
      list: list.data,
      stats: list.stats,
      tab,
      q,
      detail: detail ?? first,
      canBan: who.perms.has("users.ban"),
      canWarn: who.perms.has("users.ban") || who.perms.has("comments.moderate"),
      canInvite: who.perms.has("rbac.manage"),
      me: who.id,
    });
    enhance.push("ops");
    title = "Pengguna";
  } else if (boardId === "admin-ads") {
    const st = await adminApi.ads();
    if (!st) notFound();
    const isNew = search.id === "new";
    const byId = search.id && UUID.test(search.id) ? st.campaigns.find((c) => c.id === search.id) ?? null : null;
    const statuses = ["pending", "live", "paused", "rejected", "finished"] as const;
    const status = (statuses as readonly string[]).includes(search.status ?? "") ? (search.status as (typeof statuses)[number]) : byId?.status ?? (st.counts.pending ? "pending" : "live");
    const selected = byId ?? st.campaigns.find((c) => c.status === status) ?? null;
    const form = st.can_manage && isNew ? "new" : st.can_manage && byId && search.edit === "1" ? "edit" : null;
    html = bindAds(html, { st, status, selected, form });
    enhance.push("ops");
    title = form === "new" ? "Kampanye baru" : "Iklan";
  } else if (boardId === "admin-market") {
    const st = await adminApi.market();
    if (!st) notFound();
    const tab = (MARKET_TABS.map(([k]) => k) as string[]).includes(search.status ?? "") ? (search.status as FeedStatus | "all") : "all";
    html = bindMarket(html, { st, tab, src: search.src === "binance" ? "binance" : "twelvedata" });
    enhance.push("ops");
    title = "Data Pasar";
  } else if (boardId === "admin-symbol") {
    const isNew = search.new === "1";
    const sym = (search.s ?? "").toUpperCase();
    if (!isNew && !/^[A-Z0-9./:-]{1,24}$/.test(sym)) redirect("/admin/pasar");
    const [st, cats, mk] = await Promise.all([isNew ? Promise.resolve(null) : adminApi.symbol(sym), safe(api.categories(), { data: [] }), adminApi.market()]);
    if (!isNew && !st) notFound();
    if (isNew && !mk?.can_manage) redirect("/admin/pasar");
    html = bindSymbol(html, { st, categories: cats.data, ttlS: mk?.quote_ttl_s ?? 900, isNew });
    enhance.push("ops");
    if (!isNew && st?.instrument.active && !st.instrument.error) enhance.push("lwchart");
    if (st) ctx.symbol = st.instrument.symbol;
    title = isNew ? "Simbol baru" : `Simbol ${sym}`;
  } else if (boardId === "admin-categories") {
    const [data, recent] = await Promise.all([adminApi.categories(search.q ?? ""), adminApi.articles("published")]);
    if (!data) notFound();
    const tab = search.tab === "tag" || search.tab === "sub" ? search.tab : "kategori";
    const selected = (search.id && data.categories.find((c) => c.id === search.id)) || data.categories.find((c) => !c.parent_id) || null;
    const icons = catIcons((await loadBoard("admin-category-form")).html);
    // Ikon lama (sebelum pilihan ilustrasi) → ilustrasi terdekat.
    const ALIAS: Record<string, string> = { chart: "candle", flag: "globe", bolt: "drop", doc: "reader", pen: "reader", shield: "coin" };
    for (const [k, v] of Object.entries(ALIAS)) if (icons[v]) icons[k] = icons[v]!;
    html = bindCategories(html, {
      data,
      tab,
      selected,
      recent: (recent?.data ?? []).filter((a) => a.category_slug === selected?.slug).slice(0, 4),
      icons,
      canManage: who.perms.has("taxonomy.manage"),
    });
    enhance.push("taxonomy");
    title = "Kategori & tag";
  } else if (boardId === "admin-category-form") {
    const [data, staff] = await Promise.all([adminApi.categories(), adminApi.staff()]);
    if (!data) notFound();
    const cat = search.id && UUID.test(search.id) ? data.categories.find((c) => c.id === search.id) ?? null : null;
    if (search.id && !cat) notFound();
    const parentId = search.parent && UUID.test(search.parent) ? search.parent : "";
    html = bindCategoryForm(html, { cat, all: data.categories, staff: staff?.data ?? [], parentId, canManage: who.perms.has("taxonomy.manage") });
    enhance.push("catform");
    if (cat) ctx.id = cat.id;
    title = cat ? `Edit kategori: ${cat.name}` : "Kategori baru";
  } else if (boardId === "admin-comments") {
    const status = ["queue", "flagged", "pending", "visible", "hidden"].includes(search.status ?? "") ? search.status! : "queue";
    const st = await adminApi.comments(status);
    if (!st) notFound();
    html = bindComments(html, { st, status, canBlock: who.perms.has("users.ban") });
    enhance.push("moderation");
    title = "Moderasi komentar";
  } else if (boardId === "admin-media") {
    const filter = ["all", "unlicensed", "expiring", "video"].includes(search.filter ?? "") ? search.filter! : "all";
    const lib = await adminApi.media(filter, search.q ?? "");
    if (!lib) notFound();
    const selected = (search.id && lib.data.find((m) => m.id === search.id)) || lib.data[0] || null;
    html = bindMedia(html, { lib, filter, selected, canManage: who.perms.has("media.manage") });
    enhance.push("medialib");
    title = "Pustaka media";
  } else if (boardId === "admin-activity") {
    const group = ["all", "content", "access", "ads", "system"].includes(search.group ?? "") ? search.group! : "all";
    const days = [1, 7, 30, 90].includes(Number(search.days)) ? Number(search.days) : 7;
    const page = await adminApi.audit(group, days, /^\d+$/.test(search.before ?? "") ? search.before! : "");
    if (!page) notFound();
    const selected = (search.id && page.data.find((e) => String(e.id) === search.id)) || page.data[0] || null;
    html = bindActivity(html, { page, group, selected, canExport: true });
    enhance.push("activity");
    title = "Log aktivitas";
  }

  if (user && board.kind !== "admin") html = bindAccount(html, user);
  if (board.kind === "app") html = hideFakeStatusBar(html);
  html = bindLogout(html, board.kind !== "admin");
  if (html.includes("data-logout")) enhance.push("logout");

  // Sisa tautan "#" di panel: diagram alur, kartu statistik, konten, live blog, akses ke Permintaan masuk.
  html = deAlur(html);
  if (boardId === "admin-comments") html = bindDetailCards(html, { Menunggu: "/admin/komentar?status=pending", Dilaporkan: "/admin/komentar?status=flagged", "Disetujui hari ini": "/admin/komentar?status=visible", "Pengguna diblokir": "/admin/pengguna?tab=blocked" });
  if (boardId === "admin-users") html = bindDetailCards(html, { "Pengguna terdaftar": "/admin/pengguna?tab=reader", "Aktif harian": "/admin/laporan", "Laporan terbuka": "/admin/pengguna?tab=reported", Diblokir: "/admin/pengguna?tab=blocked" });
  if (boardId === "admin-market") html = bindDetailCards(html, { "Error 429": "/admin/pasar?status=error", "Cache hit": "/admin/pasar", "Latensi p95": "/admin/pasar", "Koneksi WS": "/admin/pasar?status=live" });
  if (boardId === "admin-live" && search.tab !== "short") html = bindLiveExtras(html);
  if (boardId === "admin-content") {
    const status = CONTENT_STATUS.has(search.status ?? "") ? search.status! : "review";
    const [list, staff] = await Promise.all([adminApi.articles(status), adminApi.staff()]);
    const arts = list?.data ?? [];
    const selId = search.id && UUID.test(search.id) ? search.id : arts[0]?.id ?? null;
    html = bindContentExtras(html, {
      status,
      cats: [...new Set(arts.map((a) => a.category_name))].sort(),
      authors: [...new Set(arts.map((a) => a.author_name))].sort(),
      staff: (staff?.data ?? []).filter((x) => !x.blocked_at).map((x) => ({ id: x.id, name: x.full_name, role: x.role_name })),
      selectedId: selId,
      total: list?.counts?.[status] ?? arts.length,
    });
    if (!enhance.includes("newsroom")) enhance.push("newsroom");
  }
  if ((boardId === "admin-users" || boardId === "admin-ads") && search.tab !== "permintaan" && who.perms.has(boardId === "admin-ads" ? "ads.manage" : "users.read")) {
    const pend = await adminApi.requests(boardId === "admin-ads" ? "ad" : "");
    const n = (pend?.data ?? []).filter((x) => (boardId === "admin-ads" || x.kind !== "ad") && (x.status === "new" || x.status === "pending")).length;
    html = html.replace(/(<span style="margin-left: auto; display: flex; flex-wrap: wrap; gap: 10px">)/, `$1<a href="/admin/${boardId === "admin-ads" ? "iklan" : "pengguna"}?tab=permintaan" style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 20px; border-radius: 999px; border: 1px solid ${n ? "#FB7A3C" : "#E3EBF7"}; background: #FFFFFF; color: #0B0B0F; font-size: 14px; font-weight: 500">Permintaan masuk${n ? ` <span style="min-width: 22px; height: 22px; padding: 0 6px; border-radius: 999px; background: #FB7A3C; color: #FFFFFF; font-size: 12px; display: inline-flex; align-items: center; justify-content: center">${n}</span>` : ""}</a>`);
  }
  return { board, boardId, html, title, description, enhance, ctx };
}

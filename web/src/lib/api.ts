import "server-only";
import type { AIAnalysis, AdSlot, Author, TopicInfo, SearchResponse, Article, ArticleCard, Candle, Category, EconomicEvent, HomeData, Instrument, Page, Quote, QuoteItem } from "./types";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface Opts {
  revalidate?: number;
  token?: string;
}

async function get<T>(path: string, { revalidate = 30, token }: Opts = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    // Konten publik di-cache (ISR); permintaan bertoken tidak di-cache.
    ...(token ? { cache: "no-store" as const } : { next: { revalidate, tags: ["api"] } }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const p = (await res.json()) as { detail?: string; title?: string };
      detail = p.detail ?? p.title ?? detail;
    } catch {
      /* respons bukan JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Analisis AI: menunggu maks. `ms` (pembuatan pertama bisa beberapa detik); null bila belum siap. */
async function aiGet(path: string, token: string | undefined, ms = 9000): Promise<AIAnalysis | null> {
  // Analisis AI khusus pelanggan Plus: selalu atas nama pembaca, tidak di-cache bersama.
  if (!token) return null;
  try {
    const res = await fetch(BASE + path, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(ms) });
    return res.ok ? ((await res.json()) as AIAnalysis) : null;
  } catch {
    return null;
  }
}

export const api = {
  search: (q: string) => get<SearchResponse>(`/v1/search?q=${encodeURIComponent(q)}&limit=6`, { revalidate: 30 }),
  articleAI: (slug: string, token?: string) => aiGet(`/v1/articles/${encodeURIComponent(slug)}/ai`, token),
  marketAI: (symbol: string, token?: string) => aiGet(`/v1/market/instruments/${encodeURIComponent(symbol)}/ai`, token),
  home: (o?: Opts) => get<HomeData>("/v1/home", o),
  categories: () => get<Page<Category>>("/v1/categories", { revalidate: 300 }),
  articles: (q: Record<string, string | number | undefined>, o?: Opts) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
    return get<Page<ArticleCard>>(`/v1/articles?${p}`, o);
  },
  article: (slug: string, o?: Opts) => get<Article>(`/v1/articles/${encodeURIComponent(slug)}`, { revalidate: 60, ...o }),
  comments: (slug: string) => get<Page<{ id: string; user_name: string; body: string; created_at: string; parent_id?: string }>>(`/v1/articles/${encodeURIComponent(slug)}/comments?limit=50`, { revalidate: 0 }),
  reactions: (slug: string) => get<Page<{ kind: string; count: number }>>(`/v1/articles/${encodeURIComponent(slug)}/reactions`, { revalidate: 0 }),
  related: (slug: string) => get<Page<ArticleCard>>(`/v1/articles/${encodeURIComponent(slug)}/related?limit=6`, { revalidate: 120 }),
  instruments: () => get<Page<Instrument>>("/v1/market/instruments", { revalidate: 300 }),
  quotes: (symbols: string[]) => get<Page<QuoteItem>>(`/v1/market/quotes?symbols=${symbols.join(",")}`, { revalidate: 15 }),
  instrument: (symbol: string) =>
    get<{ instrument: Instrument; quote: Quote | null; news: ArticleCard[]; error?: string }>(`/v1/market/instruments/${encodeURIComponent(symbol)}`, { revalidate: 15 }),
  candles: (symbol: string, interval: string, limit = 120) =>
    get<{ symbol: string; interval: string; data: Candle[] }>(`/v1/market/instruments/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`, { revalidate: 30 }),
  author: (slug: string) => get<{ author: Author; articles: ArticleCard[] }>(`/v1/authors/${encodeURIComponent(slug)}`, { revalidate: 120 }),
  topic: (slug: string) => get<{ topic: TopicInfo; articles: ArticleCard[] }>(`/v1/topics/${encodeURIComponent(slug)}`, { revalidate: 120 }),
  plans: () => get<{ data: { code: string; name: string; price_amount: number; currency: string; billing_period: "month" | "year"; min_seats: number; features: string[] }[]; tax_rate: number }>("/v1/plans", { revalidate: 300 }),
  live: () => get<import("@/dc/newsroom-bind").PublicLive>("/v1/live", { revalidate: 15 }),
  followStat: (kind: "category" | "author", slug: string, token?: string) => get<{ following: boolean; followers: number }>(`/v1/follows/${kind}/${encodeURIComponent(slug)}`, { revalidate: 0, token }),
  publicStats: () => get<{ articles: number; views: number; newsletter: number; readers: number }>("/v1/stats/public", { revalidate: 600 }),
  shorts: (token?: string) => get<Page<import("@/dc/newsroom-bind").ShortRow>>("/v1/shorts?limit=30", { revalidate: 60, token }),
  shortComments: (id: string, token?: string) => get<Page<import("@/dc/newsroom-bind").ShortComment>>(`/v1/shorts/${encodeURIComponent(id)}/comments?limit=50`, { revalidate: 30, token }),
  events: () => get<Page<EconomicEvent>>("/v1/events?days=2", { revalidate: 60 }),
  eventsWeek: (from: string) => get<Page<EconomicEvent>>(`/v1/events?from=${from}&days=7`, { revalidate: 60 }),
  ads: (surface: "web" | "app", page: string) => get<Page<AdSlot>>(`/v1/ads?surface=${surface}&page=${page}`, { revalidate: 60 }),
};

/** safe menjalankan panggilan API dan mengembalikan nilai cadangan bila gagal (halaman tetap tampil). */
export async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("[api]", e instanceof Error ? e.message : e);
    return fallback;
  }
}

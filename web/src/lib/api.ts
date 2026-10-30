import "server-only";
import type { AdSlot, Article, ArticleCard, Candle, Category, EconomicEvent, HomeData, Instrument, Page, Quote, QuoteItem } from "./types";

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
    ...(token ? { cache: "no-store" as const } : { next: { revalidate } }),
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

export const api = {
  home: (o?: Opts) => get<HomeData>("/v1/home", o),
  categories: () => get<Page<Category>>("/v1/categories", { revalidate: 300 }),
  articles: (q: Record<string, string | number | undefined>, o?: Opts) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
    return get<Page<ArticleCard>>(`/v1/articles?${p}`, o);
  },
  article: (slug: string, o?: Opts) => get<Article>(`/v1/articles/${encodeURIComponent(slug)}`, { revalidate: 60, ...o }),
  related: (slug: string) => get<Page<ArticleCard>>(`/v1/articles/${encodeURIComponent(slug)}/related?limit=6`, { revalidate: 120 }),
  quotes: (symbols: string[]) => get<Page<QuoteItem>>(`/v1/market/quotes?symbols=${symbols.join(",")}`, { revalidate: 15 }),
  instrument: (symbol: string) =>
    get<{ instrument: Instrument; quote: Quote | null; news: ArticleCard[]; error?: string }>(`/v1/market/instruments/${encodeURIComponent(symbol)}`, { revalidate: 15 }),
  candles: (symbol: string, interval: string, limit = 120) =>
    get<{ symbol: string; interval: string; data: Candle[] }>(`/v1/market/instruments/${encodeURIComponent(symbol)}/candles?interval=${interval}&limit=${limit}`, { revalidate: 30 }),
  events: () => get<Page<EconomicEvent>>("/v1/events?days=2", { revalidate: 60 }),
  ads: (surface: "web" | "app", page: string) => get<Page<AdSlot>>(`/v1/ads?surface=${surface}&page=${page}`, { revalidate: 300 }),
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

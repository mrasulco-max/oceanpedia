// Tipe data yang dikembalikan API Go (lihat api/openapi.yaml).
export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  article_count: number;
}

export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  cover_alt: string;
  category: Category;
  author_name: string;
  author_slug: string;
  is_premium: boolean;
  is_breaking: boolean;
  reading_minutes: number;
  view_count: number;
  published_at: string;
}

export interface Article extends ArticleCard {
  body: string;
  locked: boolean;
  ai_summary?: string | null;
  author: { name: string; slug: string; title: string; verified: boolean; avatar_url: string | null };
  tags: { slug: string; name: string }[];
  symbols: string[];
}

export interface Page<T> {
  data: T[];
  next_cursor?: string | null;
}

export interface HomeData {
  top_story: ArticleCard | null;
  latest: ArticleCard[];
  most_read: ArticleCard[];
  sections: { category: Category; articles: ArticleCard[] }[];
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  asset_class: "equity" | "index" | "crypto" | "commodity" | "forex";
  currency: string;
  sector: string | null;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  volume: number;
  week52_low: number;
  week52_high: number;
  as_of: string;
  source: "twelvedata" | "sample";
}

export interface QuoteItem {
  instrument: Instrument;
  quote: Quote | null;
  error?: string;
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface EconomicEvent {
  id: string;
  country: string;
  title: string;
  impact: "low" | "medium" | "high";
  scheduled_at: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface AdSlot {
  code: string;
  surface: "web" | "app";
  placement: string;
  width: number;
  height: number;
}

export type Layout = "web" | "app";

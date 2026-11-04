import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { ArticleCard, Instrument } from "./types";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  plan: string | null;
  created_at: string;
  email_verified: boolean;
  phone?: string | null;
  display_name: string | null;
  avatar_id: string | null;
  preferences: Record<string, boolean | string>;
  stats: { watchlist: number; alerts_active: number; alerts_triggered: number; bookmarks: number; topics: number };
  topics: { slug: string; name: string }[];
  two_factor?: boolean;
  totp?: boolean;
}

export interface Session {
  id: string;
  user_agent: string;
  ip: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}

/** sha256 hex refresh token: menandai "perangkat ini" di daftar sesi. */
export function sessionHash(rt: string | undefined): string {
  return rt ? createHash("sha256").update(rt).digest("hex") : "";
}

export async function meGetJSON<T>(path: string): Promise<T | null> {
  return meGet<T>(path);
}

async function meGet<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const token = jar.get("ob_at")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Session-Hash": sessionHash(jar.get("ob_rt")?.value) },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function getProfile(): Promise<{ profile: Profile; alert_limit: number } | null> {
  return meGet("/v1/me/profile");
}

export async function getSessions(): Promise<Session[]> {
  return (await meGet<{ data: Session[] }>("/v1/me/sessions"))?.data ?? [];
}

// ---------------------------------------------------------------- fitur pembaca

export interface WatchItem extends Instrument {
  added_at: string;
}
export interface UserAlert {
  id: string;
  symbol: string;
  condition: "price_above" | "price_below" | "change_pct" | "volume_spike" | "rsi" | "news";
  threshold: number | null;
  frequency: "once" | "every_time" | "daily";
  channels: string[];
  note: string;
  active: boolean;
  created_at: string;
}
export interface UserNotification {
  id: string;
  kind: "breaking" | "price_alert" | "topic" | "account" | "reply" | "billing";
  title: string;
  body: string;
  link: string;
  symbol?: string;
  price?: number;
  change?: number;
  read_at: string | null;
  created_at: string;
}

export async function getWatchlist(): Promise<WatchItem[] | null> {
  return (await meGet<{ data: WatchItem[] }>("/v1/me/watchlist"))?.data ?? null;
}
export async function getAlerts(): Promise<UserAlert[] | null> {
  return (await meGet<{ data: UserAlert[] }>("/v1/me/alerts"))?.data ?? null;
}
export async function getBookmarks(): Promise<ArticleCard[] | null> {
  return (await meGet<{ data: ArticleCard[] }>("/v1/me/bookmarks?limit=100"))?.data ?? null;
}
/** Jumlah notifikasi belum dibaca (untuk lencana ikon lonceng). */
export async function getUnread(): Promise<number> {
  return (await meGet<{ unread: number }>("/v1/me/notifications?limit=1"))?.unread ?? 0;
}
export async function getNotifications(kind = ""): Promise<{ data: UserNotification[]; counts: Record<string, number>; unread: number } | null> {
  return meGet(`/v1/me/notifications?kind=${encodeURIComponent(kind)}&limit=100`);
}

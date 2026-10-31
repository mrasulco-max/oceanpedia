import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";

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
  preferences: Record<string, boolean | string>;
  stats: { watchlist: number; alerts_active: number; alerts_triggered: number; bookmarks: number; topics: number };
  topics: { slug: string; name: string }[];
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

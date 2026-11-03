import "server-only";
import { cookies } from "next/headers";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export type ArticleStatus = "draft" | "review" | "published" | "archived" | "scheduled";

export interface AdminArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  category_slug: string;
  category_name: string;
  author_name: string;
  author_user_id: string | null;
  created_by: string | null;
  status: "draft" | "review" | "published" | "archived";
  is_premium: boolean;
  is_breaking: boolean;
  reading_minutes: number;
  view_count: number;
  symbols: string[];
  review_note: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminList {
  data: AdminArticle[];
  counts: Record<string, number>;
}

/** Panggilan API redaksi atas nama pengguna yang sedang masuk (token dari cookie httpOnly). */
async function adminGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get("ob_at")?.value;
  if (!token) return null;
  const res = await fetch(`${BASE}/v1/admin${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface RbacRole {
  key: string;
  name: string;
  description: string;
  is_staff: boolean;
  is_system: boolean;
  members: number;
}
export interface RbacState {
  roles: RbacRole[];
  permissions: { key: string; group: string; label: string }[];
  matrix: Record<string, string[]>;
  staff: { id: string; email: string; full_name: string; role: string; role_name: string; blocked_at: string | null; created_at: string; desks: string[] }[];
  invitations: { id: string; email: string; role: string; role_name: string; categories: string[]; invited_by_name: string | null; created_at: string; expires_at: string; status: "pending" | "expired" | "accepted" | "revoked" }[];
  me: string;
}

export const adminApi = {
  rbac: () => adminGet<RbacState>("/rbac"),
  articles: (status: string, q = "") => adminGet<AdminList>(`/articles?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&limit=100`),
  article: (id: string) => adminGet<AdminArticle>(`/articles/${encodeURIComponent(id)}`),
};

/** Status tampilan: terbit dengan waktu di masa depan = terjadwal; draf dengan catatan editor = revisi. */
export function displayStatus(a: AdminArticle, now = Date.now()): "draft" | "revision" | "review" | "scheduled" | "published" | "archived" {
  if (a.status === "published" && a.published_at && new Date(a.published_at).getTime() > now) return "scheduled";
  if (a.status === "draft" && a.review_note) return "revision";
  return a.status;
}

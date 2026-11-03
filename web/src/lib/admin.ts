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

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  parent_id: string | null;
  parent_name: string | null;
  sort_order: number;
  status: "active" | "draft" | "archived";
  in_menu: boolean;
  followable: boolean;
  color: string;
  seo_title: string;
  seo_description: string;
  editor_id: string | null;
  editor_name: string | null;
  articles: number;
  published: number;
  drafts: number;
  views: number;
  followers: number;
  created_at: string;
  created_by_name: string | null;
}
export interface AdminTag {
  id: string;
  slug: string;
  name: string;
  articles: number;
  followers: number;
  main_category: string | null;
}
export interface ModComment {
  id: string;
  body: string;
  status: "visible" | "hidden" | "flagged" | "pending";
  flag_reason: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_blocked: boolean;
  article_title: string;
  article_slug: string;
  reports: number;
  moderated_at: string | null;
  moderated_by_name: string | null;
}
export interface ModerationState {
  data: ModComment[];
  counts: { pending: number; flagged: number; visible: number; hidden: number; approved_today: number; blocked_week: number };
  settings: { hold_links: boolean; detect_pump: boolean; hide_after_reports: boolean; report_threshold: number; hold_new_accounts: boolean };
  words: string[];
}
export interface MediaItem {
  id: string;
  url: string;
  mime: string;
  size: number;
  title: string;
  kind: "photo" | "chart" | "illustration" | "video";
  source: string;
  license: "none" | "owned" | "licensed" | "editorial" | "cc";
  license_until: string | null;
  alt: string;
  file_name: string;
  width: number | null;
  height: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  used_in: number;
  used_title: string | null;
  expires_soon: boolean;
  expired: boolean;
}
export interface MediaLibrary {
  data: MediaItem[];
  counts: { all: number; unlicensed: number; expiring: number; video: number };
}
export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}
export interface AuditPage {
  data: AuditEntry[];
  groups: Record<string, number>;
  days: number;
}

export const adminApi = {
  staff: () => adminGet<{ data: RbacState["staff"] }>(`/staff`),
  categories: (q = "") => adminGet<{ categories: AdminCategory[]; tags: AdminTag[]; tag_total: number; tag_unused: number }>(`/categories?q=${encodeURIComponent(q)}`),
  comments: (status: string) => adminGet<ModerationState>(`/comments?status=${encodeURIComponent(status)}&limit=100`),
  media: (filter: string, q = "") => adminGet<MediaLibrary>(`/media/library?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}&limit=120`),
  audit: (group: string, days: number, before = "") => adminGet<AuditPage>(`/audit?group=${encodeURIComponent(group)}&days=${days}&before=${encodeURIComponent(before)}&limit=60`),
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

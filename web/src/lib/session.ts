import "server-only";
import { cookies } from "next/headers";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  role: "reader" | "author" | "editor" | "admin";
  phone?: string | null;
  created_at?: string;
  email_verified?: boolean;
}

/** Pengguna yang sedang masuk (dari cookie httpOnly ob_at), atau null. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get("ob_at")?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/v1/me`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SessionUser;
  } catch {
    return null;
  }
}

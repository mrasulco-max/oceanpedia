import "server-only";
import { cookies } from "next/headers";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  /** Kunci peran dari tabel roles (mis. superadmin, editor, author, atau role buatan admin). */
  role: string;
  role_name?: string;
  /** Punya akses panel admin (peran staf dengan ≥1 izin). */
  is_staff?: boolean;
  /** Izin terkini dari matriks role_permissions. */
  permissions?: string[];
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

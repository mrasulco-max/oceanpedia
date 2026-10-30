import { NextResponse } from "next/server";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/**
 * BFF login: meneruskan kredensial ke API Go dan menyimpan token di cookie httpOnly
 * (token tidak pernah bisa dibaca JavaScript di browser).
 */
export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${BASE}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "" }, body, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  const { access_token, refresh_token, expires_in, user } = data as { access_token: string; refresh_token: string; expires_in: number; user: unknown };
  const out = NextResponse.json({ user });
  const secure = process.env.NODE_ENV === "production";
  out.cookies.set("ob_at", access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: expires_in });
  out.cookies.set("ob_rt", refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return out;
}

import "server-only";
import { NextResponse } from "next/server";

export const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/** Teruskan permintaan auth ke API Go (JSON), dengan IP klien untuk pembatas laju. */
export async function forward(req: Request, path: string): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "" },
    body: await req.text(),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

/** Respons token dari API → cookie httpOnly (token tidak pernah terbaca JavaScript di browser). */
export function withSession(data: Record<string, unknown>): NextResponse {
  const { access_token, refresh_token, expires_in, user } = data as { access_token: string; refresh_token: string; expires_in: number; user: unknown };
  const out = NextResponse.json({ user });
  const secure = process.env.NODE_ENV === "production";
  out.cookies.set("ob_at", access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: expires_in });
  out.cookies.set("ob_rt", refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  out.headers.set("Cache-Control", "no-store");
  return out;
}

export function pass(res: Response, data: Record<string, unknown>): NextResponse {
  return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

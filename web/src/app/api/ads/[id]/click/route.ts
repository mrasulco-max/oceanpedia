import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/auth-session";

/** Klik iklan: dicatat di API lalu dialihkan ke situs pengiklan. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(new URL("/", _req.url));
  const res = await fetch(`${API_BASE}/v1/ads/${id}/click`, { redirect: "manual", cache: "no-store" });
  const to = res.headers.get("location");
  return NextResponse.redirect(to && to.startsWith("https://") ? to : new URL("/", _req.url), 302);
}

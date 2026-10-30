import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

export async function POST() {
  const jar = await cookies();
  const rt = jar.get("ob_rt")?.value;
  if (rt) {
    await fetch(`${BASE}/v1/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }), cache: "no-store" }).catch(() => undefined);
  }
  const out = new NextResponse(null, { status: 204 });
  out.cookies.delete("ob_at");
  out.cookies.set("ob_rt", "", { path: "/api/auth", maxAge: 0 });
  return out;
}

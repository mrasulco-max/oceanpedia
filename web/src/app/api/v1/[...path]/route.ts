import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { API_BASE } from "@/lib/auth-session";

/**
 * BFF tindakan pembaca di luar /v1/me: reaksi & komentar artikel, laporan komentar, impresi iklan,
 * checkout & status pembayaran. Hanya rute dalam daftar yang diteruskan (token dari cookie httpOnly).
 */
const ALLOW: [string, RegExp][] = [
  ["PUT", /^articles\/[a-z0-9-]+\/reaction$/],
  ["POST", /^articles\/[a-z0-9-]+\/comments$/],
  ["GET", /^articles\/[a-z0-9-]+\/(comments|reactions)$/],
  ["POST", /^comments\/[0-9a-f-]{36}\/report$/],
  ["POST", /^ads\/[0-9a-f-]{36}\/impression$/],
  ["POST", /^billing\/checkout$/],
  ["GET", /^billing\/(invoices|subscription|invoices\/[0-9a-f-]{36})$/],
  ["POST", /^billing\/(subscription\/cancel|invoices\/[0-9a-f-]{36}\/(refresh|resend))$/],
  ["POST", /^newsletter\/(subscribe|unsubscribe)$/],
  ["POST", /^shorts\/[0-9a-f-]{36}\/(view|share|like|save|comments)$/],
  ["DELETE", /^shorts\/[0-9a-f-]{36}\/(like|save)$/],
  ["DELETE", /^shorts\/[0-9a-f-]{36}\/comments\/[0-9a-f-]{36}$/],
  ["GET", /^shorts\/[0-9a-f-]{36}\/comments$/],
];

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const p = path.join("/");
  if (!ALLOW.some(([m, re]) => m === req.method && re.test(p))) return NextResponse.json({ title: "Tidak diizinkan", status: 404 }, { status: 404 });
  const token = (await cookies()).get("ob_at")?.value;
  const hasBody = req.method !== "GET" && req.method !== "DELETE";
  const res = await fetch(`${API_BASE}/v1/${p}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": req.headers.get("user-agent") ?? "",
      "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };

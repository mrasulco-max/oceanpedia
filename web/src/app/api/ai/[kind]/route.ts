import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

function pass(res: Response, body: ArrayBuffer) {
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Analisis AI untuk browser:
 *   GET  /api/ai/article?slug=…   GET /api/ai/market?symbol=…   (melengkapi halaman bila analisis belum siap)
 *   POST /api/ai/ask {slug|symbol, question}                       (Tanya AI; token dari cookie httpOnly)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const q = req.nextUrl.searchParams;
  let path = "";
  if (kind === "article" && /^[a-z0-9-]{1,200}$/.test(q.get("slug") ?? "")) path = `/v1/articles/${q.get("slug")}/ai`;
  if (kind === "market" && /^[A-Z0-9]{2,12}$/.test((q.get("symbol") ?? "").toUpperCase())) path = `/v1/market/instruments/${(q.get("symbol") ?? "").toUpperCase()}/ai`;
  if (!path) return NextResponse.json({ title: "Parameter tidak valid" }, { status: 400 });
  const res = await fetch(BASE + path, { cache: "no-store", signal: AbortSignal.timeout(55000) });
  return pass(res, await res.arrayBuffer());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "ask") return NextResponse.json({ title: "Tidak ditemukan" }, { status: 404 });
  const token = (await cookies()).get("ob_at")?.value;
  if (!token) {
    return NextResponse.json({ type: "about:blank", title: "Perlu masuk", status: 401, detail: "Masuk dulu untuk bertanya ke AI." }, { status: 401 });
  }
  const res = await fetch(`${BASE}/v1/ai/ask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: await req.text(),
    cache: "no-store",
    signal: AbortSignal.timeout(55000),
  });
  return pass(res, await res.arrayBuffer());
}

export const maxDuration = 60;

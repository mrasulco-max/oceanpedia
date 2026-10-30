import { NextResponse, type NextRequest } from "next/server";

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8080";
const INTERVALS = new Set(["1min", "5min", "15min", "30min", "1h", "4h", "1day", "1week", "1month"]);

/**
 * Candle untuk grafik Detail Market di browser (emas, valas, cadangan kripto).
 * Diteruskan ke API Go yang memakai cache bersama di database, sehingga banyak pengunjung
 * tidak menambah pemakaian kuota penyedia data.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const symbol = (q.get("symbol") ?? "").toUpperCase();
  const interval = q.get("interval") ?? "1day";
  const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 120));
  if (!/^[A-Z0-9]{1,12}$/.test(symbol) || !INTERVALS.has(interval)) {
    return NextResponse.json({ title: "Parameter tidak valid" }, { status: 400 });
  }
  const res = await fetch(`${BASE}/v1/market/instruments/${symbol}/candles?interval=${interval}&limit=${limit}`, { cache: "no-store" });
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "public, max-age=15" },
  });
}

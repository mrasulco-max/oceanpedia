import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * Gambar pratinjau tautan (Open Graph 1200×630) untuk halaman tanpa foto sampul:
 * judul, kategori, dan merek OceanBird. Dipakai WhatsApp, Telegram, X, Facebook, LinkedIn, dll.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = (q.get("t") ?? "Berita & Data Pasar").slice(0, 140);
  const kicker = (q.get("k") ?? "OceanBird").slice(0, 40).toUpperCase();
  const sub = (q.get("s") ?? "Saham IDX · Komoditas · Crypto · Forex").slice(0, 90);
  const logo = new URL("/logo.png", req.nextUrl.origin).toString();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "linear-gradient(135deg, #0B1530 0%, #12306B 55%, #2563EB 100%)", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>{kicker}</div>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 18px", borderRadius: 18, background: "#FFFFFF" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={198} height={40} alt="OceanBird" />
          </div>
        </div>
        <div style={{ display: "flex", fontSize: title.length > 80 ? 54 : 66, lineHeight: 1.15, fontWeight: 700, maxWidth: 1050 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 28, color: "#C9DAFF" }}>{sub}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}

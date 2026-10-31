import { NextResponse, type NextRequest } from "next/server";
import { LAYOUT_COOKIE, LAYOUT_HEADER, detectLayout } from "@/lib/device";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

/**
 * 1. Memilih UI per perangkat pada URL yang sama: desktop/tablet → artboard website, ponsel → artboard app.
 *    Bisa dipaksa lewat ?layout=web|app (disimpan di cookie 30 hari).
 * 2. Memperpanjang sesi (refresh token) secara diam-diam untuk halaman yang butuh login.
 */
export async function middleware(req: NextRequest) {
  const forced = req.nextUrl.searchParams.get("layout");
  const cookie = forced === "web" || forced === "app" ? forced : req.cookies.get(LAYOUT_COOKIE)?.value;
  const layout = detectLayout({ cookie, chMobile: req.headers.get("sec-ch-ua-mobile"), ua: req.headers.get("user-agent") });

  const headers = new Headers(req.headers);
  headers.set(LAYOUT_HEADER, layout);

  // Sesi kedaluwarsa tapi refresh token masih ada → terbitkan token baru sebelum halaman dirender.
  let fresh: { access_token: string; refresh_token: string; expires_in: number } | null = null;
  const needsAuth = ["/admin", "/akun", "/pengaturan"].some((p) => req.nextUrl.pathname.startsWith(p));
  const rt = req.cookies.get("ob_rt")?.value;
  if (needsAuth && !req.cookies.get("ob_at") && rt) {
    try {
      const r = await fetch(`${API}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": req.headers.get("user-agent") ?? "", "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "" },
        body: JSON.stringify({ refresh_token: rt }),
        cache: "no-store",
      });
      if (r.ok) {
        fresh = await r.json();
        // Teruskan token baru ke render server pada permintaan yang sama.
        const jar = (req.headers.get("cookie") ?? "").split(/;\s*/).filter((c) => c && !c.startsWith("ob_at=") && !c.startsWith("ob_rt="));
        jar.push(`ob_at=${fresh!.access_token}`, `ob_rt=${fresh!.refresh_token}`);
        headers.set("cookie", jar.join("; "));
      }
    } catch {
      /* API tidak terjangkau: biarkan halaman meminta login */
    }
  }

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Accept-CH", "Sec-CH-UA-Mobile");
  res.headers.append("Vary", "Sec-CH-UA-Mobile, User-Agent");
  if (forced === "web" || forced === "app") {
    res.cookies.set(LAYOUT_COOKIE, forced, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }
  if (fresh) {
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set("ob_at", fresh.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: fresh.expires_in });
    res.cookies.set("ob_rt", fresh.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/|img/|favicon|logo|robots.txt|sitemap.xml).*)"],
};

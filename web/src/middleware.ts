import { NextResponse, type NextRequest } from "next/server";
import { LAYOUT_COOKIE, LAYOUT_HEADER, detectLayout } from "@/lib/device";

/**
 * Memilih UI per perangkat pada URL yang sama:
 * desktop/tablet → UI website, ponsel → UI app.
 * Pengguna bisa memaksa lewat ?layout=web|app (disimpan di cookie 30 hari).
 */
export function middleware(req: NextRequest) {
  const forced = req.nextUrl.searchParams.get("layout");
  const cookie = forced === "web" || forced === "app" ? forced : req.cookies.get(LAYOUT_COOKIE)?.value;
  const layout = detectLayout({ cookie, chMobile: req.headers.get("sec-ch-ua-mobile"), ua: req.headers.get("user-agent") });

  const headers = new Headers(req.headers);
  headers.set(LAYOUT_HEADER, layout);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Accept-CH", "Sec-CH-UA-Mobile");
  res.headers.append("Vary", "Sec-CH-UA-Mobile, User-Agent");
  if (forced === "web" || forced === "app") {
    res.cookies.set(LAYOUT_COOKIE, forced, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/|api/|img/|favicon|logo|robots.txt|sitemap.xml).*)"],
};

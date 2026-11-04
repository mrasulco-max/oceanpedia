import "server-only";
import { headers } from "next/headers";

/**
 * Origin domain yang sedang dipakai pengunjung (mis. https://oceanpedia-web.vercel.app atau domain kustom),
 * dari header permintaan di balik proxy Vercel. Dipakai untuk tautan bagikan & metadata Open Graph,
 * sehingga tautan selalu mengikuti domain aktif tanpa konfigurasi tambahan.
 */
export async function currentOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim();
    if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
      const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto === "http" ? "http" : "https"}://${host}`;
    }
  } catch {
    /* di luar konteks permintaan */
  }
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://oceanpedia-web.vercel.app").replace(/\/$/, "");
}

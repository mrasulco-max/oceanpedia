import type { Layout } from "./types";

/** Header internal yang diisi middleware untuk memberi tahu layout yang dipakai. */
export const LAYOUT_HEADER = "x-ob-layout";
/** Pilihan eksplisit pengguna (?layout=web|app), berlaku 30 hari. */
export const LAYOUT_COOKIE = "ob_layout";
/** Preferensi sementara dari lebar viewport (sesi browser saja). */
export const LAYOUT_VP_COOKIE = "ob_layout_vp";

/** Di bawah ini UI app dipakai agar artboard web tidak di-zoom terlalu kecil. */
export const VP_APP_MAX = 899;
/** Di atas ini cookie viewport dibersihkan agar desktop kembali ke UI website. */
export const VP_WEB_MIN = 1024;

const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|Opera Mini|IEMobile|BlackBerry|webOS/i;

/**
 * detectLayout memilih tampilan:
 * 1. pilihan eksplisit pengguna (cookie / ?layout=web|app),
 * 2. cookie viewport (jendela sempit → app),
 * 3. Client Hint Sec-CH-UA-Mobile,
 * 4. User-Agent.
 * Tablet lebar tetap UI website; jendela &lt; ~900px memakai UI app.
 */
export function detectLayout(input: {
  cookie?: string | null;
  viewport?: string | null;
  chMobile?: string | null;
  ua?: string | null;
}): Layout {
  if (input.cookie === "web" || input.cookie === "app") return input.cookie;
  if (input.viewport === "web" || input.viewport === "app") return input.viewport;
  if (input.chMobile === "?1") return "app";
  if (input.chMobile === "?0") return "web";
  return input.ua && MOBILE_UA.test(input.ua) ? "app" : "web";
}

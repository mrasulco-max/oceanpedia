import type { Layout } from "./types";

/** Header internal yang diisi middleware untuk memberi tahu layout yang dipakai. */
export const LAYOUT_HEADER = "x-ob-layout";
export const LAYOUT_COOKIE = "ob_layout";

const MOBILE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|Opera Mini|IEMobile|BlackBerry|webOS/i;

/**
 * detectLayout memilih tampilan:
 * 1. pilihan eksplisit pengguna (cookie / ?layout=web|app),
 * 2. Client Hint Sec-CH-UA-Mobile,
 * 3. User-Agent.
 * Tablet diperlakukan sebagai desktop (UI website).
 */
export function detectLayout(input: { cookie?: string | null; chMobile?: string | null; ua?: string | null }): Layout {
  if (input.cookie === "web" || input.cookie === "app") return input.cookie;
  if (input.chMobile === "?1") return "app";
  if (input.chMobile === "?0") return "web";
  return input.ua && MOBILE_UA.test(input.ua) ? "app" : "web";
}

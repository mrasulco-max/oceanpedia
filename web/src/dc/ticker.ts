/**
 * Enhancer "ticker": LIVE MARKET sekarang memakai CSS marquee (ob-marq)
 * dengan jeda saat hover/fokus. Tidak ada logika JS yang diperlukan.
 */
import type { Cleanup, Env } from "./enhancers";

export function ticker(_host: HTMLElement, _env: Env): Cleanup {
  return;
}

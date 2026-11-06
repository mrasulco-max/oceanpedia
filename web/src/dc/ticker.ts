/**
 * Enhancer "ticker": strip LIVE MARKET (web) dan LIVE (app) bergulir otomatis ke kiri,
 * berhenti saat kursor/fokus berada di strip. Digerakkan JS karena marquee CSS desain
 * (ob-marq) dimatikan oleh @media (prefers-reduced-motion).
 */
import type { Cleanup, Env } from "./enhancers";

const SPEED = 40; // px per detik
const TRACKS = "[data-lm-inner], .ob-marq";

export function ticker(host: HTMLElement, _env: Env): Cleanup {
  if (!host.querySelector(TRACKS)) return;
  let raf = 0;
  let last = 0;
  const offsets: number[] = [];

  const tick = (now: number) => {
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    // Dicari ulang tiap frame: render ulang board (morph) bisa mengganti node.
    host.querySelectorAll<HTMLElement>(TRACKS).forEach((track, i) => {
      // Isi track sudah berisi dua set item: setengah lebar = satu putaran.
      const half = track.scrollWidth / 2;
      const strip = track.closest<HTMLElement>("[data-lm]") ?? track.parentElement?.parentElement ?? track;
      let off = offsets[i] ?? 0;
      if (half > 0 && !strip.matches(":hover, :focus-within")) off = (off + SPEED * dt) % half;
      offsets[i] = off;
      track.style.animation = "none";
      track.style.transform = `translate3d(${-off}px, 0, 0)`;
    });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(raf);
}

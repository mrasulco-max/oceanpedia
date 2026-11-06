/**
 * Enhancer "ticker": strip LIVE MARKET bergulir otomatis ke kiri,
 * berhenti saat kursor/fokus berada di strip.
 */
import type { Cleanup, Env } from "./enhancers";

const SPEED = 40; // px per detik

export function ticker(host: HTMLElement, _env: Env): Cleanup {
  if (!host.querySelector("[data-lm]")) return;
  let raf = 0;
  let last = 0;
  let offset = 0;

  const tick = (now: number) => {
    // Elemen dicari ulang tiap frame: render ulang board (morph) bisa mengganti node.
    const root = host.querySelector<HTMLElement>("[data-lm]");
    const inner = root?.querySelector<HTMLElement>("[data-lm-inner]");
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    if (root && inner) {
      const half = inner.scrollWidth / 2;
      const paused = root.matches(":hover, :focus-within") || document.documentElement.dataset.motion === "reduce";
      if (half > 0 && !paused) {
        offset = (offset + SPEED * dt) % half;
      }
      inner.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(raf);
}

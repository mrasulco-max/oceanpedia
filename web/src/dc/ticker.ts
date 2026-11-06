/**
 * Enhancer "ticker": strip LIVE MARKET bisa digeser kiri/kanan (tombol + drag),
 * dan bergulir otomatis ke kiri bila motion diizinkan.
 */
import type { Cleanup, Env } from "./enhancers";

const STEP = 220;
const SPEED = 0.45; // px per frame @60fps ≈ 27px/s

function reduceMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce") return true;
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ticker(host: HTMLElement, _env: Env): Cleanup {
  const roots = [...host.querySelectorAll<HTMLElement>("[data-lm]")];
  if (!roots.length) return;
  const offs: (() => void)[] = [];

  for (const root of roots) {
    const track = root.querySelector<HTMLElement>("[data-lm-track]");
    const inner = root.querySelector<HTMLElement>("[data-lm-inner]");
    if (!track || !inner) continue;

    // Duplikasi isi agar gulir otomatis mulus (setengah track = satu putaran).
    if (!inner.dataset.lmDup && inner.children.length) {
      inner.dataset.lmDup = "1";
      const clone = inner.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-lm-inner");
      clone.setAttribute("aria-hidden", "true");
      while (clone.firstChild) inner.appendChild(clone.firstChild);
    }

    let paused = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let raf = 0;

    const syncBtns = () => {
      const max = Math.max(0, track.scrollWidth - track.clientWidth);
      const prev = root.querySelector<HTMLElement>("[data-lm-prev]");
      const next = root.querySelector<HTMLElement>("[data-lm-next]");
      if (prev) prev.style.opacity = track.scrollLeft <= 2 ? "0.35" : "1";
      if (next) next.style.opacity = track.scrollLeft >= max - 2 ? "0.35" : "1";
    };

    const tick = () => {
      raf = 0;
      if (!paused && !dragging && !reduceMotion()) {
        const half = inner.scrollWidth / 2;
        if (half > 0) {
          track.scrollLeft += SPEED;
          if (track.scrollLeft >= half) track.scrollLeft -= half;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      paused = true;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.setPointerCapture(e.pointerId);
      track.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      track.scrollLeft = startScroll - (e.clientX - startX);
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      track.style.cursor = "";
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // Jeda singkat setelah drag sebelum auto-scroll lanjut.
      window.setTimeout(() => {
        if (!dragging) paused = false;
      }, 1200);
      syncBtns();
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t || !root.contains(t)) return;
      const prev = t.closest("[data-lm-prev]");
      const next = t.closest("[data-lm-next]");
      if (!prev && !next) return;
      e.preventDefault();
      e.stopPropagation();
      paused = true;
      const delta = prev ? -STEP : STEP;
      track.scrollBy({ left: delta, behavior: reduceMotion() ? "auto" : "smooth" });
      window.setTimeout(() => {
        paused = false;
        syncBtns();
      }, 500);
    };

    const onEnter = () => {
      paused = true;
    };
    const onLeave = () => {
      if (!dragging) paused = false;
    };
    const onScroll = () => syncBtns();
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && track.scrollWidth > track.clientWidth) {
        track.scrollLeft += e.deltaY;
        e.preventDefault();
        paused = true;
        window.setTimeout(() => {
          if (!dragging) paused = false;
        }, 800);
      }
    };

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    track.addEventListener("scroll", onScroll, { passive: true });
    track.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("click", onClick, true);
    syncBtns();
    if (!reduceMotion()) raf = requestAnimationFrame(tick);

    offs.push(() => {
      if (raf) cancelAnimationFrame(raf);
      track.removeEventListener("pointerdown", onDown);
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", onUp);
      track.removeEventListener("pointercancel", onUp);
      track.removeEventListener("scroll", onScroll);
      track.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("click", onClick, true);
    });
  }

  return () => offs.forEach((f) => f());
}

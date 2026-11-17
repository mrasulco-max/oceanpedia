/**
 * Enhancer "hero": slider sorotan beranda bergeser ke kiri tiap 5 detik (kembali ke awal setelah
 * slide terakhir). Bisa digeser manual (scroll-snap) atau lewat titik indikator; berhenti selama
 * kursor/fokus/sentuhan berada di slider dan saat tab tidak terlihat.
 */
import type { Cleanup } from "./enhancers";

const INTERVAL = 5000;
const DOT_ON = "width: 22px; height: 6px; border-radius: 999px; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%)";

/** Fokus keyboard di dalam slider (klik mouse/ketukan tidak menjeda selamanya). */
function keyFocus(box: HTMLElement): boolean {
  try {
    return !!box.querySelector(":focus-visible");
  } catch {
    return box.contains(document.activeElement);
  }
}

export function hero(host: HTMLElement): Cleanup {
  if (!host.querySelector("[data-hero]")) return;
  const slow = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  let touching = false;
  let last = Date.now();

  // Dicari ulang tiap kali: render ulang board (morph) bisa mengganti node.
  const parts = () => {
    const box = host.querySelector<HTMLElement>("[data-hero]");
    const track = box?.querySelector<HTMLElement>("[data-hero-track]");
    return box && track ? { box, track, slides: track.querySelectorAll<HTMLElement>("[data-hero-slide]"), dots: box.querySelectorAll<HTMLElement>("[data-hero-dot]") } : null;
  };
  const index = (track: HTMLElement) => (track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0);

  const paint = () => {
    const p = parts();
    if (!p) return;
    const cur = index(p.track);
    const off = p.box.querySelector<HTMLElement>("[data-hero-dots]")?.dataset.off ?? "";
    p.dots.forEach((d, k) => {
      const on = k === cur;
      const bar = d.firstElementChild as HTMLElement | null;
      if (on) d.setAttribute("aria-current", "true");
      else d.removeAttribute("aria-current");
      if (bar) {
        bar.className = on ? "ob-anim" : "";
        bar.setAttribute("style", `display: block; transition: width .3s; ${on ? DOT_ON : off}`);
      }
    });
  };

  const go = (k: number) => {
    const p = parts();
    if (!p || !p.slides.length) return;
    const to = ((k % p.slides.length) + p.slides.length) % p.slides.length;
    p.track.scrollTo({ left: to * p.track.clientWidth, behavior: slow() ? "auto" : "smooth" });
    last = Date.now();
  };

  const timer = window.setInterval(() => {
    const p = parts();
    const hovered = matchMedia("(hover: hover)").matches && p?.box.matches(":hover");
    if (!p || p.slides.length < 2 || document.hidden || touching || hovered || keyFocus(p.box)) {
      last = Date.now();
      return;
    }
    if (Date.now() - last >= INTERVAL) go(index(p.track) + 1);
  }, 250);

  const onScroll = (e: Event) => {
    if ((e.target as Element | null)?.matches?.("[data-hero-track]")) paint();
  };
  const onClick = (e: MouseEvent) => {
    const dot = (e.target as Element | null)?.closest<HTMLElement>("[data-hero-dot]");
    if (!dot || !host.contains(dot)) return;
    e.preventDefault();
    go(Number(dot.dataset.heroDot) || 0);
  };
  const onTouch = (e: TouchEvent) => {
    const inside = !!(e.target as Element | null)?.closest?.("[data-hero]");
    if (e.type === "touchstart") touching = inside;
    else {
      touching = false;
      last = Date.now();
    }
  };

  host.addEventListener("scroll", onScroll, true);
  host.addEventListener("click", onClick);
  host.addEventListener("touchstart", onTouch, { passive: true });
  host.addEventListener("touchend", onTouch, { passive: true });
  host.addEventListener("touchcancel", onTouch, { passive: true });
  return () => {
    window.clearInterval(timer);
    host.removeEventListener("scroll", onScroll, true);
    host.removeEventListener("click", onClick);
    host.removeEventListener("touchstart", onTouch);
    host.removeEventListener("touchend", onTouch);
    host.removeEventListener("touchcancel", onTouch);
  };
}

/**
 * Enhancer popup iklan ("adpopup"): muncul beberapa detik setelah halaman dibuka, maksimal sekali
 * per 6 jam per kampanye di perangkat ini; impresi dicatat saat tampil, ditutup dengan × / Esc / ketuk latar.
 */
import type { Cleanup } from "./enhancers";

const CAP_MS = 6 * 3600_000;
const DELAY_MS = 2500;

export function adpopup(host: HTMLElement): Cleanup {
  const pop = host.querySelector<HTMLElement>("[data-ad-popup]");
  const id = pop?.dataset.adPopup;
  if (!pop || !id) return;
  const key = `ob-adpop-${id}`;
  try {
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < CAP_MS) return;
  } catch {
    /* penyimpanan diblokir: tetap tampilkan */
  }
  const close = () => {
    pop.hidden = true;
    pop.querySelectorAll("video").forEach((v) => v.pause());
  };
  const show = () => {
    pop.hidden = false;
    pop.querySelectorAll("video").forEach((v) => void v.play().catch(() => undefined));
    try {
      localStorage.setItem(key, String(Date.now()));
    } catch {
      /* abaikan */
    }
    void fetch(`/api/v1/ads/${encodeURIComponent(id)}/impression`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
  };
  const t = window.setTimeout(show, DELAY_MS);
  const onClick = (e: MouseEvent) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || pop.hidden) return;
    if (el.closest("[data-ad-close]") || el === pop) {
      e.preventDefault();
      close();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !pop.hidden) close();
  };
  pop.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey);
  return () => {
    window.clearTimeout(t);
    pop.removeEventListener("click", onClick);
    window.removeEventListener("keydown", onKey);
  };
}

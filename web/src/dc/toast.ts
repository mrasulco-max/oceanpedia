/** Notifikasi singkat di bawah layar (dipakai enhancer). */
export function toast(_host: Element | null, text: string, kind: "error" | "ok" = "error"): void {
  let el = document.querySelector<HTMLDivElement>(".dc-flash");
  if (!el) {
    el = document.createElement("div");
    el.className = "dc-flash";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.kind = kind;
  el.dataset.on = "1";
  window.clearTimeout(Number(el.dataset.t ?? 0));
  el.dataset.t = String(window.setTimeout(() => el && (el.dataset.on = "0"), 3200));
}

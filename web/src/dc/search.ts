/**
 * Enhancer "search": kolom Cari (Enter / tombol Cari → /cari?q=…), hapus teks, filter tab
 * (Semua/Aset/Berita/Penulis/Topik), dan riwayat pencarian terakhir di perangkat ini.
 */
import type { Cleanup, Env } from "./enhancers";

const KEY = "ob_recent_search";

function recent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}
function remember(q: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

export function search(host: HTMLElement, { router }: Env): Cleanup {
  const input = host.querySelector<HTMLInputElement>("[data-search-input]");
  const go = (raw: string) => {
    const q = raw.trim().slice(0, 80);
    if (q) remember(q);
    router.push(q ? `/cari?q=${encodeURIComponent(q)}` : "/cari");
  };
  const current = new URLSearchParams(location.search).get("q");
  if (current) remember(current);

  // Riwayat pencarian di perangkat ini menggantikan contoh chip desain.
  const chips = [...host.querySelectorAll<HTMLAnchorElement>("[data-search-chip]")];
  recent().forEach((q, i) => {
    const c = chips[i];
    if (!c) return;
    c.href = `/cari?q=${encodeURIComponent(q)}`;
    const text = [...c.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE);
    if (text) text.textContent = q;
  });

  // Tab: gaya aktif web diambil dari tab yang aktif saat ini.
  const tabs = [...host.querySelectorAll<HTMLElement>("[data-tab]")];
  const activeTab = tabs.find((t) => t.getAttribute("aria-selected") === "true");
  const inactiveTab = tabs.find((t) => t.getAttribute("aria-selected") === "false");
  const styles = activeTab && inactiveTab && !activeTab.hasAttribute("onclick")
    ? { on: activeTab.getAttribute("style") ?? "", off: inactiveTab.getAttribute("style") ?? "", onCount: activeTab.querySelector("span")?.getAttribute("style") ?? "", offCount: inactiveTab.querySelector("span")?.getAttribute("style") ?? "", onClass: activeTab.className }
    : null;

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest("[data-search-go]")) {
      e.preventDefault();
      e.stopPropagation();
      go(input?.value ?? "");
    } else if (t.closest("[data-search-clear]")) {
      e.preventDefault();
      e.stopPropagation();
      if (input) {
        input.value = "";
        input.focus();
      }
    } else {
      const tab = t.closest<HTMLElement>("[data-tab]");
      if (!tab) return;
      const key = tab.dataset.tab!;
      host.dataset.searchTab = key;
      if (styles) {
        // web: tab tidak punya logika desain → atur gaya sendiri
        for (const x of tabs) {
          const on = x === tab;
          x.setAttribute("aria-selected", on ? "true" : "false");
          x.setAttribute("style", on ? styles.on : styles.off);
          x.className = on ? styles.onClass : "";
          x.querySelector("span")?.setAttribute("style", on ? styles.onCount : styles.offCount);
        }
      }
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.matches("[data-search-input]")) {
      e.preventDefault();
      go(e.target.value);
    }
  };
  host.addEventListener("click", onClick, true);
  host.addEventListener("keydown", onKey, true);
  return () => {
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("keydown", onKey, true);
    delete host.dataset.searchTab;
  };
}

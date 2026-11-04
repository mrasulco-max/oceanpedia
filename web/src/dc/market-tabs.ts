/**
 * Enhancer Market aplikasi ("mkt"): tab Saham AS · Crypto · Forex · Komoditas dan urutan
 * Top gainer · Top loser · Teraktif mengikuti state desain (u1/u2), tanpa memuat ulang halaman.
 */
import type { Cleanup, Env } from "./enhancers";

type DesignState = { u?: Record<string, boolean[]> };
const ALL = [
  ["/screener?urut=saham", "Lihat semua saham"],
  ["/screener?urut=crypto", "Lihat semua crypto"],
  ["/screener?urut=forex", "Lihat semua forex"],
  ["/screener?urut=komoditas", "Lihat semua komoditas"],
];

export function mkt(host: HTMLElement, { ctx }: Env): Cleanup {
  let st: DesignState = ctx.state ? (JSON.parse(ctx.state) as DesignState) : {};
  const idx = (a: boolean[] | undefined) => Math.max(0, a?.indexOf(true) ?? 0);
  const apply = () => {
    const tab = idx(st.u?.u1);
    const sort = idx(st.u?.u2);
    const rows = [...host.querySelectorAll<HTMLElement>("[data-mk-row]")];
    const vis = rows.filter((r) => Number(r.dataset.mkCls) === tab);
    const chg = (r: HTMLElement) => (r.dataset.mkChg === "" ? NaN : Number(r.dataset.mkChg));
    const key = (r: HTMLElement) => {
      const c = chg(r);
      if (sort === 2) return -(Number(r.dataset.mkVol) || Math.abs(c) || 0);
      if (Number.isNaN(c)) return Infinity;
      return sort === 1 ? c : -c;
    };
    vis.sort((a, b) => key(a) - key(b));
    for (const r of rows) r.style.display = "none";
    vis.forEach((r, i) => {
      r.style.display = "flex";
      r.style.order = String(i);
      r.style.borderTop = i ? "1px solid #E3EAF4" : "0";
    });
    const all = host.querySelector<HTMLAnchorElement>("[data-mk-all]");
    if (all) {
      all.setAttribute("href", ALL[tab]![0]!);
      if (all.textContent !== ALL[tab]![1]) all.textContent = ALL[tab]![1]!;
    }
    const list = host.querySelector<HTMLElement>("[data-mk-list]");
    let empty = list?.querySelector<HTMLElement>("[data-mk-empty]");
    if (list && !vis.length && !empty) {
      empty = document.createElement("p");
      empty.dataset.mkEmpty = "";
      empty.style.cssText = "margin: 16px 0; font-size: 14px; color: #5F6B7D";
      empty.textContent = "Belum ada instrumen di kategori ini.";
      list.appendChild(empty);
    }
    if (empty) empty.style.display = vis.length ? "none" : "";
  };
  const onState = (e: Event) => {
    st = ((e as CustomEvent).detail ?? {}) as DesignState;
    apply();
  };
  host.addEventListener("dc:state", onState);
  apply();
  return () => host.removeEventListener("dc:state", onState);
}

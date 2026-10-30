/**
 * Enhancer "tvchart": grafik Detail Market memakai widget resmi TradingView (Advanced Real-Time Chart),
 * dikendalikan tombol timeframe (1m…1M) & rentang (1H…Semua) milik desain.
 * Data grafik real-time disediakan TradingView; tampilan desain di sekitarnya tidak berubah.
 */
import type { Cleanup, Env } from "./enhancers";

const SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const INTERVAL: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1J": "60", "4J": "240", "1D": "D", "1W": "W", "1M": "M" };

export function tvchart(host: HTMLElement, _env: Env): Cleanup {
  const box = host.querySelector<HTMLElement>("[data-tv]");
  if (!box) return;
  const symbol = box.dataset.tv!;
  let interval = box.dataset.tvInterval || "D";
  let range: string | undefined;
  let observer: MutationObserver | null = null;
  let timer = 0;

  const mount = () => {
    observer?.disconnect();
    window.clearTimeout(timer);
    box.querySelector(".tradingview-widget-container")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.setAttribute("style", "position: absolute; inset: 0; z-index: 1; background: #FFFFFF; opacity: 0; transition: opacity .25s");
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    wrap.appendChild(inner);
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.type = "text/javascript";
    s.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      ...(range ? { range } : {}),
      timezone: "Asia/Jakarta",
      theme: "light",
      style: "1",
      locale: "id",
      backgroundColor: "#FFFFFF",
      gridColor: "rgba(238, 242, 247, 1)",
      hide_top_toolbar: true,
      hide_side_toolbar: true,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      withdateranges: false,
      studies: ["Volume@tv-basicstudies", "MASimple@tv-basicstudies", "RSI@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    wrap.appendChild(s);
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.appendChild(wrap);
    // Tampilkan widget setelah iframe benar-benar dimuat; sampai itu grafik SVG tetap terlihat.
    observer = new MutationObserver(() => {
      const f = wrap.querySelector("iframe");
      if (!f) return;
      observer?.disconnect();
      f.addEventListener("load", () => {
        wrap.style.opacity = "1";
        host.classList.add("dc-tv-ready");
      }, { once: true });
    });
    observer.observe(wrap, { childList: true, subtree: true });
    timer = window.setTimeout(() => observer?.disconnect(), 15000);
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    const tf = t?.closest<HTMLElement>("[data-tf]")?.dataset.tf;
    const rg = t?.closest<HTMLElement>("[data-range]")?.dataset.range;
    if (tf && INTERVAL[tf] && (INTERVAL[tf] !== interval || range)) {
      interval = INTERVAL[tf]!;
      range = undefined;
      mount();
    } else if (rg && rg !== range) {
      range = rg;
      mount();
    }
  };

  host.addEventListener("click", onClick);
  mount();
  return () => {
    host.removeEventListener("click", onClick);
    observer?.disconnect();
    window.clearTimeout(timer);
  };
}

/**
 * Enhancer "lwchart": grafik Detail Market memakai TradingView Lightweight Charts (open source,
 * tanpa logo) dengan data pasar nyata:
 *   - kripto: Binance (riwayat REST + aliran WebSocket, berubah setiap transaksi),
 *   - emas & valas: API OceanPedia → Twelve Data (cache bersama, disegarkan ±1 menit).
 * Tombol timeframe (1m…1M) & rentang (1H…Semua) milik desain mengendalikan grafik; legenda desain
 * (O/H/L/C, MA, Vol, RSI) dan harga di header ikut diperbarui.
 */
import type { CandlestickData, IChartApi, ISeriesApi, LineData, HistogramData, UTCTimestamp, Time } from "lightweight-charts";
import type { Cleanup, Env } from "./enhancers";

type TF = "1m" | "5m" | "15m" | "30m" | "1J" | "4J" | "1D" | "1W" | "1M";
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number }

const BINANCE_IV: Record<TF, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1J": "1h", "4J": "4h", "1D": "1d", "1W": "1w", "1M": "1M" };
const API_IV: Record<TF, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1J": "1h", "4J": "4h", "1D": "1day", "1W": "1week", "1M": "1month" };
const INTRADAY = new Set<TF>(["1m", "5m", "15m", "30m", "1J", "4J"]);
// Rentang desain → timeframe yang cukup rinci + lama rentang (detik).
const RANGE: Record<string, [TF, number]> = {
  "1D": ["5m", 86400], "5D": ["30m", 5 * 86400], "1M": ["4J", 31 * 86400], "3M": ["1D", 92 * 86400], "6M": ["1D", 183 * 86400],
  YTD: ["1D", 0], "12M": ["1D", 366 * 86400], "60M": ["1W", 5 * 366 * 86400], ALL: ["1M", -1],
};
const WIB = 7 * 3600; // waktu ditampilkan dalam WIB
const UP = "#16A34A";
const DOWN = "#E5484D";
const MA: [number, string][] = [[9, "#F59E0B"], [21, "#7C3AED"], [50, "#2F74EB"]];
const BINANCE_REST = ["https://data-api.binance.vision", "https://api.binance.com"];
const BINANCE_WS = ["wss://data-stream.binance.vision/ws", "wss://stream.binance.com:9443/ws"];
// Pasangan warna naik ↔ turun desain (sama dengan market-bind).
const UP_DOWN: [string, string][] = [["#15803D", "#DC2626"], ["#166534", "#991B1B"], ["#DCF5E4", "#FDE2E2"], ["#6EE7A0", "#FCA5A5"], ["#16A34A", "#E5484D"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function sma(b: Bar[], n: number): LineData[] {
  const out: LineData[] = [];
  let sum = 0;
  b.forEach((x, i) => {
    sum += x.close;
    if (i >= n) sum -= b[i - n]!.close;
    if (i >= n - 1) out.push({ time: x.time as UTCTimestamp, value: sum / n });
  });
  return out;
}

function rsi(b: Bar[], n = 14): LineData[] {
  const out: LineData[] = [];
  let g = 0;
  let l = 0;
  for (let i = 1; i < b.length; i++) {
    const d = b[i]!.close - b[i - 1]!.close;
    const up = Math.max(d, 0);
    const dn = Math.max(-d, 0);
    if (i <= n) {
      g += up / n;
      l += dn / n;
    } else {
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
    }
    if (i >= n) out.push({ time: b[i]!.time as UTCTimestamp, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function lwchart(host: HTMLElement, _env: Env): Cleanup {
  const box = host.querySelector<HTMLElement>("[data-lw]");
  if (!box) return;
  const sym = box.dataset.lw!;
  const binance = box.dataset.lwBinance || "";
  const lite = box.dataset.lwLite === "1";
  const dec = Number(box.dataset.lwDec || "2");
  const prev = Number(box.dataset.lwPrev || "0");
  const exch = box.dataset.lwExch || "";
  const nf = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const nf2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vol = (v: number) =>
    v >= 1e12 ? `${nf2.format(v / 1e12)} T` : v >= 1e9 ? `${nf2.format(v / 1e9)} M` : v >= 1e6 ? `${nf2.format(v / 1e6)} jt` : v >= 1e3 ? `${nf2.format(v / 1e3)} rb` : nf2.format(v);

  let disposed = false;
  let chart: IChartApi | null = null;
  let candle: ISeriesApi<"Candlestick"> | null = null;
  let volume: ISeriesApi<"Histogram"> | null = null;
  const maSeries: ISeriesApi<"Line">[] = [];
  let rsiSeries: ISeriesApi<"Line"> | null = null;
  let bars: Bar[] = [];
  let tf: TF = "1D";
  let span = 0; // rentang terlihat (detik); 0 = bawaan
  let gen = 0; // nomor muat — respons lama diabaikan
  let ws: WebSocket | null = null;
  let wsTry = 0;
  let pollT = 0;
  let wsT = 0;
  let source: "binance" | "api" = binance ? "binance" : "api";
  let hover: Bar | null = null;

  // ------------------------------------------------------------ legenda & header
  const setText = (sel: string, txt: string, color?: string) => {
    host.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.textContent = txt;
      if (color) el.style.color = color;
    });
  };
  const legend = () => {
    const b = hover ?? bars[bars.length - 1];
    if (!b) return;
    const i = bars.indexOf(b);
    const p = i > 0 ? bars[i - 1]!.close : b.open;
    const col = b.close >= b.open ? "#15803D" : DOWN;
    for (const k of ["O", "H", "L", "C"] as const) {
      const v = k === "O" ? b.open : k === "H" ? b.high : k === "L" ? b.low : b.close;
      setText(`[data-lg="${k}"]`, ` ${nf.format(v)}`, col);
    }
    const d = b.close - p;
    setText('[data-lg="chg"]', `${d >= 0 ? "+" : "−"}${nf.format(Math.abs(d))} (${d >= 0 ? "+" : "−"}${nf2.format(p ? Math.abs((d / p) * 100) : 0)}%)`, d >= 0 ? "#15803D" : DOWN);
    setText('[data-lg="v"]', b.volume > 0 ? vol(b.volume) : "—");
    setText('[data-lg="vol"]', `Vol ${b.volume > 0 ? vol(b.volume) : "—"}`);
    const upTo = bars.slice(0, i + 1);
    for (const [n] of MA) {
      const m = sma(upTo.slice(-n), n);
      setText(`[data-lg="ma${n}"]`, m.length ? `MA ${n} · ${nf.format(m[m.length - 1]!.value)}` : `MA ${n} · —`);
    }
    const r = rsi(upTo.slice(-120));
    setText('[data-lg="rsi"]', r.length ? nf2.format(r[r.length - 1]!.value) : "—");
    setText('[data-lg="title"]', `${sym} · ${tf} · ${exch}`);
  };
  const header = (price: number) => {
    setText('[data-live="price"]', nf.format(price));
    if (prev > 0) {
      const d = price - prev;
      const up = d >= 0;
      const txt = `${up ? "+" : "−"}${nf.format(Math.abs(d))} · ${up ? "+" : "−"}${nf2.format(Math.abs((d / prev) * 100))}%`;
      host.querySelectorAll<HTMLElement>("[data-live-chg]").forEach((el) => {
        const t = el.firstChild;
        const s = (el.dataset.liveChg === "arrow" ? `${up ? "▲" : "▼"} ` : "") + txt;
        if (t && t.nodeType === Node.TEXT_NODE) t.textContent = s;
        else el.textContent = s;
        // Warna naik/turun mengikuti pasangan warna desain.
        const wasUp = el.dataset.liveUp !== "0";
        if (wasUp !== up) {
          let st = el.getAttribute("style") ?? "";
          for (const [u, dn] of UP_DOWN) {
            const [a, b] = up ? [dn, u] : [u, dn];
            st = st.split(a).join(b).split(a.toLowerCase()).join(b);
          }
          el.setAttribute("style", st);
          el.dataset.liveUp = up ? "1" : "0";
        }
      });
    }
  };

  // ------------------------------------------------------------ penggambaran
  const draw = () => {
    if (!candle || disposed) return;
    candle.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close }) as CandlestickData));
    volume?.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "rgba(22,163,74,.25)" : "rgba(229,72,77,.25)" }) as HistogramData));
    MA.forEach(([n], i) => maSeries[i]?.setData(sma(bars, n)));
    rsiSeries?.setData(rsi(bars));
    const ts = chart!.timeScale();
    const last = bars[bars.length - 1];
    if (last && span !== 0) {
      if (span < 0) ts.fitContent();
      else {
        const from = span === -2 ? Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000 + WIB : last.time - span;
        ts.setVisibleRange({ from: from as UTCTimestamp, to: last.time as UTCTimestamp });
      }
    } else {
      const n = lite ? 60 : 120;
      ts.setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length + 2 });
    }
    if (bars.length) host.classList.add("dc-lw-ready");
    legend();
    if (last && tf === "1D") header(last.close);
  };

  const push = (b: Bar) => {
    if (!candle || disposed) return;
    const last = bars[bars.length - 1];
    if (last && b.time < last.time) return;
    if (last && b.time === last.time) bars[bars.length - 1] = b;
    else {
      bars.push(b);
      if (bars.length > 1500) bars.shift();
    }
    candle.update({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close });
    volume?.update({ time: b.time as UTCTimestamp, value: b.volume, color: b.close >= b.open ? "rgba(22,163,74,.25)" : "rgba(229,72,77,.25)" });
    MA.forEach(([n], i) => {
      const m = sma(bars.slice(-n), n);
      if (m.length) maSeries[i]?.update(m[m.length - 1]!);
    });
    if (rsiSeries) {
      const r = rsi(bars.slice(-120));
      if (r.length) rsiSeries.update(r[r.length - 1]!);
    }
    if (!hover) legend();
    header(b.close);
  };

  // ------------------------------------------------------------ data
  const stopLive = () => {
    window.clearTimeout(pollT);
    window.clearTimeout(wsT);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  };

  const fromBinance = async (iv: string): Promise<Bar[]> => {
    const limit = tf === "1M" ? 200 : 1000;
    let lastErr: unknown;
    for (const base of BINANCE_REST) {
      try {
        const r = await fetch(`${base}/api/v3/klines?symbol=${binance}&interval=${iv}&limit=${limit}`);
        if (!r.ok) throw new Error(String(r.status));
        const rows = (await r.json()) as (string | number)[][];
        return rows.map((k) => ({ time: Number(k[0]) / 1000 + WIB, open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]! }));
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };

  const fromApi = async (): Promise<Bar[]> => {
    const iv = API_IV[tf];
    const limit = iv === "1day" ? 260 : 300; // sama dengan permintaan halaman → cache bersama dipakai ulang
    const r = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&interval=${iv}&limit=${limit}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { data: { t: string; o: number; h: number; l: number; c: number; v: number }[] };
    return j.data.map((c) => ({ time: Date.parse(c.t) / 1000 + WIB, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }));
  };

  const connectWs = (my: number) => {
    const iv = BINANCE_IV[tf];
    const url = `${BINANCE_WS[wsTry % BINANCE_WS.length]}/${binance.toLowerCase()}@kline_${iv}`;
    const s = new WebSocket(url);
    ws = s;
    s.onmessage = (ev) => {
      if (my !== gen) return;
      try {
        const k = JSON.parse(String(ev.data)).k;
        if (k) push({ time: k.t / 1000 + WIB, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
      } catch {
        /* abaikan pesan rusak */
      }
    };
    s.onopen = () => {
      wsTry = 0;
    };
    s.onclose = () => {
      if (my !== gen || disposed) return;
      wsTry++;
      wsT = window.setTimeout(() => connectWs(my), Math.min(30000, 1000 * 2 ** Math.min(wsTry, 5)));
    };
  };

  const poll = (my: number) => {
    // Emas & valas: data penyedia disegarkan tiap ±1 menit; hanya saat tab terlihat (hemat kuota).
    pollT = window.setTimeout(async () => {
      if (my !== gen || disposed) return;
      if (document.visibilityState === "visible") {
        try {
          const fresh = await fromApi();
          if (my !== gen) return;
          const last = bars[bars.length - 1];
          for (const b of fresh) if (!last || b.time >= last.time) push(b);
        } catch {
          /* coba lagi pada putaran berikutnya */
        }
      }
      poll(my);
    }, INTRADAY.has(tf) ? 30000 : 60000);
  };

  const load = async () => {
    const my = ++gen;
    stopLive();
    hover = null;
    try {
      let data: Bar[] = [];
      if (source === "binance") {
        try {
          data = await fromBinance(BINANCE_IV[tf]);
        } catch {
          source = "api"; // Binance tidak terjangkau dari jaringan pengguna → penyedia cadangan
        }
      }
      if (source === "api") data = await fromApi();
      if (my !== gen || disposed) return;
      bars = data;
      draw();
      if (source === "binance") connectWs(my);
      else poll(my);
    } catch {
      if (my === gen && !disposed) pollT = window.setTimeout(load, 15000);
    }
  };

  // ------------------------------------------------------------ grafik
  const container = document.createElement("div");
  container.setAttribute("data-lw-canvas", "");
  container.style.cssText = "position:absolute;inset:0;z-index:1;background:#FFFFFF;opacity:0;transition:opacity .2s";
  if (getComputedStyle(box).position === "static") box.style.position = "relative";
  box.appendChild(container);

  const fmtTime = (t: Time) => {
    const d = new Date(Number(t) * 1000);
    const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return INTRADAY.has(tf) ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} WIB` : tf === "1M" ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : day;
  };

  const init = async () => {
    const lw = await import("lightweight-charts");
    if (disposed) return;
    chart = lw.createChart(container, {
      autoSize: true,
      layout: { background: { type: lw.ColorType.Solid, color: "#FFFFFF" }, textColor: "#8794A8", fontFamily: "'Roboto Mono', monospace", fontSize: lite ? 10 : 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "#EEF2F7" } },
      rightPriceScale: { borderColor: "#E3EAF4", scaleMargins: lite ? { top: 0.04, bottom: 0.2 } : { top: 0.04, bottom: 0.32 } },
      timeScale: {
        borderColor: "#E3EAF4",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        tickMarkFormatter: (t: Time, type: number) => {
          const d = new Date(Number(t) * 1000);
          // 0 tahun, 1 bulan, 2 tanggal, 3+ jam
          if (type === 0) return String(d.getUTCFullYear());
          if (type === 1) return MONTHS[d.getUTCMonth()]!;
          if (type === 2) return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
          return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        },
      },
      localization: { locale: "id-ID", timeFormatter: fmtTime, priceFormatter: (p: number) => nf.format(p) },
      crosshair: { mode: lw.CrosshairMode.Normal, vertLine: { color: "#8794A8", labelBackgroundColor: "#0B0B0F" }, horzLine: { color: "#8794A8", labelBackgroundColor: "#0B0B0F" } },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    });
    candle = chart.addCandlestickSeries({
      upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false,
      priceFormat: { type: "price", precision: dec, minMove: 1 / 10 ** dec },
    });
    volume = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: lite ? { top: 0.84, bottom: 0 } : { top: 0.6, bottom: 0.24 } });
    const maList = lite ? MA.slice(0, 2) : MA;
    for (const [, color] of maList) {
      maSeries.push(chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
    }
    if (!lite) {
      rsiSeries = chart.addLineSeries({ priceScaleId: "rsi", color: "#7C3AED", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.8, bottom: 0.04 } });
      for (const lvl of [70, 30]) rsiSeries.createPriceLine({ price: lvl, color: "#C4B5FD", lineWidth: 1, lineStyle: lw.LineStyle.Dashed, axisLabelVisible: false, title: "" });
    }
    chart.subscribeCrosshairMove((p) => {
      const t = p.time as number | undefined;
      hover = t != null ? (bars.find((b) => b.time === t) ?? null) : null;
      legend();
    });
    await load();
    container.style.opacity = "1";
  };

  // ------------------------------------------------------------ kontrol desain
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    const btf = t?.closest<HTMLElement>("[data-tf]")?.dataset.tf as TF | undefined;
    const rg = t?.closest<HTMLElement>("[data-range]")?.dataset.range;
    if (btf && BINANCE_IV[btf]) {
      if (btf !== tf || span !== 0) {
        tf = btf;
        span = 0;
        void load();
      }
    } else if (rg && RANGE[rg]) {
      const [rtf, s] = RANGE[rg]!;
      span = s === 0 ? -2 : s;
      if (rtf !== tf) {
        tf = rtf;
        void load();
      } else draw();
    }
    // Board menggambar ulang setelah klik → pasang kembali nilai legenda terbaru.
    window.setTimeout(legend, 0);
  };
  host.addEventListener("click", onClick);
  const onVis = () => {
    if (document.visibilityState === "visible" && source === "binance" && !ws) void load();
  };
  document.addEventListener("visibilitychange", onVis);

  void init();
  return () => {
    disposed = true;
    gen++;
    stopLive();
    host.removeEventListener("click", onClick);
    document.removeEventListener("visibilitychange", onVis);
    chart?.remove();
    container.remove();
  };
}

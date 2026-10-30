import "server-only";
import type { Candle, Instrument, Quote } from "@/lib/types";
import { esc } from "./bind";

/**
 * Binder data pasar: mengganti angka contoh di artboard dengan harga live dari API (Twelve Data),
 * tanpa mengubah tata letak. Instrumen yang tidak tersedia di paket data tetap memakai tampilan desain.
 */

// Label yang dipakai desain → simbol internal.
const LABELS: Record<string, string> = {
  BTC: "BTCUSD", Bitcoin: "BTCUSD", "BTC/USD": "BTCUSD", BTCUSD: "BTCUSD",
  ETH: "ETHUSD", Ethereum: "ETHUSD", "ETH/USD": "ETHUSD", ETHUSD: "ETHUSD",
  Emas: "XAUUSD", "XAU/USD": "XAUUSD", XAUUSD: "XAUUSD", XAU: "XAUUSD",
  "USD/IDR": "USDIDR", USDIDR: "USDIDR",
  IHSG: "IHSG", LQ45: "LQ45", BBCA: "BBCA", BBRI: "BBRI", BMRI: "BMRI", TLKM: "TLKM", ASII: "ASII", GOTO: "GOTO",
};

const PRICE = /^(US\$|\$|Rp ?)?\d{1,3}(\.\d{3})*(,\d+)?$/;
const PCT = /^(▲|▼)?\s?[+−-]?\d+(,\d+)?%$/;
const ABS = /^[+−-]\d{1,3}(\.\d{3})*(,\d+)?$/;

// Pasangan warna naik ↔ turun yang dipakai desain.
const UP_DOWN: [string, string][] = [
  ["#15803D", "#DC2626"],
  ["#166534", "#991B1B"],
  ["#DCF5E4", "#FDE2E2"],
  ["#6EE7A0", "#FCA5A5"],
  ["#16A34A", "#E5484D"],
];

const nf = (d: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Jumlah desimal mengikuti contoh di desain, disesuaikan dengan besaran harga. */
function decimalsFor(sample: string, v: number): number {
  const m = /,(\d+)/.exec(sample);
  let d = m ? m[1]!.length : 0;
  if (Math.abs(v) < 10) d = Math.max(d, 4);
  else if (Math.abs(v) < 1000) d = Math.max(d, 2);
  return d;
}

export function fmtPrice(sample: string, v: number): string {
  const prefix = /^(US\$|\$|Rp ?)/.exec(sample)?.[1] ?? "";
  return prefix + nf(decimalsFor(sample.replace(prefix, ""), v)).format(v);
}

function sign(v: number, sample: string): string {
  if (v > 0) return "+";
  if (v < 0) return sample.includes("−") || !sample.includes("-") ? "−" : "-";
  return "";
}

export function fmtPct(sample: string, pct: number): string {
  const arrow = /^(▲|▼)/.test(sample) ? (pct >= 0 ? "▲ " : "▼ ") : "";
  return `${arrow}${sign(pct, sample)}${nf(2).format(Math.abs(pct))}%`;
}

function fmtAbs(sample: string, v: number, priceSample: string, price: number): string {
  return `${sign(v, sample)}${nf(decimalsFor(priceSample.replace(/^(US\$|\$|Rp ?)/, ""), price)).format(Math.abs(v))}`;
}

function recolor(tag: string, up: boolean): string {
  let t = tag;
  for (const [u, d] of UP_DOWN) {
    const [from, to] = up ? [d, u] : [u, d];
    t = t.split(from).join(to).split(from.toLowerCase()).join(to);
  }
  return t;
}

/**
 * Pindai teks artboard: setiap label instrumen yang diikuti angka harga dan perubahan %
 * (dalam beberapa segmen teks berikutnya) diganti dengan data live.
 */
export function bindQuotes(html: string, quotes: Map<string, Quote>): string {
  if (!quotes.size) return html;
  const parts = html.split(/(<[^>]+>)/);
  const texts: number[] = [];
  parts.forEach((p, i) => {
    if (p && !p.startsWith("<") && p.trim()) texts.push(i);
  });
  const val = (i: number) => parts[i]!.trim();
  const setText = (i: number, s: string) => {
    parts[i] = parts[i]!.replace(val(i), s);
  };
  // Tag pembuka terdekat sebelum teks (untuk warna naik/turun).
  const openTag = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (parts[j]!.startsWith("<") && !parts[j]!.startsWith("</")) return j;
    return -1;
  };
  for (let k = 0; k < texts.length; k++) {
    const sym = LABELS[val(texts[k]!)];
    const q = sym ? quotes.get(sym) : undefined;
    if (!sym || !q) continue;
    let price = -1;
    let abs = -1;
    let pct = -1;
    for (let j = k + 1; j < Math.min(k + 6, texts.length); j++) {
      const t = val(texts[j]!);
      const other = LABELS[t];
      if (other && other !== sym) break;
      if (price < 0 && PRICE.test(t)) price = j;
      else if (price >= 0 && abs < 0 && ABS.test(t)) abs = j;
      else if (price >= 0 && PCT.test(t)) {
        pct = j;
        break;
      }
    }
    if (price < 0 || pct < 0) continue;
    const up = q.change_percent >= 0;
    const ps = val(texts[price]!);
    setText(texts[price]!, fmtPrice(ps, q.price));
    if (abs >= 0) {
      setText(texts[abs]!, fmtAbs(val(texts[abs]!), q.change, ps, q.price));
      const ot = openTag(texts[abs]!);
      if (ot >= 0) parts[ot] = recolor(parts[ot]!, up);
    }
    setText(texts[pct]!, fmtPct(val(texts[pct]!), q.change_percent));
    const ot = openTag(texts[pct]!);
    if (ot >= 0) parts[ot] = recolor(parts[ot]!, up);
    k = pct;
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Detail market: harga utama, OHLC, MA, RSI, dan grafik candlestick dari data nyata.
// ---------------------------------------------------------------------------
function sma(c: Candle[], n: number): (number | null)[] {
  return c.map((_, i) => (i + 1 < n ? null : c.slice(i + 1 - n, i + 1).reduce((s, x) => s + x.c, 0) / n));
}

function rsi(c: Candle[], n = 14): (number | null)[] {
  const out: (number | null)[] = c.map(() => null);
  let g = 0;
  let l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i]!.c - c[i - 1]!.c;
    if (i <= n) {
      g += Math.max(d, 0);
      l += Math.max(-d, 0);
      if (i === n) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    } else {
      g = (g * (n - 1) + Math.max(d, 0)) / n;
      l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fx = (v: number) => v.toFixed(1);

interface ChartCfg {
  w: number; // lebar kanvas
  h: number;
  plotW: number; // lebar area candle (sumbu harga di kanan)
  top: number;
  bottom: number; // batas bawah area harga
  volBase: number;
  volH: number;
  labelY: number;
  axisX: number;
  font: number;
  ma: [number, string][];
  rsi?: { top: number; h: number };
  bodyRx: number;
  aria: string;
}

const APP: ChartCfg = { w: 350, h: 302, plotW: 300, top: 8, bottom: 222, volBase: 282, volH: 42, labelY: 295, axisX: 306, font: 9.5, ma: [[9, "#F59E0B"], [21, "#7C3AED"]], bodyRx: 1.2, aria: "" };
const WEB: ChartCfg = { w: 1020, h: 448, plotW: 954, top: 12, bottom: 296, volBase: 340, volH: 52, labelY: 440, axisX: 962, font: 11, ma: [[9, "#F59E0B"], [21, "#7C3AED"], [50, "#2F74EB"]], rsi: { top: 350, h: 68 }, bodyRx: 0, aria: "" };

export function candleSvg(kind: "app" | "web", candles: Candle[], label: string, dec: number): string {
  const cfg = kind === "app" ? APP : WEB;
  const c = candles.slice(kind === "app" ? -42 : -100);
  if (c.length < 5) return "";
  const lo = Math.min(...c.map((x) => x.l));
  const hi = Math.max(...c.map((x) => x.h));
  const pad = (hi - lo) * 0.06 || hi * 0.01;
  const min = lo - pad;
  const max = hi + pad;
  const y = (v: number) => cfg.top + ((max - v) / (max - min)) * (cfg.bottom - cfg.top);
  const step = cfg.plotW / c.length;
  const bw = Math.max(1.5, step * 0.62);
  const xc = (i: number) => i * step + step / 2;
  const f = nf(dec);
  const out: string[] = [];
  out.push(`<svg viewBox="0 0 ${cfg.w} ${cfg.h}" ${kind === "app" ? 'style="width: 100%; height: 302px; display: block"' : `width="${cfg.w}" height="${cfg.h}" style="display: block"`} role="img" aria-label="Grafik candlestick ${esc(label)} harian dengan volume dan moving average">`);
  // Grid & label harga.
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * (g + 0.5)) / 5;
    const yy = y(v);
    out.push(`<line x1="0" x2="${cfg.plotW}" y1="${fx(yy)}" y2="${fx(yy)}" stroke="#EEF2F7"/><text x="${cfg.axisX}" y="${fx(yy + cfg.font / 2.7)}" font-size="${cfg.font}" font-family="Roboto Mono, monospace" fill="#8794A8">${f.format(v)}</text>`);
  }
  // Volume.
  const vmax = Math.max(...c.map((x) => x.v)) || 0;
  if (vmax > 0) {
    c.forEach((k, i) => {
      const hh = (k.v / vmax) * cfg.volH;
      out.push(`<rect x="${fx(xc(i) - bw / 2)}" y="${fx(cfg.volBase - hh)}" width="${fx(bw)}" height="${fx(hh)}" rx="1" fill="${k.c >= k.o ? "#16A34A" : "#E5484D"}" opacity=".25"/>`);
    });
  }
  // Moving average.
  for (const [n, color] of cfg.ma) {
    const m = sma(c, n);
    const pts = m.map((v, i) => (v === null ? null : `${fx(xc(i))},${fx(y(v))}`)).filter(Boolean);
    if (pts.length > 1) out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" opacity=".9"/>`);
  }
  // Candle.
  c.forEach((k, i) => {
    const col = k.c >= k.o ? "#16A34A" : "#E5484D";
    const top = y(Math.max(k.o, k.c));
    const bh = Math.max(1, y(Math.min(k.o, k.c)) - top);
    out.push(`<line x1="${fx(xc(i))}" x2="${fx(xc(i))}" y1="${fx(y(k.h))}" y2="${fx(y(k.l))}" stroke="${col}" stroke-width="1.1"/><rect x="${fx(xc(i) - bw / 2)}" y="${fx(top)}" width="${fx(bw)}" height="${fx(bh)}"${cfg.bodyRx ? ` rx="${cfg.bodyRx}"` : ""} fill="${col}"/>`);
  });
  // Harga terakhir.
  const last = c[c.length - 1]!;
  const lcol = last.c >= c[c.length - 2]!.c ? "#16A34A" : "#E5484D";
  const ly = y(last.c);
  const boxW = kind === "app" ? 48 : 62;
  out.push(`<line x1="0" x2="${cfg.plotW}" y1="${fx(ly)}" y2="${fx(ly)}" stroke="${lcol}" stroke-dasharray="2 3"/><rect x="${cfg.axisX - 4}" y="${fx(ly - 10)}" width="${boxW}" height="20" rx="4" fill="${lcol}"/><text x="${cfg.axisX}" y="${fx(ly + cfg.font / 2.7)}" font-size="${cfg.font}" font-weight="700" font-family="Roboto Mono, monospace" fill="#FFFFFF">${f.format(last.c)}</text>`);
  // Label waktu.
  const date = (t: string) => {
    const d = new Date(t);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };
  const ticks = kind === "app" ? [0, Math.floor(c.length / 2), c.length - 1] : [0, 0.25, 0.5, 0.75, 1].map((p) => Math.min(c.length - 1, Math.round(p * (c.length - 1))));
  ticks.forEach((i, n) => {
    const anchor = n === 0 ? "start" : n === ticks.length - 1 ? "end" : "middle";
    const xx = n === 0 ? 0 : n === ticks.length - 1 ? cfg.plotW : xc(i);
    out.push(`<text x="${fx(xx)}" y="${cfg.labelY}" text-anchor="${anchor}" font-size="${cfg.font}" fill="#8794A8">${date(c[i]!.t)}</text>`);
  });
  // Panel RSI (web).
  if (cfg.rsi) {
    const r = rsi(c);
    const ry = (v: number) => cfg.rsi!.top + ((100 - v) / 100) * cfg.rsi!.h;
    out.push(`<line x1="0" x2="${cfg.w}" y1="344" y2="344" stroke="#E3EAF4"/><rect x="0" y="${fx(ry(70))}" width="${cfg.plotW}" height="${fx(ry(30) - ry(70))}" fill="#7C3AED" opacity=".05"/><line x1="0" x2="${cfg.plotW}" y1="${fx(ry(70))}" y2="${fx(ry(70))}" stroke="#C4B5FD" stroke-dasharray="3 3"/><line x1="0" x2="${cfg.plotW}" y1="${fx(ry(30))}" y2="${fx(ry(30))}" stroke="#C4B5FD" stroke-dasharray="3 3"/>`);
    const pts = r.map((v, i) => (v === null ? null : `${fx(xc(i))},${fx(ry(v))}`)).filter(Boolean);
    if (pts.length > 1) out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="#7C3AED" stroke-width="1.4"/>`);
    const lr = r[r.length - 1];
    if (lr != null) out.push(`<rect x="${cfg.axisX - 6}" y="${fx(ry(lr) - 9)}" width="62" height="18" rx="4" fill="#7C3AED"/><text x="${cfg.axisX}" y="${fx(ry(lr) + 4)}" font-size="11" font-weight="700" font-family="Roboto Mono, monospace" fill="#FFFFFF">${nf(2).format(lr)}</text>`);
  }
  out.push("</svg>");
  return out.join("");
}

function compactVol(v: number): string {
  if (v >= 1e9) return `${nf(1).format(v / 1e9)} M`;
  if (v >= 1e6) return `${nf(1).format(v / 1e6)} jt`;
  if (v >= 1e3) return `${nf(1).format(v / 1e3)} rb`;
  return nf(0).format(v);
}

function asOfText(inst: Instrument): string {
  const live = inst.asset_class === "crypto" ? "Pasar 24 jam" : "Live";
  const t = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(".", ":");
  return `${live} · ${t} WIB`;
}

/** Halaman detail market (web & app) untuk instrumen dengan data live. */
export function bindMarketDetail(html: string, kind: "web" | "app", inst: Instrument, q: Quote, candles: Candle[]): string {
  let h = html;
  const up = q.change >= 0;
  const dec = q.price < 10 ? 4 : q.price < 1000 ? 2 : 0;
  const f = nf(dec);
  const last = candles[candles.length - 1];
  const pctTxt = `${up ? "▲ +" : "▼ −"}${f.format(Math.abs(q.change))} · ${up ? "+" : "−"}${nf(2).format(Math.abs(q.change_percent))}%`;

  // Grafik.
  const svgRe = kind === "app" ? /<svg viewBox="0 0 350 302"[\s\S]*?<\/svg>/ : /<svg viewBox="0 0 1020 448"[\s\S]*?<\/svg>/;
  const chart = candleSvg(kind, candles, inst.symbol, dec);
  if (chart) h = h.replace(svgRe, chart);

  // OHLC & indikator di legenda grafik.
  if (last) {
    const ohlc = { O: last.o, H: last.h, L: last.l, C: last.c };
    const col = last.c >= last.o ? "#15803D" : "#E5484D";
    for (const [k, v] of Object.entries(ohlc)) {
      h = h.replace(new RegExp(`(<span>${k}<span style="[^"]*color: )#[0-9A-F]{6}("> )[\\d.,]+(</span>)`), `$1${col}$2${f.format(v)}$3`);
    }
    const ma = (n: number) => {
      const s = sma(candles, n);
      return s[s.length - 1];
    };
    for (const n of [9, 21, 50]) {
      const v = ma(n);
      if (v != null) h = h.replace(new RegExp(`>MA ${n} · [\\d.,]+<`, "g"), `>MA ${n} · ${f.format(v)}<`);
    }
    if (last.v > 0) h = h.replace(/(>Vol <span[^>]*>|>Vol )86,2 jt</g, `$1${compactVol(last.v)}<`);
    const r = rsi(candles);
    const lr = r[r.length - 1];
    if (lr != null) h = h.replace(/(RSI 14 close <span[^>]*>)[\d,]+(<\/span>)/, `$1${nf(2).format(lr)}$2`);
  }

  if (kind === "app") {
    h = h.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 34px[^"]*">)[\d.,]+(<\/span>)/, `$1${f.format(q.price)}$2`);
    h = h.replace(/<span style="([^"]*)">▲ \+112 · \+1,12%<\/span>/, (_m, st: string) => `<span style="${recolor(st, up)}">${pctTxt}</span>`);
    h = h.replace(/(<span style="width: 7px; height: 7px; border-radius: 999px; background: )#9AA6B8("><\/span>)Pasar tutup/, `$1#16A34A$2${inst.asset_class === "crypto" ? "Pasar 24 jam" : "Live"}`);
    h = h.replace(/>28 Okt · 16:00 WIB</, `>${esc(asOfText(inst).split(" · ").slice(1).join(" · "))}<`);
    h = h.replace(/(<strong style="color: #0B0B0F; font-weight: 700">)[^<]* · 1D · IDX(<\/strong>)/, `$1${esc(inst.symbol)} · 1D · ${esc(inst.exchange)}$2`);
    h = h.split("Bank Central Asia · IDX").join(`${esc(inst.name)} · ${esc(inst.exchange)}`);
  } else {
    h = h.replace(/(<span[^>]*>)10\.125(<\/span><span[^>]*>) IDR(<\/span>)/, `$1${f.format(q.price)}$2 ${esc(inst.currency)}$3`);
    h = h.replace(/(<div[^>]*>)\+112 · \+1,12%(<span[^>]*>)Pasar tutup · 28 Okt 16:00 WIB/, (_m, d: string, s: string) => `${recolor(d, up)}${pctTxt.replace(/^[▲▼] /, "")}${s}${esc(asOfText(inst))}`);
    h = h.replace(/(Bank Central Asia Tbk|[^<>]+) · \{\{ tfLbl \}\} · IDX/, `${esc(inst.name)} · {{ tfLbl }} · ${esc(inst.exchange)}`);
    // Ringkasan samping: rentang hari ini & volume (crypto/forex dari penyedia tidak punya volume).
    h = h.replace(/>9\.990 – 10\.150</, `>${f.format(q.low)} – ${f.format(q.high)}<`);
    if (q.week52_high > 0) h = h.replace(/(>Rentang 52 minggu<\/span><span[^>]*>)[^<]+</, `$1${f.format(q.week52_low)} – ${f.format(q.week52_high)}<`);
    h = h.replace(/(>Volume<\/span><span[^>]*>)86,2 jt</, `$1${q.volume > 0 ? compactVol(q.volume) : "—"}<`);
    h = h.replace(/(>Rata-rata vol \(30H\)<\/span><span[^>]*>)74,9 jt</, `$1${candles.some((x) => x.v > 0) ? compactVol(candles.slice(-30).reduce((a, x) => a + x.v, 0) / Math.min(30, candles.length)) : "—"}<`);
  }
  return h;
}

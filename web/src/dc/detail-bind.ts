import "server-only";
import type { Candle, Instrument, Quote } from "@/lib/types";
import { esc } from "./bind";

/**
 * Sinkronisasi seluruh isi halaman Detail Market dengan instrumen yang dibuka:
 * statistik, rentang, kinerja, ringkasan teknikal (dihitung dari candle harian), dan panel
 * fundamental/profil/dividen. Instrumen tanpa data harga ditampilkan "—", bukan angka contoh.
 */

const nf = (d: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const DASH = "—";

export function decimals(v: number): number {
  return Math.abs(v) < 10 ? 4 : Math.abs(v) < 1000 ? 2 : 0;
}

// ---------------------------------------------------------------- indikator teknikal
type Sig = 1 | 0 | -1;

function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  return xs.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function emaSeries(xs: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1]! * (1 - k)));
  return out;
}
function rsi(c: number[], n = 14): number | null {
  if (c.length <= n) return null;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i]! - c[i - 1]!;
    g += Math.max(d, 0);
    l += Math.max(-d, 0);
  }
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i]! - c[i - 1]!;
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export interface Technical {
  buy: number;
  neutral: number;
  sell: number;
  osc: { buy: number; neutral: number; sell: number };
  ma: { buy: number; neutral: number; sell: number };
  label: string;
  tone: "buy" | "sell" | "neutral";
}

function tally(sigs: Sig[]) {
  return { buy: sigs.filter((s) => s === 1).length, neutral: sigs.filter((s) => s === 0).length, sell: sigs.filter((s) => s === -1).length };
}

function verdict(t: { buy: number; neutral: number; sell: number }): { label: string; tone: Technical["tone"] } {
  const n = t.buy + t.neutral + t.sell || 1;
  const s = (t.buy - t.sell) / n;
  if (s >= 0.5) return { label: "Beli kuat", tone: "buy" };
  if (s >= 0.1) return { label: "Beli", tone: "buy" };
  if (s <= -0.5) return { label: "Jual kuat", tone: "sell" };
  if (s <= -0.1) return { label: "Jual", tone: "sell" };
  return { label: "Netral", tone: "neutral" };
}

/** Ringkasan teknikal ala TradingView: moving average (SMA/EMA) + osilator, dari candle harian. */
export function technical(candles: Candle[]): Technical | null {
  if (candles.length < 30) return null;
  const c = candles.map((x) => x.c);
  const h = candles.map((x) => x.h);
  const l = candles.map((x) => x.l);
  const price = c[c.length - 1]!;
  const cmp = (ma: number | null): Sig | null => (ma === null ? null : Math.abs(price - ma) / ma < 0.001 ? 0 : price > ma ? 1 : -1);
  const maSigs: Sig[] = [];
  for (const n of [10, 20, 30, 50, 100, 200]) {
    const s = cmp(sma(c, n));
    if (s !== null) maSigs.push(s);
    if (c.length >= n) {
      const e = emaSeries(c, n);
      maSigs.push(cmp(e[e.length - 1]!)!);
    }
  }
  const osc: Sig[] = [];
  const r = rsi(c);
  if (r !== null) osc.push(r < 30 ? 1 : r > 70 ? -1 : 0);
  const hh = Math.max(...h.slice(-14));
  const ll = Math.min(...l.slice(-14));
  const k = hh === ll ? 50 : ((price - ll) / (hh - ll)) * 100;
  osc.push(k < 20 ? 1 : k > 80 ? -1 : 0); // Stochastic %K
  const wr = hh === ll ? -50 : ((hh - price) / (hh - ll)) * -100;
  osc.push(wr < -80 ? 1 : wr > -20 ? -1 : 0); // Williams %R
  const tp = candles.slice(-20).map((x) => (x.h + x.l + x.c) / 3);
  const tpm = tp.reduce((a, b) => a + b, 0) / tp.length;
  const md = tp.reduce((a, b) => a + Math.abs(b - tpm), 0) / tp.length || 1;
  const cci = (tp[tp.length - 1]! - tpm) / (0.015 * md);
  osc.push(cci < -100 ? 1 : cci > 100 ? -1 : 0); // CCI 20
  const mom = price - c[c.length - 11]!;
  osc.push(mom > 0 ? 1 : mom < 0 ? -1 : 0); // Momentum 10
  const e12 = emaSeries(c, 12);
  const e26 = emaSeries(c, 26);
  const macd = c.map((_, i) => e12[i]! - e26[i]!);
  const sig = emaSeries(macd, 9);
  osc.push(macd[macd.length - 1]! > sig[sig.length - 1]! ? 1 : -1); // MACD
  const o = tally(osc);
  const m = tally(maSigs);
  const all = { buy: o.buy + m.buy, neutral: o.neutral + m.neutral, sell: o.sell + m.sell };
  return { ...all, osc: o, ma: m, ...verdict(all) };
}

const TONE_COLOR = { buy: "#16A34A", sell: "#E5484D", neutral: "#5F6B7D" };
const TONE_TEXT = { buy: "#15803D", sell: "#DC2626", neutral: "#5F6B7D" };
const TONE_BG = { buy: "#E7F6EC", sell: "#FDECEC", neutral: "#F1F4F9" };

// ---------------------------------------------------------------- kinerja
function perf(candles: Candle[], days: number): number | null {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1]!;
  const target = new Date(last.t).getTime() - days * 86400e3;
  const base = [...candles].reverse().find((x) => new Date(x.t).getTime() <= target);
  return base ? ((last.c - base.c) / base.c) * 100 : null;
}
function ytd(candles: Candle[]): number | null {
  if (!candles.length) return null;
  const last = candles[candles.length - 1]!;
  const y = new Date(last.t).getUTCFullYear();
  const base = candles.find((x) => new Date(x.t).getUTCFullYear() === y);
  return base ? ((last.c - base.c) / base.c) * 100 : null;
}

function pct(v: number | null): string {
  if (v === null) return DASH;
  return `${v >= 0 ? "+" : "−"}${nf(2).format(Math.abs(v))}%`;
}

function compact(v: number): string {
  if (v >= 1e9) return `${nf(1).format(v / 1e9)} M`;
  if (v >= 1e6) return `${nf(1).format(v / 1e6)} jt`;
  if (v >= 1e3) return `${nf(1).format(v / 1e3)} rb`;
  return nf(0).format(v);
}

/** Ganti nilai di bawah label sebuah kartu statistik: `>Label</span><span ...>nilai<`. */
function stat(h: string, label: string, value: string, newLabel?: string): string {
  const re = new RegExp(`>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(</span><span[^>]*>)[^<]*<`);
  return h.replace(re, `>${esc(newLabel ?? label)}$1${esc(value)}<`);
}

function marker(h: string, label: string, pos: number | null, lo: string, hi: string): string {
  // Rentang (app): label → bar dengan penanda posisi → angka bawah & atas.
  const re = new RegExp(`(<span>${label}</span></span><span[^>]*><span style="position: absolute; left: )calc\\(\\d+% - 7px\\)([^>]*></span></span><span[^>]*><span[^>]*>)[^<]*(</span><span[^>]*>)[^<]*<`);
  const p = pos === null ? 50 : Math.round(Math.max(0, Math.min(1, pos)) * 100);
  return h.replace(re, `$1calc(${p}% - 7px)$2${esc(lo)}$3${esc(hi)}<`);
}

export interface DetailData {
  inst: Instrument;
  quote: Quote | null;
  candles: Candle[];
  short: string;
}

export function bindDetail(html: string, kind: "web" | "app", d: DetailData): string {
  let h = html;
  const { inst, quote: q, candles, short } = d;
  const equity = inst.asset_class === "equity";
  const dec = q ? decimals(q.price) : 0;
  const f = nf(dec);
  const n = (v: number | null | undefined) => (q && v !== null && v !== undefined && v > 0 ? f.format(v) : DASH);
  const pos = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : null);
  const tech = technical(candles);

  h = h.split("Analisis AI BBCA").join(`Analisis AI ${esc(short)}`);

  if (kind === "app") {
    // Header tanpa data → "—" (bukan angka contoh BBCA).
    if (!q) {
      h = h.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 34px[^"]*">)[\d.,]+(<\/span>)/, `$1${DASH}$2`);
      h = h.replace(/(<span style="[^"]*">)▲ \+112 · \+1,12%(<\/span>)/, `$1${DASH}$2`);
      h = h.replace(/>Pasar tutup</, ">Data harga belum tersedia<").replace(/>28 Okt · 16:00 WIB</, ">Grafik: TradingView<");
    }
    h = marker(h, "Rentang hari ini", q ? pos(q.price, q.low, q.high) : null, n(q?.low), n(q?.high));
    h = marker(h, "Rentang 52 minggu", q ? pos(q.price, q.week52_low, q.week52_high) : null, n(q?.week52_low), n(q?.week52_high));
    // Kartu statistik: saham memakai label asli; aset lain diberi label yang relevan.
    const vol = q && q.volume > 0 ? compact(q.volume) : DASH;
    if (equity) {
      h = stat(h, "Pembukaan", n(q?.open));
      h = stat(h, "Volume", vol);
      for (const lbl of ["Nilai", "Kap. pasar", "P/E", "Div. yield", "Asing (net)", "Frekuensi", "Beta"]) h = stat(h, lbl, DASH);
    } else {
      h = stat(h, "Pembukaan", n(q?.open));
      h = stat(h, "Volume", q ? f.format(q.high) : DASH, "Tertinggi");
      h = stat(h, "Nilai", q ? f.format(q.low) : DASH, "Terendah");
      h = stat(h, "Kap. pasar", n(q?.previous_close), "Tutup kemarin");
      h = stat(h, "P/E", q ? `${q.change >= 0 ? "+" : "−"}${f.format(Math.abs(q.change))}` : DASH, "Perubahan");
      h = stat(h, "Div. yield", q ? pct(q.change_percent) : DASH, "Perubahan %");
      h = stat(h, "Asing (net)", pct(perf(candles, 7)), "Kinerja 1M");
      h = stat(h, "Frekuensi", pct(perf(candles, 30)), "Kinerja 1B");
      h = stat(h, "Beta", pct(ytd(candles)), "Kinerja YTD");
    }
    // Ringkasan teknikal (gauge).
    h = h.replace(/<svg viewBox="0 0 220 112"([\s\S]*?)<line x1="110" y1="100" x2="[\d.]+" y2="[\d.]+"/, (_m, mid: string) => {
      const s = tech ? (tech.buy - tech.sell) / (tech.buy + tech.neutral + tech.sell) : 0;
      const ang = Math.PI - ((s + 1) / 2) * Math.PI;
      return `<svg viewBox="0 0 220 112"${mid.replace(/aria-label="Ringkasan indikator: [^"]*"/, `aria-label="Ringkasan indikator: ${tech?.label ?? "belum tersedia"}"`)}<line x1="110" y1="100" x2="${(110 + 58 * Math.cos(ang)).toFixed(1)}" y2="${(100 - 58 * Math.sin(ang)).toFixed(1)}"`;
    });
    h = h.replace(/<strong style="font-size: 20px; font-weight: 700; color: #16A34A">Beli<\/strong>/, `<strong style="font-size: 20px; font-weight: 700; color: ${tech ? TONE_COLOR[tech.tone] : "#5F6B7D"}">${tech ? tech.label : "Belum tersedia"}</strong>`);
    h = h.replace(/(<span>Jual <b[^>]*>)3(<\/b><\/span><span>Netral <b[^>]*>)7(<\/b><\/span><span>Beli <b[^>]*>)16(<\/b>)/, `$1${tech?.sell ?? DASH}$2${tech?.neutral ?? DASH}$3${tech?.buy ?? DASH}$4`);
    h = h.replace(/Dihitung dari 26 indikator · bukan rekomendasi investasi/, tech ? `Dihitung dari ${tech.buy + tech.neutral + tech.sell} indikator harian · bukan rekomendasi investasi` : "Butuh data harga harian · bukan rekomendasi investasi");
    return h;
  }

  // ---------------- web
  if (!q) {
    h = h.replace(/(<span[^>]*>)10\.125(<\/span><span[^>]*>) IDR(<\/span>)/, `$1${DASH}$2 ${esc(inst.currency)}$3`);
    h = h.replace(/(<div[^>]*>)\+112 · \+1,12%(<span[^>]*>)Pasar tutup · 28 Okt 16:00 WIB/, `$1${DASH}$2Data harga belum tersedia · grafik: TradingView`);
    for (const lbl of ["Volume", "Rata-rata vol (30H)", "Rentang hari", "Rentang 52 minggu"]) h = stat(h, lbl, DASH);
  }

  // Kinerja 1M, 1B, 3B, 6B, YTD, 1T.
  const P: [string, number | null][] = [["1M", perf(candles, 7)], ["1B", perf(candles, 30)], ["3B", perf(candles, 91)], ["6B", perf(candles, 182)], ["YTD", ytd(candles)], ["1T", perf(candles, 365)]];
  for (const [lbl, v] of P) {
    const re = new RegExp(`<span style="([^"]*)background: #[0-9A-F]{6}"><span style="([^"]*)color: #[0-9A-F]{6}">[^<]*</span><span style="([^"]*)">${lbl}</span></span>`);
    const tone = v === null ? "neutral" : v >= 0 ? "buy" : "sell";
    h = h.replace(re, `<span style="$1background: ${TONE_BG[tone]}"><span style="$2color: ${TONE_TEXT[tone]}">${pct(v)}</span><span style="$3">${lbl}</span></span>`);
  }
  // Ringkasan teknikal (sidebar & tab Teknikal).
  h = h.replace(/(<span style="font-size: 13px">Ringkasan teknikal<\/span><strong style="[^"]*color: )#[0-9A-F]{6}(">)Beli kuat</, `$1${tech ? TONE_TEXT[tech.tone] : "#5F6B7D"}$2${tech?.label ?? "Belum tersedia"}<`);
  const bars = (title: string, t: { buy: number; neutral: number; sell: number } | undefined) => {
    const re = new RegExp(`(<strong style="font-weight: 700">${title}</strong><span style="font-weight: 700; color: )#[0-9A-F]{6}(">)[^<]*(</span></span><div[^>]*><span style="flex: )\\d+(;[^>]*></span><span style="flex: )\\d+(;[^>]*></span><span style="flex: )\\d+(;[^>]*></span></div><span[^>]*><span>Jual )\\d+(</span><span>Netral )\\d+(</span><span>Beli )\\d+(</span>)`);
    const v = t ? verdict(t) : null;
    h = h.replace(re, `$1${v ? TONE_TEXT[v.tone] : "#5F6B7D"}$2${v?.label ?? "Belum tersedia"}$3${t?.sell ?? 0}$4${t?.neutral ?? 1}$5${t?.buy ?? 0}$6${t?.sell ?? DASH}$7${t?.neutral ?? DASH}$8${t?.buy ?? DASH}$9`);
  };
  bars("Ringkasan", tech ?? undefined);
  bars("Osilator", tech?.osc);
  bars("Moving average", tech?.ma);

  // Panel yang hanya berlaku untuk saham.
  const pane = (key: string, body: string) => {
    h = h.replace(new RegExp(`(<sc-if value="\\{\\{ ${key.replace(/\./g, "\\.")} \\}\\}"[^>]*>)[\\s\\S]*?(</sc-if>)`), `$1${body}$2`);
  };
  const note = (t: string) => `<div style="padding: 22px 16px; font-size: 14px; line-height: 1.6; color: #5F6B7D">${t}</div>`;
  const kindName: Record<string, string> = { crypto: "aset kripto", forex: "pasangan mata uang", commodity: "komoditas", index: "indeks", equity: "saham" };
  if (!equity) {
    pane("bt.i1.on", note(`Data fundamental (laporan keuangan, valuasi) tidak berlaku untuk ${kindName[inst.asset_class] ?? "aset ini"}.`));
    pane("bt.i4.on", note(`${esc(inst.name)} tidak membagikan dividen.`));
  } else {
    pane("bt.i1.on", note("Data fundamental emiten belum tersedia di paket data saat ini."));
    pane("bt.i4.on", note("Jadwal dividen emiten belum tersedia di paket data saat ini."));
  }
  const profile =
    `<div style="padding: 12px 14px; font-size: 13px; line-height: 1.6"><p style="margin: 0 0 12px; color: #0B0B0F"><b>${esc(inst.name)}</b> (${esc(short)}) adalah ${kindName[inst.asset_class] ?? "instrumen"} yang diperdagangkan di ${esc(inst.exchange)} dalam mata uang ${esc(inst.currency)}.${inst.asset_class === "crypto" ? " Pasar kripto buka 24 jam setiap hari." : ""}</p>` +
    `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px">${[
      ["Kelas aset", kindName[inst.asset_class] ?? inst.asset_class],
      ["Bursa / sumber", inst.exchange],
      ["Mata uang", inst.currency],
    ]
      .map(([k, v]) => `<div style="padding: 10px 12px; border-radius: 12px; background: #F6F8FC"><span style="display: block; font-size: 11px; color: #5F6B7D">${esc(k!)}</span><span style="font-size: 14px; font-weight: 500">${esc(v!)}</span></div>`)
      .join("")}</div></div>`;
  if (!equity || inst.symbol !== "BBCA") pane("bt.i3.on", profile);
  // Kapitalisasi (sidebar) hanya relevan untuk saham.
  if (!equity) h = stat(h, "Kapitalisasi", n(q?.previous_close), "Tutup kemarin");
  else h = stat(h, "Kapitalisasi", DASH);
  return h;
}

/** Status bar tiruan (9:41) di artboard app disembunyikan di ponsel sungguhan. */
export function hideFakeStatusBar(html: string): string {
  // Status bar tiruan desain (jam 9:41 & baterai) dibuang beserta ruangnya, supaya header tidak terlalu tinggi.
  // Yang tersisa hanya area aman atas (notch) saat dibuka sebagai aplikasi layar penuh; di browser biasa = 0.
  return html.replace(/<div style="([^"]*)"><span>9:41<\/span>([\s\S]*?)<\/div>/, (_m, st: string, rest: string) => {
    if (rest.includes("<img")) {
      // Varian dengan logo (profil): logo tetap, jam dihapus, jarak atas dirapatkan.
      return `<div style="${st.replace(/padding: 14px (\d+px) 0/, "padding: max(10px, env(safe-area-inset-top)) $1 0").replace("justify-content: space-between", "justify-content: flex-end")}">${rest}</div>`;
    }
    const pos = st.includes("position: relative") ? "position: relative; " : "";
    return `<div aria-hidden="true" style="${pos}height: env(safe-area-inset-top, 0px)"></div>`;
  });
}

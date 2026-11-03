import "server-only";
import { esc } from "./bind";

/** Alat bantu binder panel admin (pola desain berulang: pill, sakelar, angka ringkas, potong bagian). */

/** Satu ikon <svg>…</svg> (tidak melompati ikon lain). */
export const SVG = String.raw`<svg(?:(?!<\/svg>)[\s\S])*<\/svg>`;
export const rx = (s: string, f = "") => new RegExp(s, f);

export function grab(h: string, r: RegExp, where: string): RegExpExecArray {
  const m = r.exec(h);
  if (!m) throw new Error(`binder admin: ${where} tidak ditemukan`);
  return m;
}

/** Semua elemen <tag …style="START…">…</tag> seimbang yang dimulai dengan atribut style tertentu. */
export function blocks(h: string, startsWith: string, tag = "div"): { start: number; end: number; html: string }[] {
  const out: { start: number; end: number; html: string }[] = [];
  let from = 0;
  for (;;) {
    const i = h.indexOf(startsWith, from);
    if (i < 0) break;
    const end = closeOf(h, i, tag);
    out.push({ start: i, end, html: h.slice(i, end) });
    from = end;
  }
  return out;
}

/** Indeks setelah tag penutup yang menyeimbangkan tag pembuka di posisi i. */
export function closeOf(h: string, i: number, tag = "div"): number {
  const open = rx(`<${tag}\\b`, "g");
  const close = `</${tag}>`;
  let depth = 0;
  let p = i;
  for (;;) {
    open.lastIndex = p;
    const o = open.exec(h);
    const c = h.indexOf(close, p);
    if (c < 0) throw new Error(`binder admin: </${tag}> tidak seimbang`);
    if (o && o.index < c) {
      depth++;
      p = o.index + 1;
    } else {
      depth--;
      p = c + close.length;
      if (depth === 0) return p;
    }
  }
}

const nf = new Intl.NumberFormat("id-ID");
export const num = (n: number) => nf.format(n);
/** 3200 → "3,2 rb"; 1400000 → "1,4 jt". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")} rb`;
  return nf.format(n);
}

const TONES = {
  green: ["#166534", "#DCF5E4"],
  blue: ["#1E40AF", "#E5ECFF"],
  orange: ["#9A3412", "#FFE4D2"],
  gray: ["#374151", "#EFF0F2"],
  yellow: ["#854D0E", "#FEF3C7"],
  red: ["#991B1B", "#FDE2E2"],
  lime: ["#3F6212", "#E4F8C9"],
} as const;
export type Tone = keyof typeof TONES;
export function pill(text: string, tone: Tone, size = 12): string {
  const [c, b] = TONES[tone];
  return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: ${size}px; font-weight: 500; color: ${c}; background: ${b}; padding: 5px 10px; border-radius: 999px; white-space: nowrap">${esc(text)}</span>`;
}

export function switchBtn(on: boolean, attrs: string): string {
  return `<button type="button" role="switch" aria-checked="${on}" ${attrs} style="flex: none; width: 48px; height: 28px; border-radius: 999px; border: 0; background: ${on ? "#4285F4" : "#DCE3EE"}; padding: 3px; display: flex; justify-content: flex-${on ? "end" : "start"}; cursor: pointer"><span style="width: 22px; height: 22px; border-radius: 999px; background: #FFFFFF"></span></button>`;
}

const WIB = "Asia/Jakarta";
export const fmtDate = (iso: string, withTime = false) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: WIB, day: "numeric", month: "short", year: withTime ? undefined : "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) })
    .format(new Date(iso))
    .replace(/\./g, ":")
    .replace(",", "");

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} hari lalu`;
  return fmtDate(iso);
}

/** Ganti teks persis pertama >from< dengan teks baru (di-escape). */
export const swap = (h: string, from: string, to: string) => h.replace(`>${from}<`, `>${esc(to)}<`);

export const emptyRow = (text: string) => `<div style="padding: 28px 18px; text-align: center; font-size: 14px; color: #5F6B7D; border-top: 1px solid #E3EBF7">${esc(text)}</div>`;

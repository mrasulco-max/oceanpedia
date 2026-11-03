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

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Kartu statistik admin: angka, panah opsional, pill, keterangan. Judul kartu bisa diganti (`rename`). */
export function statCard(h: string, title: string, value: string, pillHtml: string, caption: string, opt: { arrow?: "up" | "down" | null; rename?: string } = {}): string {
  const re = rx(
    `(<h3 style="margin: 0; font-size: 15px; font-weight: 500">)${reEsc(title)}(</h3>(?:(?!</section>)[\\s\\S])*?letter-spacing: -.01em">)(?:(?!</span>)[\\s\\S])*(</span>)(?:<span style="font-size: 14px; color: #[0-9A-Fa-f]{6}">[▲▼]</span>)?(<span style="margin-left: auto">)<span[^>]*>[^<]*</span>(</span></div>\\s*<span style="font-size: 13px; line-height: 1.45; color: #5F6B7D">)(?:(?!</span>)[\\s\\S])*(</span>)`,
  );
  if (!re.test(h)) throw new Error(`binder admin: kartu "${title}" tidak ditemukan`);
  const arrow = opt.arrow === "up" ? '<span style="font-size: 14px; color: #22C55E">▲</span>' : opt.arrow === "down" ? '<span style="font-size: 14px; color: #EF4444">▼</span>' : "";
  const name = esc(opt.rename ?? title);
  return h
    .replace(re, `$1${name}$2${esc(value)}$3${arrow}$4${pillHtml}$5${esc(caption)}$6`)
    .replace(`aria-label="Detail ${title}"`, `aria-label="Detail ${name}"`);
}

/** Tab berangka (tablist desain): [kunci, label, jumlah, href]. Jumlah besar diringkas (6,4 rb). */
export function tabsBar(h: string, items: [string, string, number, string][], active: string): string {
  const tl = grab(h, /<div role="tablist" class="scroll-x"[^>]*>([\s\S]*?)<\/div>/, "tab");
  const all = tl[1]!.match(/<a href="#" role="tab"[\s\S]*?<\/a>/g);
  if (!all) throw new Error("binder admin: isi tab tidak ditemukan");
  const on = all.find((t) => t.includes('aria-selected="true"')) ?? all[0]!;
  const off = all.find((t) => t.includes('aria-selected="false"')) ?? on;
  const built = items
    .map(([key, label, n, href], i) => {
      const src = key === active ? on : (all[i] && !all[i]!.includes('aria-selected="true"') ? all[i]! : off);
      return src
        .replace('href="#"', `href="${href}"`)
        .replace(/(min-width: 32px; height: 32px;[^"]*">)[^<]*(<\/span>)/, `$1${n >= 10000 ? compact(n).replace(" ", "") : num(n)}$2`)
        .replace(/(<span style="font-size: 16px; font-weight: (?:500|400)">)[^<]*(<\/span>)/, `$1${esc(label)}$2`);
    })
    .join("");
  return h.replace(tl[0], tl[0].replace(tl[1]!, built));
}

/** Sel titik status (grid mingguan): selesai ✓, terlewat ✗, berjalan, terjadwal, kosong. */
export type Dot = "done" | "missed" | "running" | "scheduled" | "empty";
export function dotCells(h: string): Record<Dot, string> {
  const ok = grab(h, rx(`<span title="Terbit" style="([^"]*)">(${SVG})</span>`), "titik selesai");
  const miss = rx(`<span title="Terlewat" style="([^"]*)">(${SVG})</span>`).exec(h);
  const wrap = (inner: string) => `<span style="display: flex; justify-content: center">${inner}</span>`;
  return {
    done: wrap(`<span title="Aktif" style="${ok[1]}">${ok[2]}</span>`),
    missed: wrap(miss ? `<span title="Bermasalah" style="${miss[1]}">${miss[2]}</span>` : `<span title="Bermasalah" style="width: 26px; height: 26px; border-radius: 999px; background: #FDE2E2"></span>`),
    running: wrap('<span title="Hari ini" style="width: 26px; height: 26px; border-radius: 999px; background: #E4F8C9; border: 2px solid #84CC16; box-sizing: border-box"></span>'),
    scheduled: wrap('<span title="Terjadwal" style="width: 26px; height: 26px; border-radius: 999px; border: 1.5px dashed #C9CDD3; box-sizing: border-box"></span>'),
    empty: wrap('<span style="width: 26px; height: 26px"></span>'),
  };
}

/** Ganti isi grid titik 7 kolom (judul baris + 7 sel per baris) di bawah judul `anchor`. */
export function dotGrid(h: string, anchor: string, rows: [string, Dot[]][], cells: Record<Dot, string>): string {
  const at = h.indexOf(anchor);
  if (at < 0) throw new Error(`binder admin: grid "${anchor}" tidak ditemukan`);
  const gStart = h.indexOf('<div style="display: grid; grid-template-columns: 44px repeat(7', at);
  const gEnd = closeOf(h, gStart);
  const grid = h.slice(gStart, gEnd);
  const headEnd = grid.lastIndexOf('<span style="text-align: center; font-size: 12px; color: #5F6B7D">');
  const head = grid.slice(0, grid.indexOf("</span>", headEnd) + 7);
  const label = (t: string) => `<span style="font-size: 13px; color: #5F6B7D">${esc(t)}</span>`;
  const body = rows.map(([t, ds]) => label(t) + ds.map((d) => cells[d]).join("")).join("");
  return h.slice(0, gStart) + head + body + "</div>" + h.slice(gEnd);
}

/** Langkah alur (daftar horizontal desain). */
export interface Step {
  when: string;
  title: string;
  sub: string;
  state: "done" | "current" | "todo";
}
export function flowSteps(h: string, anchorRe: RegExp, label: string, steps: Step[]): string {
  const m = anchorRe.exec(h);
  if (!m) throw new Error("binder admin: alur tidak ditemukan");
  const wrapStart = h.lastIndexOf('<div style="display: flex; flex-direction: column; gap: 8px">', m.index);
  const wrapEnd = closeOf(h, wrapStart);
  const f = h.slice(wrapStart, wrapEnd);
  const items = f.match(/<div role="listitem" style="flex: none">[\s\S]*?<\/a><\/div>/g) ?? [];
  const done = items.find((x) => x.includes("background: #4285F4; color: #FFFFFF")) ?? items[0]!;
  const cur = items.find((x) => x.includes("border: 2px solid #84CC16"));
  const todo = items.find((x) => x.includes("border: 1px dashed #C9CDD3"));
  const tpl = (st: Step["state"]) => {
    if (st === "current" && cur) return cur;
    if (st === "todo" && todo) return todo;
    if (st === "done") return done;
    // Desain tanpa contoh keadaan ini: turunkan dari langkah selesai.
    return done.replace(rx(`<span style="flex: none; width: 34px; height: 34px; border-radius: 999px; background: #4285F4; color: #FFFFFF;[^"]*">${SVG}</span>`),
      st === "current"
        ? '<span style="flex: none; width: 34px; height: 34px; border-radius: 999px; background: #E4F8C9; border: 2px solid #84CC16; box-sizing: border-box"></span>'
        : '<span style="flex: none; width: 34px; height: 34px; border-radius: 999px; background: #EFF0F2; border: 1px dashed #C9CDD3; box-sizing: border-box"></span>');
  };
  const built = steps
    .map((s) =>
      tpl(s.state)
        .replace(/<a href="#" style="flex: none; width: 236px/, '<span style="flex: none; width: 236px')
        .replace(/<\/a><\/div>$/, "</span></div>")
        .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(s.when)}$2`)
        .replace(/(<strong style="font-size: 13px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(s.title)}$2`)
        .replace(/(<span style="font-size: 12px; color: #5F6B7D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/span>)/, `$1${esc(s.sub)}$2`),
    )
    .join("");
  const listRe = /(<div role="list"[^>]*>)[\s\S]*(<\/div>\s*<\/div>)$/;
  const out = f.replace(/(<span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(label)}$2`).replace(listRe, `$1${built}$2`);
  return h.slice(0, wrapStart) + out + h.slice(wrapEnd);
}

/** Avatar inisial berwarna stabil per nama. */
const AV: [string, string][] = [["#FFE4D2", "#9A3412"], ["#E5ECFF", "#1E40AF"], ["#EDE9FE", "#5B21B6"], ["#DCF5E4", "#166534"], ["#FEF3C7", "#854D0E"], ["#EFF0F2", "#374151"]];
export function avatarColors(seed: string): [string, string] {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[x % AV.length]!;
}
export function recolorAvatar(span: string, seed: string): string {
  const [bg, fg] = avatarColors(seed);
  return span.replace(/background: #[0-9A-Fa-f]{6}; color: #[0-9A-Fa-f]{6}/, `background: ${bg}; color: ${fg}`);
}

/** Tombol desain (a.href="#" + ikon + label) → tombol aksi dengan atribut data; "" bila tidak ada. */
export function actionBtn(h: string, label: string, attrs: string, newLabel?: string): string {
  const m = rx(`<a href="[^"]*"([^>]*>)(${SVG})?${reEsc(label)}</a>`).exec(h);
  if (!m) return "";
  return `<a href="#" ${attrs}${m[1]}${m[2] ?? ""}${esc(newLabel ?? label)}</a>`;
}

/** Input & select bergaya desain admin. */
export const INPUT_STYLE = "min-height: 46px; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px; color: #0B0B0F; box-sizing: border-box; width: 100%";
export const LABEL_STYLE = "display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D; min-width: 0";
export function field(label: string, control: string): string {
  return `<label style="${LABEL_STYLE}">${esc(label)}${control}</label>`;
}
export function input(attrs: string, value = "", extra = ""): string {
  return `<input ${attrs} value="${esc(value)}" style="${INPUT_STYLE}${extra}">`;
}
export function select(attrs: string, options: [string, string][], value: string): string {
  return `<select ${attrs} style="${INPUT_STYLE}; appearance: auto">${options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
}

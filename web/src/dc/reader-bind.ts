import "server-only";
import type { AdSlot, ArticleCard, EconomicEvent, Instrument, Quote } from "@/lib/types";
import type { UserAlert, UserNotification, WatchItem } from "@/lib/me";
import { esc as esc0 } from "./bind";
import { avatarColors, ago, blocks, closeOf, emptyRow, recolorAvatar, rx, SVG } from "./kit";
import { initials } from "./bind";

/**
 * Binder fitur pembaca: Watchlist (web & app), Price alert, Tersimpan, Notifikasi,
 * Kalender ekonomi, Penulis/Topik, serta iklan nyata di slot desain.
 */

/** Escape HTML + "$" (sebagai &#36;) agar aman dipakai dalam string pengganti String.replace ("$1"). */
const esc = (s: string) => esc0(s).replace(/\$/g, "&#36;");

const nf = (dec: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export function price(v: number, cur: string): string {
  const dec = v === 0 ? 2 : Math.abs(v) < 10 ? 4 : cur === "IDR" || Math.abs(v) >= 1000 ? 0 : 2;
  const s = nf(dec).format(v);
  return cur === "USD" ? `$${s}` : s;
}
export const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2).replace(".", ",")}%`;
const pctArrow = (v: number) => `${v >= 0 ? "▲" : "▼"} ${pct(v)}`;
export const displaySym = (i: Pick<Instrument, "symbol" | "asset_class">) =>
  (i.asset_class === "crypto" || i.asset_class === "forex" || i.asset_class === "commodity") && i.symbol.length === 6 && i.symbol !== "IHSG" ? `${i.symbol.slice(0, 3)}/${i.symbol.slice(3)}` : i.symbol;
const short = (s: string) => (s.length >= 6 ? s.slice(0, 3) : s);
const CLASS_TAB: Record<Instrument["asset_class"], string> = { equity: "saham", index: "saham", crypto: "crypto", commodity: "komoditas", forex: "forex" };

/** Garis 7 hari dari harga penutupan nyata. */
export function spark(closes: number[], w: number, h: number): string {
  if (closes.length < 2) return `<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((c - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const up = closes[closes.length - 1]! >= closes[0]!;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "#16A34A" : "#E5484D"}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export interface WatchData {
  loggedIn: boolean;
  items: WatchItem[];
  quotes: Map<string, Quote>;
  alerts: UserAlert[];
  sparks: Map<string, number[]>;
  news: ArticleCard[];
  alertLimit: number;
}

function alertLabel(a: UserAlert, cur: string): string {
  if (a.threshold == null) return "Berita baru";
  if (a.condition === "price_above") return `${price(a.threshold, cur)} ▲`;
  if (a.condition === "price_below") return `${price(a.threshold, cur)} ▼`;
  if (a.condition === "change_pct") return `±${Math.abs(a.threshold).toString().replace(".", ",")}%`;
  return a.condition;
}

/** Ganti daftar kartu berita (blok <a href="/berita/…">) dengan berita nyata atau pesan kosong. */
function newsList(h: string, prefix: string, news: ArticleCard[], fill: (tpl: string, a: ArticleCard, i: number) => string, empty: string): string {
  const rows = blocks(h, prefix, "a");
  if (!rows.length) return h;
  const tpl0 = rows[0]!.html;
  const tpl1 = rows[1]?.html ?? tpl0;
  const built = news.length ? news.map((a, i) => fill(i ? tpl1 : tpl0, a, i)).join("") : emptyRow(empty);
  return h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
}
const cover = (tpl: string, a: ArticleCard) => (a.cover_url ? tpl.replace(/src="\/img\/news-\d\.jpg"/, `src="${esc(a.cover_url)}"`).replace(/alt=""/, `alt="${esc(a.cover_alt || a.title)}"`) : tpl);

function summary(d: WatchData) {
  let up = 0, down = 0, sum = 0, n = 0;
  for (const it of d.items) {
    const q = d.quotes.get(it.symbol);
    if (!q) continue;
    n++;
    sum += q.change_percent;
    if (q.change_percent >= 0) up++;
    else down++;
  }
  return { up, down, avg: n ? sum / n : 0, n, active: d.alerts.filter((a) => a.active).length };
}

// ======================================================================= watchlist (aplikasi)
export function bindWatchlistApp(html: string, d: WatchData): string {
  let h = html;
  const s = summary(d);
  h = h.replace(/(<strong style="font-size: 20px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${d.items.length ? `${s.up} naik · ${s.down} turun` : "Belum ada aset"}$2`);
  h = h.replace(/(<span style="font-size: 12px; opacity: .9">)[^<]*(<\/span>)/, `$1${s.active} price alert aktif$2`);
  h = h.replace(/<a href="\/cari" aria-label="Tambah aset"/, '<a href="#" data-wl-action="add" aria-label="Tambah aset"');
  // Tab: jumlah per kelas aset.
  const cnt = (k: string) => d.items.filter((i) => k === "semua" || CLASS_TAB[i.asset_class] === k).length;
  ["semua", "saham", "crypto", "komoditas", "forex"].forEach((k, i) => {
    h = h.replace(rx(`(<button onClick="\\{\\{ u1\\.m${i}\\.pick \\}\\}"[^>]*>[^<]*<span style="opacity: .8">)\\d+(</span>)`), `$1${cnt(k)}$2`).replace(`{{ u1.m${i}.pick }}"`, `{{ u1.m${i}.pick }}" data-wl-tab="${k}"`);
  });
  const rows = blocks(h, '<a href="/market/BBCA" style="display: flex; align-items: center; gap: 12px; min-height: 64px;', "a");
  if (rows.length) {
    const tpl = rows[1]?.html ?? rows[0]!.html;
    const built = !d.loggedIn
      ? emptyRow("Masuk untuk menyimpan aset favorit di semua perangkat.") + '<a href="/masuk?next=/watchlist" style="display: block; text-align: center; padding: 12px; color: #2F74EB; font-weight: 500">Masuk</a>'
      : d.items.length
        ? d.items
            .map((it, i) => {
              const q = d.quotes.get(it.symbol);
              let r = tpl
                .replace('href="/market/BBCA"', `href="/market/${encodeURIComponent(it.symbol)}" data-wl-row="${esc(it.symbol)}" data-wl-class="${CLASS_TAB[it.asset_class]}" data-wl-name="${esc(it.symbol)}" data-wl-price="${q?.price ?? 0}" data-wl-chg="${q?.change_percent ?? 0}"`)
                .replace("border-top: 1px solid #E3EAF4", i ? "border-top: 1px solid #E3EAF4" : "")
                .replace(/(<span style="flex: none; width: 36px; height: 36px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}(; [^"]*font-size: )\d+px([^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string, e: string) =>
                  recolorAvatar(`${a}background: #000000; color: #000000${b}${short(it.symbol).length > 4 ? 9 : 11}px${c}${esc(short(it.symbol))}${e}`, it.symbol),
                )
                .replace(/(<strong style="font-size: 15px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(displaySym(it))}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/span>)/, `$1${esc(it.name)}$2`)
                .replace(rx(SVG), spark(d.sparks.get(it.symbol) ?? [], 64, 24))
                .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${q ? esc(price(q.price, it.currency)) : "—"}$2`);
              r = r.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #[0-9A-F]{6}; background: #[0-9A-F]{6}([^"]*)">[^<]*<\/span>/, (_m, rest: string) => {
                if (!q) return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #374151; background: #EFF0F2${rest}">—</span>`;
                const up = q.change_percent >= 0;
                return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: ${up ? "#166534" : "#991B1B"}; background: ${up ? "#DCF5E4" : "#FDE2E2"}${rest}">${pctArrow(q.change_percent)}</span>`;
              });
              // Tombol hapus (tampil saat mode ubah).
              return r.replace(/<\/a>$/, `<button type="button" data-wl-remove="${esc(it.symbol)}" aria-label="Hapus ${esc(it.symbol)} dari watchlist" style="display: none; flex: none; width: 32px; height: 32px; border-radius: 999px; border: 0; background: #FDE2E2; color: #991B1B; font-size: 18px; line-height: 1">×</button></a>`);
            })
            .join("")
        : emptyRow("Watchlist masih kosong. Ketuk + untuk menambah aset.");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  h = newsList(
    h,
    '<a href="/berita/ihsg-menguat-ditopang-saham-perbankan" style="display: flex; gap: 12px; padding: 12px 0;',
    d.news,
    (tpl, a) =>
      cover(tpl, a)
        .replace('href="/berita/ihsg-menguat-ditopang-saham-perbankan"', `href="/berita/${encodeURIComponent(a.slug)}"`)
        .replace(/(<strong style="font-size: 14px; line-height: 1.35; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(a.title)}$2`)
        .replace(/(<span style="font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.category.name)} · ${esc(ago(a.published_at))}$2`),
    d.items.length ? "Belum ada berita yang menautkan aset di watchlist kamu." : "Tambahkan aset untuk melihat berita terkait.",
  );
  return h;
}

// ======================================================================= watchlist (web)
export function bindWatchlistWeb(html: string, d: WatchData): string {
  let h = html;
  const s = summary(d);
  const stat = (label: string, v: string, sub: string, color?: string) => {
    h = h.replace(rx(`(<span style="font-size: 13px; color: #5F6B7D">${label}</span>\\s*<strong[^>]*>)[^<]*(</strong>\\s*<span style="font-size: 12px; color: )#[0-9A-F]{6}(">)[^<]*(</span>)`), `$1${esc(v)}$2${color ?? "#5F6B7D"}$3${esc(sub)}$4`);
  };
  stat("Aset dipantau", String(d.items.length), `${s.up} naik · ${s.down} turun`);
  stat("Price alert aktif", String(s.active), `${s.active} dari ${d.alertLimit} gratis terpakai`, "#2F74EB");
  stat("Kinerja rata-rata", s.n ? pct(s.avg) : "—", "hari ini", s.avg >= 0 ? "#15803D" : "#DC2626");
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Buat daftar baru</a>`), '<a href="/alert"$1$2Buat price alert</a>');
  h = h.replace(rx(`<a href="/cari"( class="ob-anim"[^>]*>)(${SVG})Tambah aset</a>`), '<a href="#" data-wl-action="add"$1$2Tambah aset</a>');
  // Tab kelas aset (tab ke-6 "Daftar: Dividen" dibuang — satu daftar per akun).
  const tl = /(<div role="tablist" class="ob-scroll" style="display: flex; gap: 8px; overflow-x: auto">)([\s\S]*?)(<\/div>)/.exec(h);
  if (tl) {
    const tabs = tl[2]!.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const on = tabs[0]!;
    const off = tabs[1] ?? on;
    const keys: [string, string][] = [["semua", "Semua"], ["saham", "Saham"], ["crypto", "Crypto"], ["komoditas", "Komoditas"], ["forex", "Forex"]];
    const built = keys
      .map(([k, label], i) => {
        const n = d.items.filter((it) => k === "semua" || CLASS_TAB[it.asset_class] === k).length;
        return (i ? off : on).replace("<button ", `<button type="button" data-wl-tab="${k}" `).replace(/>([^<]+)(<span[^>]*>)\d+(<\/span>)/, `>${label} $2${n}$3`);
      })
      .join("");
    h = h.replace(tl[0], tl[1] + built + tl[3]);
  }
  const rows = blocks(h, '<div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr 110px 1fr 50px; gap: 12px; align-items: center; padding: 12px 18px;');
  if (rows.length) {
    const tpl = rows[0]!.html;
    const built = !d.loggedIn
      ? emptyRow("Masuk untuk menyimpan aset favorit dan price alert di semua perangkat.") + '<a href="/masuk?next=/watchlist" style="display: block; text-align: center; padding: 14px; color: #2F74EB; font-weight: 500; border-top: 1px solid #E3EAF4">Masuk</a>'
      : d.items.length
        ? d.items
            .map((it) => {
              const q = d.quotes.get(it.symbol);
              const al = d.alerts.find((a) => a.symbol === it.symbol && a.active);
              return tpl
                .replace("<div ", `<div data-wl-row="${esc(it.symbol)}" data-wl-class="${CLASS_TAB[it.asset_class]}" `)
                .replace('href="/market/BBCA"', `href="/market/${encodeURIComponent(it.symbol)}"`)
                .replace(/(<span style="flex: none; width: 36px; height: 36px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}(; [^"]*font-size: )\d+px([^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string, e: string) =>
                  recolorAvatar(`${a}background: #000000; color: #000000${b}${short(it.symbol).length > 4 ? 9 : 11}px${c}${esc(short(it.symbol))}${e}`, it.symbol),
                )
                .replace(/(<strong style="font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(displaySym(it))}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(it.name)}$2`)
                .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 15px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${q ? esc(price(q.price, it.currency)) : "—"}$2`)
                .replace(/<span style="font-weight: 700; color: #[0-9A-F]{6}">[^<]*<\/span>/, q ? `<span style="font-weight: 700; color: ${q.change_percent >= 0 ? "#15803D" : "#DC2626"}">${pct(q.change_percent)}</span>` : '<span style="font-weight: 700; color: #5F6B7D">—</span>')
                .replace(rx(`(<span style="display: flex; justify-content: flex-end; align-items: center">)${SVG}(</span>)`), `$1${spark(d.sparks.get(it.symbol) ?? [], 90, 26)}$2`)
                .replace(rx(`(<span style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #2F74EB">)(?:${SVG})?[^<]*(</span>)`), (m, a: string, b: string) => {
                  const bell = rx(SVG).exec(m)?.[0] ?? "";
                  return al ? `${a}${bell}${esc(alertLabel(al, it.currency))}${b}` : `${a}<a href="/alert?symbol=${encodeURIComponent(it.symbol)}" style="color: #2F74EB">+ Buat alert</a>${b}`;
                })
                .replace(/<a href="#" aria-label="Opsi"/, `<a href="#" data-wl-remove="${esc(it.symbol)}" aria-label="Hapus ${esc(it.symbol)} dari watchlist" title="Hapus dari watchlist"`);
            })
            .join("")
        : emptyRow("Watchlist masih kosong. Tekan “Tambah aset” untuk mulai memantau.");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  h = newsList(
    h,
    '<a href="/berita/ihsg-menguat-ditopang-saham-perbankan" style="display: flex; gap: 18px; padding: 18px 0;',
    d.news,
    (tpl, a) =>
      cover(tpl, a)
        .replace('href="/berita/ihsg-menguat-ditopang-saham-perbankan"', `href="/berita/${encodeURIComponent(a.slug)}"`)
        .replace(/(<span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #2F74EB">)[^<]*(<\/span>)/, `$1${esc(a.category.name.toUpperCase())}$2`)
        .replace(/(<strong style="font-size: 17px; line-height: 1.35; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(a.title)}$2`)
        .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.author_name)} · ${esc(ago(a.published_at))}$2`),
    d.items.length ? "Belum ada berita yang menautkan aset di watchlist kamu." : "Tambahkan aset untuk melihat berita terkait.",
  );
  return h;
}

// ======================================================================= price alert (aplikasi)
export interface AlertPage {
  loggedIn: boolean;
  inst: Instrument;
  quote: Quote | null;
  closes: number[];
  alerts: UserAlert[];
  limit: number;
  email: string;
  phone: string | null;
  plan: boolean;
  instruments: Instrument[];
}
const COND_TEXT: Record<string, string> = { price_above: "naik ke", price_below: "turun ke", change_pct: "berubah", news: "berita baru" };
const FREQ_TEXT: Record<string, string> = { once: "sekali", every_time: "setiap kali", daily: "harian" };
const CH_TEXT: Record<string, string> = { push: "Push", email: "email", whatsapp: "WhatsApp", in_app: "in-app" };

export function bindAlert(html: string, d: AlertPage): string {
  let h = html;
  const q = d.quote;
  const cur = d.inst.currency;
  const active = d.alerts.filter((a) => a.active);
  h = h.replace(rx(`(<a href="#alert-aktif"[^>]*>)(${SVG})[^<]*(</a>)`), `$1$2${active.length} aktif$3`);
  h = h.replace('href="/market/BBCA" aria-label="Kembali"', `href="/market/${encodeURIComponent(d.inst.symbol)}" aria-label="Kembali"`);
  // Kartu aset + grafik 30 hari nyata.
  h = h.replace(/(<span style="flex: none; width: 40px; height: 40px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}(; [^"]*font-size: )\d+px([^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string, e: string) =>
    recolorAvatar(`${a}background: #000000; color: #000000${b}${short(d.inst.symbol).length > 4 ? 9 : 11}px${c}${esc(short(d.inst.symbol))}${e}`, d.inst.symbol),
  );
  h = h.replace(/(<strong style="font-size: 16px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(displaySym(d.inst))}$2`);
  h = h.replace(/(<span style="font-size: 12px; color: #5F6B7D">)Bank Central Asia · IDX(<\/span>)/, `$1${esc(d.inst.name)} · ${esc(d.inst.exchange)}$2`);
  h = h.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${q ? esc(price(q.price, cur)) : "—"}$2`);
  h = h.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #166534; background: #DCF5E4; padding: 4px 9px; border-radius: 999px; white-space: nowrap">▲ \+1,12%<\/span>/, () => {
    if (!q) return "";
    const up = q.change_percent >= 0;
    return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: ${up ? "#166534" : "#991B1B"}; background: ${up ? "#DCF5E4" : "#FDE2E2"}; padding: 4px 9px; border-radius: 999px; white-space: nowrap">${pctArrow(q.change_percent)}</span>`;
  });
  h = h.replace(rx(`(<div style="margin-top: 12px">)(?:${SVG})?(</div>)`), `$1<div data-al="chart" style="position: relative">${spark(d.closes, 310, 120)}</div>$2`);
  h = h.replace(/<a href="\/cari" style="color: #2F74EB; font-weight: 500">Ganti aset<\/a>/, `<select data-al="symbol" aria-label="Ganti aset" style="border: 0; background: transparent; color: #2F74EB; font-weight: 500; font-size: 11px; max-width: 140px">${d.instruments.map((i) => `<option value="${esc(i.symbol)}"${i.symbol === d.inst.symbol ? " selected" : ""}>${esc(displaySym(i))}</option>`).join("")}</select>`);
  // Harga target: input nyata + selisih dihitung enhancer.
  const base = q?.price ?? 0;
  const dec = base === 0 ? 2 : base < 10 ? 4 : cur === "IDR" || base >= 1000 ? 0 : 2;
  h = h.replace(/<span style="font-size: 14px; color: #5F6B7D">Rp<\/span>/, `<span style="font-size: 14px; color: #5F6B7D">${cur === "IDR" ? "Rp" : cur === "USD" ? "$" : esc(cur)}</span>`);
  h = h.replace(/<span style="font-family: 'Roboto Mono', monospace; font-size: 30px; font-weight: 500; color: #0B0B0F">\{\{ tp \}\}<\/span>/, `<input data-al="target" inputmode="decimal" value="${base ? (base * 1.02).toFixed(dec) : ""}" data-base="${base}" data-dec="${dec}" aria-label="Harga target" style="width: 170px; text-align: center; border: 0; background: transparent; font-family: 'Roboto Mono', monospace; font-size: 26px; font-weight: 500; color: #0B0B0F; outline: none">`);
  h = h.replace(/<span style="font-size: 12px; font-weight: 700; color: \{\{ tpc \}\}">\{\{ tpd \}\}<\/span>/, '<span data-al="delta" style="font-size: 12px; font-weight: 700; color: #16A34A"></span>');
  h = h.replace('onClick="{{ tpDown }}" aria-label="Kurangi"', 'data-al-step="-1" aria-label="Kurangi"').replace('onClick="{{ tpUp }}" aria-label="Tambah"', 'data-al-step="1" aria-label="Tambah"');
  h = h.replace(/(<span style="color: #2F74EB; font-weight: 500">)Sekarang [^<]*(<\/span>)/, `$1Sekarang ${q ? esc(price(q.price, cur)) : "—"}$2`);
  const presets = ["+2%", "+5%", "−2%", "−5%"];
  for (let i = 0; i < 4; i++) h = h.replace(rx(`(<button onClick="\\{\\{ u7\\.m${i}\\.pick \\}\\}"[^>]*>)[^<]*(</button>)`), (_m, a: string, b: string) => `${a.replace("<button ", `<button data-al-preset="${["2", "5", "-2", "-5"][i]}" `)}${presets[i]}${b}`);
  h = h.replace(/<strong style="font-weight: 500">27 Nov 2026 ›<\/strong>/, '<strong style="font-weight: 500">Sampai dihapus</strong>');
  h = h.replace(/(<strong style="font-size: 14px; font-weight: 700; color: #0B0B0F">Email<\/strong>\s*<span style="font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(d.email || "Email akun")}$2`);
  h = h.replace(/(<strong style="font-size: 14px; font-weight: 700; color: #0B0B0F">WhatsApp<\/strong>\s*<span style="font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(d.phone ? d.phone.replace(/(\+\d{2})(\d{3})\d+(\d{4})/, "$1 $2-****-$3") : "Tambah nomor di Akun")}$2`);
  h = h.replace(/<input type="text" placeholder="Catatan \(opsional\)/, '<input type="text" data-al="note" maxlength="140" placeholder="Catatan (opsional)');
  const used = active.length;
  h = h.replace(/(<span style="font-size: 13px; font-weight: 500">)\d+ dari \d+ alert gratis terpakai(<\/span>)/, d.plan ? "$1Plus: alert tanpa batas$2" : `$1${used} dari ${d.limit} alert gratis terpakai$2`);
  h = h.replace(/(<span style="display: block; width: )\d+%(; height: 100%; border-radius: 999px; background: #F59E0B">)/, `$1${d.plan ? 100 : Math.min(100, Math.round((used / Math.max(1, d.limit)) * 100))}%$2`);
  // Daftar alert aktif.
  const at = h.indexOf('<div id="alert-aktif">');
  if (at >= 0) {
    // Baris alert berada setelah judul "Alert aktif" (bukan di dalam div-nya).
    const end = h.length;
    let sec = h.slice(at, end);
    sec = sec.replace(/<a tabindex="0" role="button" onClick="\{\{ t8 \}\}"[^>]*>Kelola<\/a>/, `<span style="font-size: 13px; color: #5F6B7D">${d.alerts.length} alert</span>`);
    const rows = blocks(sec, '<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 0;');
    if (rows.length) {
      const tpl = rows[1]?.html ?? rows[0]!.html;
      const built = !d.loggedIn
        ? emptyRow("Masuk untuk membuat dan melihat price alert.")
        : d.alerts.length
          ? d.alerts
              .map((a, i) => {
                const inst = d.instruments.find((x) => x.symbol === a.symbol);
                const c = inst?.currency ?? "IDR";
                const what = a.condition === "change_pct" ? `${displaySym({ symbol: a.symbol, asset_class: inst?.asset_class ?? "equity" })} berubah ±${String(a.threshold ?? 0).replace(".", ",")}%` : a.threshold != null ? `${a.symbol} ${COND_TEXT[a.condition] ?? a.condition} ${price(a.threshold, c)}` : `${a.symbol} · ${COND_TEXT[a.condition] ?? a.condition}`;
                const ch = a.channels.map((x) => CH_TEXT[x] ?? x).join(" + ");
                return tpl
                  .replace("border-top: 1px solid #E3EAF4", i ? "border-top: 1px solid #E3EAF4" : "")
                  .replace(/(<span style="flex: none; width: 38px; height: 38px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}(; [^"]*font-size: )\d+px([^"]*">)[^<]*(<\/span>)/, (_m, x: string, y: string, z: string, e: string) =>
                    recolorAvatar(`${x}background: #000000; color: #000000${y}${short(a.symbol).length > 4 ? 9 : 11}px${z}${esc(short(a.symbol))}${e}`, a.symbol),
                  )
                  .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(what)}$2`)
                  .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(ch)} · ${a.active ? FREQ_TEXT[a.frequency] ?? a.frequency : "sudah terpicu"}${a.note ? ` · ${esc(a.note)}` : ""}$2`)
                  .replace(/<button onClick="\{\{ u\d\.m0\.pick \}\}" role="switch"[\s\S]*?<\/button>/, `<button type="button" data-al-delete="${a.id}" aria-label="Hapus alert ${esc(a.symbol)}" style="flex: none; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid #F5C2C2; background: #FFFFFF; color: #991B1B; font-size: 12px; font-weight: 500">Hapus</button>`)
                  .replace(/<span style="display: flex; align-items: center; gap: 10px; padding-left: 50px">[\s\S]*<\/span>\s*<\/div>$/, (m) => {
                    const qq = a.threshold != null && (a.condition === "price_above" || a.condition === "price_below") && d.quote && a.symbol === d.inst.symbol ? d.quote.price : null;
                    if (qq == null || !a.threshold) return "</div>";
                    const dist = Math.abs(a.threshold - qq) / a.threshold;
                    const prog = Math.max(0, Math.min(100, Math.round((1 - dist) * 100)));
                    return m.replace(/width: \d+%; height: 100%; border-radius: 999px; background: #[0-9A-F]{6}/, `width: ${prog}%; height: 100%; border-radius: 999px; background: ${a.active ? "#4285F4" : "#C4CDDA"}`).replace(/>\d+% lagi</, `>${(dist * 100).toFixed(1).replace(".", ",")}% lagi<`);
                  });
              })
              .join("")
          : emptyRow("Belum ada price alert. Atur target di atas lalu simpan.");
      sec = sec.slice(0, rows[0]!.start) + built + sec.slice(rows[rows.length - 1]!.end);
    }
    h = h.slice(0, at) + sec + h.slice(end);
  }
  h = h.replace(/(<span style="text-align: center; font-size: 12px; color: #5F6B7D">)Kamu akan diberi tahu saat <b style="color: #0B0B0F">BBCA ≥ Rp\{\{ tp \}\}<\/b>/, `$1<span data-al="summary">Kamu akan diberi tahu saat <b style="color: #0B0B0F">${esc(displaySym(d.inst))}</b> mencapai target.</span>`);
  h = h.replace(/<a href="\/watchlist" class="ob-anim"/, `<a href="#" data-al="save" data-symbol="${esc(d.inst.symbol)}" data-logged="${d.loggedIn ? 1 : 0}" class="ob-anim"`);
  return h;
}

// ======================================================================= tersimpan (aplikasi)
export function bindSaved(html: string, d: { loggedIn: boolean; items: ArticleCard[] }): string {
  let h = html;
  const prem = d.items.filter((a) => a.is_premium).length;
  const counts = [d.items.length, 0, prem, 0];
  const labels = ["Artikel", "Video", "Analisis", "Offline"];
  for (let i = 0; i < 4; i++) h = h.replace(rx(`(<button onClick="\\{\\{ u1\\.m${i}\\.pick \\}\\}"[^>]*>)[^<]*(<span style="opacity: .8">)\\d+(</span>)`), (_m, a: string, b: string, c: string) => `${a.replace("<button ", `<button data-bm-tab="${["all", "video", "premium", "offline"][i]}" `)}${labels[i]} ${b}${counts[i]}${c}`);
  h = h.replace(/(<span style="font-size: 13px; color: #5F6B7D">)\d+ artikel · urut terbaru(<\/span>)/, `$1${d.items.length} artikel · urut terbaru$2`);
  const rows = blocks(h, '<div style="border-top: 1px solid #E3EAF4; {{ gone.i');
  if (rows.length) {
    const tpl = rows[0]!.html;
    const built = !d.loggedIn
      ? emptyRow("Masuk untuk melihat artikel yang kamu simpan.") + '<a href="/masuk?next=/tersimpan" style="display: block; text-align: center; padding: 12px; color: #2F74EB; font-weight: 500">Masuk</a>'
      : d.items.length
        ? d.items
            .map((a) =>
              cover(tpl, a)
                .replace(/\{\{ gone\.i\d+ \}\}/, "")
                .replace("<div ", `<div data-bm-row="${esc(a.slug)}" data-bm-kind="${a.is_premium ? "premium" : "article"}" `)
                .replace('href="/berita/ihsg-menguat-ditopang-saham-perbankan"', `href="/berita/${encodeURIComponent(a.slug)}"`)
                .replace(/(<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #1E40AF; background: #E5ECFF;[^"]*">)[^<]*(<\/span>)/, `$1${esc(a.category.name)}$2`)
                .replace(rx(`<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #166534; background: #DCF5E4;[^"]*">(?:${SVG})?Offline</span>`), a.is_premium ? '<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #854D0E; background: #FEF3C7; padding: 4px 9px; border-radius: 999px; white-space: nowrap">Plus</span>' : "")
                .replace(/(<strong style="font-size: 14px; line-height: 1.35; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(a.title)}$2`)
                .replace(/(<span style="font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.author_name)} · ${esc(ago(a.published_at))} · ${a.reading_minutes} mnt baca$2`)
                .replace(/<span style="display: flex; align-items: center; gap: 8px">\s*<span style="flex: 1; height: 4px;[\s\S]*?<\/span>\s*<\/span>\s*<span style="font-size: 11px; color: #5F6B7D">[^<]*<\/span>\s*<\/span>/, "")
                .replace(/<button onClick="\{\{ f\d+ \}\}" aria-label="Hapus dari tersimpan"/, `<button type="button" data-bm-remove="${esc(a.slug)}" aria-label="Hapus dari tersimpan"`),
            )
            .join("")
        : emptyRow("Belum ada artikel tersimpan. Ketuk ikon simpan di artikel mana pun.");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  return h;
}

// ======================================================================= notifikasi (aplikasi)
const NOTIF_TAB: [string, string][] = [["all", "Semua"], ["breaking", "Breaking"], ["price_alert", "Price alert"], ["topic", "Topik"], ["account", "Akun"]];
export function bindNotifications(html: string, d: { loggedIn: boolean; list: UserNotification[]; counts: Record<string, number> }): string {
  let h = html;
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  NOTIF_TAB.forEach(([k, label], i) => {
    const n = k === "all" ? total : d.counts[k] ?? 0;
    h = h.replace(rx(`(<button onClick="\\{\\{ u1\\.m${i}\\.pick \\}\\}"[^>]*>)[^<]*(<span style="opacity: .8">)\\d+(</span>)`), (_m, a: string, b: string, c: string) => `${a.replace("<button ", `<button data-nt-tab="${k}" `)}${label} ${b}${n}${c}`);
  });
  h = h.replace('onClick="{{ markRead }}"', 'onClick="{{ markRead }}" data-nt="read-all"');
  // Templat per jenis dari baris desain.
  const rows = blocks(h, '<a href="/', "a").filter((r) => r.html.includes('style="display: flex; gap: 12px; padding: 14px 20px;'));
  if (!rows.length) return h;
  const pick = (needle: string) => rows.find((r) => r.html.includes(needle))?.html ?? rows[0]!.html;
  const T: Record<string, string> = {
    breaking: pick("BREAKING"),
    price_alert: pick("Price alert:"),
    topic: pick("Topik IHSG"),
    account: pick("membalas komentarmu"),
    reply: pick("membalas komentarmu"),
    billing: pick("Ringkasan pagi"),
  };
  const first = rows[0]!.start;
  const startOfList = h.lastIndexOf('<div style="padding: 16px 20px 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #5F6B7D">', first);
  const listEnd = rows[rows.length - 1]!.end;
  const head = (t: string) => `<div style="padding: 16px 20px 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; color: #5F6B7D">${esc(t)}</div>`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const yest = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(Date.now() - 86400000));
  let last = "";
  const built = !d.loggedIn
    ? emptyRow("Masuk untuk melihat notifikasi breaking, price alert, dan topik yang kamu ikuti.")
    : d.list.length
      ? d.list
          .map((n) => {
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(n.created_at));
            const grp = day === today ? "HARI INI" : day === yest ? "KEMARIN" : "SEBELUMNYA";
            const g = grp !== last ? head(grp) : "";
            last = grp;
            let r = (T[n.kind] ?? T.breaking!)
              .replace(/^<a href="[^"]*"/, `<a href="${esc(n.link || "#")}" data-nt-row="${n.id}" data-nt-kind="${n.kind}"`)
              .replace(/(<strong style="font-size: 14px; line-height: 1.4; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(n.title)}$2`)
              .replace(/(<span style="font-size: 13px; line-height: 1.45; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(n.body)}$2`)
              .replace(/(<span style="font-size: 11px; color: #9AA6B8">)[^<]*(<\/span>)/, `$1${esc(ago(n.created_at))}$2`);
            r = n.read_at ? r.replace("background: #F4F8FF; ", "").replace("{{ unreadSt }}", "opacity: 0") : r;
            if (n.kind === "price_alert") {
              r = n.symbol && n.price != null
                ? r
                    .replace(/(<strong style="font-size: 12px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(n.symbol)}$2`)
                    .replace(/(<span style="font-family: Roboto Mono, monospace; font-size: 12px">)[^<]*(<\/span>)/, `$1${esc(nf(n.price < 10 ? 4 : n.price >= 1000 ? 0 : 2).format(n.price))}$2`)
                    .replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: #[0-9A-F]{6}; background: #[0-9A-F]{6}([^"]*)">[^<]*<\/span>/, (_m, rest: string) => {
                      const up = (n.change ?? 0) >= 0;
                      return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 500; color: ${up ? "#166534" : "#991B1B"}; background: ${up ? "#DCF5E4" : "#FDE2E2"}${rest}">${pctArrow(n.change ?? 0)}</span>`;
                    })
                : r.replace(/<span style="align-self: flex-start; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 12px; background: #F6F8FC">[\s\S]*?<\/span><\/span>/, "");
            }
            return g + r;
          })
          .join("")
      : emptyRow("Belum ada notifikasi. Ikuti topik atau buat price alert untuk mulai menerima kabar.");
  return h.slice(0, startOfList >= 0 ? startOfList : first) + built + h.slice(listEnd);
}

// ======================================================================= kalender ekonomi
const COUNTRY: Record<string, [string, string, string]> = {
  ID: ["Indonesia", "#FDE2E2", "#991B1B"],
  US: ["Amerika Serikat", "#E5ECFF", "#1E40AF"],
  CN: ["Tiongkok", "#FEF3C7", "#854D0E"],
  EU: ["Eropa", "#EDE9FE", "#5B21B6"],
  JP: ["Jepang", "#FFE4D2", "#9A3412"],
};
const WIBf = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...o }).format(new Date(iso));
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(iso));
function impactBars(h: string, impact: string, big: boolean): string {
  const lbl = impact === "high" ? "Dampak tinggi" : impact === "medium" ? "Dampak sedang" : "Dampak rendah";
  const re = big ? /<span aria-label="Dampak" style="display: flex; gap: 2px; align-items: flex-end">[\s\S]*?<\/span>\s*<\/span>\s*<\/span>\s*<\/span>/ : rx(`<span aria-label="${lbl}" style="display: flex; gap: 2px; align-items: flex-end">[\\s\\S]*?</span>\\s*</span>\\s*</span>\\s*</span>`);
  return re.exec(h)?.[0] ?? "";
}
function bars(impact: string, big: boolean): string {
  const c = impact === "high" ? ["#EF4444", "#EF4444", "#EF4444"] : impact === "medium" ? ["#FB7A3C", "#FB7A3C", "#E3EAF4"] : ["#FACC15", "#E3EAF4", "#E3EAF4"];
  const hs = big ? [7, 11, 15] : [6, 9, 12];
  const w = big ? 5 : 4;
  return `<span aria-label="Dampak ${impact === "high" ? "tinggi" : impact === "medium" ? "sedang" : "rendah"}" style="display: flex; gap: 2px; align-items: flex-end">${hs.map((x, i) => `<span style="width: ${w}px; height: ${x}px; border-radius: 2px; background: ${c[i]}"></span>`).join("")}</span>`;
}
const val = (v: string | null) => (v == null || v === "" ? "—" : v);
function actualColor(e: EconomicEvent): string {
  const a = parseFloat((e.actual ?? "").replace(",", "."));
  const f = parseFloat((e.forecast ?? "").replace(",", "."));
  if (isNaN(a) || isNaN(f) || a === f) return "#0B0B0F";
  return a > f ? "#15803D" : "#DC2626";
}
export interface CalData {
  week: string[]; // 7 hari (YYYY-MM-DD), Senin–Minggu
  selected: string;
  events: EconomicEvent[];
  reminders: Set<string>;
  loggedIn: boolean;
  country: string;
}
const ctry = (e: EconomicEvent) => COUNTRY[e.country] ?? [e.country, "#EFF0F2", "#374151"];

export function bindCalendarApp(html: string, d: CalData): string {
  let h = html;
  const mon = new Date(`${d.week[0]}T12:00:00+07:00`);
  h = h.replace(/(<strong style="font-size: 15px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(WIBf(mon.toISOString(), { month: "long", year: "numeric" }))}$2`);
  d.week.forEach((day, i) => {
    const has = d.events.some((e) => dayOf(e.scheduled_at) === day);
    h = h.replace(rx(`(<button onClick="\\{\\{ u1\\.m${i}\\.pick \\}\\}"[^>]*>\\s*<span style="font-size: 11px; opacity: .85">[^<]*</span>\\s*<strong style="font-size: 17px; font-weight: 700">)\\d+(</strong>\\s*)<span style=(?:height:5px|'[^']*')>(\\s*</span>)`), (_m, a: string, b: string, c: string) =>
      `${a.replace("<button ", `<button data-cal-day="${day}" `)}${Number(day.slice(8))}${b}<span style='${has ? "width: 5px; height: 5px; border-radius: 999px; background: #4285F4" : "height:5px"}'>${c}`,
    );
  });
  h = h.replace('onClick="{{ u2.m0.pick }}"', 'onClick="{{ u2.m0.pick }}" data-cal-country=""').replace('onClick="{{ u2.m1.pick }}"', 'onClick="{{ u2.m1.pick }}" data-cal-country="ID"').replace('onClick="{{ u2.m2.pick }}"', 'onClick="{{ u2.m2.pick }}" data-cal-country="US"').replace('onClick="{{ u2.m3.pick }}"', 'onClick="{{ u2.m3.pick }}" data-cal-country="CN"').replace('onClick="{{ u3.m0.pick }}"', 'onClick="{{ u3.m0.pick }}" data-cal-high="1"');
  const rows = blocks(h, '<div style="display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid #E3EAF4;');
  if (!rows.length) return h;
  const tpl = rows.find((r) => !r.html.includes("RILIS DALAM") && r.html.includes("Aktual"))!.html;
  const built = d.events.length
    ? d.events
        .map((e) => {
          const [, bg, fg] = ctry(e);
          const day = dayOf(e.scheduled_at);
          return tpl
            .replace('<div style="display: flex;', `<div data-cal-row="${e.id}" data-day="${day}" data-country="${esc(e.country)}" data-impact="${e.impact}"${day === d.selected ? ' style="display: flex;' : ' data-disp="flex" style="display: none;'}`)
            .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; font-weight: 500; color: #0B0B0F">)\d\d:\d\d(<\/span>)/, `$1${WIBf(e.scheduled_at, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":")}$2`)
            .replace(impactBars(tpl, tpl.includes('aria-label="Dampak tinggi"') ? "high" : tpl.includes('aria-label="Dampak sedang"') ? "medium" : "low", false) || "@@none@@", bars(e.impact, false))
            .replace(/(<span style="flex: none; width: 30px; height: 30px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}([^"]*">)[^<]*(<\/span>)/, `$1background: ${bg}; color: ${fg}$2${esc(e.country)}$3`)
            .replace(/(<strong style="font-size: 14px; line-height: 1.35; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(e.title)}$2`)
            .replace(/(<span style="font-size: 10px; color: #5F6B7D">Aktual<\/span>\s*<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; font-weight: 500; color: )#[0-9A-F]{6}(">)[^<]*(<\/span>)/, `$1${actualColor(e)}$2${esc(val(e.actual))}$3`)
            .replace(/(<span style="font-size: 10px; color: #5F6B7D">Perkiraan<\/span>\s*<span[^>]*>)[^<]*(<\/span>)/, `$1${esc(val(e.forecast))}$2`)
            .replace(/(<span style="font-size: 10px; color: #5F6B7D">Sebelumnya<\/span>\s*<span[^>]*>)[^<]*(<\/span>)/, `$1${esc(val(e.previous))}$2`)
            .replace(/(<span style="font-size: 11px; color: #5F6B7D">Pengaruh:<\/span>)[\s\S]*?(<\/span>\s*<\/span>)/, (_m, a: string, b: string) =>
              e.related_symbols.length ? `${a}${e.related_symbols.map((s) => `<a href="/market/${encodeURIComponent(s)}" style="font-size: 11px; font-weight: 500; color: #2F74EB; background: #EEF5FF; padding: 3px 8px; border-radius: 999px">${esc(s)}</a>`).join("")}${b}` : b.replace(/^<\/span>/, "</span>"),
            )
            .replace(/<button onClick="\{\{ u\d\.m0\.pick \}\}" aria-pressed="\{\{ u\d\.m0\.pr \}\}" aria-label="Ingatkan saya" style="[^"]*">/, `<button type="button" data-cal-remind="${e.id}" aria-pressed="${d.reminders.has(e.id)}" aria-label="Ingatkan saya" style="flex: none; align-self: flex-start; width: 40px; height: 40px; border-radius: 999px; border: 1px solid ${d.reminders.has(e.id) ? "#4285F4" : "#E3EAF4"}; background: ${d.reminders.has(e.id) ? "#EEF5FF" : "#FFFFFF"}; color: ${d.reminders.has(e.id) ? "#2F74EB" : "#9AA6B8"}; display: flex; align-items: center; justify-content: center">`);
        })
        .join("") + `<div data-cal-empty hidden>${emptyRow("Tidak ada rilis data di hari ini.")}</div>`
    : emptyRow("Belum ada jadwal rilis data minggu ini.");
  return h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
}

export function bindCalendarWeb(html: string, d: CalData & { prevWeek: string; nextWeek: string }): string {
  let h = html;
  const mon = new Date(`${d.week[0]}T12:00:00+07:00`);
  h = h.replace(/(<strong style="font-size: 17px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(WIBf(mon.toISOString(), { month: "long", year: "numeric" }))}$2`);
  h = h.replace(/<a href="#"([^>]*)>Minggu lalu<\/a>/, `<a href="/kalender?d=${d.prevWeek}"$1>Minggu lalu</a>`).replace(/<a href="#"([^>]*)>Minggu depan<\/a>/, `<a href="/kalender?d=${d.nextWeek}"$1>Minggu depan</a>`);
  // Tombol hari → tautan.
  const grid = /(<div style="display: grid; grid-template-columns: repeat\(7, 1fr\); gap: 10px">)([\s\S]*?)(<\/div>\s*<\/div>)/.exec(h);
  if (grid) {
    const btns = grid[2]!.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const on = btns.find((b) => b.includes("ob-anim")) ?? btns[0]!;
    const off = btns.find((b) => !b.includes("ob-anim")) ?? btns[0]!;
    const built = d.week
      .map((day, i) => {
        const n = d.events.filter((e) => dayOf(e.scheduled_at) === day).length;
        return (day === d.selected ? on : off)
          .replace("<button ", `<a href="/kalender?d=${day}" `)
          .replace(/<\/button>$/, "</a>")
          .replace(/(<span style="font-size: 12px; opacity: .85">)[^<]*(<\/span>)/, `$1${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][i]}${n ? ` · ${n}` : ""}$2`)
          .replace(/(<strong style="font-size: 20px; font-weight: 700">)\d+(<\/strong>)/, `$1${Number(day.slice(8))}$2`);
      })
      .join("");
    h = h.replace(grid[0], grid[1] + built + grid[3]);
  }
  // Tab negara.
  const tl = /(<div role="tablist" class="ob-scroll" style="display: flex; gap: 8px; overflow-x: auto">)([\s\S]*?)(<\/div>)/.exec(h);
  if (tl) {
    const tabs = tl[2]!.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const on = tabs[0]!, off = tabs[1] ?? on;
    const keys: [string, string][] = [["", "Semua negara"], ["ID", "Indonesia"], ["US", "Amerika Serikat"], ["CN", "Tiongkok"], ["high", "Dampak tinggi"]];
    const built = keys
      .map(([k, l]) => (k === d.country ? on : off).replace("<button ", `<a href="/kalender?d=${d.selected}&amp;negara=${k}" `).replace(/<\/button>$/, "</a>").replace(/>([^<>]+)(<\/a>)$/, `>${esc(l)}$2`).replace(/aria-selected="(true|false)"/, `aria-selected="${k === d.country}"`))
      .join("");
    h = h.replace(tl[0], tl[1] + built + tl[3]);
  }
  const sel = new Date(`${d.selected}T12:00:00+07:00`).toISOString();
  const today = dayOf(new Date().toISOString());
  h = h.replace(/(<h2 style="margin: 0; display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 700">)Hari ini · [^<]*(<\/h2>)/, `$1${d.selected === today ? "Hari ini · " : ""}${esc(WIBf(sel, { weekday: "long", day: "numeric", month: "short" }))}$2`);
  const rows = blocks(h, '<div style="display: grid; grid-template-columns: 70px 1.9fr 60px 80px 80px 90px 1.1fr 44px; gap: 12px; align-items: center; padding: 14px 18px;');
  if (!rows.length) return h;
  const tpl = rows[0]!.html;
  const list = d.events.filter((e) => dayOf(e.scheduled_at) === d.selected && (!d.country || (d.country === "high" ? e.impact === "high" : e.country === d.country)));
  const built = list.length
    ? list
        .map((e) => {
          const [, bg, fg] = ctry(e);
          const on = d.reminders.has(e.id);
          return tpl
            .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 14px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${WIBf(e.scheduled_at, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":")}$2`)
            .replace(/(<span style="width: 30px; height: 30px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}([^"]*">)[^<]*(<\/span>)/, `$1background: ${bg}; color: ${fg}$2${esc(e.country)}$3`)
            .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(e.title)}$2`)
            .replace(/<span aria-label="Dampak" style="display: flex; gap: 2px; align-items: flex-end">[\s\S]*?<\/span>\s*<\/span>\s*<\/span>\s*<\/span>/, bars(e.impact, true))
            .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; font-weight: 500; color: )#[0-9A-F]{6}(">)[^<]*(<\/span>)/, `$1${actualColor(e)}$2${esc(val(e.actual))}$3`)
            .replace(/(<\/span>\s*<span style="display: flex; justify-content: flex-end; align-items: center">\s*<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${esc(val(e.forecast))}$2`)
            .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; font-weight: 500; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(val(e.previous))}$2`)
            .replace(/(<span style="font-size: 12px; color: #2F74EB">)[^<]*(<\/span>)/, `$1${e.related_symbols.map((s) => `<a href="/market/${encodeURIComponent(s)}">${esc(s)}</a>`).join(", ") || "—"}$2`)
            .replace(/<button aria-label="Ingatkan saya" style="([^"]*)">/, (_m, st: string) => `<button type="button" data-cal-remind="${e.id}" aria-pressed="${on}" aria-label="Ingatkan saya" style="${st.replace("background: #F6F8FC; color: #9AA6B8", on ? "background: #EEF5FF; color: #2F74EB" : "background: #F6F8FC; color: #9AA6B8")}">`);
        })
        .join("")
    : emptyRow("Tidak ada rilis data yang cocok di hari ini.");
  return h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
}

// ======================================================================= komentar & reaksi artikel
export interface Social {
  loggedIn: boolean;
  me: { name: string; email: string } | null;
  comments: { id: string; user_name: string; body: string; created_at: string }[];
  reactions: Record<string, number>; // bullish, bearish, informative, favorite
  bookmarked: boolean;
  slug: string;
}
const avatar36 = (name: string, style: string) => {
  const [bg, fg] = avatarColors(name);
  return style.replace(/background: #[0-9A-F]{6}; color: #[0-9A-F]{6}/, `background: ${bg}; color: ${fg}`);
};

export function bindArticleSocialWeb(html: string, s: Social): string {
  let h = html;
  h = h.replace(/<a href="#" aria-label="Simpan" style="([^"]*)">/, (_m, st: string) => `<a href="#" data-art="bookmark" data-slug="${esc(s.slug)}" aria-pressed="${s.bookmarked}" aria-label="${s.bookmarked ? "Hapus dari tersimpan" : "Simpan"}" style="${s.bookmarked ? st.replace("border: 1px solid #E3EAF4", "border: 1px solid #4285F4; background: #EEF5FF; color: #2F74EB") : st}">`);
  h = h.replace(/<a href="#" aria-label="Komentar"/, '<a href="#komentar" aria-label="Komentar"');
  h = h.replace(/(<\/span>)Komentar \(\d+\)(<\/h3>)/, `$1Komentar (${s.comments.length})$2`);
  const rows = blocks(h, '<div style="display: flex; gap: 12px; padding: 12px 0;');
  if (rows.length) {
    const tpl = rows[1]?.html ?? rows[0]!.html;
    const built = s.comments.length
      ? s.comments
          .map((c, i) =>
            tpl
              .replace("border-top: 1px solid #E3EAF4", i ? "border-top: 1px solid #E3EAF4" : "")
              .replace(/(<span style="flex: none; width: 36px; height: 36px; border-radius: 999px; [^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string) => `${avatar36(c.user_name, a)}${esc(initials(c.user_name))}${b}`)
              .replace(/(<strong style="font-weight: 500">)[^<]*(<\/strong> <span style="color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(c.user_name)}$2· ${esc(ago(c.created_at))}$3`)
              .replace(/(<span style="font-size: 14px; line-height: 1.5">)[^<]*(<\/span>)/, `$1${esc(c.body)}$2`)
              .replace(/<\/span>\s*<\/span>\s*<\/div>$/, `<button type="button" data-art="report" data-id="${c.id}" style="align-self: flex-start; border: 0; background: none; padding: 0; font-size: 12px; color: #9AA6B8; cursor: pointer">Laporkan</button></span></span></div>`),
          )
          .join("")
      : '<p style="margin: 8px 0; font-size: 14px; color: #5F6B7D">Belum ada komentar. Jadilah yang pertama.</p>';
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  const form = s.loggedIn
    ? `<form data-art="comment-form" data-slug="${esc(s.slug)}" style="display: flex; gap: 8px; margin-top: 8px"><input data-art="comment" maxlength="1000" required placeholder="Tulis komentar sebagai ${esc(s.me?.name ?? "kamu")}…" style="flex: 1; height: 46px; padding: 0 16px; border-radius: 14px; border: 1px solid #E3EAF4; font-size: 14px"><button type="submit" style="height: 46px; padding: 0 18px; border-radius: 14px; border: 0; background: #2F74EB; color: #FFFFFF; font-size: 14px; font-weight: 500">Kirim</button></form>`
    : `<a href="/masuk?next=${encodeURIComponent(`/berita/${s.slug}`)}" style="display: flex; align-items: center; height: 46px; margin-top: 8px; padding: 0 16px; border-radius: 14px; border: 1px solid #E3EAF4; color: #5F6B7D; font-size: 14px">Masuk untuk berkomentar…</a>`;
  h = h.replace(/<a href="\/masuk" style="display: flex; align-items: center; height: 46px; margin-top: 8px;[^"]*">Masuk untuk berkomentar…<\/a>/, form);
  h = h.replace(/(<section[^>]*>)(\s*<h3[^>]*>(?:(?!<\/h3>)[\s\S])*Komentar \()/, '$1<span id="komentar"></span>$2');
  return h;
}

export function bindArticleSocialApp(html: string, s: Social): string {
  let h = html;
  const kinds = ["bullish", "bearish", "informative", "favorite"];
  kinds.forEach((k, i) => {
    h = h.replace(`{{ rx.r${i}.count }}`, String(s.reactions[k] ?? 0)).replace(`onClick="{{ rx.r${i}.pick }}"`, `onClick="{{ rx.r${i}.pick }}" data-art-react="${k}" data-slug="${esc(s.slug)}"`);
  });
  const total = kinds.reduce((a, k) => a + (s.reactions[k] ?? 0), 0);
  h = h.split("{{ totalReact }}").join(String(total));
  h = h.replace('href="/tersimpan" aria-label="Simpan"', `href="#" data-art="bookmark" data-slug="${esc(s.slug)}" aria-label="Simpan"`);
  // "Terbaru" di lembar reaksi berisi nama contoh → disembunyikan (reaksi bersifat anonim).
  h = h.replace(/<h3 style="margin: 4px 0 0; font-size: 14px; font-weight: 700">Terbaru<\/h3>\s*<div style="display: flex; flex-direction: column; gap: 12px">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>(\s*<div role="dialog" aria-modal="true" aria-label="Komentar)/, "</div>$1");
  h = h.replace(/aria-label="Komentar \d+"/, `aria-label="Komentar ${s.comments.length}"`);
  h = h.replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">Komentar <span style="font-weight: 500; color: #5F6B7D">)\d+(<\/span>)/, `$1${s.comments.length}$2`);
  h = h.replace(/<div style="display: flex; gap: 8px">\s*<button aria-pressed="\{\{ cs\.i0\.pr \}\}"[\s\S]*?<\/div>/, "");
  const rows = blocks(h, '<div style="display: flex; gap: 12px">\n'.trim());
  const commentRows = rows.filter((r) => r.html.includes("<p style=\"margin: 0; font-size: 14px; line-height: 1.45\">"));
  if (commentRows.length) {
    const tpl = commentRows[0]!.html;
    const built = s.comments.length
      ? s.comments
          .map((c) =>
            tpl
              .replace(/(<span style="flex: none; width: 36px; height: 36px; border-radius: 999px; [^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string) => `${avatar36(c.user_name, a)}${esc(initials(c.user_name))}${b}`)
              .replace(/(<strong style="font-size: 14px; font-weight: 700">)[^<]*(<\/strong>\s*<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(c.user_name)}$2· ${esc(ago(c.created_at))}$3`)
              .replace(/(<p style="margin: 0; font-size: 14px; line-height: 1.45">)[^<]*(<\/p>)/, `$1${esc(c.body)}$2`)
              .replace(/<span style="display: flex; align-items: center; gap: 16px; font-size: 12px; font-weight: 500; color: #5F6B7D">[\s\S]*?<span>Balas<\/span>\s*<\/span>/, `<span style="display: flex; gap: 16px; font-size: 12px; font-weight: 500; color: #9AA6B8"><button type="button" data-art="report" data-id="${c.id}" style="border: 0; background: none; padding: 0; color: inherit; font: inherit">Laporkan</button></span>`),
          )
          .join("")
      : '<p style="margin: 0; font-size: 14px; color: #5F6B7D">Belum ada komentar. Jadilah yang pertama.</p>';
    h = h.slice(0, commentRows[0]!.start) + built + h.slice(commentRows[commentRows.length - 1]!.end);
  }
  if (s.me) h = h.replace(/(<div style="display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid #E3EAF4">\s*<span style="flex: none; width: 36px; height: 36px; border-radius: 999px; [^"]*">)[^<]*(<\/span>)/, `$1${esc(initials(s.me.name))}$2`);
  h = h.replace(/<input type="text" placeholder="Tulis komentar…"/, s.loggedIn ? `<input type="text" data-art="comment" data-slug="${esc(s.slug)}" maxlength="1000" placeholder="Tulis komentar…"` : `<input type="text" data-art="comment" data-login="/masuk?next=${encodeURIComponent(`/berita/${s.slug}`)}" readonly placeholder="Masuk untuk berkomentar…"`);
  h = h.replace('onClick="{{ f6 }}"', `data-art="comment-send" data-slug="${esc(s.slug)}"`);
  return h;
}

// ======================================================================= iklan di slot desain
/**
 * Placeholder iklan desain (garis putus-putus berukuran W × H) diganti materi kampanye yang tayang
 * di slot berukuran sama; slot kosong menampilkan iklan internal "Pasang iklan di OceanBird".
 */
export function bindAdSlots(html: string, slots: AdSlot[]): string {
  let h = html;
  let from = 0;
  const used = new Set<string>();
  for (;;) {
    const i = h.indexOf('<div role="complementary" aria-label="Iklan ', from);
    if (i < 0) break;
    const end = closeOf(h, i);
    let blk = h.slice(i, end);
    const size = /(\d+) × (\d+)</.exec(blk);
    const w = size ? Number(size[1]) : 0, ht = size ? Number(size[2]) : 0;
    const slot = slots.find((s) => s.campaign_id && s.creative_url && !used.has(s.campaign_id + i) && s.width === w && (s.height === ht || s.height === 0)) ?? slots.find((s) => s.campaign_id && s.creative_url && s.width === w);
    const box = /<span style="([^"]*border: 1px dashed #B9C4D4;[^"]*)">([\s\S]*?)<\/span>\s*<\/div>$/.exec(blk);
    if (box) {
      const st = box[1]!.replace(/border: 1px dashed #B9C4D4; background: repeating-linear-gradient\([^)]*\)[^;]*/, "border: 1px solid #E3EAF4; background: #F6F8FC");
      const inner = slot
        ? `<a href="/api/ads/${slot.campaign_id}/click" target="_blank" rel="sponsored noopener" data-ad-imp="${slot.campaign_id}" style="display: block; width: 100%; height: 100%"><img src="${esc(slot.creative_url!)}" alt="Iklan ${esc(slot.advertiser ?? "")}" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; display: block"></a>`
        : `<a href="/iklan" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 100%; height: 100%; color: #5F6B7D; text-align: center"><strong style="font-size: 13px; font-weight: 500; color: #2F74EB">Pasang iklan di OceanBird</strong><span style="font-size: 11px">${w} × ${ht} · hubungi tim iklan</span></a>`;
      blk = blk.slice(0, box.index) + `<span style="${st}; overflow: hidden; padding: 0">${inner}</span></div>`;
      if (slot) {
        used.add(`${slot.campaign_id}${i}`);
        blk = blk.replace(/(<span style="display: flex; justify-content: space-between; font-size: 10px; letter-spacing: .08em; color: #5F6B7D">\s*<span>IKLAN<\/span>\s*<span>)[^<]*(<\/span>)/, `$1${esc(slot.advertiser ?? "Sponsor")}$2`);
      }
    }
    h = h.slice(0, i) + blk + h.slice(end);
    from = i + blk.length;
  }
  return h;
}

// ======================================================================= penulis & topik
/** Ganti teks persis `>from<` (sekali, mulai dari posisi `at`). */
function swapOnce(h: string, from: string, to: string, at = 0): string {
  const i = h.indexOf(`>${from}<`, at);
  return i < 0 ? h : h.slice(0, i) + `>${esc(to)}<` + h.slice(i + from.length + 2);
}
const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")} rb` : String(n));

/** Daftar berita contoh (tautan artikel contoh) → artikel nyata, tanpa mengulang; sisa disembunyikan. */
function articleRows(h: string, list: ArticleCard[], from: number, empty: string): string {
  const head = h.slice(0, from);
  let tail = h.slice(from);
  let i = 0;
  let firstAt = -1;
  tail = tail.replace(/<a\b([^>]*?)href="\/berita\/ihsg-menguat-ditopang-saham-perbankan"([^>]*)>([\s\S]*?)<\/a>/g, (whole, pre: string, post: string, inner: string, off: number) => {
    if (firstAt < 0) firstAt = off;
    const a = list[i++];
    if (!a) return "";
    const segs = [...inner.matchAll(/>([^<]+)</g)].map((m) => m[1]!.trim()).filter(Boolean);
    const headline = segs.reduce((x, y) => (y.length > x.length ? y : x), "");
    let body = inner.replace(`>${headline}<`, `>${esc(a.title)}<`);
    for (const t of segs) {
      if (t === headline) continue;
      if (/lalu|Kemarin|Okt|menit baca|jam/.test(t)) body = body.replace(`>${t}<`, `>${esc(`${a.category.name} · ${ago(a.published_at)} · ${a.reading_minutes} menit baca`)}<`);
      else if (t.length <= 12 && t === t.toUpperCase()) body = body.replace(`>${t}<`, `>${esc(a.category.name.toUpperCase())}<`);
      else if (t.length <= 12) body = body.replace(`>${t}<`, `>${esc(a.category.name)}<`);
    }
    if (a.cover_url) body = body.replace(/src="\/img\/news-\d\.jpg"/, `src="${esc(a.cover_url)}"`);
    return `<a${pre}href="/berita/${encodeURIComponent(a.slug)}"${post}>${body}</a>`;
  });
  if (!list.length && firstAt >= 0) tail = tail.slice(0, firstAt) + emptyRow(empty) + tail.slice(firstAt);
  return head + tail;
}

export interface AuthorPage {
  author: { slug: string; name: string; title: string; bio?: string; avatar_url: string | null; verified: boolean };
  articles: ArticleCard[];
}
export function bindAuthor(html: string, d: AuthorPage): string {
  let h = html;
  const at = Math.max(0, h.indexOf(">Maya Lestari<") - 2000);
  const a = d.author;
  const cats = [...new Set(d.articles.map((x) => x.category.name))];
  h = h.split(">Maya Lestari<").join(`>${esc(a.name)}<`);
  h = h.split("Maya Lestari").join(esc(a.name));
  h = swapOnce(h, "ML", initials(a.name), at);
  h = swapOnce(h, "Analis Saham · Redaksi OceanBird", a.title || "Redaksi OceanBird", at);
  h = swapOnce(h, "Meliput pasar modal sejak 2021. Fokus pada saham perbankan, IPO, dan dividen. Menulis analisis mingguan setiap Senin.", a.bio || `${a.name} menulis untuk redaksi OceanBird.`, at);
  // Chip keahlian → kategori yang ditulis.
  ["Perbankan", "IPO", "Dividen", "IHSG"].forEach((t, i) => {
    h = cats[i] ? swapOnce(h, t, cats[i]!, at) : h.replace(rx(`<span[^>]*>${t}</span>`), "");
  });
  // Statistik: artikel · kategori · status.
  const n = d.articles.length >= 20 ? "20+" : String(d.articles.length);
  h = swapOnce(h, "248", n, at);
  h = swapOnce(h, "12,4 rb", String(cats.length), at);
  h = swapOnce(h, "Pengikut", "Kategori", at);
  h = swapOnce(h, "5 thn", a.verified ? "✓" : "—", at);
  h = swapOnce(h, "Pengalaman", a.verified ? "Terverifikasi" : "Kontributor", at);
  const tabsAt = h.indexOf(">Artikel<", h.indexOf(">Terverifikasi<") > 0 ? h.indexOf(">Terverifikasi<") : at + 1);
  h = swapOnce(h, "248", n, tabsAt);
  h = swapOnce(h, "64", String(d.articles.filter((x) => x.category.slug === "analisis").length), tabsAt);
  h = swapOnce(h, "18", "0", tabsAt);
  if (a.avatar_url) h = h.replace(rx(`(<span[^>]*border-radius: 999px[^>]*>)${esc(initials(a.name))}(</span>)`), `$1<img src="${esc(a.avatar_url)}" alt="" style="width: 100%; height: 100%; border-radius: 999px; object-fit: cover">$2`);
  return articleRows(h, d.articles, at, "Belum ada artikel dari penulis ini.");
}

export interface TopicPage {
  topic: { slug: string; name: string; article_count: number; followers: number; following: boolean };
  articles: ArticleCard[];
  quotes: { inst: Instrument; quote: Quote | null }[];
  related: { slug: string; name: string }[];
  loggedIn: boolean;
}
export function bindTopic(html: string, d: TopicPage): string {
  let h = html;
  const t = d.topic;
  const at = Math.max(0, h.indexOf(">#Perbankan<") - 500);
  h = swapOnce(h, "#Perbankan", `#${t.name}`, at);
  h = h.replace(/>Kabar emiten bank, suku bunga, kredit, dan kinerja sektor keuangan(\.?)[^<]*</, (_m, dot: string) => `>Berita dan analisis terbaru seputar ${esc(t.name)}${dot}${dot ? "" : ` · ${fmtCount(t.followers)} pengikut · ${t.article_count} artikel`}<`);
  h = h.replace(/>12,8 rb pengikut · 342 artikel</, `>${fmtCount(t.followers)} pengikut · ${t.article_count} artikel<`);
  // Tombol ikuti (web: tombol statis; app: state u7 diatur dari server).
  h = h.replace(/<(button|a)([^>]*)>([^<]*<svg[\s\S]*?<\/svg>)?\s*Ikuti topik<\/(button|a)>/, (_m, tag: string, attrs: string, icon: string | undefined) => `<${tag}${attrs} data-topic-follow="${esc(t.slug)}" data-logged="${d.loggedIn ? 1 : 0}" aria-pressed="${t.following}">${icon ?? ""}${t.following ? "Mengikuti" : "Ikuti topik"}</${tag}>`);
  h = h.replace('onClick="{{ u7.m0.pick }}"', `onClick="{{ u7.m0.pick }}" data-topic-follow="${esc(t.slug)}" data-logged="${d.loggedIn ? 1 : 0}"`);
  // Aset terkait: harga nyata, atau bagian disembunyikan bila tak ada.
  const sample = ["BBCA", "BBRI", "BMRI", "BBNI"];
  sample.forEach((s, i) => {
    const q = d.quotes[i];
    const re = rx(`<a href="/market/BBCA"((?:(?!</a>)[\\s\\S])*?)>${s}<((?:(?!</a>)[\\s\\S])*)</a>`);
    h = h.replace(re, (whole) => {
      if (!q) return "";
      let r = whole.replace('href="/market/BBCA"', `href="/market/${encodeURIComponent(q.inst.symbol)}"`).split(`>${s}<`).join(`>${esc(displaySym(q.inst))}<`);
      r = r.replace(/>\d[\d.,]*</, `>${q.quote ? esc(price(q.quote.price, q.inst.currency)) : "—"}<`);
      if (q.quote) r = r.replace(/>(▲ |▼ )?[+−-]\d+,\d+%</, `>${esc(q.quote.change_percent >= 0 ? (r.includes("▲") || r.includes("▼") ? "▲ " : "") : r.includes("▲") || r.includes("▼") ? "▼ " : "")}${esc(pct(q.quote.change_percent))}<`).replace(/color: #(15803D|16A34A|DC2626|166534|991B1B)/g, (m0) => (q.quote!.change_percent >= 0 ? (m0.includes("991B1B") ? "color: #166534" : m0.includes("DC2626") ? "color: #15803D" : m0) : m0.includes("166534") ? "color: #991B1B" : m0.includes("15803D") || m0.includes("16A34A") ? "color: #DC2626" : m0));
      return r;
    });
  });
  // Topik serupa → tag nyata.
  const sim = ["#SukuBunga", "#Dividen", "#LaporanKeuangan", "#BankIndonesia", "#Kredit"];
  sim.forEach((s, i) => {
    const r = d.related[i];
    h = h.replace(rx(`<a href="(?:/topik/ihsg|#)"([^>]*)>${s}</a>`), r ? `<a href="/topik/${encodeURIComponent(r.slug)}"$1>#${esc(r.name)}</a>` : "");
    if (!r) h = h.replace(rx(`<(span|button)([^>]*)>${s}</(span|button)>`), "");
  });
  // Iklan in-feed contoh (app) dibuang — slot iklan nyata di-bind terpisah.
  h = h.replace(/<a[^>]*>(?:(?!<\/a>)[\s\S])*?Iklan in-feed tampil seperti berita di daftar(?:(?!<\/a>)[\s\S])*?<\/a>/, "");
  return articleRows(h, d.articles, at, "Belum ada artikel di topik ini.");
}

/** Pelanggan Plus: blok iklan (beserta labelnya) dihapus dari halaman. */
export function removeAdSlots(html: string): string {
  let h = html;
  for (let guard = 0; guard < 20; guard++) {
    const i = h.indexOf('<div role="complementary" aria-label="Iklan ');
    if (i < 0) break;
    h = h.slice(0, i) + h.slice(closeOf(h, i));
  }
  return h;
}

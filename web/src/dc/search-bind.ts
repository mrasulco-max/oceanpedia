import "server-only";
import type { ArticleCard, Instrument, Quote, SearchResponse } from "@/lib/types";
import { esc, initials, relTime } from "./bind";

/**
 * Binder halaman Cari (web-cari & app-11): hasil nyata dari GET /v1/search
 * (aset, berita, penulis, topik) dengan tata letak desain. Bagian diberi penanda
 * [data-sec] agar tab "Semua / Aset / Berita / Penulis / Topik" bisa menyaring (enhancer "search").
 */

const MARK_RE = (q: string) => new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");

function highlight(text: string, q: string, markTag: string): string {
  const safe = esc(text);
  if (!q) return safe;
  return safe.replace(MARK_RE(esc(q)), `${markTag}$1</mark>`);
}

function priceText(q: Quote | undefined): string {
  if (!q) return "—";
  const dec = q.price < 10 ? 4 : q.price < 1000 ? 2 : 0;
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(q.price);
}
const pct = (q: Quote | undefined) =>
  q ? `${q.change_percent >= 0 ? "+" : "−"}${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(q.change_percent))}%` : "—";

function first(h: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0;
  return re.exec(h);
}

/** Ganti blok berulang (template = kemunculan pertama, semua kemunculan di rentang dihapus) dengan daftar baru. */
function replaceRun(h: string, start: number, end: number, itemRe: RegExp, render: (tpl: string) => string): string {
  const seg = h.slice(start, end);
  const items = [...seg.matchAll(itemRe)];
  if (!items.length) return h;
  const a = start + items[0]!.index!;
  const last = items[items.length - 1]!;
  const b = start + last.index! + last[0].length;
  return h.slice(0, a) + render(items[0]![0]) + h.slice(b);
}

/** Label pendek untuk lingkaran simbol (BTCUSD → BTC, USDIDR → USD). */
const badge = (sym: string) => (sym.length === 6 && /(USD|IDR)$/.test(sym) ? sym.slice(0, 3) : sym.slice(0, 5));

const EMPTY = (txt: string, pad: string) => `<p style="margin: 0; padding: ${pad}; font-size: 14px; color: #5F6B7D">${txt}</p>`;

export interface SearchData {
  q: string;
  res: SearchResponse | null;
  quotes: Map<string, Quote>;
  popular: { instruments: Instrument[]; articles: ArticleCard[] };
}

function counts(d: SearchData) {
  const r = d.res?.result;
  const inst = r ? r.instruments : d.popular.instruments;
  const arts = r ? r.articles : d.popular.articles;
  const auth = r ? r.authors : [];
  const tags = r ? r.tags : [];
  return { inst, arts, auth, tags, total: inst.length + arts.length + auth.length + tags.length };
}

/** Halaman Cari versi aplikasi (app-11). */
export function bindSearchApp(html: string, d: SearchData): string {
  let h = html;
  const { inst, arts, auth, tags, total } = counts(d);
  const mark = '<mark style="background: #DCEBFF; color: #0B0B0F; border-radius: 4px; padding: 0 2px">';
  // Kolom pencarian: nilai nyata, dikendalikan enhancer (bukan state contoh desain).
  h = h.replace(/<input onChange="\{\{ onQ \}\}" type="text" inputmode="search" aria-label="Cari" value="\{\{ q \}\}" autofocus/, `<input data-search-input type="search" inputmode="search" enterkeyhint="search" aria-label="Cari" value="${esc(d.q)}" placeholder="Cari saham, kripto, berita, penulis…"${d.q ? "" : " autofocus"}`);
  h = h.replace('<button onClick="{{ clearQ }}" aria-label="Hapus teks"', '<button data-search-clear aria-label="Hapus teks"');
  // Tab & jumlah.
  const tabs: [string, string, number][] = [["Semua", "all", total], ["Aset", "aset", inst.length], ["Berita", "berita", arts.length], ["Penulis", "penulis", auth.length], ["Topik", "topik", tags.length]];
  for (const [label, key, n] of tabs) {
    h = h.replace(new RegExp(`(<button onClick="\\{\\{ u1\\.m\\d\\.pick \\}\\}")([^>]*>)${label} <span style="opacity: \\.8">\\d+</span>`), `$1 data-tab="${key}"$2${label} <span style="opacity: .8">${n}</span>`);
  }
  const scrollStart = h.indexOf('<div class="ob-scroll" style="position: absolute; top: 167px');
  if (scrollStart < 0) return h;
  const head = (t: string) => new RegExp(`<div style="display: flex; align-items: center; justify-content: space-between; padding: 18px 0 6px"><h2 style="margin: 0; font-size: 15px; font-weight: 700">${t}</h2>`);
  const pos = (t: string) => {
    const m = first(h.slice(scrollStart), head(t));
    return m ? scrollStart + m.index : -1;
  };

  // Topik.
  let s = pos("Topik terkait");
  let e = h.indexOf("PENCARIAN TERAKHIR", s);
  if (s > 0 && e > s) {
    h = replaceRun(h, s, e, /<a href="\/topik\/[^"]*"[^>]*>[^<]*<\/a>/g, (tpl) =>
      tags.length ? tags.map((t) => tpl.replace(/href="\/topik\/[^"]*"/, `href="/topik/${esc(t.slug)}"`).replace(/>[^<]*<\/a>$/, `>#${esc(t.name)}</a>`)).join("") : EMPTY(d.q ? "Tidak ada topik terkait." : "Ketik kata kunci untuk melihat topik.", "4px 0"),
    );
  }
  // Penulis.
  s = pos("Penulis");
  e = pos("Topik terkait");
  if (s > 0 && e > s) {
    h = replaceRun(h, s, e, /<a href="\/penulis\/[\s\S]*?<\/a>/g, (tpl) =>
      auth.length
        ? auth
            .map((a) =>
              tpl
                .replace(/href="\/penulis\/[^"]*"/, `href="/penulis/${esc(a.slug)}"`)
                .replace(/(font-size: 13px; font-weight: 500">)ML(<\/span>)/, `$1${esc(initials(a.name))}$2`)
                .replace(/(<strong style="font-size: 15px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${highlight(a.name, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[\s\S]*?(<\/span><\/span><span style="font-size: 13px)/, `$1${esc(a.title || "Penulis")} · ${a.article_count} artikel$2`),
            )
            .join("")
        : EMPTY(d.q ? "Tidak ada penulis yang cocok." : "Ketik kata kunci untuk mencari penulis.", "8px 0"),
    );
  }
  // Berita.
  s = pos("Berita");
  e = pos("Penulis");
  if (s > 0 && e > s) {
    h = h.slice(0, s) + h.slice(s).replace('href="/kategori/saham" style=\'font-size: 13px; font-weight: 500; color: #2F74EB\'>Lihat semua', `href="${d.q ? `/cari?q=${encodeURIComponent(d.q)}` : "/"}" style='font-size: 13px; font-weight: 500; color: #2F74EB'>${d.q ? "Lihat semua" : "Terbaru"}`);
    e = pos("Penulis");
    h = replaceRun(h, s, e, /<a href="\/berita\/[\s\S]*?<\/a>/g, (tpl) =>
      arts.length
        ? arts
            .map((a) =>
              tpl
                .replace(/href="\/berita\/[^"]*"/, `href="/berita/${esc(a.slug)}"`)
                .replace(/src="\/img\/news-\d\.jpg"/, `src="${esc(a.cover_url ?? "/img/news-1.jpg")}"`)
                .replace(/alt=""/, `alt="${esc(a.cover_alt || a.title)}"`)
                .replace(/(<strong style="font-size: 14px; line-height: 1\.35; font-weight: 500">)[\s\S]*?(<\/strong>)/, `$1${highlight(a.title, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.category.name)} · ${esc(relTime(a.published_at))}$2`),
            )
            .join("")
        : EMPTY(d.q ? "Tidak ada berita yang cocok." : "Belum ada berita.", "8px 0"),
    );
  }
  // Aset.
  s = pos("Aset");
  e = pos("Berita");
  if (s > 0 && e > s) {
    h = replaceRun(h, s, e, /<a href="\/market\/[\s\S]*?<\/a>/g, (tpl) =>
      inst.length
        ? inst
            .map((i) => {
              const q = d.quotes.get(i.symbol);
              const up = (q?.change_percent ?? 0) >= 0;
              return tpl
                .replace(/href="\/market\/[^"]*"/, `href="/market/${esc(i.symbol)}"`)
                .replace(/(font-size: 9px; font-weight: 700">)[^<]*(<\/span>)/, `$1${esc(badge(i.symbol))}$2`)
                .replace(/(<strong style="font-size: 15px; font-weight: 500">)[\s\S]*?(<\/strong>)/, `$1${highlight(i.symbol, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${highlight(i.name, d.q, mark)} · ${esc(i.exchange)}$2`)
                .replace(/(monospace; font-size: 14px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${priceText(q)}$2`)
                .replace(/color: #166534; background: #DCF5E4([^>]*>)[^<]*</, `color: ${q ? (up ? "#166534" : "#991B1B") : "#5F6B7D"}; background: ${q ? (up ? "#DCF5E4" : "#FDE2E2") : "#F6F8FC"}$1${q ? `${up ? "▲" : "▼"} ${pct(q)}` : "—"}<`);
            })
            .join("")
        : EMPTY(d.q ? "Tidak ada aset yang cocok." : "Belum ada aset.", "8px 0"),
    );
  }
  // Penanda bagian untuk filter tab.
  h = markSections(h, scrollStart, head, ["Aset", "aset"], ["Berita", "berita"], ["Penulis", "penulis"], ["Topik terkait", "topik"]);
  h = h.replace(/(<div style="margin-top: 22px; padding-top: 14px; border-top: 1px solid #E3EAF4"><span[^>]*>)PENCARIAN TERAKHIR/, `<div data-sec="recent" style="margin-top: 22px; padding-top: 14px; border-top: 1px solid #E3EAF4"><span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #5F6B7D">PENCARIAN TERAKHIR`);
  // Chip pencarian: tautan sungguhan.
  h = h.replace(/<a tabindex="0" role="button" onClick="\{\{ f[345] \}\}"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?([^<]*)<\/a>/g, (_m, attrs: string, icon: string | undefined, label: string) => `<a data-search-chip href="/cari?q=${encodeURIComponent(label.trim())}"${attrs}>${icon ?? ""}${label}</a>`);
  return h;
}

/** Bungkus tiap bagian (judul + isi hingga judul berikutnya) dengan <div data-sec>. */
function markSections(h: string, from: number, head: (t: string) => RegExp, ...secs: [string, string][]): string {
  let out = h;
  for (let i = secs.length - 1; i >= 0; i--) {
    const [title, key] = secs[i]!;
    const m = first(out.slice(from), head(title));
    if (!m) continue;
    const s = from + m.index;
    let e = -1;
    if (i + 1 < secs.length) {
      const n = first(out.slice(from), head(secs[i + 1]![0]));
      e = n ? from + n.index : -1;
      // bagian berikutnya mungkin sudah dibungkus
      const wrapped = out.lastIndexOf("<div data-sec=", e);
      if (wrapped > s) e = wrapped;
    } else {
      e = out.indexOf('<div style="margin-top: 22px; padding-top: 14px; border-top: 1px solid #E3EAF4">', s);
    }
    if (e < 0) continue;
    out = `${out.slice(0, s)}<div data-sec="${key}">${out.slice(s, e)}</div>${out.slice(e)}`;
  }
  return out;
}

/** Halaman Cari versi web (web-cari). */
export function bindSearchWeb(html: string, d: SearchData): string {
  let h = html;
  const { inst, arts, auth, tags, total } = counts(d);
  const mark = '<mark style="background: #DCEBFF; color: #0B0B0F; border-radius: 4px; padding: 0 3px">';
  h = h.replace('<input type="text" value="BBCA"', `<input data-search-input type="search" enterkeyhint="search" value="${esc(d.q)}" placeholder="Cari saham, kripto, berita, penulis…"${d.q ? "" : " autofocus"}`);
  h = h.replace(/(<input data-search-input[^>]*>)<a href="#" class="ob-anim"/, '$1<a href="/cari" data-search-go class="ob-anim"');
  const tabs: [string, string, number][] = [["Semua", "all", total], ["Aset", "aset", inst.length], ["Berita", "berita", arts.length], ["Penulis", "penulis", auth.length], ["Topik", "topik", tags.length]];
  for (const [label, key, n] of tabs) {
    h = h.replace(new RegExp(`(<button role="tab" aria-selected="(?:true|false)")([^>]*>)${label}(<span[^>]*>)\\d+</span>`), `$1 data-tab="${key}"$2${label}$3${n}</span>`);
  }
  const took = d.res ? new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(d.res.took_ms, 1) / 1000) : "";
  h = h.replace(
    /<span style="font-size: 13px; color: #5F6B7D">8 hasil untuk <b style="color: #0B0B0F">“BBCA”<\/b> · 0,12 detik<\/span>/,
    d.q
      ? `<span style="font-size: 13px; color: #5F6B7D">${total} hasil untuk <b style="color: #0B0B0F">“${esc(d.q)}”</b> · ${took} detik</span>`
      : `<span style="font-size: 13px; color: #5F6B7D">Ketik kata kunci lalu tekan Enter · menampilkan aset &amp; berita terbaru</span>`,
  );

  // Aset (tabel).
  const asetHead = h.indexOf("ASET</span>");
  const beritaH2 = h.indexOf(">Berita</h2>");
  if (asetHead > 0 && beritaH2 > asetHead) {
    h = replaceRun(h, asetHead, beritaH2, /<div style="display: grid; grid-template-columns: 1\.6fr 1fr 1fr 140px; gap: 12px; align-items: center;[\s\S]*?Watchlist<\/a><\/span><\/div>/g, (tpl) =>
      inst.length
        ? inst
            .map((i) => {
              const q = d.quotes.get(i.symbol);
              const up = (q?.change_percent ?? 0) >= 0;
              return `<a href="/market/${esc(i.symbol)}" style="display: block">${tpl
                .replace(/(font-size: 9px; font-weight: 700">)[^<]*(<\/span>)/, `$1${esc(badge(i.symbol))}$2`)
                .replace(/(<strong style="font-weight: 700">)[\s\S]*?(<\/strong>)/, `$1${highlight(i.symbol, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${highlight(i.name, d.q, mark)} · ${esc(i.exchange)}$2`)
                .replace(/(monospace; font-size: 15px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${priceText(q)}$2`)
                .replace(/(<span style="font-weight: 700; color: )#15803D(">)[^<]*(<\/span>)/, `$1${q ? (up ? "#15803D" : "#DC2626") : "#5F6B7D"}$2${pct(q)}$3`)
                .replace(/<a href="#" style="height: 38px;/, `<span style="height: 38px;`)
                .replace(/Watchlist<\/a><\/span><\/div>$/, "Detail</span></span></div>")}</a>`;
            })
            .join("")
        : EMPTY(d.q ? "Tidak ada aset yang cocok." : "Belum ada aset.", "16px 18px"),
    );
  }
  // Berita.
  let s = h.indexOf(">Berita</h2>");
  let e = h.indexOf('<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 32px">', s);
  if (s > 0 && e > s) {
    h = h.slice(0, s) + h.slice(s).replace('<a class="wl" href="#" style="display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 500; color: #2F74EB">Lihat semua', `<a class="wl" href="${d.q ? `/cari?q=${encodeURIComponent(d.q)}` : "/"}" style="display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 500; color: #2F74EB">${d.q ? "Lihat semua" : "Terbaru"}`);
    e = h.indexOf('<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 32px">', s);
    h = replaceRun(h, s, e, /<a href="\/berita\/[\s\S]*?<\/a>/g, (tpl) =>
      arts.length
        ? arts
            .map((a, n) =>
              tpl
                .replace(/href="\/berita\/[^"]*"/, `href="/berita/${esc(a.slug)}"`)
                .replace(/padding: 18px 0; [^"]*"/, `padding: 18px 0; ${n ? "border-top: 1px solid #E3EAF4" : ""}"`)
                .replace(/src="\/img\/news-\d\.jpg"/, `src="${esc(a.cover_url ?? "/img/news-1.jpg")}"`)
                .replace(/alt=""/, `alt="${esc(a.cover_alt || a.title)}"`)
                .replace(/(letter-spacing: \.06em; color: #2F74EB">)[^<]*(<\/span>)/, `$1${esc(a.category.name.toUpperCase())}$2`)
                .replace(/(<strong style="font-size: 17px; line-height: 1\.35; font-weight: 500">)[\s\S]*?(<\/strong>)/, `$1${highlight(a.title, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span><\/span><\/a>)$/, `$1${esc(a.author_name)} · ${esc(relTime(a.published_at))}$2`),
            )
            .join("")
        : EMPTY(d.q ? "Tidak ada berita yang cocok." : "Belum ada berita.", "18px 0"),
    );
  }
  // Penulis.
  s = h.indexOf(">Penulis</h3>");
  e = h.indexOf(">Topik terkait</h3>", s);
  if (s > 0 && e > s) {
    h = replaceRun(h, s, e, /<a href="\/penulis\/[\s\S]*?<\/a>/g, (tpl) =>
      auth.length
        ? auth
            .map((a) =>
              tpl
                .replace(/href="\/penulis\/[^"]*"/, `href="/penulis/${esc(a.slug)}"`)
                .replace(/(font-weight: 700">)ML(<\/span>)/, `$1${esc(initials(a.name))}$2`)
                .replace(/(<strong style="font-weight: 500">)[^<]*(<\/strong>)/, `$1${highlight(a.name, d.q, mark)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[\s\S]*?(<\/span><\/span><span style="color: #2F74EB)/, `$1${esc(a.title || "Penulis")} · ${a.article_count} artikel$2`),
            )
            .join('<span style="display: block; height: 12px"></span>')
        : EMPTY(d.q ? "Tidak ada penulis yang cocok." : "Ketik kata kunci untuk mencari penulis.", "0"),
    );
  }
  // Topik.
  s = h.indexOf(">Topik terkait</h3>");
  e = h.indexOf("PENCARIAN TERAKHIR", s);
  if (s > 0 && e > s) {
    h = replaceRun(h, s, e, /<a class="wl" href="\/topik\/[^"]*"[^>]*>[^<]*<\/a>/g, (tpl) =>
      tags.length ? tags.map((t) => tpl.replace(/href="\/topik\/[^"]*"/, `href="/topik/${esc(t.slug)}"`).replace(/>[^<]*<\/a>$/, `>#${esc(t.name)}</a>`)).join("") : EMPTY(d.q ? "Tidak ada topik terkait." : "Ketik kata kunci untuk melihat topik.", "0"),
    );
  }
  // Penanda bagian (filter tab).
  h = h.replace(/(<div style="display: flex; align-items: center; justify-content: space-between; margin: 28px 0 16px"><h2[^>]*>(?:<span[\s\S]*?<\/span>)?Aset<\/h2><\/div>)/, '<div data-sec="aset">$1');
  h = h.replace(/(<div style="display: flex; align-items: center; justify-content: space-between; margin: 32px 0 16px"><h2[^>]*>(?:<span[\s\S]*?<\/span>)?Berita<\/h2>)/, "</div><div data-sec=\"berita\">$1");
  h = h.replace('<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 32px"><div style="border-radius: 22px; border: 1px solid #E3EAF4; padding: 20px; ">', '</div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 32px"><div data-sec="penulis" style="border-radius: 22px; border: 1px solid #E3EAF4; padding: 20px; ">');
  h = h.replace(/(<\/div><div) (style="border-radius: 22px; border: 1px solid #E3EAF4; padding: 20px; "><h3 style="margin: 0 0 12px; font-size: 17px; font-weight: 700">Topik terkait)/, '$1 data-sec="topik" $2');
  // Chip pencarian terakhir & populer: tautan sungguhan.
  h = h.replace(/<a href="#" (style="height: 36px; display: flex; align-items: center; gap: 6px; padding: 0 14px; border-radius: 999px; background: #F6F8FC; font-size: 14px">)(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?([^<]*)<\/a>/g, (_m, st: string, icon: string | undefined, label: string) => `<a data-search-chip href="/cari?q=${encodeURIComponent(label.trim())}" ${st}>${icon ?? ""}${label}</a>`);
  return h;
}

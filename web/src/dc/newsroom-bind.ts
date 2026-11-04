import "server-only";
import { esc as esc0 } from "./bind";
import { ago, blocks, closeOf, compact, emptyRow, fmtDate, num, pill, recolorAvatar, rx, statCard, threaded } from "./kit";
import { initials } from "./bind";
import { shortMedia, type ShortMedia } from "@/lib/short-media";

/**
 * Binder panel redaksi lanjutan: Dashboard, Riwayat versi, Breaking & live, Newsletter,
 * Notifikasi staf, Laporan, Pencarian admin.
 */

const esc = (s: string) => esc0(s).replace(/\$/g, "&#36;");
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
function safeCard(h: string, title: string, value: string, pillHtml: string, caption: string, opt: { arrow?: "up" | "down" | null; rename?: string } = {}): string {
  try {
    return statCard(h, title, value, pillHtml, caption, opt);
  } catch {
    return h;
  }
}

export interface DashStats {
  review: number;
  scheduled: number;
  breaking_active: number;
  published_today: number;
  published_yesterday: number;
  views_total: number;
  active_users_24h: number;
  new_users_7d: number;
  readers: number;
  subscribers: number;
  reports_pending: number;
  comments_pending: number;
  ad_impressions: number;
  ad_clicks: number;
  campaigns_review: number;
  market_calls_today: number;
  market_latency_avg_ms: number;
  market_errors_today: number;
  revenue_month: number;
  newsletter_subscribers: number;
}
export interface ReviewItem {
  id: string;
  title: string;
  author_name: string;
  category_name: string;
  is_breaking: boolean;
  symbols: string[];
  cover_url: string | null;
  status: string;
  updated_at: string;
}

function tabCount(h: string, label: string, n: number): string {
  return h.replace(rx(`(>)\\d+(</span><span style="font-size: 16px; font-weight: \\d+">${label}<)`), `$1${n}$2`);
}

// ======================================================================= dashboard
export function bindDashboard(html: string, d: { stats: DashStats; review: ReviewItem[]; quota: number; me: string }): string {
  let h = html;
  const s = d.stats;
  h = tabCount(h, "Antrian review", s.review);
  h = tabCount(h, "Terjadwal", s.scheduled);
  h = tabCount(h, "Breaking aktif", s.breaking_active);
  h = h.replace(/>Halo, Andi</, `>Halo, ${esc(d.me.split(/\s+/)[0] || "Tim")}<`);
  // Antrian review: baris nyata.
  const rows = blocks(h, '<div style="display: grid; grid-template-columns: 2.2fr 1.5fr .9fr .8fr .8fr 36px; gap: 12px; align-items: center;');
  if (rows.length) {
    const tpl = rows[1]?.html ?? rows[0]!.html;
    const built = d.review.length
      ? d.review
          .map((a, i) =>
            tpl
              .replace("border-top: 1px solid #E3EBF7; font-size: 14px", `border-top: 1px solid #E3EBF7; font-size: 14px${i === 0 ? "; background: #F4F8FF" : ""}`)
              .replace(/(<strong style="font-weight: 500; line-height: 1.35">)[^<]*(<\/strong><span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1<a href="/admin/tulis?id=${a.id}" style="color: inherit">${esc(a.title)}</a>$2Masuk ${esc(ago(a.updated_at))}$3`)
              .replace(/(<span style="flex: none; width: 32px; height: 32px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}([^"]*">)[^<]*(<\/span>)/, (_m, x: string, y: string, z: string) => recolorAvatar(`${x}background: #000000; color: #000000${y}${esc(initials(a.author_name))}${z}`, a.author_name))
              .replace(/(<strong style="font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/strong><span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.author_name)}$2Redaksi$3`)
              .replace(/(<span style="min-width: 0">)<span style="display: inline-flex[^"]*">[^<]*<\/span>(<\/span><span style="min-width: 0">)<span style="display: inline-flex[^"]*">[^<]*<\/span>(<\/span><span style="min-width: 0">)<span style="display: inline-flex[^"]*">[^<]*<\/span>/, `$1${pill(a.category_name, "blue")}$2${pill(a.is_breaking ? "Tinggi" : "Normal", a.is_breaking ? "orange" : "gray")}$3${pill("Review", "orange")}`)
              .replace(/<button aria-label="(?:Tutup|Buka) detail"[^>]*>/, `<a href="/admin/konten?status=review&amp;id=${a.id}" aria-label="Buka ${esc(a.title)}" style="width: 34px; height: 34px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; color: #0B0B0F; display: flex; align-items: center; justify-content: center">`)
              .replace(/<\/button>(<\/span><\/div>)$/, "</a>$1"),
          )
          .join("")
      : emptyRow("Tidak ada artikel menunggu review.");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  // Panel detail: artikel pertama di antrian.
  const a = d.review[0];
  if (a) {
    h = h.replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">Detail artikel<\/h2><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.title.slice(0, 60))}$2`);
    const kv = (k: string, v: string) => {
      h = h.replace(rx(`(<span style="color: #5F6B7D">${k}</span><span style="text-align: right; font-weight: 500">)(?:<span[^>]*>)?[^<]*(?:</span>)?(</span>)`), `$1${esc(v)}$2`);
    };
    kv("Penulis", a.author_name);
    kv("Kategori", a.category_name);
    kv("Ticker terkait", a.symbols.join(", ") || "—");
    kv("Sumber data", a.symbols.length ? "Twelve Data" : "—");
    kv("Foto", a.cover_url ? "Ada" : "Belum ada foto sampul");
    kv("Notifikasi", a.is_breaking ? "Breaking · push saat terbit" : "Pengikut topik saat terbit");
    h = h.replace(/<a href="\/admin\/konten"([^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Minta revisi<\/a>)/, `<a href="/admin/konten?status=review&amp;id=${a.id}"$1`).replace(/<a href="\/admin\/tulis"( class=ob-anim[^>]*>(?:(?!<\/a>)[\s\S])*Review sekarang<\/a>)/, `<a href="/admin/tulis?id=${a.id}"$1`);
  } else {
    h = h.replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">Detail artikel<\/h2><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, "$1Antrian kosong$2");
  }
  // Kuota data pasar.
  const used = s.market_calls_today;
  h = h.replace(/(<strong style="font-size: 26px; font-weight: 500">)642(<\/strong><span[^>]*>)dari 800 kredit terpakai/, `$1${num(used)}$2dari ${num(d.quota)} kredit terpakai`);
  h = h.replace(/>Gunakan cache Redis untuk aset yang jarang dibuka\. Batas aman 85%\./, `>Cache bersama di database melayani harga berulang. Mode hemat aktif otomatis di atas 85% (${Math.round((used / d.quota) * 100)}% hari ini).`);
  // Skor kesehatan: 100 − penalti latensi & error.
  const score = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, (s.market_latency_avg_ms - 400) / 40) - s.market_errors_today * 2 - Math.max(0, (used / d.quota - 0.85) * 100))));
  h = h.replace(/(letter-spacing: -.02em">)92(<span)/, `$1${score}$2`).replace(/>▲ \+2 poin</, `>${score >= 90 ? "Sehat" : score >= 70 ? "Perlu perhatian" : "Bermasalah"}<`);
  // Kartu angka.
  h = safeCard(h, "Pageview hari ini", compact(s.views_total), pill("Total", "blue"), "Akumulasi pembacaan artikel sejak terbit.", { rename: "Total pageview" });
  h = safeCard(h, "Pengguna aktif", compact(s.active_users_24h), pill(`${num(s.new_users_7d)} baru/7 hari`, "lime"), `${num(s.readers)} akun · ${num(s.subscribers)} pelanggan Plus.`, { rename: "Aktif 24 jam" });
  h = safeCard(h, "Artikel terbit", num(s.published_today), pill(`Kemarin ${num(s.published_yesterday)}`, "gray"), `${num(s.review)} di antrian review · ${num(s.scheduled)} terjadwal.`, { arrow: s.published_today >= s.published_yesterday ? "up" : "down", rename: "Terbit hari ini" });
  h = safeCard(h, "Latensi harga p95", `${Math.round(s.market_latency_avg_ms)} ms`, pill(s.market_latency_avg_ms < 1000 ? "Normal" : "Lambat", s.market_latency_avg_ms < 1000 ? "green" : "orange"), `${num(s.market_calls_today)} panggilan penyedia hari ini · ${num(s.market_errors_today)} error.`, { rename: "Latensi data rata-rata" });
  const ctr = s.ad_impressions ? (s.ad_clicks / s.ad_impressions) * 100 : 0;
  h = safeCard(h, "CTR iklan", `${ctr.toFixed(1).replace(".", ",")}%`, pill(`${compact(s.ad_impressions)} tayang`, "blue"), `${num(s.ad_clicks)} klik · ${num(s.campaigns_review)} kampanye menunggu verifikasi.`);
  h = safeCard(h, "Laporan komentar", num(s.reports_pending), pill(s.reports_pending ? "Perlu cek" : "Aman", s.reports_pending ? "orange" : "green"), `${num(s.comments_pending)} komentar menunggu persetujuan.`);
  return h;
}

// ======================================================================= riwayat versi
export interface VersionItem {
  id: string;
  version: number;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  symbols: string[];
  note: string;
  editor_name: string;
  created_at: string;
}
const WIBt = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":");

/** Diff kata sederhana (LCS) → HTML dengan tambahan hijau & hapusan merah. */
export function wordDiff(a: string, b: string): { html: string; add: number; del: number } {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  if (A.length * B.length > 400000) return { html: `<span>${esc(b)}</span>`, add: 0, del: 0 };
  const n = A.length, m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  let i = 0, j = 0, add = 0, del = 0;
  const out: string[] = [];
  while (i < n && j < m) {
    if (A[i] === B[j]) out.push(esc(A[i++]!)), j++;
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      if (A[i]!.trim()) del++;
      out.push(`<del style="background: #FDE2E2; color: #991B1B; text-decoration: line-through">${esc(A[i++]!)}</del>`);
    } else {
      if (B[j]!.trim()) add++;
      out.push(`<ins style="background: #DCF5E4; color: #166534; text-decoration: none">${esc(B[j++]!)}</ins>`);
    }
  }
  while (i < n) {
    if (A[i]!.trim()) del++;
    out.push(`<del style="background: #FDE2E2; color: #991B1B; text-decoration: line-through">${esc(A[i++]!)}</del>`);
  }
  while (j < m) {
    if (B[j]!.trim()) add++;
    out.push(`<ins style="background: #DCF5E4; color: #166534; text-decoration: none">${esc(B[j++]!)}</ins>`);
  }
  return { html: out.join(""), add, del };
}

export function bindVersions(html: string, d: { article: { id: string; title: string; status: string }; list: VersionItem[]; cmp: string | null }): string {
  let h = html;
  const L = d.list;
  const cur = L[0];
  const prev = (d.cmp && L.find((v) => v.id === d.cmp)) || L[1] || cur;
  h = h.replace(/>Rekap sesi 1: IHSG naik 0,6% ditopang saham bank · 12 versi</, `>${esc(d.article.title)} · ${L.length} versi<`);
  h = h.split('href="/admin/tulis"').join(`href="/admin/tulis?id=${d.article.id}"`);
  // Daftar versi.
  const rows = blocks(h, '<a href="/admin/versi" style="display: flex; gap: 12px; padding: 12px; border-radius: 18px;', "a");
  if (rows.length && cur) {
    const tpl = rows.find((r) => !r.html.includes("Saat ini") && !r.html.includes("Dibandingkan"))?.html ?? rows[0]!.html;
    const built = L.slice(0, 40)
      .map((v) => {
        const isCur = v.id === cur.id;
        const isCmp = !!prev && v.id === prev.id && !isCur;
        let r = tpl
          .replace('href="/admin/versi"', `href="/admin/versi?id=${d.article.id}&amp;cmp=${v.id}"`)
          .replace(/(color: #2F74EB">)v\d+(<)/, `$1v${v.version}$2`)
          .replace(/(<span style="font-size: 12px; color: #5F6B7D">)\d+ Okt · \d\d:\d\d(<)/, `$1${esc(WIBt(v.created_at))}$2`)
          .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<)/, `$1${esc(v.note || "Simpan")}$2`)
          .replace(/(font-size: 7px; font-weight: 700">)[^<]*(<\/span><span style="font-size: 12px; color: #5F6B7D">)[^<]*(<)/, `$1${esc(initials(v.editor_name))}$2${esc(v.editor_name)}$3`);
        if (isCur || isCmp) {
          r = r.replace("border: 1px solid transparent", isCur ? "border: 1px solid transparent; background: #F4F8FF" : "border: 1px solid #BFD6FB")
            .replace(/<\/a>$/, `${pill(isCur ? "Saat ini" : "Dibandingkan", isCur ? "green" : "blue", 11)}</a>`);
        }
        return r;
      })
      .join("");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  h = removeStateDemos(h);
  if (cur && prev) {
    h = h.replace(/(>v)11(<\/[^>]+>\s*<[^>]+>→<)/, `$1${prev.version}$2`).replace(/>v12 · saat ini</, `>v${cur.version} · saat ini<`);
    const t = wordDiff(prev.title, cur.title);
    const e = wordDiff(prev.excerpt, cur.excerpt);
    const b = wordDiff(prev.body.slice(0, 6000), cur.body.slice(0, 6000));
    h = h.replace(/>\+ 3 tambahan</, `>+ ${t.add + e.add + b.add} tambahan<`).replace(/>− 2 hapusan</, `>− ${t.del + e.del + b.del} hapusan<`);
    const meta = prev.symbols.join(",") !== cur.symbols.join(",") || prev.status !== cur.status ? 1 : 0;
    h = h.replace(/>1 perubahan metadata</, `>${meta} perubahan metadata<`);
    // Ganti isi panel perbandingan (JUDUL … METADATA) dengan diff nyata.
    const start = h.indexOf(">JUDUL<");
    const mStart = h.indexOf(">METADATA<");
    if (start > 0 && mStart > start) {
      const s0 = h.lastIndexOf("<", start);
      const m0 = h.lastIndexOf("<", mStart);
      const sec = (label: string, body: string) => `<div style="display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-top: 1px solid #E3EBF7"><span style="font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #5F6B7D">${label}</span><div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap">${body}</div></div>`;
      h = h.slice(0, s0) + sec("JUDUL", t.html) + sec("DEK", e.html) + sec("ISI", b.html) + h.slice(m0);
    }
    h = h.replace(/(Ticker terkait: )(?:<span[^>]*>[^<]*<\/span>)+/, (_m, a0: string) => `${a0}${cur.symbols.map((x) => pill(x, prev.symbols.includes(x) ? "gray" : "lime")).join("")}${prev.symbols.filter((x) => !cur.symbols.includes(x)).map((x) => pill(`− ${x}`, "red")).join("")}${cur.symbols.length || prev.symbols.length ? "" : "—"}`);
    h = h.replace(/>Pratinjau v\d+</, `>Pratinjau v${cur.version}<`);
    h = h.replace(/>Salin teks v11</, `>Salin teks v${prev.version}<`).replace(/>Pulihkan v11</g, `>Pulihkan v${prev.version}<`).replace(/>Pulihkan versi v11\?</, `>Pulihkan versi v${prev.version}?<`);
    h = h.replace(/Isi artikel kembali ke v11\. Versi v12 tetap tersimpan/, `Isi artikel kembali ke v${prev.version}. Versi v${cur.version} tetap tersimpan`);
    h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Pulihkan v\d+<)/, `$1 data-ver="restore" data-article="${d.article.id}" data-version="${prev.id}" data-n="${prev.version}"$2`);
    h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Salin teks v\d+<)/, `$1 data-ver="copy" data-version="${prev.id}"$2`);
  }
  if (!L.length) h = h.replace(/>Perbandingan</, ">Belum ada versi tersimpan<");
  return h;
}

// ======================================================================= breaking & live
export interface BreakingRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  views: number;
  published_at: string | null;
  breaking_until: string | null;
  active: boolean;
  author: string;
}
export interface LivePostRow {
  id: string;
  body: string;
  kind: string;
  symbol: string | null;
  pinned: boolean;
  author: string;
  created_at: string;
}
export interface LiveState {
  breaking: BreakingRow[];
  live: { id: string; title: string; summary: string; symbol: string | null; status: string; closes_at: string | null; created_at: string; posts: LivePostRow[] } | null;
  can_breaking: boolean;
}
const hm = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":");

export function bindLiveAdmin(html: string, st: LiveState): string {
  let h = removeStateDemos(html);
  const act = st.breaking.find((b) => b.active);
  if (act) {
    h = h.split("BI tahan suku bunga di 6,00%, IHSG berbalik menguat").join(esc(act.title));
    h = h.replace(/>Tampil di web &amp; aplikasi sejak 10:02 WIB<|>Tampil di web & aplikasi sejak 10:02 WIB</, `>Tampil di web &amp; aplikasi sejak ${act.published_at ? hm(act.published_at) : "—"} WIB<`);
    const left = act.breaking_until ? Math.max(0, new Date(act.breaking_until).getTime() - Date.now()) : 0;
    h = h.replace(/>3j 45m</, `>${act.breaking_until ? `${Math.floor(left / 3600000)}j ${Math.floor((left % 3600000) / 60000)}m` : "Manual"}<`);
    h = h.replace(/>24,1 rb</, `>${compact(act.views)}<`).replace(/>44%</, ">—<");
    h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Perpanjang 2 jam<)/, `$1 data-live="extend" data-id="${act.id}"$2`);
    h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Akhiri breaking<)/, `$1 data-live="end-breaking" data-id="${act.id}"$2`);
    h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Edit judul bar<)/, `$1 data-live="edit-breaking" data-id="${act.id}"$2`);
  } else {
    h = h.replace(/>Breaking aktif</, ">Tidak ada breaking aktif<").replace(/>TAYANG</, ">—<");
    h = h.replace(/>Tampil di web &amp; aplikasi sejak 10:02 WIB<|>Tampil di web & aplikasi sejak 10:02 WIB</, ">Tandai artikel sebagai BREAKING dari editor untuk menampilkan bar merah.<");
  }
  // Live blog.
  const L = st.live;
  if (L) {
    h = h.replace(/>Live blog: Perdagangan IHSG hari ini</, `>Live blog: ${esc(L.title)}<`);
    h = h.replace(/>Dibuka 08:45 · ditutup otomatis 16:15 WIB</, `>Dibuka ${hm(L.created_at)}${L.closes_at ? ` · ditutup otomatis ${hm(L.closes_at)} WIB` : ""}${L.status === "ended" ? " · selesai" : ""}<`);
    h = h.replace(/> LIVE · 2,1 rb menonton</, `> ${L.status === "live" ? "LIVE" : "SELESAI"} · ${L.posts.length} pembaruan<`);
    if (L.status === "live") h = h.replace(/(>Live blog: [^<]*<\/[a-z0-9]+>)/, `$1<button type="button" data-live="end" data-id="${L.id}" style="margin-left: 8px; border: 1px solid #F5C2C2; background: #FFFFFF; color: #991B1B; border-radius: 999px; padding: 4px 12px; font-size: 12px">Tutup live blog</button>`);
  }
  const rows = blocks(h, '<div style="display: flex; gap: 14px; padding: 16px 0; border-top: 1px solid #E3EBF7">');
  if (rows.length) {
    const tpl = rows.find((r) => r.html.includes("Pasar dibuka"))?.html ?? rows[rows.length - 1]!.html;
    const built = L && L.posts.length
      ? L.posts
          .map((p) =>
            tpl
              .replace(/>\d\d:\d\d</, `>${hm(p.created_at)}<`)
              .replace(/(font-size: 9px; font-weight: 700">)[^<]*(<\/span><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(initials(p.author))}$2${esc(p.author)}$3${p.pinned ? pill("Disematkan", "blue", 11) : ""}${p.kind === "breaking" ? pill("BREAKING", "red", 11) : ""}`)
              .replace(/<span style="margin-left: auto; display: flex; gap: 6px">[\s\S]*?<\/span>(<\/span>\s*<span style="font-size: 15px; line-height: 1.55">)[^<]*(<\/span>)/, `<span style="margin-left: auto; display: flex; gap: 6px"><button type="button" data-live="pin" data-id="${p.id}" data-on="${p.pinned ? 0 : 1}" style="border: 1px solid #E3EBF7; background: #FFFFFF; border-radius: 999px; padding: 3px 10px; font-size: 12px">${p.pinned ? "Lepas" : "Sematkan"}</button><button type="button" data-live="del" data-id="${p.id}" style="border: 1px solid #F5C2C2; background: #FFFFFF; color: #991B1B; border-radius: 999px; padding: 3px 10px; font-size: 12px">Hapus</button></span>$1${esc(p.body)}$2`),
          )
          .join("")
      : emptyRow(L ? "Belum ada pembaruan. Tulis pembaruan pertama di atas." : "Belum ada live blog. Tekan “Mulai live blog” untuk membuka liputan langsung.");
    h = h.slice(0, rows[0]!.start) + built + h.slice(rows[rows.length - 1]!.end);
  }
  h = h.replace('<button role="switch" aria-checked="false" aria-label="Sematkan"', '<button type="button" role="switch" aria-checked="false" aria-label="Sematkan" data-live-pin');
  h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Mulai live blog<)/, `$1 data-live="start"$2`);
  h = h.replace(/(<(?:button|a)[^>]*)(>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Kirim pembaruan<)/, `$1 data-live="post" data-id="${L?.id ?? ""}"$2`);
  h = h.replace(/<textarea([^>]*)>[^<]*<\/textarea>/, `<textarea$1 data-live="body" placeholder="Tulis pembaruan…"></textarea>`);
  // Riwayat breaking.
  const hist = blocks(h, '<div style="display: grid; grid-template-columns:').filter((r) => r.html.includes(" · Rina") || r.html.includes(" · Andi"));
  if (hist.length) {
    const tpl = hist[hist.length - 1]!.html;
    const built = st.breaking.length
      ? st.breaking
          .map((b) =>
            tpl
              .replace(/>(The Fed beri sinyal pangkas bunga|OJK bekukan izin aplikasi investasi X|BI tahan suku bunga di 6,00%)</, `><a href="/admin/tulis?id=${b.id}" style="color: inherit">${esc(b.title)}</a><`)
              .replace(/>\d+ Okt \d\d:\d\d · \w+</, `>${b.published_at ? esc(fmtDate(b.published_at, true)) : "—"} · ${esc(b.author)}<`)
              .replace(/>\d+,\d rb</, `>${compact(b.views)}<`)
              .replace(/<span style="display: inline-flex[^"]*">(Tayang|Selesai)<\/span>/, pill(b.active ? "Tayang" : "Selesai", b.active ? "red" : "gray")),
          )
          .join("")
      : emptyRow("Belum ada breaking dalam 30 hari terakhir.");
    h = h.slice(0, hist[0]!.start) + built + h.slice(hist[hist.length - 1]!.end);
  }
  return h;
}

// ======================================================================= newsletter (admin)
export interface NLState {
  stats: { active: number; new_7d: number; unsubscribed: number; members: number };
  subscribers: { id: string; email: string; lists: string[]; status: string; source: string; member: boolean; created_at: string }[];
  issues: { id: string; list: string; subject: string; status: string; recipients: number; failed: number; created_at: string; sent_at: string | null }[];
  mail_ready: boolean;
}
export function newsletterPanel(st: NLState, recent: { id: string; title: string }[]): string {
  const card = (t: string, v: string, s: string) => `<section style="flex: 1 1 160px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 6px"><span style="font-size: 13px; color: #5F6B7D">${esc(t)}</span><strong style="font-size: 26px; font-weight: 500">${esc(v)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(s)}</span></section>`;
  const issues = st.issues.length
    ? st.issues.map((i) => `<div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #E3EBF7"><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px"><strong style="font-weight: 500">${esc(i.subject)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(i.list)} · ${esc(fmtDate(i.sent_at ?? i.created_at, true))}${i.status === "sent" ? ` · ${num(i.recipients)} terkirim${i.failed ? `, ${num(i.failed)} gagal` : ""}` : ""}</span></span>${i.status === "sent" ? pill("Terkirim", "green") : `<button type="button" data-nl="send" data-id="${i.id}" style="border: 0; border-radius: 999px; padding: 8px 14px; background: #2F74EB; color: #FFFFFF; font-size: 13px">Kirim</button>`}</div>`).join("")
    : emptyRow("Belum ada edisi.");
  const subs = st.subscribers.length
    ? st.subscribers.map((s) => `<div style="display: grid; grid-template-columns: 1.6fr 1fr .8fr .8fr; gap: 12px; padding: 10px 0; border-top: 1px solid #E3EBF7; font-size: 13px"><span style="overflow: hidden; text-overflow: ellipsis">${esc(s.email)}</span><span>${esc(s.lists.join(", "))}</span><span>${s.member ? "Akun" : "Tamu"} · ${esc(s.source)}</span><span>${pill(s.status === "active" ? "Aktif" : "Berhenti", s.status === "active" ? "green" : "gray")}</span></div>`).join("")
    : emptyRow("Belum ada pelanggan newsletter.");
  const opts = recent.map((a) => `<label style="display: flex; gap: 8px; align-items: flex-start; font-size: 13px; padding: 4px 0"><input type="checkbox" data-nl="article" value="${a.id}" style="margin-top: 3px"><span>${esc(a.title)}</span></label>`).join("");
  return `<div data-nl-panel style="display: flex; flex-direction: column; gap: 18px; padding: 4px 0 24px">
<div style="display: flex; flex-wrap: wrap; gap: 12px">${card("Pelanggan aktif", num(st.stats.active), `+${num(st.stats.new_7d)} dalam 7 hari`)}${card("Punya akun", num(st.stats.members), "Pelanggan yang juga pengguna")}${card("Berhenti", num(st.stats.unsubscribed), "Total berhenti berlangganan")}${card("Edisi terkirim", num(st.issues.filter((i) => i.status === "sent").length), st.mail_ready ? "Email transaksional aktif" : "Email belum dikonfigurasi")}</div>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 12px"><h2 style="margin: 0; font-size: 18px; font-weight: 700">Edisi baru</h2>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Daftar<select data-nl="list" style="min-height: 44px; border-radius: 14px; border: 1px solid #E3EBF7; padding: 0 12px; font-size: 14px"><option value="daily">Harian</option><option value="crypto">Crypto Mingguan</option><option value="macro">Makro &amp; Kebijakan</option><option value="breaking">Breaking</option><option value="plus">Pelanggan Plus</option></select></label>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Subjek<input data-nl="subject" maxlength="200" placeholder="Ringkasan pasar pagi ini" style="min-height: 44px; border-radius: 14px; border: 1px solid #E3EBF7; padding: 0 12px; font-size: 14px"></label>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Pengantar<textarea data-nl="intro" rows="3" style="border-radius: 14px; border: 1px solid #E3EBF7; padding: 10px 12px; font-size: 14px; font-family: inherit"></textarea></label>
<div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13px; color: #5F6B7D">Artikel (maks. 12)</span>${opts || '<span style="font-size: 13px; color: #9AA6B8">Belum ada artikel terbit.</span>'}</div>
<div style="display: flex; gap: 10px; flex-wrap: wrap"><button type="button" data-nl="save" style="min-height: 46px; padding: 0 20px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px">Simpan draf</button><button type="button" data-nl="save-send" class="ob-anim" style="min-height: 46px; padding: 0 20px; border-radius: 999px; border: 0; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 14px">Kirim sekarang</button></div></section>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px"><h2 style="margin: 0 0 6px; font-size: 18px; font-weight: 700">Edisi</h2>${issues}</section>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px"><h2 style="margin: 0 0 6px; font-size: 18px; font-weight: 700">Pelanggan terbaru</h2>${subs}</section></div>`;
}

// ======================================================================= laporan
export interface ReportState {
  revenue: { day: string; value: number }[];
  signups: { day: string; value: number }[];
  published: { day: string; value: number }[];
  by_plan: { name: string; value: number }[];
  top_articles: { name: string; value: number; extra?: string }[];
  top_campaigns: { name: string; value: number; extra?: string }[];
  totals: { revenue: number; invoices_paid: number; invoices_open: number; subscribers: number; signups: number; published: number; views: number; ad_impressions: number; ad_clicks: number };
}
function bars(series: { day: string; value: number }[], color: string, fmt: (n: number) => string): string {
  const max = Math.max(1, ...series.map((x) => x.value));
  return `<div style="display: flex; align-items: flex-end; gap: 3px; height: 120px">${series.map((x) => `<span title="${esc(x.day)}: ${esc(fmt(x.value))}" style="flex: 1; min-width: 3px; height: ${Math.max(2, Math.round((x.value / max) * 100))}%; border-radius: 4px 4px 0 0; background: ${x.value ? color : "#E3EBF7"}"></span>`).join("")}</div><div style="display: flex; justify-content: space-between; font-size: 11px; color: #9AA6B8; margin-top: 4px"><span>${esc(series[0]?.day.slice(5) ?? "")}</span><span>${esc(series[series.length - 1]?.day.slice(5) ?? "")}</span></div>`;
}
export function reportsPanel(r: ReportState): string {
  const t = r.totals;
  const card = (k: string, v: string, s: string) => `<section style="flex: 1 1 180px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 6px"><span style="font-size: 13px; color: #5F6B7D">${esc(k)}</span><strong style="font-size: 24px; font-weight: 500">${esc(v)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(s)}</span></section>`;
  const chart = (title: string, sub: string, body: string) => `<section style="flex: 1 1 320px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 10px"><span style="display: flex; flex-direction: column; gap: 2px"><h2 style="margin: 0; font-size: 17px; font-weight: 700">${esc(title)}</h2><span style="font-size: 12px; color: #5F6B7D">${esc(sub)}</span></span>${body}</section>`;
  const list = (rows: { name: string; value: number; extra?: string }[], fmt: (x: { name: string; value: number; extra?: string }) => string, empty: string) =>
    rows.length ? rows.map((x) => `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid #E3EBF7; font-size: 14px"><span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(x.name)}</span><strong style="font-weight: 500; flex: none">${esc(fmt(x))}</strong></div>`).join("") : emptyRow(empty);
  const ctr = t.ad_impressions ? ((t.ad_clicks / t.ad_impressions) * 100).toFixed(2).replace(".", ",") : "0";
  return `<div data-report style="display: flex; flex-direction: column; gap: 18px; padding: 4px 0 24px">
<div style="display: flex; flex-wrap: wrap; gap: 12px">${card("Pendapatan 30 hari", rp(t.revenue), `${num(t.invoices_open)} invoice menunggu bayar`)}${card("Pelanggan Plus aktif", num(t.subscribers), r.by_plan.map((p) => `${p.name} ${p.value}`).join(" · ") || "Belum ada")}${card("Pendaftar 30 hari", num(t.signups), "Akun baru")}${card("Artikel terbit 30 hari", num(t.published), `${compact(t.views)} total pageview`)}${card("Iklan", `${compact(t.ad_impressions)} tayang`, `${num(t.ad_clicks)} klik · CTR ${ctr}%`)}</div>
<div style="display: flex; flex-wrap: wrap; gap: 14px">${chart("Pendapatan harian", "Invoice lunas (termasuk PPN), WIB", bars(r.revenue, "#2F74EB", rp))}${chart("Pendaftar harian", "Akun baru per hari", bars(r.signups, "#84CC16", num))}${chart("Artikel terbit", "Per hari", bars(r.published, "#FB7A3C", num))}</div>
<div style="display: flex; flex-wrap: wrap; gap: 14px">${chart("Artikel terpopuler", "Pageview sejak terbit", list(r.top_articles, (x) => compact(x.value), "Belum ada data."))}${chart("Kampanye iklan", "Tayangan · klik", list(r.top_campaigns, (x) => `${compact(x.value)} · ${x.extra ?? 0} klik`, "Belum ada kampanye."))}${chart("Paket Plus", "Langganan aktif", list(r.by_plan, (x) => num(x.value), "Belum ada pelanggan."))}</div></div>`;
}

// ======================================================================= cari & notifikasi staf
export interface AdminHit {
  kind: "article" | "user" | "symbol";
  id: string;
  title: string;
  sub: string;
  href: string;
}
export function searchPanel(q: string, hits: AdminHit[]): string {
  const group = (kind: AdminHit["kind"], label: string) => {
    const l = hits.filter((x) => x.kind === kind);
    if (!l.length) return "";
    return `<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 18px"><h2 style="margin: 0 0 6px; font-size: 16px; font-weight: 700">${label} <span style="font-weight: 400; color: #5F6B7D">${l.length}</span></h2>${l.map((x) => `<a href="${esc(x.href)}" style="display: flex; flex-direction: column; gap: 2px; padding: 10px 0; border-top: 1px solid #E3EBF7; color: inherit"><strong style="font-weight: 500">${esc(x.title)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(x.sub)}</span></a>`).join("")}</section>`;
  };
  const body = hits.length ? group("article", "Artikel") + group("user", "Pengguna") + group("symbol", "Simbol") : emptyRow(q ? `Tidak ada hasil untuk “${q}”.` : "Ketik kata kunci untuk mencari artikel, pengguna, atau simbol.");
  return `<div data-search-panel style="display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px"><form action="/admin/cari/hasil" method="get" style="display: flex; gap: 10px"><input name="q" value="${esc(q)}" placeholder="Cari artikel, pengguna, simbol…" autofocus style="flex: 1; min-height: 48px; border-radius: 999px; border: 1px solid #E3EBF7; padding: 0 18px; font-size: 15px"><button type="submit" style="min-height: 48px; padding: 0 22px; border-radius: 999px; border: 0; background: #2F74EB; color: #FFFFFF; font-size: 14px">Cari</button></form>${body}</div>`;
}

export interface FeedItem {
  kind: string;
  title: string;
  body: string;
  action?: string;
  href?: string;
  urgent: boolean;
  at: string;
}
const KIND_LABEL: Record<string, [string, Parameters<typeof pill>[1]]> = { content: ["Konten", "blue"], market: ["Data pasar", "orange"], ads: ["Iklan", "yellow"], comments: ["Komentar", "red"], users: ["Pengguna", "lime"], system: ["Sistem", "gray"] };
export function feedPanel(items: FeedItem[], kind: string): string {
  const list = items.filter((x) => kind === "all" || x.kind === kind);
  const tabs = [["all", "Semua"], ["content", "Konten"], ["market", "Data pasar"], ["ads", "Iklan"], ["comments", "Komentar"], ["users", "Pengguna"], ["system", "Sistem"]]
    .map(([k, l]) => `<a href="/admin/notifikasi?tipe=${k}" style="flex: none; min-height: 38px; display: flex; align-items: center; padding: 0 14px; border-radius: 999px; border: 1px solid ${k === kind ? "#4285F4" : "#E3EBF7"}; background: ${k === kind ? "#EEF5FF" : "#FFFFFF"}; color: ${k === kind ? "#2F74EB" : "#0B0B0F"}; font-size: 13px">${esc(l!)} ${num(items.filter((x) => k === "all" || x.kind === k).length)}</a>`)
    .join("");
  const rows = list.length
    ? list.map((x) => {
        const [lab, tone] = KIND_LABEL[x.kind] ?? ["Sistem", "gray"];
        return `<div style="display: flex; gap: 12px; padding: 14px 0; border-top: 1px solid #E3EBF7${x.urgent ? "; background: #FFFBF5" : ""}"><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px"><span style="display: flex; gap: 8px; align-items: center">${pill(lab, tone)}<span style="font-size: 12px; color: #9AA6B8">${esc(ago(x.at))}</span></span><strong style="font-weight: 500">${esc(x.title)}</strong>${x.body ? `<span style="font-size: 13px; color: #5F6B7D">${esc(x.body)}</span>` : ""}</span>${x.href ? `<a href="${esc(x.href)}" style="flex: none; align-self: center; min-height: 38px; display: flex; align-items: center; padding: 0 14px; border-radius: 999px; border: 1px solid #E3EBF7; font-size: 13px">${esc(x.action ?? "Buka")}</a>` : ""}</div>`;
      }).join("")
    : emptyRow("Semua beres. Tidak ada notifikasi untuk tipe ini.");
  return `<div data-feed style="display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px"><div class="scroll-x" style="display: flex; gap: 8px; overflow-x: auto">${tabs}</div><section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 6px 20px">${rows}</section></div>`;
}

/**
 * Ganti isi utama halaman admin (di bawah baris judul) dengan panel data nyata.
 * Header, navigasi samping, dan baris judul desain tetap dipakai.
 */
export function replaceBody(html: string, panel: string, opt: { subtitle?: string; actions?: string } = {}): string {
  const h1 = html.indexOf("<h1");
  if (h1 < 0) return html;
  const rowStart = html.lastIndexOf('<div style="display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px">', h1);
  const wrapStart = html.lastIndexOf("max-width: 1400px", rowStart);
  if (rowStart < 0 || wrapStart < 0) return html;
  const wrapOpen = html.lastIndexOf("<", wrapStart);
  const tag = /^<([a-z]+)/.exec(html.slice(wrapOpen))?.[1] ?? "div";
  const rowEnd = closeOf(html, rowStart);
  const wrapEnd = closeOf(html, wrapOpen, tag);
  let row = html.slice(rowStart, rowEnd);
  if (opt.subtitle !== undefined) row = row.replace(/(<\/h1><span style="font-size: 15px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(opt.subtitle)}$2`);
  if (opt.actions !== undefined) row = row.replace(/(<span style="margin-left: auto; display: flex; flex-wrap: wrap; gap: 10px">)[\s\S]*(<\/span><\/div>)$/, `$1${opt.actions}$2`);
  return html.slice(0, rowStart) + row + panel + html.slice(wrapEnd - `</${tag}>`.length);
}

// ======================================================================= pengaturan
export interface SettingsState {
  env: string;
  site_url: string;
  api_url: string;
  tax_rate: number;
  integrations: { key: string; name: string; ok: boolean; detail: string; notify_url?: string }[];
}
export function settingsPanel(st: SettingsState): string {
  const rows = st.integrations
    .map((x) => `<div style="display: flex; gap: 12px; align-items: center; padding: 14px 0; border-top: 1px solid #E3EBF7"><span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px"><strong style="font-weight: 500">${esc(x.name)}</strong><span style="font-size: 12px; color: #5F6B7D; word-break: break-all">${esc(x.detail || "—")}${x.notify_url ? ` · URL notifikasi: ${esc(x.notify_url)}` : ""}</span></span>${pill(x.ok ? "Terhubung" : "Belum dikonfigurasi", x.ok ? "green" : "orange")}</div>`)
    .join("");
  const kv = (k: string, v: string) => `<div style="display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid #E3EBF7; font-size: 14px"><span style="color: #5F6B7D">${esc(k)}</span><strong style="font-weight: 500; text-align: right; word-break: break-all">${esc(v)}</strong></div>`;
  return `<div data-settings style="display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; padding: 4px 0 24px">
<section style="flex: 2 1 420px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 6px 20px 10px"><h2 style="margin: 14px 0 4px; font-size: 18px; font-weight: 700">Integrasi</h2><p style="margin: 0 0 6px; font-size: 13px; color: #5F6B7D">Kunci API disimpan sebagai variabel lingkungan server (terenkripsi) dan tidak pernah ditampilkan di panel atau dikirim ke peramban.</p>${rows}</section>
<section style="flex: 1 1 280px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 6px 20px 10px"><h2 style="margin: 14px 0 4px; font-size: 18px; font-weight: 700">Platform</h2>${kv("Lingkungan", st.env)}${kv("Situs", st.site_url)}${kv("API", st.api_url)}${kv("PPN", `${Math.round(st.tax_rate * 100)}%`)}
<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 0"><a href="/admin/role" style="font-size: 14px; color: #2F74EB">Role &amp; izin staf →</a><a href="/admin/komentar" style="font-size: 14px; color: #2F74EB">Aturan moderasi komentar →</a><a href="/admin/pasar" style="font-size: 14px; color: #2F74EB">Peringatan data pasar →</a><a href="/admin/iklan" style="font-size: 14px; color: #2F74EB">Slot iklan →</a></div></section></div>`;
}

/** Hapus kartu contoh "STATE · …" (keadaan desain), karena konfirmasi kini nyata di tombol. */
export function removeStateDemos(html: string): string {
  let h = html;
  for (let guard = 0; guard < 10; guard++) {
    const i = h.indexOf(">STATE · ");
    if (i < 0) break;
    let start = h.lastIndexOf('<div style="display: flex; flex-wrap: wrap; gap: 20px">', i);
    const sec = h.lastIndexOf("<section", i);
    if (start < 0 || closeOf(h, start) < i) start = sec;
    if (start < 0) break;
    const tag = h.startsWith("<section", start) ? "section" : "div";
    h = h.slice(0, start) + h.slice(closeOf(h, start, tag));
  }
  return h;
}

// ======================================================================= halaman publik: Live, Short, Newsletter
export interface PublicLive {
  id: string;
  title: string;
  summary: string;
  status: string;
  created_at: string;
  posts: LivePostRow[];
}
export function bindLivePublic(html: string, L: PublicLive | null, app: boolean): string {
  let h = html;
  const T = "RDG Bank Indonesia Oktober 2026: BI Tahan Suku Bunga di 6,00%";
  if (!L) {
    h = h.split(T).join("Belum ada liputan langsung");
    h = h.replace(/>Diperbarui 1 menit lalu · 2,4 rb membaca</, ">Liputan langsung dibuka saat pasar bergerak cepat<");
  } else {
    h = h.split(T).join(esc(L.title));
    const last = L.posts.reduce((a, p) => (p.created_at > a ? p.created_at : a), L.created_at);
    h = h.replace(/>Diperbarui 1 menit lalu · 2,4 rb membaca</, `>Diperbarui ${esc(ago(last))} · ${L.posts.length} pembaruan<`);
    if (L.status !== "live") h = h.replace(/>LIVE</, ">SELESAI<");
  }
  // Linimasa: wadah pembaruan diganti seluruhnya.
  const first = h.indexOf(`<div style="position: relative; display: flex; flex-direction: column; gap: ${app ? 8 : 10}px; padding-bottom:`);
  if (first > 0) {
    const box = h.lastIndexOf("<div", first - 1);
    const end = closeOf(h, box);
    const open = h.slice(box, h.indexOf(">", box) + 1);
    const fs = app ? 15 : 17, ts = app ? 13 : 14, dot = app ? 12 : 14;
    const items = L && L.posts.length
      ? L.posts
          .map((p, i) => `<div style="position: relative; display: flex; flex-direction: column; gap: ${app ? 8 : 10}px; padding-bottom: ${i === L.posts.length - 1 ? 0 : app ? 22 : 28}px"><span style="position: absolute; left: -33px; top: ${app ? 4 : 5}px; width: ${dot}px; height: ${dot}px; border-radius: 999px; background: ${p.pinned || p.kind === "breaking" ? "#EF4444" : "#FFFFFF"}; border: 2.5px solid ${p.pinned || p.kind === "breaking" ? "#EF4444" : "#4285F4"}; box-sizing: border-box"></span><span style="display: flex; align-items: center; gap: 10px"><span style="font-family: 'Roboto Mono', monospace; font-size: ${ts}px; font-weight: 500; color: #2F74EB">${hm(p.created_at)}</span>${p.pinned ? pill("Disematkan", "red", 11) : ""}${p.kind === "breaking" ? pill("BREAKING", "red", 11) : ""}<span style="font-size: 12px; color: #9AA6B8">${esc(p.author)}</span></span>${p.kind === "quote" ? `<blockquote style="margin: 0; padding: 14px 18px; border-left: 4px solid #4285F4; border-radius: 0 16px 16px 0; background: #EEF5FF; font-size: ${fs}px; line-height: 1.5">${esc(p.body)}</blockquote>` : `<p style="margin: 0; font-size: ${fs}px; line-height: 1.65; white-space: pre-wrap">${esc(p.body)}</p>`}</div>`)
          .join("")
      : `<p style="margin: 0; font-size: 15px; color: #5F6B7D">${L ? "Pembaruan pertama segera hadir." : "Belum ada liputan langsung saat ini. Ikuti breaking news di beranda."}</p>`;
    h = h.slice(0, box) + open + items + "</div>" + h.slice(end);
  }
  return h;
}

export interface ShortRow {
  id: string;
  title: string;
  caption: string;
  video_url: string | null;
  cover_url: string | null;
  symbol: string | null;
  category: string | null;
  status?: string;
  views: number;
  duration_s: number;
  created_at: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  liked: boolean;
  saved: boolean;
}
export interface ShortComment {
  id: string;
  short_id: string;
  short_title?: string;
  user_name: string;
  user_email?: string;
  body: string;
  status: string;
  flag_reason?: string | null;
  mine: boolean;
  created_at: string;
  parent_id?: string;
}
export interface ShortCtx {
  loggedIn: boolean;
  me: string; // nama pengguna (untuk avatar kolom komentar)
  comments: ShortComment[];
  siteUrl: string;
}
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const SVGX = "(?:<svg(?:(?!<\\/svg>)[\\s\\S])*<\\/svg>)?";

/** Baris komentar short (dirender server; enhancer "shorts" menangani kirim/hapus). */
function shortCommentRows(list: ShortComment[], dark: boolean): string {
  if (!list.length) return `<p data-sh-empty style="margin: 0; font-size: 14px; color: #5F6B7D">Belum ada komentar. Jadilah yang pertama.</p>`;
  return threaded(list)
    .map(
      ({ c, reply }) =>
        `<div data-sh-comment="${esc(c.id)}"${reply ? " data-reply" : ""} style="display: flex; gap: 10px; align-items: flex-start${reply ? "; padding-left: 42px" : ""}"><span style="flex: none; width: 32px; height: 32px; border-radius: 999px; background: ${dark ? "#E5ECFF" : "#E5ECFF"}; color: #1E40AF; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700">${esc(initials(c.user_name))}</span><div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px"><span style="display: flex; gap: 6px; align-items: baseline; font-size: 13px"><strong style="font-weight: 500">${esc(c.user_name)}</strong><span style="color: #5F6B7D">· ${esc(ago(c.created_at))}</span>${c.mine ? `<button type="button" data-sh="comment-del" data-cid="${esc(c.id)}" style="margin-left: auto; border: 0; background: transparent; color: #B42318; font-size: 12px; cursor: pointer">Hapus</button>` : ""}</span><p style="margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word">${esc(c.body)}</p><button type="button" data-sh="reply" data-id="${esc(c.parent_id || c.id)}" data-name="${esc(c.user_name)}" style="align-self: flex-start; border: 0; background: transparent; padding: 0; color: #2F74EB; font-size: 12px; font-weight: 500; cursor: pointer">Balas</button></div></div>`
    )
    .join("");
}

export function bindShorts(html: string, list: ShortRow[], sel: string, app: boolean, sc: ShortCtx = { loggedIn: false, me: "", comments: [], siteUrl: "" }): string {
  let h = html;
  const cur = list.find((x) => x.id === sel) ?? list[0];
  const T = "3 saham bank paling diburu asing pekan ini";
  const url = cur ? `${sc.siteUrl}/short?v=${cur.id}` : `${sc.siteUrl}/short`;
  const login = `/masuk?next=${encodeURIComponent(cur ? `/short?v=${cur.id}` : "/short")}`;
  if (!cur) {
    h = h.split(`>${T}<`).join(">Belum ada video<");
    h = h.replace(/>(Asing beli bersih[^<]*)</g, ">Video singkat seputar pasar akan tampil di sini.<");
    h = h.replace(/>0:23 \/ 0:58</, ">—<");
  } else {
    h = h.split(`>${T}<`).join(`>${esc(cur.title)}<`);
    h = h.replace(/>(Asing beli bersih[^<]*)</g, () => `>${shortCaption(cur.id, cur.caption || cur.title)}<`);
    h = h.replace(/>28 Okt 2026 · 12,4 rb ditonton</, `>${esc(fmtDate(cur.created_at))} · ${compact(cur.views)} ditonton<`);
    h = h.replace(/>0:23 \/ 0:58</, `>${dur(cur.duration_s)}<`);
    h = h.replace(/>Saham(<\/span><span style="font-size: 13px; color: #5F6B7D">)/, `>${esc(cur.category || "Ocean Short")}$1`);
    const md = shortMedia(cur.video_url, cur.cover_url);
    if (!app) {
      const player = shortPlayer(cur.id, md, false);
      if (player) h = h.replace(/<span style="position: absolute; left: 50%; top: 45%; transform: translate\(-50%, -50%\);[^"]*">▶<\/span>/, player);
      if (md.poster) h = h.replace(/src="\/img\/news-1\.jpg"/, `src="${esc(md.poster)}"`);
    } else {
      // Aplikasi: video layar penuh menggantikan gambar contoh; tombol putar & progres nyata.
      const player = shortPlayer(cur.id, md, true);
      h = h.replace(/<img src="\/img\/news-1\.jpg" alt="" style="position: absolute; inset: 0;[^"]*">/, player || (md.poster ? `<img src="${esc(md.poster)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block">` : ""));
      // Gradasi tidak menghalangi sentuhan ke pemutar.
      h = h.replace('<span aria-hidden="true" style="position: absolute; inset: 0; background: linear-gradient(180deg,', '<span aria-hidden="true" style="pointer-events: none; position: absolute; inset: 0; background: linear-gradient(180deg,');
      const playBtn = /<div style="position: absolute; left: 50%; top: 46%; transform: translate\(-50%, -50%\); width: 76px;[^"]*" aria-hidden="true">(<svg[\s\S]*?<\/svg>)<\/div>/;
      const prog = /<span role="progressbar" aria-label="Posisi video" aria-valuenow="40"([^>]*)><span style="display: block; width: 40%;/;
      if (md.kind === "file") {
        h = h.replace(playBtn, (_m, svg: string) => `<button type="button" data-sh-play aria-label="Putar video" style="position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: 76px; height: 76px; border-radius: 999px; border: 0; background: rgba(255,255,255,.22); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2">${svg}</button>`);
        h = h.replace(prog, '<span role="progressbar" data-sh-prog aria-label="Posisi video" aria-valuenow="0"$1><span data-sh-bar style="display: block; width: 0%;');
      } else {
        // Pemutar platform / tanpa video: tombol putar & progres contoh disembunyikan.
        h = h.replace(playBtn, "");
        h = h.replace(/<div style="position: absolute; left: 20px; right: 20px; bottom: 30px; display: flex; align-items: center; gap: 10px; color: #FFFFFF; font-size: 11px">[\s\S]*?<\/span><\/span><span[^>]*>[^<]*<\/span><\/div>/, "");
      }
    }
  }
  const id = cur?.id ?? "";
  const n = (k: "likes" | "comments", v: number) => `<span data-sh-n="${k}">${compact(v)}</span>`;
  const meta = `<span data-sh-meta hidden data-id="${esc(id)}" data-url="${esc(url)}" data-title="${esc(cur?.title ?? "Ocean Short")}" data-logged="${sc.loggedIn ? 1 : 0}" data-login="${esc(login)}" data-liked="${cur?.liked ? 1 : 0}" data-saved="${cur?.saved ? 1 : 0}" data-likes="${cur?.likes ?? 0}" data-comments="${cur?.comments ?? 0}"></span>`;
  h = h.replace(/>Maya Lestari</g, ">Redaksi OceanBird<").replace(/>ML</, ">OB<").replace(/>Analis Saham</, ">Ocean Short<");
  const rest = list.filter((x) => x.id !== cur?.id);
  if (!app) {
    // Aksi: suka, komentar, bagikan, simpan.
    h = h.replace(rx(`<a href="#"( style="[^"]*">${SVGX})Suka 1,2 rb</a>`), (_m, a: string) => `<a href="#" data-sh="like" aria-pressed="${cur?.liked ? "true" : "false"}"${a}Suka ${n("likes", cur?.likes ?? 0)}</a>`);
    h = h.replace(rx(`<a href="#"( style="[^"]*">${SVGX})86</a>`), (_m, a: string) => `<a href="#komentar" data-sh="goto-comments"${a}${n("comments", cur?.comments ?? 0)}</a>`);
    h = h.replace(rx(`<a href="#"( style="[^"]*">${SVGX})Bagikan</a>`), (_m, a: string) => `<a href="#" data-sh="share"${a}Bagikan</a>`);
    h = h.replace(rx(`<a href="#"( style="[^"]*">${SVGX})Simpan</a>(</div>)`), (_m, a: string, close: string) => {
      const form = sc.loggedIn
        ? `<form data-sh="comment-form" style="display: flex; gap: 8px"><input data-sh="comment" maxlength="1000" placeholder="Tulis komentar…" autocomplete="off" style="flex: 1; min-width: 0; min-height: 44px; border-radius: 999px; border: 1px solid #E3EAF4; padding: 0 16px; font-size: 14px; font-family: inherit"><button type="submit" data-sh="comment-send" style="flex: none; min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: #2F74EB; color: #FFFFFF; font-size: 14px; font-weight: 500; cursor: pointer">Kirim</button></form>`
        : `<a href="${esc(login)}" style="display: inline-flex; align-self: flex-start; min-height: 44px; align-items: center; padding: 0 18px; border-radius: 999px; border: 1px solid #E3EAF4; color: #2F74EB; font-size: 14px; font-weight: 500">Masuk untuk berkomentar</a>`;
      return `<a href="#" data-sh="save" aria-pressed="${cur?.saved ? "true" : "false"}"${a}<span data-sh-t="save">${cur?.saved ? "Tersimpan" : "Simpan"}</span></a>${close}${cur ? `<section id="komentar" style="display: flex; flex-direction: column; gap: 14px; padding-top: 6px"><h3 style="margin: 0; font-size: 18px; font-weight: 700">Komentar <span style="color: #5F6B7D; font-weight: 400">${n("comments", cur.comments)}</span></h3>${form}<div data-sh-list style="display: flex; flex-direction: column; gap: 16px">${shortCommentRows(sc.comments, false)}</div></section>` : ""}`;
    });
    // Penulis contoh → tanpa tombol ikuti; chip harga contoh → simbol short ini.
    h = h.replace(rx(`<a href="#" class="ob-anim"[^>]*>${SVGX}Ikuti</a>`), "");
    h = h.replace(/<div style="[^"]*"><a href="\/market\/BBCA"[\s\S]*?<\/a><a href="\/market\/BBCA"[\s\S]*?<\/a><\/div>/, cur?.symbol ? `<div style="display: flex; gap: 8px"><a href="/market/${encodeURIComponent(cur.symbol)}" style="padding: 8px 14px; border-radius: 999px; border: 1px solid #E3EAF4; font-size: 14px; font-weight: 500">${esc(cur.symbol)} · lihat harga</a></div>` : "");
    const nx = blocks(h, '<a href="#" style="display: flex; gap: 12px; align-items: center">', "a");
    if (nx.length) {
      const tpl = nx[0]!.html;
      const built = rest.slice(0, 3).map((s) => tpl.replace('href="#"', `href="/short?v=${s.id}"`).replace(/(<strong[^>]*>)[^<]*(<\/strong>)/, `$1${esc(s.title)}$2`).replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<)/, `$1${dur(s.duration_s)} · ${compact(s.views)}$2`).replace(/<img src="\/img\/news-\d\.jpg"([^>]*)>/, (m, rest: string) => shortThumb(s, rest) ?? m)).join("");
      h = h.slice(0, nx[0]!.start) + (built || '<span style="font-size: 13px; color: #5F6B7D">Belum ada video lain.</span>') + h.slice(nx[nx.length - 1]!.end);
    }
    const more = blocks(h, '<a href="#" style="position: relative; height: 340px;', "a");
    if (more.length) {
      const tpl = more[0]!.html;
      const built = rest.slice(3, 11).map((s) => tpl.replace('href="#"', `href="/short?v=${s.id}"`).replace(/>▶ \d:\d\d</, `>▶ ${dur(s.duration_s)}<`).replace(/(<strong[^>]*>)[^<]*(<\/strong>)/, `$1${esc(s.title)}$2`).replace(/<img src="\/img\/news-\d\.jpg"([^>]*)>/, (m, rest: string) => shortThumb(s, rest) ?? m)).join("");
      h = h.slice(0, more[0]!.start) + built + h.slice(more[more.length - 1]!.end);
      if (!built) h = h.replace(/<h2([^>]*)>Lainnya<\/h2>/, "<h2$1></h2>");
    }
  } else {
    // Aksi aplikasi: suka & simpan (status awal lewat ctx.state), jumlah nyata.
    h = h.replace(rx(`(<button onClick="\\{\\{ u6\\.m0\\.pick \\}\\}"[^>]*aria-label="Suka")([^>]*>(?:<span[^>]*>${SVGX}</span>))1,2 rb</button>`), (_m, a: string, b: string) => `${a} data-sh="like"${b}${n("likes", cur?.likes ?? 0)}</button>`);
    h = h.replace(rx(`(<button aria-haspopup="dialog" onClick="\\{\\{ open_comment \\}\\}" aria-label="Komentar"[^>]*>(?:<span[^>]*>${SVGX}</span>))86</button>`), (_m, a: string) => `${a}${n("comments", cur?.comments ?? 0)}</button>`);
    h = h.replace(/(<button onClick="\{\{ u7\.m0\.pick \}\}"[^>]*aria-label="Simpan")/, '$1 data-sh="save"');
    // Lembar bagikan: kanal nyata + tautan short ini.
    ([["f1", "wa"], ["f2", "tg"], ["f3", "x"], ["f4", "copy"]] as const).forEach(([f, ch]) => (h = h.replace(`<button onClick="{{ ${f} }}"`, `<button onClick="{{ ${f} }}" data-sh-share="${ch}"`)));
    h = h.replace(/>oceanpedia\.id\/berita\/ihsg-menguat-perbankan</, `>${esc(url.replace(/^https?:\/\//, ""))}<`);
    // Lembar komentar: komentar nyata, kirim lewat API.
    h = h.replace(/aria-label="Komentar 86"/, 'aria-label="Komentar"');
    h = h.replace(/(<h2[^>]*>Komentar <span[^>]*>)86(<\/span>)/, (_m, a: string, b: string) => `${a}${n("comments", cur?.comments ?? 0)}${b}`);
    h = h.replace(/(<div class="ob-scroll" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding: 4px 0">)[\s\S]*?(<\/div><div[^>]*>\s*<span[^>]*>)NA(<\/span>)/, (_m, a: string, b: string, c: string) => `${a.replace("<div ", "<div data-sh-list ")}${shortCommentRows(sc.comments, true)}${b}${esc(sc.me ? initials(sc.me) : "?")}${c}`);
    h = h.replace(/<input type="text" placeholder="Tulis komentar…"/, `<input type="text" data-sh="comment" maxlength="1000"${sc.loggedIn ? "" : ` data-login="${esc(login)}" readonly`} placeholder="${sc.loggedIn ? "Tulis komentar…" : "Masuk untuk berkomentar"}"`);
    h = h.replace(/<button aria-label="Kirim komentar" onClick="\{\{ f5 \}\}"/, '<button aria-label="Kirim komentar" data-sh="comment-send" onClick="{{ f5 }}"');
    h = h.replace(/<a href="\/penulis\/maya-lestari"[^>]*>[\s\S]*?<\/a>/, "");
    h = h.replace(/<span style="display: flex; gap: 8px"><a href="\/market\/BBCA"[\s\S]*?<\/span>/, cur?.symbol ? `<span style="display: flex; gap: 8px"><a href="/market/${encodeURIComponent(cur.symbol)}" style="padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.2); font-size: 12px; font-weight: 500">${esc(cur.symbol)}</a></span>` : "");
  }
  return meta + h;
}

// ======================================================================= admin: Ocean Short
export function shortsAdminPanel(list: ShortRow[], comments: ShortComment[], filter: string): string {
  const sum = (k: "views" | "likes" | "comments" | "saves" | "shares") => list.reduce((a, s) => a + (s[k] ?? 0), 0);
  const card = (t: string, v: string, sub: string) => `<section style="flex: 1 1 150px; background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 6px"><span style="font-size: 13px; color: #5F6B7D">${esc(t)}</span><strong style="font-size: 24px; font-weight: 500">${esc(v)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(sub)}</span></section>`;
  const inp = (k: string, label: string, ph = "", extra = "") => `<label style="flex: 1 1 220px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">${label}<input data-shf="${k}" placeholder="${esc(ph)}" ${extra} style="min-height: 44px; border-radius: 14px; border: 1px solid #E3EBF7; padding: 0 12px; font-size: 14px; color: #0B0B0F"></label>`;
  const btn = (act: string, id: string, label: string, tone: "blue" | "gray" | "red" = "gray") =>
    `<button type="button" data-sha="${act}" data-id="${esc(id)}" style="border: 1px solid ${tone === "red" ? "#F5C2C2" : tone === "blue" ? "#2F74EB" : "#E3EBF7"}; background: ${tone === "blue" ? "#2F74EB" : "#FFFFFF"}; color: ${tone === "red" ? "#991B1B" : tone === "blue" ? "#FFFFFF" : "#0B0B0F"}; border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer">${label}</button>`;
  const ST: Record<string, [string, "green" | "gray" | "orange"]> = { published: ["Tayang", "green"], draft: ["Draf", "orange"], archived: ["Arsip", "gray"] };
  const rows = list.length
    ? list
        .map((s) => {
          const [lab, tone] = ST[s.status ?? "published"] ?? ["—", "gray"];
          const acts = [s.status !== "published" ? btn("publish", s.id, "Tayangkan", "blue") : "", s.status === "published" ? btn("draft", s.id, "Jadikan draf") : "", s.status !== "archived" ? btn("archive", s.id, "Arsipkan", "red") : ""].join("");
          return `<div style="display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #E3EBF7; flex-wrap: wrap"><span style="flex: none; width: 54px; height: 72px; border-radius: 10px; background: #0B0B0F ${s.cover_url ? `url('${esc(s.cover_url)}') center/cover` : ""}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 16px">${s.cover_url ? "" : "▶"}</span><span style="flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 4px"><a href="/short?v=${esc(s.id)}" target="_blank" rel="noopener" style="font-weight: 500; color: #0B0B0F">${esc(s.title)}</a><span style="font-size: 12px; color: #5F6B7D">${esc(fmtDate(s.created_at, true))}${s.symbol ? ` · ${esc(s.symbol)}` : ""} · ${dur(s.duration_s)}${s.video_url ? "" : " · tanpa video"}</span><span style="font-size: 12px; color: #5F6B7D">${compact(s.views)} tayang · ${compact(s.likes)} suka · ${compact(s.comments)} komentar · ${compact(s.saves)} disimpan · ${compact(s.shares)} dibagikan</span></span>${pill(lab, tone)}<span style="display: flex; gap: 6px; flex-wrap: wrap">${acts}</span></div>`;
        })
        .join("")
    : emptyRow("Belum ada Ocean Short. Buat yang pertama di atas.");
  const CS: Record<string, [string, "green" | "gray" | "orange" | "red"]> = { visible: ["Tampil", "green"], pending: ["Menunggu", "orange"], hidden: ["Disembunyikan", "gray"], flagged: ["Dilaporkan", "red"] };
  const tabs = [["", "Semua"], ["pending", "Menunggu"], ["visible", "Tampil"], ["hidden", "Disembunyikan"]]
    .map(([k, l]) => `<a href="/admin/live?tab=short${k ? `&komentar=${k}` : ""}" style="padding: 6px 12px; border-radius: 999px; font-size: 13px; ${filter === k ? "background: #0B0B0F; color: #FFFFFF" : "border: 1px solid #E3EBF7; color: #0B0B0F"}">${l}</a>`)
    .join("");
  const crow = comments.length
    ? comments
        .map((c) => {
          const [lab, tone] = CS[c.status] ?? ["—", "gray"];
          return `<div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid #E3EBF7; flex-wrap: wrap"><span style="flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 4px"><span style="font-size: 12px; color: #5F6B7D"><strong style="color: #0B0B0F; font-weight: 500">${esc(c.user_name)}</strong> · ${esc(c.user_email ?? "")} · ${esc(fmtDate(c.created_at, true))}</span><span style="font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word">${esc(c.body)}</span><a href="/short?v=${esc(c.short_id)}" target="_blank" rel="noopener" style="font-size: 12px; color: #2F74EB">${esc(c.short_title ?? "Short")}</a>${c.flag_reason ? `<span style="font-size: 12px; color: #854D0E">Alasan: ${esc(c.flag_reason)}</span>` : ""}</span>${pill(lab, tone)}<span style="display: flex; gap: 6px">${c.status !== "visible" ? btn("c-visible", c.id, "Tampilkan", "blue") : ""}${c.status !== "hidden" ? btn("c-hidden", c.id, "Sembunyikan", "red") : ""}</span></div>`;
        })
        .join("")
    : emptyRow("Tidak ada komentar di filter ini.");
  return `<div data-sh-admin style="display: flex; flex-direction: column; gap: 18px; padding: 4px 0 24px">
<div style="display: flex; flex-wrap: wrap; gap: 12px">${card("Video", num(list.length), `${list.filter((s) => s.status === "published").length} tayang`)}${card("Tayangan", compact(sum("views")), "Total semua video")}${card("Suka", compact(sum("likes")), `${compact(sum("saves"))} disimpan`)}${card("Komentar", compact(sum("comments")), `${comments.filter((c) => c.status === "pending").length} menunggu moderasi`)}${card("Dibagikan", compact(sum("shares")), "WhatsApp, Telegram, X, salin tautan")}</div>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 12px"><h2 style="margin: 0; font-size: 18px; font-weight: 700">Short baru</h2>
<div style="display: flex; flex-wrap: wrap; gap: 12px">${inp("title", "Judul", "IHSG dalam 60 detik", 'maxlength="140"')}${inp("symbol", "Simbol (opsional)", "BBCA")}${inp("duration", "Durasi (detik)", "58", 'inputmode="numeric"')}</div>
<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Keterangan<textarea data-shf="caption" rows="2" maxlength="500" style="border-radius: 14px; border: 1px solid #E3EBF7; padding: 10px 12px; font-size: 14px; font-family: inherit"></textarea></label>
<div style="display: flex; flex-wrap: wrap; gap: 12px">${inp("video", "Video: unggah berkas, URL file (MP4/MOV/WebM…), atau tautan YouTube/TikTok/Instagram/Vimeo/Facebook/Drive", "https://youtube.com/shorts/… atau unggah")}<label data-shv-pick style="flex: 0 0 auto; align-self: flex-end; min-height: 44px; display: inline-flex; align-items: center; padding: 0 16px; border-radius: 999px; border: 1px solid #2F74EB; color: #2F74EB; font-size: 14px; cursor: pointer">Unggah video<input type="file" data-shf="video-file" accept="video/*,.mp4,.m4v,.mov,.webm,.ogv,.3gp,.3g2,.mkv,.avi,.mpeg,.mpg" hidden></label>${inp("cover", "URL sampul", "https://… atau unggah")}<label style="flex: 0 0 auto; align-self: flex-end; min-height: 44px; display: inline-flex; align-items: center; padding: 0 16px; border-radius: 999px; border: 1px solid #E3EBF7; font-size: 14px; cursor: pointer">Unggah sampul<input type="file" data-shf="cover-file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
<div data-shv-progress hidden style="display: flex; flex-direction: column; gap: 6px"><span data-shv-label style="font-size: 13px; color: #5F6B7D">Mengunggah video…</span><span style="height: 6px; border-radius: 999px; background: #E3EBF7; overflow: hidden"><span data-shv-bar style="display: block; height: 100%; width: 0%; background: #2F74EB; transition: width .2s"></span></span></div>
<div style="display: flex; gap: 10px; flex-wrap: wrap"><button type="button" data-sha="create" data-status="draft" style="min-height: 46px; padding: 0 20px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px">Simpan draf</button><button type="button" data-sha="create" data-status="published" class="ob-anim" style="min-height: 46px; padding: 0 20px; border-radius: 999px; border: 0; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 14px">Tayangkan</button></div></section>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px"><h2 style="margin: 0 0 6px; font-size: 18px; font-weight: 700">Semua Short</h2>${rows}</section>
<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 8px"><span style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center"><h2 style="margin: 0; font-size: 18px; font-weight: 700; flex: 1">Komentar Short</h2>${tabs}</span>${crow}</section></div>`;
}

/** Gambar kecil Short di daftar: sampul, thumbnail platform, atau bingkai pertama video unggahan. */
function shortThumb(s: { video_url: string | null; cover_url: string | null }, rest: string): string | null {
  const md = shortMedia(s.video_url, s.cover_url);
  if (md.poster) return `<img src="${esc(md.poster)}"${rest}>`;
  if (md.kind === "file") return `<video src="${esc(md.src.includes("#") ? md.src : `${md.src}#t=0.1`)}" muted playsinline preload="metadata" aria-hidden="true"${rest.replace(/\s?alt="[^"]*"/, "")}></video>`;
  return null;
}

/** Pemutar Short: <video> untuk berkas langsung, iframe pemutar resmi untuk YouTube/TikTok/Instagram/Vimeo dll. */
function shortPlayer(id: string, md: ShortMedia, app: boolean): string {
  const box = "position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #0B0B0F; z-index: 1";
  if (md.kind === "file") {
    // "#t=0.1" agar bingkai pertama tampil sebagai sampul bila tidak ada gambar sampul.
    const src = md.poster || md.src.includes("#") ? md.src : `${md.src}#t=0.1`;
    return `<video data-short="${esc(id)}" src="${esc(src)}"${md.poster ? ` poster="${esc(md.poster)}"` : ""}${app ? " loop" : " controls"} playsinline webkit-playsinline preload="metadata" style="${box}; object-fit: ${app ? "cover" : "contain"}"></video>`;
  }
  if (md.kind === "embed")
    return `<iframe data-short="${esc(id)}" data-sh-embed="${esc(md.provider)}" src="${esc(md.src)}" title="Video ${esc(md.provider)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="${box}${app ? "; top: 64px; height: calc(100% - 64px - 150px)" : ""}"></iframe>`;
  return "";
}

/** Batas keterangan Ocean Short sebelum dilipat (gaya TikTok: "… selengkapnya"). */
export const CAPTION_LIMIT = 150;
/**
 * Keterangan Short: ≤150 karakter tampil utuh; lebih dari itu dipotong di batas kata
 * dengan tombol "selengkapnya" / "sembunyikan" (dibuka-tutup di peramban oleh enhancer shorts).
 */
export function shortCaption(id: string, text: string): string {
  const chars = Array.from(text.trim());
  if (chars.length <= CAPTION_LIMIT) return esc(text.trim());
  let cut = chars.slice(0, CAPTION_LIMIT).join("");
  const sp = cut.lastIndexOf(" ");
  if (sp > CAPTION_LIMIT * 0.6) cut = cut.slice(0, sp);
  const btn = "border: 0; background: none; padding: 0; margin: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; text-decoration: none";
  return `<span data-sh-cap="${esc(id)}" style="white-space: pre-wrap; word-break: break-word"><span data-sh-cap-s>${esc(cut.replace(/[\s.,;:!?-]+$/, ""))}… </span><span data-sh-cap-f hidden>${esc(text.trim())} </span><button type="button" data-sh="cap" aria-expanded="false" style="${btn}">selengkapnya</button></span>`;
}

export function bindNewsletterPublic(html: string, d: { email: string; status: string | null }): string {
  let h = html;
  h = h.replace(/<input type="email" placeholder="email@kamu\.com"/, `<input type="email" data-nlp="email" autocomplete="email" value="${esc(d.email)}" placeholder="email@kamu.com"`);
  h = h.replace(/<a href="#"( class="ob-anim"[^>]*>)Langganan gratis<\/a>/, '<a href="#" data-nlp="subscribe"$1Langganan gratis</a>');
  h = h.replace(/>180 rb pembaca · bebas spam · berhenti kapan saja</, `>${d.status === "ok" ? "Kamu sudah berhenti berlangganan. Sampai jumpa lagi!" : d.status === "invalid" ? "Tautan berhenti berlangganan tidak valid atau sudah dipakai." : "Gratis · bebas spam · berhenti kapan saja lewat tautan di setiap email"}<`);
  const map: [string, string][] = [["Pagi Pasar", "daily"], ["Crypto Mingguan", "crypto"], ["Makro &amp; Kebijakan", "macro"], ["Makro & Kebijakan", "macro"], ["Plus Research", "plus"]];
  for (const [label, key] of map) h = h.replace(rx(`<button role="switch" aria-checked="(true|false)" aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), (_m, on: string) => `<button type="button" role="switch" aria-checked="${on}" data-nlp-list="${key}" aria-label="${label}"`);
  return h;
}

// ======================================================================= screener (web)
export interface ScreenRow {
  symbol: string;
  name: string;
  asset_class: string;
  exchange: string;
  currency: string;
  price: number | null;
  change: number | null;
  closes: number[];
}
const CLASS_LABEL: Record<string, string> = { equity: "Saham", index: "Indeks", crypto: "Crypto", forex: "Forex", commodity: "Komoditas" };
export function bindScreener(html: string, rows: ScreenRow[], tab: string): string {
  let h = html;
  const tabs: [string, string][] = [["gainer", "Top gainer"], ["loser", "Top loser"], ["saham", "Saham"], ["crypto", "Crypto"], ["forex", "Forex"], ["komoditas", "Komoditas"]];
  const tl = /(<div role="tablist" class="ob-scroll" style="display: flex; gap: 8px; overflow-x: auto">)([\s\S]*?)(<\/div>)/.exec(h);
  if (tl) {
    const btns = tl[2]!.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const on = btns[0]!, off = btns[1] ?? on;
    h = h.replace(tl[0], tl[1] + tabs.map(([k, l]) => (k === tab ? on : off).replace("<button ", `<a href="/screener?urut=${k}" `).replace(/<\/button>$/, "</a>").replace(/>[^<]*<\/a>$/, `>${l}</a>`).replace(/aria-selected="(true|false)"/, `aria-selected="${k === tab}"`)).join("") + tl[3]);
  }
  const cls = { saham: ["equity", "index"], crypto: ["crypto"], forex: ["forex"], komoditas: ["commodity"] } as Record<string, string[]>;
  let list = rows.filter((r) => !cls[tab] || cls[tab]!.includes(r.asset_class));
  list = list.slice().sort((a, b) => (tab === "loser" ? (a.change ?? 1e9) - (b.change ?? 1e9) : (b.change ?? -1e9) - (a.change ?? -1e9)));
  h = h.replace(/>Saring saham berdasarkan kinerja, valuasi, dan dividen</, ">Pergerakan harga hari ini untuk semua instrumen yang dipantau<");
  h = h.replace(/>7 dari 812 saham cocok · Keuangan, Energi · naik 0–5%</, `>${list.length} instrumen · harga Twelve Data (tertunda hingga 15 menit)<`);
  h = h.replace(/<span style="text-align: left">SEKTOR<\/span>/, '<span style="text-align: left">NAMA</span>').replace('<span style="text-align: right">KAP. PASAR</span>', '<span style="text-align: right">KELAS</span>').replace('<span style="text-align: right">P/E</span>', '<span style="text-align: right">BURSA</span>').replace('<span style="text-align: right">DIV. YIELD</span>', '<span style="text-align: right">MATA UANG</span>');
  // Panel filter desain (sektor/valuasi belum ada datanya) → pilihan kelompok yang berfungsi.
  const fi = h.indexOf(">Filter<");
  if (fi > 0) {
    const box = h.lastIndexOf('<div style="', h.lastIndexOf("<div", fi) - 1);
    const start = h.lastIndexOf("<div", h.lastIndexOf("<div", fi) - 1);
    void box;
    const end = closeOf(h, start);
    const link = (k: string, l: string) => `<a href="/screener?urut=${k}" style="display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 0 12px; border-radius: 12px; ${k === tab ? "background: #EEF5FF; color: #2F74EB; font-weight: 500" : "color: #0B0B0F"}">${l}<span style="font-size: 12px; color: #5F6B7D">${k === "gainer" || k === "loser" ? rows.length : rows.filter((r) => cls[k]?.includes(r.asset_class)).length}</span></a>`;
    const panel = `<div style="border-radius: 22px; border: 1px solid #E3EAF4; padding: 18px; display: flex; flex-direction: column; gap: 4px"><strong style="font-size: 17px; font-weight: 700; margin-bottom: 6px">Kelompok</strong>${tabs.map(([k, l]) => link(k, l)).join("")}<p style="margin: 10px 0 0; font-size: 12px; line-height: 1.5; color: #5F6B7D">Data valuasi (kap. pasar, P/E, dividen) tersedia setelah paket data fundamental diaktifkan.</p></div>`;
    if (end > fi) h = h.slice(0, start) + panel + h.slice(end);
  }
  const rs = blocks(h, '<div style="display: grid; grid-template-columns: 110px 1fr 80px 90px 100px 60px 80px 70px; gap: 12px; align-items: center;');
  if (rs.length) {
    const tpl = rs[0]!.html;
    const fmt = (v: number, cur: string) => {
      const dec = Math.abs(v) < 10 ? 4 : cur === "IDR" || Math.abs(v) >= 1000 ? 0 : 2;
      return new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
    };
    const spark = (c: number[]) => {
      if (c.length < 2) return "";
      const mn = Math.min(...c), mx = Math.max(...c), sp = mx - mn || 1;
      const pts = c.map((v, i) => `${((i / (c.length - 1)) * 66 + 2).toFixed(1)},${(22 - ((v - mn) / sp) * 18).toFixed(1)}`).join(" ");
      return `<svg width="70" height="24" viewBox="0 0 70 24" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c[c.length - 1]! >= c[0]! ? "#16A34A" : "#E5484D"}" stroke-width="1.6"/></svg>`;
    };
    const built = list.length
      ? list
          .map((r) => {
            const vals = [r.price != null ? fmt(r.price, r.currency) : "—", CLASS_LABEL[r.asset_class] ?? r.asset_class, r.exchange, r.currency];
            let k = 0;
            const short = r.symbol.length > 5 ? r.symbol.slice(0, 3) : r.symbol;
            return tpl
              .replace('href="/market/BBCA"', `href="/market/${encodeURIComponent(r.symbol)}"`)
              .replace(/(<span style="flex: none; width: 30px; height: 30px; border-radius: 999px; )background: #[0-9A-F]{6}; color: #[0-9A-F]{6}([^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string) => recolorAvatar(`${a}background: #000000; color: #000000${b}${esc(short)}${c}`, r.symbol))
              .replace(/(<strong style="font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(r.symbol)}$2`)
              .replace(/(<span style="color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(r.name)}$2`)
              .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 1[34]px; font-weight: 500; color: #0B0B0F">)[^<]*(<\/span>)/g, (_m, a: string, b: string) => `${a}${esc(vals[k++] ?? "")}${b}`)
              .replace(/<span style="font-weight: 700; color: #[0-9A-F]{6}">[^<]*<\/span>/, r.change == null ? '<span style="font-weight: 700; color: #5F6B7D">—</span>' : `<span style="font-weight: 700; color: ${r.change >= 0 ? "#15803D" : "#DC2626"}">${r.change >= 0 ? "+" : "−"}${Math.abs(r.change).toFixed(2).replace(".", ",")}%</span>`)
              .replace(/(<span style="display: flex; justify-content: flex-end; align-items: center">)<svg(?:(?!<\/svg>)[\s\S])*<\/svg>(<\/span><\/div>)$/, `$1${spark(r.closes)}$2`);
          })
          .join("")
      : emptyRow("Belum ada instrumen di kelompok ini.");
    h = h.slice(0, rs[0]!.start) + built + h.slice(rs[rs.length - 1]!.end);
  }
  h = h.replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Ekspor CSV<\/a>/, "");
  h = h.replace(/<a href="#"([^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Simpan screener<\/a>)/, '<a href="/watchlist"$1').replace(/>Simpan screener</, ">Buka watchlist<");
  return h;
}

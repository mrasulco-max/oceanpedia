import "server-only";
import { esc } from "./bind";
import { compact } from "./kit";

/**
 * Binder fitur pembaca yang tersisa: ikuti kategori/penulis, paginasi kategori, tambah ke watchlist dari
 * Market web, Pusat bantuan, Pasang iklan, verifikasi Student, permintaan data pribadi, hapus cache, dll.
 * Perilaku klik ditangani enhancer "wire" (dc/wire.ts).
 */

const INNER = "((?:(?!<\\/?(?:a|button)\\b)[\\s\\S])*?)";

/** Tombol ikuti web (tautan statis "Ikuti"). */
export function bindFollowWeb(html: string, kind: "category" | "author", slug: string, following: boolean, loggedIn: boolean, label = "Ikuti"): string {
  const re = new RegExp(`<a href="#"([^>]*)>${INNER}${label}</a>`);
  return html.replace(re, (_m, attrs: string, icon: string) => `<a href="#" data-follow="${kind}:${esc(slug)}" data-logged="${loggedIn ? 1 : 0}" data-on="${following ? "Mengikuti" : label}" aria-pressed="${following}"${attrs}>${icon}<span data-follow-label>${following ? "Mengikuti" : label}</span></a>`);
}

/** Kategori: jumlah pengikut nyata, tombol ikuti, paginasi "Berikutnya" berbasis kursor. */
export function bindCategoryExtras(html: string, d: { slug: string; followers: number; following: boolean; loggedIn: boolean; total: number; today: number; nextCursor: string | null; cursor: string | null; app: boolean }): string {
  let h = html.replace(/248 artikel · 32 hari ini · 12,4 rb pengikut/, `${d.total} artikel · ${d.today} hari ini · <span data-follow-count="category:${esc(d.slug)}">${compact(d.followers)}</span> pengikut`);
  if (d.app) {
    h = h.replace(/(<a [^>]*onClick="\{\{ u3\.m0\.pick \}\}")/, `$1 data-follow="category:${esc(d.slug)}" data-logged="${d.loggedIn ? 1 : 0}"`);
  } else {
    h = bindFollowWeb(h, "category", d.slug, d.following, d.loggedIn);
    // Paginasi: nomor halaman contoh → Terbaru / Berikutnya (kursor waktu terbit).
    h = h.replace(/<div([^>]*)>((?:<a href="#"[^>]*>(?:← Sebelumnya|\d+|…|Berikutnya →)<\/a>|<span[^>]*>(?:\d+|…)<\/span>)+)<\/div>/, (_m, attrs: string, inner: string) => {
      const btn = (/<a href="#"([^>]*)>Berikutnya →<\/a>/.exec(inner)?.[1]) ?? ' style="min-width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0 12px; border-radius: 14px; border: 1px solid #E3EAF4; font-size: 14px; font-weight: 500"';
      const first = d.cursor ? `<a href="/kategori/${esc(d.slug)}"${btn}>← Terbaru</a>` : "";
      const next = d.nextCursor ? `<a href="/kategori/${esc(d.slug)}?sebelum=${encodeURIComponent(d.nextCursor)}"${btn}>Berikutnya →</a>` : "";
      return first || next ? `<div${attrs}>${first}${next}</div>` : "";
    });
  }
  return h;
}

/** Penulis: ikuti & notifikasi tulisan baru (keduanya = mengikuti penulis). */
export function bindAuthorExtras(html: string, d: { slug: string; followers: number; following: boolean; loggedIn: boolean; app: boolean }): string {
  let h = html;
  if (d.app) {
    h = h.replace(/(<[a-z]+ [^>]*onClick="\{\{ u6\.m0\.pick \}\}")/, `$1 data-follow="author:${esc(d.slug)}" data-logged="${d.loggedIn ? 1 : 0}"`);
    h = h.replace(/(<[a-z]+ [^>]*onClick="\{\{ u7\.m0\.pick \}\}")/, `$1 data-follow="author:${esc(d.slug)}" data-follow-alt data-logged="${d.loggedIn ? 1 : 0}"`);
  } else {
    h = bindFollowWeb(h, "author", d.slug, d.following, d.loggedIn);
    h = h.replace(new RegExp(`<a href="#"([^>]*)>${INNER}Notifikasi</a>`), (_m, attrs: string, icon: string) => `<a href="#" data-follow="author:${esc(d.slug)}" data-follow-alt data-logged="${d.loggedIn ? 1 : 0}" data-on="Notifikasi aktif" aria-pressed="${d.following}"${attrs}>${icon}<span data-follow-label>${d.following ? "Notifikasi aktif" : "Notifikasi"}</span></a>`);
  }
  h = h.replace(/(\d+(?:,\d+)? rb|\d+) pengikut/, `<span data-follow-count="author:${esc(d.slug)}">${compact(d.followers)}</span> pengikut`);
  return h;
}

/** Market web: tombol "+ watchlist" per baris & tautan "Lihat". */
export function bindMarketWebExtras(html: string, loggedIn: boolean): string {
  return html
    .replace(/<a href="#" aria-label="Tambah ([A-Z0-9/]+) ke watchlist"/g, (_m, sym: string) => `<a href="#" data-wl-sym="${esc(sym.replace("/", ""))}" data-logged="${loggedIn ? 1 : 0}" aria-label="Tambah ${sym} ke watchlist"`)
    .replace(/<a( class="wl")? href="#"([^>]*)>Lihat</g, '<a$1 href="/screener"$2>Lihat<');
}

/** Halaman 404/offline web: tombol coba lagi memuat ulang. */
export function bindRetry(html: string): string {
  return html.replace(/<a href="#"([^>]*)>([^<]*(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Coba lagi<\/a>/, '<a href="#" data-reload$1>$2Coba lagi</a>');
}

/** Pusat bantuan: cari pertanyaan (penyaringan di peramban), kontak WhatsApp nyata. */
export function bindHelp(html: string): string {
  let h = html.replace(/<input type="text" placeholder="Cari pertanyaan, mis\. batalkan langganan"/, '<input type="text" data-faq-q placeholder="Cari pertanyaan, mis. batalkan langganan"');
  h = h.replace(/<a href="#"([^>]*)>([^<]*(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Cari<\/a>/, '<a href="#" data-faq-go$1>$2Cari</a>');
  // Item FAQ: kartu dengan judul <strong> dalam daftar "Pertanyaan populer".
  const at = h.indexOf("Pertanyaan populer");
  if (at > 0) {
    const end = h.indexOf("Hubungi kami", at);
    const seg = h.slice(at, end > 0 ? end : undefined).replace(/<div([^>]*)><div([^>]*)><strong([^>]*)>/g, '<div data-faq$1><div$2><strong$3>');
    h = h.slice(0, at) + seg + (end > 0 ? h.slice(end) : "");
  }
  h = h.replace(/<h3([^>]*)>Hubungi kami<\/h3>/, '<h3 id="kontak"$1>Hubungi kami</h3>');
  const wa = "https://wa.me/62882022395690?text=" + encodeURIComponent("Halo OceanBird, saya butuh bantuan.");
  h = h.replace(/<a href="#"((?:(?!<\/a>)[\s\S])*?WhatsApp CS)/, `<a href="${wa}" target="_blank" rel="noopener"$1`);
  h = h.replace(/<a href="#"((?:(?!<\/a>)[\s\S])*?Live chat)/, `<a href="${wa}" target="_blank" rel="noopener"$1`);
  return h;
}

/** Pasang iklan: angka nyata, unduh media kit, formulir permintaan ke tim sales (tersimpan di database). */
export function bindAds(html: string, s: { articles: number; views: number; newsletter: number; readers: number }): string {
  let h = html;
  const stats: [RegExp, string, string][] = [
    [/<strong([^>]*)>2,4 jt<\/strong>(<span[^>]*>)Pembaca \/ bulan\*/, compact(s.views), "Tayangan artikel"],
    [/<strong([^>]*)>68%<\/strong>(<span[^>]*>)Usia 25–44\*/, compact(s.readers), "Pembaca terdaftar"],
    [/<strong([^>]*)>3 mnt<\/strong>(<span[^>]*>)Rata-rata baca\*/, compact(s.articles), "Artikel terbit"],
    [/<strong([^>]*)>180 rb<\/strong>(<span[^>]*>)Pelanggan newsletter\*/, compact(s.newsletter), "Pelanggan newsletter"],
  ];
  for (const [re, v, l] of stats) h = h.replace(re, (_m, a: string, b: string) => `<strong${a}>${esc(v)}</strong>${b}${l}`);
  h = h.replace(/<p([^>]*)>\*Angka contoh untuk prototipe;[^<]*<\/p>/, '<p$1>Angka diambil langsung dari data OceanBird.</p>');
  h = h.replace(/<a href="#"([^>]*)>([^<]*(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Unduh media kit \(PDF\)<\/a>/, '<a href="/media-kit-oceanbird.pdf" download$1>$2Unduh media kit (PDF)</a>');
  h = h.replace(/placeholder="PT Contoh Sekuritas"/, 'data-adq="company" maxlength="160" placeholder="PT Contoh Sekuritas"');
  h = h.replace(/<input type="text"([^>]*)placeholder="nama@perusahaan\.com"/, '<input type="email" data-adq="email" maxlength="200" autocomplete="email"$1placeholder="nama@perusahaan.com"');
  h = h.replace(/placeholder="mis\. Rp50 juta"/, 'data-adq="budget" maxlength="80" placeholder="mis. Rp50 juta"');
  h = h.replace(/<a href="#"([^>]*)>([^<]*(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Kirim permintaan<\/a>/, '<a href="#" data-adq="submit"$1>$2Kirim permintaan</a>');
  return h;
}

/** Plus: lembar verifikasi Student → pengajuan nyata (email kampus + NIM) dan status terakhir. */
export function bindStudent(html: string, st: { loggedIn: boolean; status: string; verified: boolean }): string {
  let h = html;
  h = h.replace(/(<input[^>]*)placeholder="nama@univ\.ac\.id"/, '$1data-student="email" placeholder="nama@univ.ac.id"');
  h = h.replace(/(<input[^>]*)placeholder="1234567890"/, '$1data-student="nim" placeholder="1234567890"');
  h = h.replace(/data-plus="student"/, `data-student="submit" data-logged="${st.loggedIn ? 1 : 0}" data-verified="${st.verified ? 1 : 0}"`);
  if (st.verified) h = h.replace(/>Kirim verifikasi</, ">Lanjut ke pembayaran Student<");
  else if (st.status === "pending") h = h.replace(/>Kirim verifikasi</, ">Sedang diperiksa · kirim ulang<");
  return h;
}

/** Legal: tombol permintaan data pribadi (app-22) → tercatat & diproses admin. */
export function bindPrivacy(html: string, loggedIn: boolean): string {
  return html.replace(/(<[a-z]+ [^>]*onClick="\{\{ f1 \}\}")/, `$1 data-privacy="export" data-logged="${loggedIn ? 1 : 0}"`);
}

/** Pengaturan: hapus cache nyata (Cache Storage & data offline di peramban). */
export function bindCacheClear(html: string): string {
  return html.replace(/(<[a-z]+ [^>]*onClick="\{\{ f10 \}\}")/, "$1 data-cache-clear").replace(/>Hapus 48 MB</, ">Hapus cache<").replace(/Cache dihapus · 48 MB dikosongkan/, "Cache dihapus");
}

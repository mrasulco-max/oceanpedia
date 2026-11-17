import "server-only";
import { esc } from "./bind";
import { avatarColors, closeOf, compact } from "./kit";

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
export function bindCategoryExtras(html: string, d: { slug: string; followers: number; following: boolean; loggedIn: boolean; total: number; today: number; nextCursor: string | null; cursor: string | null; app: boolean; query?: string }): string {
  const qs = d.query ?? "";
  let h = html.replace(/248 artikel · 32 hari ini · 12,4 rb pengikut/, `${d.total} artikel · ${d.today} hari ini · <span data-follow-count="category:${esc(d.slug)}">${compact(d.followers)}</span> pengikut`);
  if (d.app) {
    h = h.replace(/(<a [^>]*onClick="\{\{ u3\.m0\.pick \}\}")/, `$1 data-follow="category:${esc(d.slug)}" data-logged="${d.loggedIn ? 1 : 0}"`);
  } else {
    h = bindFollowWeb(h, "category", d.slug, d.following, d.loggedIn);
    // Paginasi: nomor halaman contoh → Terbaru / Berikutnya (kursor waktu terbit).
    h = h.replace(/<div([^>]*)>((?:<a href="#"[^>]*>(?:← Sebelumnya|\d+|…|Berikutnya →)<\/a>|<span[^>]*>(?:\d+|…)<\/span>)+)<\/div>/, (_m, attrs: string, inner: string) => {
      const btn = (/<a href="#"([^>]*)>Berikutnya →<\/a>/.exec(inner)?.[1]) ?? ' style="min-width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; padding: 0 12px; border-radius: 14px; border: 1px solid #E3EAF4; font-size: 14px; font-weight: 500"';
      const first = d.cursor ? `<a href="/kategori/${esc(d.slug)}${qs ? `?${qs.slice(1)}` : ""}"${btn}>← Terbaru</a>` : "";
      const next = d.nextCursor ? `<a href="/kategori/${esc(d.slug)}?sebelum=${encodeURIComponent(d.nextCursor)}${qs}"${btn}>Berikutnya →</a>` : "";
      return first || next ? `<div${attrs}>${first}${next}</div>` : "";
    });
  }
  return h;
}

export interface CategoryTopic {
  slug: string;
  name: string;
  count: number;
}
export interface CategoryCardMeta {
  label: string;
  /** label = nama tag artikel (tampil sebagai #tag) */
  tag: boolean;
  author: string;
  views: number;
  minutes: number;
  published: string;
}
export interface CategoryPick {
  slug: string;
  title: string;
  author: string;
}

const GRAD = "linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%)";
const ago = (iso: string, now = Date.now()) => {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 2 * 86400) return "Kemarin";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(new Date(iso));
};
const wibTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "OB";

/**
 * Kategori: chip topik (tag artikel kategori, jumlah nyata) → /kategori/{slug}?topik=…, tombol urutan
 * Terbaru/Terpopuler (web), label & info kartu artikel, dan "Analisis pilihan" dari artikel Analisis.
 */
export function bindCategoryPage(
  html: string,
  d: { slug: string; app: boolean; total: number; topics: CategoryTopic[]; topic: string; sort: "" | "populer"; cards: Map<string, CategoryCardMeta>; picks: CategoryPick[] },
): string {
  let h = html;
  const base = `/kategori/${encodeURIComponent(d.slug)}`;
  const url = (topic: string, sort: string) => {
    const q = [topic && `topik=${encodeURIComponent(topic)}`, sort && `urut=${sort}`].filter(Boolean).join("&");
    return q ? `${base}?${q}` : base;
  };
  const num = (n: number) => new Intl.NumberFormat("id-ID").format(n);

  // Chip topik.
  const tabStart = d.app ? '<div role="tablist" class="ob-scroll" style="display: flex; gap: 8px; overflow-x: auto; margin: 16px -20px 0; padding: 0 20px">' : '<div role="tablist" class="ob-scroll" style="flex: 1; display: flex; gap: 8px; overflow-x: auto">';
  const ts = h.indexOf(tabStart);
  if (ts >= 0) {
    const size = d.app ? "height: 38px; padding: 0 12px; border-radius: 12px; font-size: 13px" : "height: 42px; padding: 0 14px; border-radius: 14px; font-size: 14px";
    const chip = (label: string, count: number, href: string, on: boolean) =>
      `<a href="${href}" data-keep-scroll${on ? ' aria-current="page" class="ob-anim"' : ""} style="flex: none; ${size}; display: flex; align-items: center; gap: 8px; box-sizing: border-box; font-weight: 500; white-space: nowrap; ${on ? `border: 0; background: ${GRAD}; color: #FFFFFF` : "border: 1px solid #E3EAF4; background: #FFFFFF; color: #0B0B0F"}">${label}<span style="font-size: ${d.app ? 11 : 12}px; padding: 2px 7px; border-radius: 999px; ${on ? "background: rgba(255,255,255,.22); color: #FFFFFF" : "background: #F6F8FC; color: #5F6B7D"}">${num(count)}</span></a>`;
    const chips = [chip("Semua", d.total, url("", d.sort), !d.topic), ...d.topics.map((t) => chip(`#${esc(t.name)}`, t.count, url(t.slug, d.sort), t.slug === d.topic))].join("");
    const box = tabStart.replace('role="tablist" ', 'aria-label="Topik" ');
    h = h.slice(0, ts) + box + chips + "</div>" + h.slice(closeOf(h, ts));
  }

  // Urutan (web): tombol "Terbaru" → beralih Terbaru / Terpopuler.
  if (!d.app) {
    h = h.replace(/<button style="(flex: none; height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 14px; border-radius: 14px; border: 1px solid #E3EAF4; background: #FFFFFF; font-size: 14px; font-weight: 500; color: #0B0B0F)">(<svg[\s\S]*?<\/svg>)Terbaru<\/button>/, (_m, st: string, icon: string) => {
      const next = d.sort === "populer" ? "" : "populer";
      return `<a href="${url(d.topic, next)}" data-keep-scroll title="Urutkan: ${next ? "Terpopuler" : "Terbaru"}" style="${st}">${icon}${d.sort === "populer" ? "Terpopuler" : "Terbaru"}</a>`;
    });
  }

  // Label & info kartu artikel (setelah bindArticleCards: tautan sudah menuju artikel nyata).
  // Artikel yang sudah tampil tidak diulang (bindArticleCards mengulang daftar bila slot desain lebih banyak).
  const seen = new Set<string>();
  h = h.replace(/<a href="\/berita\/([^"?#]+)"([^>]*)>([\s\S]*?)<\/a>/g, (whole, slug: string, attrs: string, inner: string) => {
    const m = d.cards.get(decodeURIComponent(slug));
    if (!m) return whole;
    if (seen.has(slug)) return "";
    seen.add(slug);
    const label = esc(m.label);
    const kicker = m.tag ? `#${label}` : label;
    const views = m.views > 0 ? compact(m.views) : "";
    let b = inner
      .replace(/(<span style="font-size: 1[12]px; font-weight: 700; letter-spacing: \.0[56]em; color: #2F74EB">)[^<]*(<\/span>)/, `$1${kicker.toUpperCase()}$2`)
      .replace(/(<span style="position: absolute; top: 12px; left: 12px; padding: 5px 10px; border-radius: 999px; background: rgba\(255,255,255,\.92\); color: #2F74EB; font-size: 11px; font-weight: 700">)(?!Pilihan editor)[^<]*(<\/span>)/, `$1${kicker}$2`);
    const READS = />[^<·]{1,40} · [^<·]{1,20} · [^<]{1,16} pembaca</;
    if (READS.test(b)) {
      b = b.replace(READS, `>${label} · ${ago(m.published)}${views ? ` · ${views} pembaca` : ""}<`);
    } else {
      b = b
        .replace(/>[^<·]{1,40} · \d{1,2}:\d{2} WIB · \d+ mnt( baca)?</, (_x, baca?: string) => `>${esc(m.author)} · ${wibTime(m.published)} WIB · ${m.minutes || 1} mnt${baca ?? ""}<`)
        .replace(/>[^<·]{1,40} · (?:\d+ (?:jam|mnt|hari) lalu|\d+ (?:jam|mnt|hari)|\d{1,2} [A-Z][a-z]{2})( · \d+ mnt)?</, (_x, min?: string) => `>${esc(m.author)} · ${ago(m.published)}${min ? ` · ${m.minutes || 1} mnt` : ""}<`);
    }
    // Baris daftar aplikasi: "1 jam lalu" + ikon mata "3,2 rb".
    if (d.app) {
      b = b.replace(/(<span style="margin-top: auto; display: flex; align-items: center; gap: 10px; font-size: 11px; color: #5F6B7D"><span>)[^<]*(<\/span>)/, `$1${ago(m.published)}$2`);
      const EYE = /(<span style="display: flex; align-items: center; gap: 4px"><svg(?:(?!<\/svg>)[\s\S])*<\/svg>)[^<]*(<\/span>)/;
      b = views ? b.replace(EYE, `$1${views}$2`) : b.replace(EYE, "");
    }
    return `<a href="/berita/${slug}"${attrs}>${b}</a>`;
  });

  // Analisis pilihan: artikel terbaru kategori Analisis.
  const ap = h.indexOf("Analisis pilihan</h2>");
  if (ap >= 0) {
    const gridStart = d.app ? '<div class="ob-scroll" style="display: flex; gap: 10px; overflow-x: auto; margin: 0 -20px; padding: 0 20px">' : '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px">';
    const gs = h.indexOf(gridStart, ap);
    if (gs >= 0) {
      const cards = d.picks
        .slice(0, 3)
        .map((p) => {
          const [bg, fg] = avatarColors(p.author);
          return d.app
            ? `<a href="/berita/${encodeURIComponent(p.slug)}" style="flex: none; width: 150px; padding: 14px; border-radius: 20px; background: #F6F8FC; display: flex; flex-direction: column; gap: 10px"><span style="width: 44px; height: 44px; border-radius: 999px; background: ${bg}; color: ${fg}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700">${esc(initialsOf(p.author))}</span><strong style="font-size: 13px; line-height: 1.35; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden">${esc(p.title)}</strong><span style="font-size: 11px; color: #5F6B7D">${esc(p.author)}</span></a>`
            : `<a href="/berita/${encodeURIComponent(p.slug)}" style="padding: 16px; border-radius: 20px; background: #F6F8FC; display: flex; flex-direction: column; gap: 10px"><span style="width: 44px; height: 44px; border-radius: 999px; background: ${bg}; color: ${fg}; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700">${esc(initialsOf(p.author))}</span><strong style="font-size: 14px; line-height: 1.35; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden">${esc(p.title)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(p.author)}</span></a>`;
        })
        .join("");
      const ge = closeOf(h, gs);
      if (cards) {
        h = h.slice(0, gs) + gridStart + cards + "</div>" + h.slice(ge);
        h = h.slice(0, ap) + h.slice(ap).replace(/href="\/penulis\/maya-lestari"/, 'href="/kategori/analisis"');
      } else {
        // Tanpa artikel Analisis: buang judul bagian beserta isinya.
        const head = h.lastIndexOf("<div", h.lastIndexOf("<h2", ap));
        h = h.slice(0, head) + h.slice(ge);
      }
    }
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

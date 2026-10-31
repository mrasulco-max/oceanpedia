import "server-only";
import type { Article, ArticleCard } from "@/lib/types";

/**
 * Binder: mengisi template desain dengan data nyata di server, tanpa mengubah tata letaknya.
 * Prinsip: hanya mengganti teks/atribut di titik yang jelas (judul kartu, tautan, gambar),
 * sehingga tampilan tetap persis seperti artboard.
 */

export const SAMPLE_ARTICLE = "ihsg-menguat-ditopang-saham-perbankan";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\{\{/g, "{ {");
}

const CATEGORY_LABELS = new Set(["Saham", "Ekonomi", "Crypto", "Komoditas", "Forex", "Analisis", "Kebijakan", "Politik", "Politik & Kebijakan", "Makro", "Pasar", "Emiten", "Edukasi", "Opini", "Energi"]);
const REL_TIME = /^\d+\s?(dtk|detik|mnt|menit|jam|hari|j|m)( lalu)?$/i;

export function relTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} mnt`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam`;
  return `${Math.floor(s / 86400)} hari`;
}

/**
 * Semua kartu yang menautkan ke artikel contoh diarahkan ke artikel nyata (bergiliran),
 * dan judul/kategori/waktu/gambarnya diganti dengan data artikel tersebut.
 */
export function bindArticleCards(html: string, articles: ArticleCard[], opts: { skipFirst?: boolean } = {}): string {
  if (!articles.length) return html;
  let i = 0;
  const re = new RegExp(`<a\\b([^>]*?)href="/berita/${SAMPLE_ARTICLE}"([^>]*)>([\\s\\S]*?)</a>`, "g");
  return html.replace(re, (whole, pre: string, post: string, inner: string) => {
    const segs = [...inner.matchAll(/>([^<]+)</g)].map((m) => m[1]!.trim()).filter(Boolean);
    const headline = segs.reduce((a, b) => (b.length > a.length ? b : a), "");
    // Tautan tanpa judul (tombol "Baca selengkapnya", ikon) tetap diarahkan ke artikel terkait berikutnya.
    const a = articles[i % articles.length]!;
    if (headline.length >= 18) i++;
    if (opts.skipFirst && headline.length < 18) return whole;
    let body = inner;
    if (headline.length >= 18) {
      body = body.replace(`>${headline}<`, `>${esc(a.title)}<`);
      // Judul berukuran besar biasanya diikuti ringkasan; ganti bila ada teks panjang kedua.
      const second = segs.filter((t) => t !== headline && t.length > 60)[0];
      if (second && a.excerpt) body = body.replace(`>${second}<`, `>${esc(a.excerpt)}<`);
      for (const t of segs) {
        if (CATEGORY_LABELS.has(t)) body = body.replace(`>${t}<`, `>${esc(a.category.name)}<`);
        else if (REL_TIME.test(t)) body = body.replace(`>${t}<`, `>${relTime(a.published_at)}<`);
      }
      if (a.cover_url) body = body.replace(/src="\/img\/news-[12]\.jpg"/, `src="${esc(a.cover_url)}"`);
    }
    return `<a${pre}href="/berita/${encodeURIComponent(a.slug)}"${post}>${body}</a>`;
  });
}

/** Detail berita: judul, ringkasan, isi, penulis, kategori. */
export function bindArticleDetail(html: string, a: Article): string {
  let h = html;
  // Judul (h1 pertama).
  h = h.replace(/(<h1\b[^>]*>)([\s\S]*?)(<\/h1>)/, (_m, o: string, _t: string, c: string) => `${o}${esc(a.title)}${c}`);

  // Paragraf: ringkasan = <p> pertama setelah h1; isi = <p> berikutnya hingga judul "Baca juga".
  const h1End = h.indexOf("</h1>");
  const stop = h.indexOf(">Baca juga<");
  if (h1End > 0 && stop > h1End) {
    const head = h.slice(0, h1End);
    let mid = h.slice(h1End, stop);
    const tail = h.slice(stop);
    const paras = a.locked ? [a.excerpt] : a.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let pi = 0;
    let first = true;
    mid = mid.replace(/(<p\b[^>]*>)([\s\S]*?)(<\/p>)/g, (whole, o: string, inner: string, c: string) => {
      if (/<(div|img|svg)\b/.test(inner) || inner.includes("data-ai-")) return whole; // kartu Analisis AI diisi binder AI
      if (first) {
        first = false;
        return `${o}${esc(a.excerpt)}${c}`;
      }
      if (pi < paras.length) return `${o}${esc(paras[pi++]!)}${c}`;
      return ""; // desain punya paragraf lebih banyak dari artikel → sembunyikan sisanya
    });
    // Isi lebih panjang dari jumlah paragraf desain → tambahkan setelah paragraf terakhir yang terisi.
    if (pi < paras.length) {
      const rest = paras.slice(pi).map((p) => `<p style="margin: 0 0 16px">${esc(p)}</p>`).join("");
      const lastP = mid.lastIndexOf("</p>");
      if (lastP >= 0) mid = mid.slice(0, lastP + 4) + rest + mid.slice(lastP + 4);
    }
    h = head + mid + tail;
  }

  // Penulis & kategori di kepala artikel.
  const author = a.author?.name ?? a.author_name;
  h = h.split(">Maya Lestari<").join(`>${esc(author)}<`);
  h = h.split(">ML<").join(`>${esc(initials(author))}<`);
  if (a.cover_url) h = h.replace(/src="\/img\/news-1\.jpg"/, `src="${esc(a.cover_url)}"`);
  return h;
}

/** Ganti semua kemunculan nama/teks contoh yang persis (dibatasi tag) dengan nilai nyata. */
export function replaceText(html: string, from: string, to: string): string {
  return html.split(`>${from}<`).join(`>${esc(to)}<`);
}

// ---------------------------------------------------------------------------
// Form login: kosongkan nilai contoh & tandai field untuk enhancer "login".
// ---------------------------------------------------------------------------
export function bindLogin(html: string, emailSample: string, submitText: string): string {
  let h = html;
  const emailRe = new RegExp(`<input([^>]*?)value="${emailSample.replace(/\./g, "\\.")}"([^>]*)>`);
  if (!emailRe.test(h)) throw new Error("bindLogin: input email tidak ditemukan");
  h = h.replace(emailRe, (_m, a: string, b: string) =>
    `<input${a.replace(/type="text"/, 'type="email"')}value="" data-login-email autocomplete="username" inputmode="email" placeholder="nama@email.com"${b.replace(/placeholder="[^"]*"/, "")}>`,
  );
  h = h.replace(/<input([^>]*?)value="•+"([^>]*)>/, (_m, a: string, b: string) =>
    `<input${a.replace(/type="password"/, 'type="password"')}value="" data-login-password autocomplete="current-password" placeholder="Kata sandi"${b.replace(/placeholder="[^"]*"/, "")}>`,
  );
  // Tombol kirim: tautan/tombol bergradien dengan teks submitText.
  let found = false;
  h = h.replace(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag: string, attrs: string, inner: string) => {
    if (found || !/class="?ob-anim/.test(attrs)) return whole;
    if (inner.replace(/<[^>]+>/g, "").trim() !== submitText) return whole;
    found = true;
    return `<${tag} data-login-submit${attrs}>${inner}</${tag}>`;
  });
  if (!found) throw new Error("bindLogin: tombol kirim tidak ditemukan");
  return h;
}

/** Tautan/tombol "Keluar" menghapus sesi sungguhan (enhancer "logout"). */
export function bindLogout(html: string, toHome = true): string {
  return html.replace(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (!/^Keluar\b/.test(text)) return whole;
    // Pembaca: setelah keluar selalu kembali ke beranda. Panel redaksi: ke tujuan tautan (halaman masuk admin).
    const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? "/";
    const to = toHome ? "/" : href.startsWith("/") ? href : "/";
    return `<${tag} data-logout="${to}"${toHome ? attrs.replace(/href="[^"]*"/, 'href="/"') : attrs}>${inner}</${tag}>`;
  });
}

/** Inisial avatar (mis. "ML" → "HK") untuk nama penulis. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

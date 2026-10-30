import "server-only";
import type { AIAnalysis, Article } from "@/lib/types";
import { esc } from "./bind";

/**
 * Binder Analisis AI (Gemini lewat API): mengganti teks contoh analisis di artboard
 * dengan hasil analisis nyata untuk berita / instrumen yang dibuka.
 */

const SAMPLE_INTI = "IHSG naik 0,84% dipimpin saham bank, didorong beli bersih asing Rp1,2 T dan harapan pemangkasan bunga The Fed.";
const DOT: Record<string, string> = { positif: "#22C55E", netral: "#9AA6B8", negatif: "#EF4444" };
const PILL: Record<string, [string, string, string]> = {
  positif: ["#166534", "#DCF5E4", "Positif"],
  netral: ["#374151", "#EFF0F2", "Netral"],
  negatif: ["#991B1B", "#FDE2E2", "Negatif"],
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function timeWIB(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso))
    .replace(".", ":");
}

/** Kartu Analisis AI di halaman berita (web-berita, app-06). */
export function bindArticleAI(html: string, a: Article, ai: AIAnalysis | null): string {
  let h = html;
  const href = `/plus/analisis?a=${encodeURIComponent(a.slug)}`;
  if (ai) h = h.split(SAMPLE_INTI).join(esc(ai.inti));
  else h = h.split(SAMPLE_INTI).join(`<span data-ai-fill="article:${esc(a.slug)}">Analisis AI sedang disiapkan…</span>`);
  // Tombol di kartu AI: buka analisis lengkap berita ini.
  h = h.replace(/(<section aria-label="Analisis AI"[\s\S]*?)<a href="\/plus"([^>]*>[\s\S]*?)Berlangganan untuk analisis lengkap<\/a>/, `$1<a href="${href}"$2Lihat analisis AI lengkap</a>`);
  h = h.replace(/(Analisis AI<\/strong>[\s\S]{0,1200}?)<a href="\/plus"([^>]*>[\s\S]*?)Berlangganan untuk analisis lengkap<\/a>/, `$1<a href="${href}"$2Lihat analisis AI lengkap</a>`);
  return h;
}

/** Halaman baca Plus (app-26): kalimat inti, sentimen, dan tautan analisis lengkap. */
export function bindPlusReadAI(html: string, a: Article, ai: AIAnalysis | null): string {
  let h = bindArticleAI(html, a, ai);
  if (ai) {
    h = h.replace(
      /(<span style="width: 8px; height: 8px; border-radius: 999px; background: )#22C55E("><\/span>)Sentimen positif · 3 aset terdampak/,
      `$1${DOT[ai.sentimen] ?? DOT.netral}$2Sentimen ${esc(ai.sentimen)} · ${ai.aset.length} aset terdampak`,
    );
  }
  return h.split('href="/plus/analisis"').join(`href="/plus/analisis?a=${encodeURIComponent(a.slug)}"`);
}

/** Kartu "Analisis AI <simbol>" di Detail Market (app-09). */
export function bindMarketAICard(html: string, symbol: string, ai: AIAnalysis | null): string {
  let h = html.split('href="/plus/analisis"').join(`href="/plus/analisis?symbol=${encodeURIComponent(symbol)}"`);
  const sub = "Ringkasan berita, sentimen &amp; level penting hari ini";
  const subRaw = "Ringkasan berita, sentimen & level penting hari ini";
  const text = ai ? esc(ai.inti) : `<span data-ai-fill="market:${esc(symbol)}">Analisis AI sedang disiapkan…</span>`;
  h = h.split(sub).join(text).split(subRaw).join(text);
  return h;
}

export interface AISource {
  kind: "article" | "market";
  title: string;
  href: string;
  image?: string | null;
  slug?: string;
  symbol?: string;
}

/** Halaman Analisis AI lengkap (app-27). */
export function bindAnalysisPage(html: string, ai: AIAnalysis | null, src: AISource): string {
  let h = html;
  // Kartu sumber & tombol kembali.
  h = h.split('href="/plus/baca"').join(`href="${esc(src.href)}"`);
  h = h.replace(">Dianalisis dari artikel<", src.kind === "market" ? ">Dianalisis dari data pasar &amp; berita terkini<" : ">Dianalisis dari artikel<");
  h = h.replace(/(<strong style="font-size: 13px; line-height: 1.35; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(src.title)}$2`);
  if (src.image) h = h.replace('src="/img/news-1.jpg"', `src="${esc(src.image)}"`);
  // Wadah percakapan Tanya AI (diisi enhancer, dipertahankan saat board digambar ulang).
  const ctxAttr = src.kind === "article" ? `data-ai-ask-slug="${esc(src.slug ?? "")}"` : `data-ai-ask-symbol="${esc(src.symbol ?? "")}"`;
  h = h.replace(
    /<div style="margin-top: 14px"><span style="font-size: 11px; line-height: 1.5; color: #5F6B7D">Dihasilkan AI/,
    `<div data-ai-chat ${ctxAttr} data-dc-keep style="display: flex; flex-direction: column; gap: 10px"></div>$&`,
  );
  if (!ai) {
    h = h.split(SAMPLE_INTI).join(`<span data-ai-fill="${src.kind === "article" ? `article:${esc(src.slug ?? "")}` : `market:${esc(src.symbol ?? "")}`}">Analisis AI sedang disiapkan…</span>`);
    return h;
  }
  h = h.split(SAMPLE_INTI).join(esc(ai.inti));
  // Chip ringkas.
  h = h.replace(">Sentimen positif</span>", `>Sentimen ${esc(ai.sentimen)}</span>`);
  h = h.replace(">3 aset</span>", `>${ai.aset.length} aset</span>`);

  // Ringkasan poin.
  h = h.replace(/(RINGKASAN POIN<\/span><ul[^>]*>)([\s\S]*?)(<\/ul>)/, (_m, open: string, inner: string, close: string) => {
    const li = inner.match(/<li[\s\S]*?<\/li>/)?.[0];
    if (!li) return _m;
    const items = ai.poin.map((p) => li.replace(/(<\/span><span>)[\s\S]*?(<\/span><\/li>)$/, `$1${esc(p)}$2`)).join("");
    return open + items + close;
  });

  // Sentimen berita (skor 0–100).
  const col = ai.sentimen === "positif" ? "#15803D" : ai.sentimen === "negatif" ? "#B42318" : "#5F6B7D";
  h = h.replace(/(SENTIMEN BERITA<\/span><strong style="color: )#15803D(; font-weight: 700">)Positif 72(<\/strong>)/, `$1${col}$2${cap(ai.sentimen)} ${ai.skor}$3`);
  h = h.replace(/left: calc\(72% - 8px\)(; [^"]*border: 3px solid )#15803D/, `left: calc(${ai.skor}% - 8px)$1${col}`);

  // Dampak ke aset.
  h = h.replace(/(DAMPAK KE ASET<\/span>)((?:<a href="\/market\/BBCA"[\s\S]*?<\/a>)+)/, (_m, head: string, rows: string) => {
    const tpl = rows.match(/<a href="\/market\/BBCA"[\s\S]*?<\/a>/)?.[0];
    if (!tpl || !ai.aset.length) return head;
    return (
      head +
      ai.aset
        .map((x) => {
          const [fg, bg, label] = PILL[x.dampak] ?? PILL.netral!;
          const sym = x.simbol.replace(/[^A-Z0-9/]/g, "").slice(0, 10);
          return tpl
            .replace('href="/market/BBCA"', `href="/market/${encodeURIComponent(sym.replace("/", ""))}"`)
            .replace(/(font-size: 9px; font-weight: 700">)[^<]*(<\/span>)/, `$1${esc(sym)}$2`)
            .replace(/(<strong style="font-size: 13px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(sym)}$2`)
            .replace(/(<span style="font-size: 11px; line-height: 1.35; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(x.catatan)}$2`)
            .replace(/color: #[0-9A-F]{6}; background: #[0-9A-F]{6}; padding: 4px 9px; border-radius: 999px; white-space: nowrap">[^<]*</, `color: ${fg}; background: ${bg}; padding: 4px 9px; border-radius: 999px; white-space: nowrap">${label}<`);
        })
        .join("")
    );
  });

  // Yang perlu dipantau.
  h = h.replace(/(YANG PERLU DIPANTAU<\/span>)((?:<span style="display: flex; justify-content: space-between;[\s\S]*?<\/span><\/span>)+)/, (_m, head: string, rows: string) => {
    const first = rows.match(/<span style="display: flex; justify-content: space-between;[\s\S]*?<\/span><\/span>/)?.[0];
    if (!first) return head;
    if (!ai.pantau.length) return head + first.replace(/<span>[^<]*<\/span>/, "<span>Tidak ada agenda khusus di sumber</span>").replace(/(monospace; [^>]*>)[^<]*(<\/span><\/span>)$/, "$1—$2");
    return (
      head +
      ai.pantau
        .map((p, i) => {
          let r = first.replace(/<span>[^<]*<\/span>/, `<span>${esc(p.judul)}</span>`).replace(/(monospace; [^>]*>)[^<]*(<\/span><\/span>)$/, `$1${esc(p.nilai)}$2`);
          if (i > 0) r = r.replace("padding: 8px 0; ;", "padding: 8px 0; border-top: 1px solid #E3EAF4;");
          return r;
        })
        .join("")
    );
  });

  // Keterangan sumber & waktu.
  h = h.replace(
    "Dihasilkan AI dari artikel ini dan dapat keliru.",
    `Dihasilkan AI (${esc(ai.model)}) dari ${src.kind === "market" ? "data pasar &amp; berita terkini" : "artikel ini"} · ${esc(timeWIB(ai.generated_at))} WIB · dapat keliru.`,
  );

  // Chip pertanyaan lanjutan dari AI.
  const chips = ["Apa dampaknya ke saham bank?", "Jelaskan lebih sederhana", "Bandingkan dengan pekan lalu"];
  chips.forEach((c, i) => {
    const q = ai.pertanyaan[i];
    if (q) h = h.replace(`>${c}</button>`, ` data-ai-chip>${esc(q)}</button>`);
    else h = h.replace(`>${c}</button>`, ` data-ai-chip>${c}</button>`);
  });
  if (src.kind === "market") h = h.replace("Tanya AI tentang berita ini…", `Tanya AI tentang ${esc(src.symbol ?? "aset ini")}…`);
  return h;
}

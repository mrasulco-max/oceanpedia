import { esc } from "./bind";

/**
 * Format ringan isi artikel (ditulis lewat toolbar editor, aman karena teks di-escape dulu):
 *   **tebal**, [teks](https://tautan), baris "- " = daftar, "> " = kutipan, ![keterangan](url) = gambar.
 * Mengembalikan HTML untuk isi satu paragraf <p>.
 */
const URL_OK = /^(https:\/\/|http:\/\/|\/)[^\s"'<>]+$/;

function inline(s: string): string {
  return s
    .replace(/\*\*([^*][\s\S]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, url: string) => {
      const raw = url.replace(/&amp;/g, "&");
      if (!URL_OK.test(raw)) return whole;
      const ext = !raw.startsWith("/");
      return `<a href="${url}"${ext ? ' target="_blank" rel="noopener nofollow"' : ""} style="color: #2F74EB; text-decoration: underline">${text}</a>`;
    });
}

export function richParagraph(p: string): string {
  const e = esc(p.trim());
  // Gambar sendiri dalam satu paragraf.
  const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(e);
  if (img && URL_OK.test(img[2]!.replace(/&amp;/g, "&"))) {
    const cap = img[1]!.trim();
    return `<img src="${img[2]}" alt="${cap}" loading="lazy" style="display: block; width: 100%; height: auto; border-radius: 16px">${cap ? `<span style="display: block; margin-top: 8px; font-size: 13px; color: #5F6B7D">${inline(cap)}</span>` : ""}`;
  }
  const lines = e.split("\n");
  if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
    return lines.map((l) => `<span style="display: flex; gap: 10px"><span aria-hidden="true">•</span><span>${inline(l.replace(/^\s*[-•]\s+/, ""))}</span></span>`).join("");
  }
  if (lines.every((l) => /^&gt;\s?/.test(l))) {
    return `<span style="display: block; border-left: 3px solid #4285F4; padding-left: 14px; font-style: italic; color: #3D4250">${inline(lines.map((l) => l.replace(/^&gt;\s?/, "")).join("<br>"))}</span>`;
  }
  return inline(lines.join("<br>"));
}

/** Teks polos (untuk ringkasan/AI): buang penanda format. */
export function plainText(p: string): string {
  return p
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^\s*(?:[-•]|>)\s?/gm, "");
}

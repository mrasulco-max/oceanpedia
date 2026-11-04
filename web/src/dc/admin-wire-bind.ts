import "server-only";
import { esc } from "./bind";
import { closeOf, fmtDate, pill } from "./kit";

/**
 * Sisa tautan "#" di panel admin: diagram alur (dekoratif → bukan tautan), kartu statistik → filter nyata,
 * konten (filter, ekspor CSV, tugaskan editor, jadwalkan), live blog, serta panel Permintaan masuk.
 */

/** Diagram "Alur" berisi kartu langkah; bukan tautan. */
export function deAlur(html: string): string {
  let h = html;
  let from = 0;
  for (;;) {
    const i = h.indexOf('<div role="list" aria-label="Alur"', from);
    if (i < 0) break;
    const end = closeOf(h, i);
    const inner = h.slice(i, end).replace(/<a href="#"/g, "<div").replace(/<\/a>/g, "</div>");
    h = h.slice(0, i) + inner + h.slice(end);
    from = i + inner.length;
  }
  return h;
}

/** Kartu statistik "Detail …" → tab/filter yang sesuai. */
export function bindDetailCards(html: string, map: Record<string, string>): string {
  // Kartu tanpa halaman detail: ikon tautan disembunyikan (atribut style pertama yang berlaku).
  return html.replace(/<a href="#" aria-label="Detail ([^"]+)"/g, (_m, label: string) => (map[label] ? `<a href="${map[label]}" aria-label="Detail ${label}"` : `<a href="#" style="display: none" aria-hidden="true" tabindex="-1" aria-label="Detail ${label}"`));
}

const BTN = "min-height: 42px; box-sizing: border-box; border-radius: 999px; background: #FFFFFF; color: #0B0B0F; border: 1px solid #E3EBF7; font-size: 14px; font-weight: 500; padding: 0 16px";

/** Konten: filter kategori & penulis, ekspor CSV, tugaskan editor, jadwalkan, paginasi. */
export function bindContentExtras(html: string, d: { status: string; cats: string[]; authors: string[]; staff: { id: string; name: string; role: string }[]; selectedId: string | null; total: number }): string {
  let h = html;
  const sel = (key: string, all: string, opts: string[]) =>
    `<select data-cnt-filter="${key}" aria-label="${all}" style="${BTN}"><option value="">${all}</option>${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
  h = h.replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Kategori<\/a>/, sel("cat", "Semua kategori", d.cats));
  h = h.replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Penulis<\/a>/, sel("author", "Semua penulis", d.authors));
  h = h.replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Ekspor CSV<\/a>/, `<a href="#" data-cnt-export="${esc(d.status)}"$1>$2Ekspor CSV</a>`);
  if (d.selectedId) {
    const opts = d.staff.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.role)}</option>`).join("");
    h = h.replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Tugaskan editor<\/a>/, `<select data-cnt-assign="${esc(d.selectedId)}" aria-label="Tugaskan editor" style="${BTN}; min-height: 38px"><option value="">Tugaskan editor…</option>${opts}</select>`);
    h = h.replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Jadwalkan<\/a>/, `<a href="/admin/tulis?id=${esc(d.selectedId)}#jadwal"$1>$2Jadwalkan</a>`);
  } else {
    h = h.replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Tugaskan editor<\/a>/, "").replace(/<a href="#"[^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Jadwalkan<\/a>/, "");
  }
  // Semua artikel tahap ini tampil (maks. 100) → tombol halaman contoh dibuang.
  h = h.replace(/<span style="display: flex; gap: 6px"><a href="#"[^>]*>Sebelumnya<\/a><a href="#"[^>]*>Berikutnya<\/a><\/span>/, d.total > 100 ? '<span style="font-size: 12px; color: #5F6B7D">Gunakan pencarian untuk artikel lebih lama</span>' : "");
  return h;
}

/** Live blog: tombol riwayat & sisipan widget harga / kutipan ke isi pembaruan. */
export function bindLiveExtras(html: string): string {
  // Tanpa breaking aktif, tombol perpanjang/akhiri tidak berlaku.
  if (!html.includes('data-live="extend"')) html = html.replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)(Perpanjang 2 jam|Akhiri breaking)<\/a>/g, "");
  return html
    .replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Riwayat<\/a>/, '<a href="/admin/konten?status=published"$1>$2Riwayat</a>')
    .replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Widget harga<\/a>/, '<a href="#" data-live-insert="harga"$1>$2Widget harga</a>')
    .replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Kutipan<\/a>/, '<a href="#" data-live-insert="kutipan"$1>$2Kutipan</a>')
    .replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)\+ Tambah<\/a>/, '<a href="#" data-live-insert="poin"$1>$2+ Tambah</a>');
}

// ======================================================================= Permintaan masuk
export interface AdminRequest {
  id: string;
  kind: "ad" | "student" | "privacy";
  status: string;
  name: string;
  email: string;
  detail: string;
  extra: string;
  user_id: string | null;
  created_at: string;
  handled_at: string | null;
}
const KIND: Record<string, string> = { ad: "Kerja sama iklan", student: "Verifikasi Student", privacy: "Data pribadi" };
const PRIV: Record<string, string> = { export: "Salinan data", delete: "Hapus akun & data", correction: "Koreksi data", other: "Lainnya" };
const STAT: Record<string, [string, "green" | "gray" | "orange" | "red" | "blue"]> = {
  new: ["Baru", "orange"], pending: ["Menunggu", "orange"], contacted: ["Dihubungi", "blue"], won: ["Deal", "green"], lost: ["Batal", "gray"],
  approved: ["Disetujui", "green"], rejected: ["Ditolak", "red"], done: ["Selesai", "green"],
};
export function requestsPanel(list: AdminRequest[], kind: string, base: string): string {
  const tabs = [["", "Semua"], ["student", "Verifikasi Student"], ["privacy", "Data pribadi"], ["ad", "Kerja sama iklan"]]
    .map(([k, l]) => `<a href="${base}${k ? `&jenis=${k}` : ""}" style="padding: 8px 14px; border-radius: 999px; font-size: 13px; ${kind === k ? "background: #0B0B0F; color: #FFFFFF" : "border: 1px solid #E3EBF7; color: #0B0B0F"}">${l}</a>`)
    .join("");
  const btn = (k: string, id: string, st: string, label: string, tone: "blue" | "red" | "gray" = "gray") =>
    `<button type="button" data-req="${k}" data-id="${esc(id)}" data-status="${st}" style="border: 1px solid ${tone === "red" ? "#F5C2C2" : tone === "blue" ? "#2F74EB" : "#E3EBF7"}; background: ${tone === "blue" ? "#2F74EB" : "#FFFFFF"}; color: ${tone === "red" ? "#991B1B" : tone === "blue" ? "#FFFFFF" : "#0B0B0F"}; border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer">${label}</button>`;
  const rows = list.length
    ? list
        .map((r) => {
          const [lab, tone] = STAT[r.status] ?? [r.status, "gray"];
          const acts =
            r.kind === "student"
              ? r.status === "pending"
                ? btn("student", r.id, "approved", "Setujui", "blue") + btn("student", r.id, "rejected", "Tolak", "red")
                : ""
              : r.kind === "privacy"
                ? r.status === "pending"
                  ? btn("privacy", r.id, "done", "Tandai selesai", "blue") + btn("privacy", r.id, "rejected", "Tolak", "red")
                  : ""
                : ["contacted", "won", "lost"].filter((s) => s !== r.status).map((s) => btn("ad", r.id, s, STAT[s]![0], s === "won" ? "blue" : "gray")).join("");
          const info =
            r.kind === "student"
              ? `Email kampus: <strong style="font-weight: 500">${esc(r.detail)}</strong> · NIM ${esc(r.extra)}`
              : r.kind === "privacy"
                ? `${esc(PRIV[r.extra] ?? r.extra)}${r.detail ? ` · ${esc(r.detail)}` : ""}`
                : `Anggaran: ${esc(r.extra || "—")}${r.detail ? ` · ${esc(r.detail)}` : ""}`;
          return `<div style="display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-top: 1px solid #E3EBF7; flex-wrap: wrap"><span style="flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 4px"><span style="font-size: 12px; color: #5F6B7D">${esc(KIND[r.kind] ?? r.kind)} · ${esc(fmtDate(r.created_at, true))}</span><strong style="font-weight: 500">${esc(r.name)} <span style="font-weight: 400; color: #5F6B7D">· <a href="mailto:${esc(r.email)}" style="color: #2F74EB">${esc(r.email)}</a></span></strong><span style="font-size: 13px; line-height: 1.5; word-break: break-word">${info}</span></span>${pill(lab, tone)}<span style="display: flex; gap: 6px; flex-wrap: wrap">${acts}</span></div>`;
        })
        .join("")
    : `<p style="margin: 16px 0; font-size: 14px; color: #5F6B7D">Tidak ada permintaan.</p>`;
  return `<div data-req-panel style="display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px"><span style="display: flex; flex-wrap: wrap; gap: 8px">${tabs}</span><section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 6px 20px 10px">${rows}</section></div>`;
}

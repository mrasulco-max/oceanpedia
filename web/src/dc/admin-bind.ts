import "server-only";
import type { AdminArticle, AdminList } from "@/lib/admin";
import { displayStatus } from "@/lib/admin";
import type { SessionUser } from "@/lib/session";
import type { Category, Instrument } from "@/lib/types";
import { esc, initials } from "./bind";

/**
 * Binder panel redaksi: menghubungkan artboard "Tulis artikel" dan "Konten" ke data nyata.
 * Semua elemen yang diubah tetap memakai gaya inline dari desain.
 */

const ROLE_LABEL: Record<string, string> = { admin: "Admin", editor: "Editor", author: "Penulis", reader: "Pembaca" };
const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  revision: "Revisi",
  review: "Review",
  scheduled: "Terjadwal",
  published: "Terbit",
  archived: "Arsip",
};

/** Editor/admin: kelola artikel siapa pun (BREAKING, minta revisi). */
export function canPublish(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** Semua peran redaksi (termasuk penulis) boleh menerbitkan artikelnya sendiri tanpa review. */
const staffRole = (role: string) => role === "admin" || role === "editor" || role === "author";

/** Sama dengan aturan API: penulis menghapus draf/review miliknya; editor/admin semua yang tidak sedang tayang. */
export function canDelete(a: AdminArticle, role: string, now = Date.now()): boolean {
  const live = a.status === "published" && !!a.published_at && new Date(a.published_at).getTime() <= now;
  return staffRole(role) && !live;
}

function must(html: string, needle: string | RegExp, where: string): void {
  const ok = typeof needle === "string" ? html.includes(needle) : needle.test(html);
  if (!ok) throw new Error(`admin-bind: elemen desain tidak ditemukan (${where})`);
}

const WIB = "Asia/Jakarta";
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", { timeZone: WIB, day: "2-digit", month: "short", year: "numeric" }).format(d);
  const today = new Intl.DateTimeFormat("id-ID", { timeZone: WIB, day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const hm = new Intl.DateTimeFormat("id-ID", { timeZone: WIB, hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(".", ":");
  return day === today ? hm : `${day} ${hm}`;
}

function wibParts(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: WIB, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}

/** Nama, inisial & peran di pojok kanan atas semua halaman admin. */
export function bindStaffHeader(html: string, user: SessionUser | null): string {
  if (!user) return html;
  return html
    .split(">Andi Saputra<").join(`>${esc(user.full_name)}<`)
    .split(">Super Admin<").join(`>${esc(ROLE_LABEL[user.role] ?? user.role)}<`)
    .split(">AS<").join(`>${esc(initials(user.full_name))}<`);
}

// ---------------------------------------------------------------------------
// Tulis artikel
// ---------------------------------------------------------------------------
export function bindEditor(
  html: string,
  opts: { article: AdminArticle | null; categories: Category[]; instruments: Instrument[]; role: string },
): string {
  const { article: a, categories, instruments, role } = opts;
  let h = html;

  // Judul halaman & catatan editor.
  if (a) h = h.replace(/(<h1\b[^>]*>)Tulis artikel(<\/h1>)/, `$1Edit artikel$2`);
  if (a?.review_note) {
    h = h.replace(
      ">Artikel yang terbit tampil serentak di website dan aplikasi.<",
      `><b style="color:#9A3412">Catatan editor:</b> ${esc(a.review_note)}<`,
    );
  }
  // Pratinjau → halaman publik (bila sudah terbit).
  h = h.replace(/<a href="#"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Pratinjau<\/a>/, (_m, attrs: string, svg = "") =>
    a?.status === "published"
      ? `<a href="/berita/${esc(a.slug)}" target="_blank" rel="noopener"${attrs}>${svg}Pratinjau</a>`
      : `<a href="#" data-ed-action="preview" aria-disabled="true"${attrs.replace('style="', 'style="opacity: .5; ')}>${svg}Pratinjau</a>`,
  );

  // Hapus artikel (bila diizinkan) di samping Pratinjau.
  if (a && canDelete(a, role)) {
    h = h.replace(/(<a href="\/admin\/versi"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Riwayat versi<\/a>)/, (_m, whole: string, attrs: string) =>
      `${whole}<a href="#" data-ed-action="delete"${attrs.replace(/color: #0B0B0F/, "color: #B3261E").replace(/border: 1px solid #E3EBF7/, "border: 1px solid #F5C2C0")}>Hapus</a>`,
    );
  }

  // Alur 5 langkah mengikuti keadaan artikel.
  h = bindSteps(h, a, role);

  // Toolbar format isi.
  const tools: Record<string, string> = { Tebal: "bold", Daftar: "list", Kutipan: "quote", Tautan: "link", Gambar: "image", "Sisipkan widget harga": "widget" };
  for (const [label, key] of Object.entries(tools)) {
    h = h.replace(`<button aria-label="${label}" style="`, `<button type="button" data-ed-tool="${key}" aria-label="${label}" title="${label}" style="cursor: pointer; `);
  }
  h = h.replace('<input value="Rekap sesi 1', '<input type="file" accept="image/*" data-ed="image-file" hidden><input value="Rekap sesi 1');

  // Toolbar: status simpan.
  must(h, ">Tersimpan otomatis 12:24<", "status simpan");
  h = h.replace(">Tersimpan otomatis 12:24<", ` data-ed="saved">${a ? `Terakhir disimpan ${fmtTime(a.updated_at)}` : "Belum disimpan"}<`);

  // Judul + penghitung karakter.
  const titleRe = /<input value="Rekap sesi 1: IHSG naik 0,6% ditopang saham bank" aria-label="Judul"/;
  must(h, titleRe, "judul");
  const title = a?.title ?? "";
  h = h.replace(titleRe, `<input value="${esc(title)}" data-ed="title" maxlength="200" placeholder="Tulis judul artikel" aria-label="Judul" enterkeyhint="next"`);
  h = h.replace(">48/90 karakter<", ` data-ed="count">${[...title].length}/90 karakter<`);

  // Dek.
  const dekRe = /<textarea aria-label="Dek" rows="2"([^>]*)>[\s\S]*?<\/textarea>/;
  must(h, dekRe, "dek");
  h = h.replace(dekRe, (_m, attrs: string) => `<textarea aria-label="Dek" rows="2" data-ed="excerpt" maxlength="400" placeholder="Dek: ringkasan 1–2 kalimat yang tampil di bawah judul"${attrs}>${esc(a?.excerpt ?? "")}</textarea>`);

  // Foto sampul.
  const coverRe = /<span style="position: relative; display: block; height: 220px; border-radius: 20px; background: linear-gradient\(150deg, #2C3A63, #1B2235\)">/;
  must(h, coverRe, "foto sampul");
  const bg = a?.cover_url ? `url(&quot;${esc(a.cover_url)}&quot;) center / cover no-repeat, ` : "";
  h = h.replace(coverRe, `<span data-ed="cover" data-url="${esc(a?.cover_url ?? "")}" style="position: relative; display: block; height: 220px; border-radius: 20px; background: ${bg}linear-gradient(150deg, #2C3A63, #1B2235)">`);
  h = h.replace(/<a href="#"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)Ganti foto<\/a>/, `<a href="#" data-ed="cover-btn"$1>$2${a?.cover_url ? "Ganti foto" : "Unggah foto"}</a><input type="file" accept="image/*" data-ed="cover-file" hidden>`);
  h = h.replace(">Lisensi belum diisi<", ` data-ed="cover-note">${a?.cover_url ? "Foto terpasang" : "Belum ada foto"}<`);

  // Isi artikel: paragraf contoh + widget → satu area tulis bergaya paragraf desain.
  const bodyStart = h.indexOf('<p style="margin: 0; font-size: 16px; line-height: 1.75">JAKARTA');
  const bodyEndMark = ">Lanjutkan menulis…</p>";
  const bodyEnd = h.indexOf(bodyEndMark);
  if (bodyStart < 0 || bodyEnd < bodyStart) throw new Error("admin-bind: isi artikel tidak ditemukan");
  h =
    h.slice(0, bodyStart) +
    `<textarea data-ed="body" aria-label="Isi artikel" placeholder="Tulis isi artikel di sini…&#10;&#10;Pisahkan paragraf dengan satu baris kosong. Pakai toolbar di atas untuk tebal, daftar, kutipan, tautan, dan gambar." style="margin: 0; font-size: 16px; line-height: 1.75; border: 0; outline: none; resize: vertical; min-height: 380px; width: 100%; box-sizing: border-box; padding: 0; font-family: inherit; color: #0B0B0F; background: transparent">${esc(a?.body ?? "")}</textarea>` +
    h.slice(bodyEnd + bodyEndMark.length);

  // Kategori & tipe → <select> bergaya kotak desain.
  const selectBox = (label: string, sample: string, name: string, options: [string, string][], value: string) => {
    const re = new RegExp(`(>${label}<span )style="([^"]*)">${sample}(<svg(?:(?!<\\/svg>)[\\s\\S])*<\\/svg>)<\\/span>`);
    must(h, re, label);
    h = h.replace(re, (_m, pre: string, style: string, svg: string) => {
      const opts = options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`).join("");
      return `${pre}style="position: relative; display: block"><select data-ed="${name}" aria-label="${label}" style="${style}; width: 100%; appearance: none; -webkit-appearance: none; font-family: inherit; color: #0B0B0F; cursor: pointer; padding-right: 44px">${opts}</select><span aria-hidden="true" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; display: flex">${svg}</span></span>`;
    });
  };
  const catOpts: [string, string][] = [["", "Pilih kategori…"], ...categories.map((c) => [c.slug, c.name] as [string, string])];
  selectBox("Kategori", "Saham", "category", catOpts, a?.category_slug ?? "");
  selectBox("Tipe", "Berita", "type", [["berita", "Berita (gratis)"], ["plus", "Ocean Pedia Plus (pelanggan)"]], a?.is_premium ? "plus" : "berita");

  // Ticker terkait: chip nyata + input dengan daftar saran.
  const chipRe = /<span style="(display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: #1E40AF; background: #E5ECFF;[^"]*)">IHSG ×<\/span>/;
  const chipStyle = chipRe.exec(h)?.[1];
  if (!chipStyle) throw new Error("admin-bind: chip ticker tidak ditemukan");
  const chips = (a?.symbols ?? []).map((s) => `<span data-sym="${esc(s)}" style="${chipStyle}; cursor: pointer" title="Hapus ${esc(s)}">${esc(s)} ×</span>`).join("");
  h = h.replace(/<span style="display: inline-flex[^"]*color: #1E40AF; background: #E5ECFF;[^"]*">(IHSG|BBCA|BBRI) ×<\/span>/g, "");
  h = h.replace(
    /<input placeholder="Tambah…" style="([^"]*)">/,
    (_m, st: string) =>
      `<span data-ed="chips" data-chip-style="${esc(chipStyle)}" style="display: contents">${chips}</span><input placeholder="Tambah ticker…" list="ob-symbols" data-ed="symbol-input" autocomplete="off" style="${st}; text-transform: uppercase"><datalist id="ob-symbols">${instruments
        .map((i) => `<option value="${esc(i.symbol)}">${esc(i.name)}</option>`)
        .join("")}</datalist>`,
  );

  // Sakelar.
  const sw = (aria: string, key: string, on: boolean, disabled = false) => {
    const re = new RegExp(`<button role="switch" aria-checked="(true|false)" aria-label="${aria}" style="([^"]*)">`);
    must(h, re, aria);
    h = h.replace(re, (_m, _cur: string, style: string) => {
      let st = style
        .replace(/background: #[0-9A-F]{6}/, `background: ${on ? "#4285F4" : "#DCE3EE"}`)
        .replace(/justify-content: flex-(start|end)/, `justify-content: flex-${on ? "end" : "start"}`);
      if (disabled) st += "; opacity: .45; cursor: not-allowed";
      return `<button role="switch" aria-checked="${on}" aria-label="${aria}" data-ed-switch="${key}"${disabled ? ' aria-disabled="true" title="Hanya editor/admin"' : ""} style="${st}">`;
    });
  };
  sw("Tandai breaking", "breaking", !!a?.is_breaking, !canPublish(role));
  sw("Penggerak pasar", "mover", true);
  sw("Kirim push", "push", canPublish(role));

  // Pratinjau notifikasi mengikuti judul & dek.
  h = h.replace(/(<strong style="font-size: 14px; font-weight: 700")>IHSG naik 0,6% di sesi 1</, `$1 data-ed="pv-title">${esc(title || "Judul artikel")}<`);
  h = h.replace(/(<span style="font-size: 13px; color: #3D4250")>Saham bank besar jadi penopang\. Baca rekapnya →</, `$1 data-ed="pv-text">${esc(a?.excerpt || "Dek artikel tampil di sini.")}<`);

  // Tanggal & jam terbit (WIB). Kosong/masa lalu = terbit segera.
  const when = wibParts(a?.published_at ?? null);
  const dateBox = (label: string, sample: string, input: string) => {
    const re = new RegExp(`(>${label}<span )style="([^"]*)">${sample}(<svg(?:(?!<\\/svg>)[\\s\\S])*<\\/svg>)<\\/span>`);
    must(h, re, label);
    h = h.replace(re, (_m, _pre: string, style: string) => `>${label}${input.replace("STYLE", `${style}; width: 100%; box-sizing: border-box; font-family: inherit; color: #0B0B0F`)}`);
  };
  dateBox("Tanggal", "22 Okt 2026", `<input type="date" data-ed="date" value="${when.date}" style="STYLE">`);
  dateBox("Jam", "12:30 WIB", `<input type="time" data-ed="time" value="${when.time}" style="STYLE">`);

  // Tombol aksi (di HP menempel di bawah layar).
  must(h, ">Simpan draf</a>", "simpan draf");
  h = h.replace(/<div style="display: flex; gap: 10px">(<a href="\/admin\/konten"[^>]*>Simpan draf<\/a>)/, '<div data-ed-actions style="display: flex; gap: 10px">$1');
  h = h.replace(/<a href="\/admin\/konten"([^>]*)>Simpan draf<\/a>/, `<a href="#" data-ed-action="draft"$1>Simpan draf</a>`);
  h = h.replace(/<a href="\/admin\/konten"( class=ob-anim[^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)Kirim ke review<\/a>/, (_m, attrs: string, svg: string) =>
    `<a href="#" data-ed-action="publish"${attrs}>${svg}Terbitkan</a>`,
  );
  // Review editor tetap tersedia sebagai pilihan (tidak wajib).
  {
    const at = h.indexOf("data-ed-actions");
    const close = at >= 0 ? h.indexOf("</div>", at) : -1;
    if (close >= 0) {
      const note = `<span style="display: flex; justify-content: center; gap: 6px; font-size: 13px; color: #5F6B7D">Ingin diperiksa dulu? <a href="#" data-ed-action="review" style="color: #2F74EB; text-decoration: underline">Kirim ke review editor</a></span>`;
      h = h.slice(0, close + 6) + note + h.slice(close + 6);
    }
  }

  // Konfirmasi BREAKING: disembunyikan sampai dibutuhkan.
  h = h.replace(/<section style="([^"]*border: 2px solid #4285F4)"><span style="[^"]*">STATE · KONFIRMASI TERBIT BREAKING<\/span>/, `<section data-ed="confirm" hidden style="$1">`);
  h = h.replace(/<a href="#"([^>]*)>Batal<\/a>/, `<a href="#" data-ed-action="cancel"$1>Batal</a>`);
  h = h.replace(/<a href="\/admin\/konten"( class=ob-anim[^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)Ya, terbitkan<\/a>/, `<a href="#" data-ed-action="confirm"$1>$2Ya, terbitkan</a>`);
  return h;
}

// ---------------------------------------------------------------------------
// Alur 5 langkah di editor
// ---------------------------------------------------------------------------
type StepState = "done" | "current" | "todo";

function bindSteps(html: string, a: AdminArticle | null, role: string): string {
  const listRe = /(<div role="list" aria-label="Alur"[^>]*>)([\s\S]*?)(<\/div><\/div>)(?=<div style="display: flex; flex-wrap: wrap; gap: 20px)/;
  const m = listRe.exec(html);
  if (!m) return html;
  const items = m[0].match(/<div role="listitem"[\s\S]*?<\/a><\/div>/g);
  if (!items || items.length !== 5) return html;
  const circle = (it: string) => /<span style="flex: none; width: 34px; height: 34px;[^"]*">(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?<\/span>/.exec(it)![0];
  const look: Record<StepState, { circle: string; border: string }> = {
    done: { circle: circle(items[0]!), border: "#E3EBF7" },
    current: { circle: circle(items[2]!), border: "#84CC16" },
    todo: { circle: circle(items[3]!), border: "#E3EBF7" },
  };
  const ds = a ? displayStatus(a) : "draft";
  const live = ds === "published";
  const out = ds === "published" || ds === "scheduled";
  const wrote = !!a && a.title.trim().length >= 10 && a.body.trim().length >= 50;
  const meta = !!a && !!a.category_slug && a.symbols.length > 0;
  const steps: [StepState, string, string][] = [
    [wrote ? "done" : "current", "Tulis", wrote ? "Judul, dek, isi" : "Judul, dek, isi"],
    [meta ? "done" : wrote ? "current" : "todo", "Metadata", a?.cover_url ? "Kategori, ticker, foto ✓" : "Kategori, ticker, foto"],
    [
      out ? "done" : ds === "review" || ds === "revision" ? "current" : "todo",
      "Review editor",
      out ? "Disetujui" : ds === "review" ? "Menunggu editor" : ds === "revision" ? "Perlu revisi" : "Opsional · bisa langsung terbit",
    ],
    [out ? "done" : "todo", "Jadwal & notifikasi", ds === "scheduled" ? `Terjadwal ${fmtTime(a!.published_at)}` : "Push, newsletter"],
    [live ? "done" : ds === "scheduled" ? "current" : "todo", "Terbit", live ? `Tayang ${fmtTime(a!.published_at)}` : ds === "archived" ? "Diarsipkan" : "Web + aplikasi"],
  ];
  const built = items
    .map((it, i) => {
      const [st, title, sub] = steps[i]!;
      return it
        .replace('<a href="#" style="', '<span style="')
        .replace(/<\/a><\/div>$/, "</span></div>")
        .replace(circle(it), look[st].circle)
        .replace(/border: 1px solid #(?:E3EBF7|84CC16)">/, `border: 1px solid ${look[st].border}"${st === "current" ? ' aria-current="step"' : ""}>`)
        .replace(/(<strong style="font-size: 13px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(title)}$2`)
        .replace(/(text-overflow: ellipsis">)[^<]*(<\/span>)/, `$1${esc(sub)}$2`);
    })
    .join("");
  return html.replace(m[0], `${m[1]}${built}</div>`);
}

// ---------------------------------------------------------------------------
// Konten (daftar & review)
// ---------------------------------------------------------------------------
const TABS: [string, string][] = [
  ["review", "Review"],
  ["scheduled", "Terjadwal"],
  ["revision", "Revisi"],
  ["breaking", "Breaking"],
  ["draft", "Draf"],
  ["published", "Terbit"],
  ["archived", "Arsip"],
];

function grab(html: string, re: RegExp, where: string): string {
  const m = re.exec(html);
  if (!m) throw new Error(`admin-bind: ${where} tidak ditemukan`);
  return m[0];
}

const nf = new Intl.NumberFormat("id-ID");

export function bindContent(html: string, opts: { list: AdminList; status: string; selected: AdminArticle | null; role: string }): string {
  const { list, status, selected, role } = opts;
  let h = html;
  const c = list.counts;

  // Kartu tahap alur.
  const stage = (label: string, key: string, n: number) => {
    const re = new RegExp(`<a href="/admin/konten"([^>]*>(?:(?!</a>)[\\s\\S])*?>${label}</span><strong style="[^"]*">)[^<]*(</strong>)`);
    must(h, re, label);
    h = h.replace(re, `<a href="/admin/konten?status=${key}"$1${nf.format(n)}$2`);
  };
  stage("1 · Draf", "draft", c.draft ?? 0);
  stage("2 · Review editor", "review", c.review ?? 0);
  stage("3 · Terjadwal", "scheduled", c.scheduled ?? 0);
  stage("4 · Terbit", "published", c.published ?? 0);

  // Tab status.
  const tabOn = grab(h, /<a href="#" role="tab" aria-selected="true"[\s\S]*?<\/a>/, "tab aktif");
  const tabOff = grab(h, /<a href="#" role="tab" aria-selected="false"[\s\S]*?<\/a>/, "tab");
  const tabs = TABS.map(([key, label]) => {
    const tpl = key === status ? tabOn : tabOff;
    return tpl
      .replace('href="#"', `href="/admin/konten?status=${key}"`)
      .replace(/(<span style="[^"]*">)\d+(<\/span>)/, `$1${nf.format(c[key] ?? 0)}$2`)
      .replace(/(<span style="[^"]*">)[A-Za-z]+(<\/span><\/a>)$/, `$1${label}$2`);
  }).join("");
  h = h.replace(/(<div role="tablist"[^>]*>)[\s\S]*?(<\/div>)/, `$1${tabs}$2`);

  // Baris tabel: baris contoh pertama (terpilih) & kedua (biasa) jadi template.
  const rowRe = /<div style="[^"]*"><span[^>]*><input type="checkbox" aria-label="Pilih"[\s\S]*?<\/button><\/span><\/div>/g;
  const rows = h.match(rowRe);
  if (!rows || rows.length < 6) throw new Error("admin-bind: baris tabel tidak ditemukan");
  const [rowSel, rowNorm] = [rows[0]!, rows[1]!];
  const pill = (row: string, text: string) => grab(row, new RegExp(`<span style="[^"]*">${text}</span>`), `pill ${text}`);
  const statusPill: Record<string, string> = {
    review: pill(rows[0]!, "Review"),
    published: pill(rows[2]!, "Terbit"),
    scheduled: pill(rows[3]!, "Terjadwal"),
    revision: pill(rows[4]!, "Revisi"),
    draft: pill(rows[5]!, "Draf"),
  };
  statusPill.archived = statusPill.draft!.replace(">Draf<", ">Arsip<");
  const typePill = { berita: pill(rows[0]!, "Berita"), breaking: pill(rows[2]!, "BREAKING"), plus: pill(rows[3]!, "Analisis").replace(">Analisis<", ">Plus<") };

  const rowFor = (a: AdminArticle) => {
    const ds = displayStatus(a);
    const isSel = selected?.id === a.id;
    let r = isSel ? rowSel : rowNorm;
    const sample = isSel
      ? { title: "Rekap sesi 1: IHSG naik 0,6% ditopang bank", upd: "Diperbarui 12:18", ini: "BW", name: "Bagas Wicaksono", role: "Penulis", cat: "Saham" }
      : { title: "Bitcoin tembus $67 ribu jelang data inflasi AS", upd: "Diperbarui 11:52", ini: "YF", name: "Yoga Firmansyah", role: "Penulis", cat: "Crypto" };
    r = r
      .replace(`>${sample.title}<`, ` data-row-title><a href="/admin/tulis?id=${a.id}" style="color: inherit">${esc(a.title)}</a><`)
      .replace(`>${sample.upd}<`, `>${ds === "scheduled" ? "Terbit " : "Diperbarui "}${esc(fmtTime(ds === "scheduled" ? a.published_at : a.updated_at))}<`)
      .replace(`>${sample.ini}<`, `>${esc(initials(a.author_name))}<`)
      .replace(`>${sample.name}<`, `>${esc(a.author_name)}<`)
      .replace(`>${sample.role}<`, `>Penulis<`)
      .replace(`>${sample.cat}<`, `>${esc(a.category_name)}<`)
      .replace(pill(r, "Berita"), a.is_breaking ? typePill.breaking : a.is_premium ? typePill.plus : typePill.berita)
      .replace(pill(r, "Review"), statusPill[ds] ?? statusPill.draft!);
    // Tombol detail → pilih baris ini.
    r = r.replace(/<button aria-label="(Tutup|Buka) detail" aria-expanded="(true|false)"/, `<button data-select="/admin/konten?status=${status}&amp;id=${a.id}" aria-label="${isSel ? "Detail terbuka" : "Buka detail"}" aria-expanded="${isSel}"`);
    r = r.replace("<div ", `<div data-row="${a.id}" `);
    return r;
  };
  const body = list.data.length
    ? list.data.map(rowFor).join("")
    : `<div style="padding: 40px 18px; text-align: center; font-size: 14px; color: #5F6B7D">Belum ada artikel di tahap ini. <a href="/admin/tulis" style="color: #2F74EB">Tulis artikel</a></div>`;
  h = h.replace('<div style="min-width: 780px"><div style="display: grid;', '<div data-cnt-table style="min-width: 780px"><div data-cnt-head style="display: grid;');
  const first = h.indexOf(rows[0]!);
  const lastRow = rows[rows.length - 1]!;
  const end = h.indexOf(lastRow) + lastRow.length;
  h = h.slice(0, first) + body + h.slice(end);

  // Footer tabel.
  h = h.replace(/<span>1 dipilih<\/span>/, `<span>${selected ? "1 dipilih" : ""}</span>`);
  h = h.replace(/Menampilkan 1–6 dari 1\.284 artikel/, list.data.length ? `Menampilkan 1–${list.data.length} dari ${nf.format(c[status] ?? list.data.length)} artikel` : "Tidak ada artikel");

  // Panel review.
  h = h.replace('<div class="" style="flex: 1 1 380px', '<div data-cnt-panel class="" style="flex: 1 1 380px');
  h = h.replace(/<section style="[^"]*border-style: dashed"><span style="[^"]*">STATE · SETELAH "MINTA REVISI"[\s\S]*?<\/section>/, "");
  if (!selected) {
    return h.replace(
      /(<div class="" style="flex: 1 1 380px[^"]*">)<section[\s\S]*?<\/section>/,
      `$1<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 22px; font-size: 14px; color: #5F6B7D">Pilih artikel di tabel untuk melihat detail dan meninjau.</section>`,
    );
  }
  const s = selected;
  const ds = displayStatus(s);
  h = h
    .replace(/>Review: Rekap sesi 1</, `>${ds === "review" ? "Review" : STATUS_LABEL[ds]}: ${esc(s.title.length > 42 ? s.title.slice(0, 40) + "…" : s.title)}<`)
    .replace(/>Masuk 12:18 · ditugaskan ke Rina Pratiwi</, `>Diperbarui ${esc(fmtTime(s.updated_at))} · oleh ${esc(s.author_name)}<`)
    .replace(/<span style="([^"]*)">Prioritas tinggi<\/span>/, s.is_breaking ? `<span style="$1">BREAKING</span>` : "")
    .replace(/>Rekap sesi 1: IHSG naik 0,6% ditopang saham bank</, `>${esc(s.title)}<`)
    .replace(/>IHSG ditutup naik 0,6% ke 7\.265 pada sesi pertama\. Saham bank besar jadi penopang utama…</, `>${esc(s.excerpt || "Belum ada dek.")}<`)
    .replace(/>Foto: Layar BEI · belum ada lisensi</, `>${s.cover_url ? "Foto sampul terpasang" : "Belum ada foto sampul"}<`);
  if (s.cover_url) {
    h = h.replace(
      /<span style="position: relative; display: block; height: 150px; border-radius: 18px; background: linear-gradient/,
      `<span style="position: relative; display: block; height: 150px; border-radius: 18px; background: url(&quot;${esc(s.cover_url)}&quot;) center / cover no-repeat, linear-gradient`,
    );
  }

  // Daftar periksa dihitung dari isi artikel.
  const items = h.match(/<div style="display: flex; align-items: center; gap: 12px; min-height: 44px; border-top: [^"]*">[\s\S]*?<\/span><\/div>/g) ?? [];
  if (items.length === 5) {
    const okIcon = grab(items[0]!, /<span title="Terbit"[\s\S]*?<\/span>/, "ikon ok");
    const badIcon = grab(items[4]!, /<span title="Terlewat"[\s\S]*?<\/span>/, "ikon gagal");
    const wajib = grab(items[4]!, /<span style="[^"]*">Wajib<\/span>/, "label wajib");
    const checks: [string, boolean][] = [
      ["Judul ≤ 90 karakter", [...s.title].length <= 90],
      ["Dek (ringkasan) terisi", s.excerpt.trim().length > 0],
      ["Ticker terkait dipilih", s.symbols.length > 0],
      ["Isi minimal 3 paragraf", s.body.split(/\n{2,}/).filter((p) => p.trim()).length >= 3],
      ["Foto sampul diunggah", !!s.cover_url],
    ];
    const built = checks
      .map(([label, ok], i) => {
        const wrap = /^<div style="([^"]*)">/.exec(items[i]!)![1]!;
        return `<div style="${wrap}">${ok ? okIcon : badIcon}<span style="flex: 1; font-size: 14px">${esc(label)}</span>${ok ? "" : wajib}</div>`;
      })
      .join("");
    const firstItem = h.indexOf(items[0]!);
    const lastItem = items[4]!;
    h = h.slice(0, firstItem) + built + h.slice(h.indexOf(lastItem) + lastItem.length);
  }

  // Catatan & tombol aksi.
  h = h.replace(/<textarea rows="3"([^>]*)>Tambahkan lisensi foto dari tim foto\.<\/textarea>/, `<textarea rows="3" data-cnt="note" placeholder="Tulis catatan bila meminta revisi"$1>${esc(s.review_note)}</textarea>`);
  const actRe = /<a href="\/admin\/konten"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)Minta revisi<\/a><a href="\/admin\/tulis"( class=ob-anim[^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)Setujui (?:&amp;|&) jadwalkan<\/a>/;
  must(h, actRe, "tombol review");
  const MARK = "\u0001ob-actions\u0001";
  const actions = (secAttrs: string, secSvg: string, priAttrs: string, priSvg: string): string => {
    const edit = `<a href="/admin/tulis?id=${s.id}"${secAttrs}>Edit</a>`;
    if (!staffRole(role)) return edit;
    const future = s.published_at && new Date(s.published_at).getTime() > Date.now();
    if (ds === "published" || ds === "scheduled") {
      return `${edit}<a href="#" data-cnt-action="unpublish" data-id="${s.id}"${secAttrs}>${secSvg}Tarik ke draf</a><a href="/berita/${esc(s.slug)}" target="_blank" rel="noopener"${priAttrs}>${priSvg}Lihat</a>`;
    }
    if (ds === "archived") return `${edit}<a href="#" data-cnt-action="publish" data-id="${s.id}"${priAttrs}>${priSvg}Terbitkan lagi</a>`;
    if (!canPublish(role)) {
      // Penulis: terbitkan sendiri (BREAKING tetap lewat editor).
      if (s.is_breaking) return edit;
      return `${edit}<a href="#" data-cnt-action="publish" data-id="${s.id}"${priAttrs}>${priSvg}${future ? "Jadwalkan" : "Terbitkan"}</a>`;
    }
    return `<a href="#" data-cnt-action="reject" data-id="${s.id}"${secAttrs}>${secSvg}Minta revisi</a>${edit}<a href="#" data-cnt-action="publish" data-id="${s.id}"${priAttrs}>${priSvg}${future ? "Setujui & jadwalkan" : "Setujui & terbitkan"}</a>`;
  };
  h = h.replace(actRe, (_m, a1: string, a2: string, a3: string, a4: string) => actions(a1, a2, a3, a4) + MARK);
  // Arsipkan (yang sedang tayang) & hapus (yang boleh dihapus).
  const extra: string[] = [];
  if (staffRole(role) && ds === "published") extra.push(`<a href="#" data-cnt-action="archive" data-id="${s.id}" style="font-size: 14px; color: #5F6B7D; text-decoration: underline">Arsipkan</a>`);
  if (canDelete(s, role)) extra.push(`<a href="#" data-cnt-action="delete" data-id="${s.id}" style="font-size: 14px; color: #B3261E; text-decoration: underline">Hapus artikel</a>`);
  const at = h.indexOf(MARK);
  h = h.replace(MARK, "");
  const close = at >= 0 ? h.indexOf("</div>", at) : -1;
  if (extra.length && close >= 0) {
    h = h.slice(0, close + 6) + `<div style="display: flex; gap: 18px; justify-content: flex-end; padding-top: 4px">${extra.join("")}</div>` + h.slice(close + 6);
  }
  return h;
}

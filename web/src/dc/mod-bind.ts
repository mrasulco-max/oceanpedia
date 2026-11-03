import "server-only";
import type { AuditEntry, AuditPage, MediaItem, MediaLibrary, ModComment, ModerationState } from "@/lib/admin";
import { esc, initials } from "./bind";
import { ago, blocks, closeOf, emptyRow, fmtDate, grab, num, pill, rx, SVG, switchBtn, type Tone } from "./kit";

/**
 * Binder Komentar (admin-comments), Media (admin-media), dan Log aktivitas (admin-activity).
 * Data dari tabel comments/comment_reports/moderation_words/app_settings, media, dan audit_log.
 */

function tabs(h: string, items: [string, string, number, string][], active: string): string {
  const tl = grab(h, /<div role="tablist"[^>]*>([\s\S]*?)<\/div>/, "tab");
  const all = tl[1]!.match(/<a href="#" role="tab"[\s\S]*?<\/a>/g)!;
  const on = all.find((t) => t.includes('aria-selected="true"'))!;
  const built = items
    .map(([key, label, n, href], i) => {
      const base = key === active ? on : (all[i] ?? all[all.length - 1]!).replace('aria-selected="true"', 'aria-selected="false"');
      let t = base.replace('href="#"', `href="${href}"`).replace(/(font-size: 13px; font-weight: 700">)[^<]*(<\/span>)/, `$1${num(n)}$2`);
      t = t.replace(/(<span style="font-size: 16px; font-weight: (?:500|400)">)[^<]*(<\/span>)/, `$1${esc(label)}$2`);
      if (key === active) t = t.replace(/(font-size: 13px; font-weight: 700">)/, "$1");
      return t;
    })
    .join("");
  return h.replace(tl[0], tl[0].replace(tl[1]!, built));
}

function statCard(h: string, title: string, value: string, pillHtml: string, caption: string): string {
  const re = rx(`(<h3 style="margin: 0; font-size: 15px; font-weight: 500">${title}</h3>[\\s\\S]*?letter-spacing: -.01em">)[^<]*(</span><span style="margin-left: auto">)<span[^>]*>[^<]*</span>(</span></div>\\s*<span style="font-size: 13px; line-height: 1.45; color: #5F6B7D">)[^<]*(</span>)`);
  return h.replace(re, `$1${esc(value)}$2${pillHtml}$3${esc(caption)}$4`);
}

// ======================================================================= komentar
const COMMENT_TABS: [string, string][] = [
  ["queue", "Antrian"],
  ["flagged", "Dilaporkan"],
  ["pending", "Menunggu"],
  ["visible", "Disetujui"],
  ["hidden", "Disembunyikan"],
];

export function bindComments(html: string, opts: { st: ModerationState; status: string; canBlock: boolean }): string {
  const { st, status, canBlock } = opts;
  let h = html;
  const c = st.counts;
  h = statCard(h, "Menunggu", num(c.pending), pill(c.pending ? "Perlu cek" : "Kosong", c.pending ? "orange" : "green"), "Tertahan filter otomatis (tautan, kata terlarang, akun baru).");
  h = statCard(h, "Dilaporkan", num(c.flagged), pill(c.flagged ? "Prioritas" : "Aman", c.flagged ? "red" : "green"), `Disembunyikan otomatis setelah ${st.settings.report_threshold} laporan pembaca.`);
  h = statCard(h, "Disetujui hari ini", num(c.approved_today), pill("Normal", "blue"), `${num(c.visible)} komentar tampil di web & aplikasi.`);
  h = statCard(h, "Pengguna diblokir", num(c.blocked_week), pill("Minggu ini", "gray"), "Diblokir dari halaman Pengguna atau dari antrian ini.");
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Ekspor</a>`), "");

  const counts: Record<string, number> = { queue: c.pending + c.flagged, flagged: c.flagged, pending: c.pending, visible: c.visible, hidden: c.hidden };
  h = tabs(h, COMMENT_TABS.map(([k, l]) => [k, l, counts[k] ?? 0, `/admin/komentar?status=${k}`] as [string, string, number, string]), status);

  // Antrian.
  const titleMap: Record<string, string> = { queue: "Antrian moderasi", flagged: "Dilaporkan pembaca", pending: "Menunggu persetujuan", visible: "Komentar tampil", hidden: "Disembunyikan" };
  h = h.replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">)Antrian moderasi(<\/h2>)/, `$1${titleMap[status] ?? "Antrian moderasi"}$2`);
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Setujui yang aman</a>`), status === "queue" || status === "pending" ? '<a href="#" data-cm-action="approve-safe"$1Setujui yang tanpa laporan</a>' : "");
  const rows = blocks(h, '<div style="display: flex; gap: 12px; padding: 16px 18px; border-top: 1px solid #E3EBF7;');
  if (rows.length < 2) throw new Error("binder admin: baris komentar tidak ditemukan");
  const tplSel = rows[0]!.html;
  const tpl = rows[1]!.html;
  const btn = (label: string, attr: string) => grab(tpl, rx(`<a href="[^"]*"([^>]*>)(${SVG})${label}</a>`), `tombol ${label}`) && tpl.match(rx(`<a href="[^"]*"([^>]*>)(${SVG})${label}</a>`))![0].replace(/<a href="[^"]*"/, `<a href="#" ${attr}`);
  const row = (m: ModComment, i: number) => {
    let r = (i === 0 ? tplSel : tpl).replace("<div ", `<div data-cm-row="${m.id}" data-reports="${m.reports}" `);
    r = r
      .replace(/(font-size: 13px; font-weight: 700">)[^<]*(<\/span>)/, `$1${esc(initials(m.user_name))}$2`)
      .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(m.user_name)}${m.user_blocked ? ' <span style="color: #B3261E">· diblokir</span>' : ""}$2`)
      .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(ago(m.created_at))} · di <a href="/berita/${esc(m.article_slug)}" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline">“${esc(m.article_title.length > 48 ? m.article_title.slice(0, 46) + "…" : m.article_title)}”</a>$2`)
      .replace(/(<span style="font-size: 14px; line-height: 1.5">)[\s\S]*?(<\/span><span style="display: flex; flex-wrap: wrap; gap: 6px">)/, `$1${esc(m.body)}$2`);
    const tags: string[] = [];
    if (m.reports) tags.push(pill(`${m.reports} laporan`, "red", 11));
    if (m.flag_reason) tags.push(pill(m.flag_reason, m.status === "pending" ? "yellow" : "orange", 11));
    const stLabel: Record<string, [string, Tone]> = { pending: ["Menunggu", "yellow"], flagged: ["Disembunyikan sementara", "orange"], visible: ["Tampil", "green"], hidden: ["Disembunyikan", "gray"] };
    const [sl, stone] = stLabel[m.status] ?? stLabel.pending!;
    tags.push(pill(sl, stone, 11));
    if (m.moderated_by_name) tags.push(pill(`oleh ${m.moderated_by_name}`, "gray", 11));
    r = r.replace(/(<\/span><span style="display: flex; flex-wrap: wrap; gap: 6px">)[\s\S]*?(<\/span>\s*<span style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px">)/, `$1${tags.join("")}$2`);
    const acts = [
      m.status !== "visible" ? btn("Setujui", `data-cm-action="visible" data-id="${m.id}"`) : "",
      m.status !== "hidden" ? btn("Sembunyikan", `data-cm-action="hidden" data-id="${m.id}"`) : "",
      canBlock && !m.user_blocked ? btn("Blokir pengguna", `data-cm-action="block" data-user="${m.user_id}"`) : "",
    ].join("");
    r = r.replace(/(<span style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px">)[\s\S]*?(<\/span><\/div><\/div>)$/, `$1${acts}$2`);
    return r;
  };
  const list = st.data.map(row).join("") || emptyRow(status === "queue" ? "Antrian kosong — semua komentar sudah ditinjau." : "Tidak ada komentar di sini.");
  h = h.slice(0, rows[0]!.start) + list + h.slice(rows[rows.length - 1]!.end);

  // Alur moderasi untuk komentar teratas.
  const flowAt = h.indexOf("Alur moderasi · komentar");
  if (flowAt >= 0) {
    const wrapStart = h.lastIndexOf('<div style="display: flex; flex-direction: column; gap: 8px">', flowAt);
    const wrapEnd = closeOf(h, wrapStart);
    const top = st.data[0];
    if (!top) {
      h = h.slice(0, wrapStart) + h.slice(wrapEnd);
    } else {
      let f = h.slice(wrapStart, wrapEnd).replace(/Alur moderasi · komentar [^<]*/, `Alur moderasi · komentar ${esc(top.user_name.split(" ")[0]!)}`);
      const steps: [string, string, string][] = [
        [ago(top.created_at), "Masuk", "Ditulis pembaca"],
        [top.reports ? `${top.reports} laporan` : "Filter", top.reports ? "Dilaporkan" : "Tertahan", top.flag_reason || "Menunggu tinjauan"],
        ["Sekarang", "Ditinjau moderator", "Anda"],
        ["Berikutnya", "Keputusan", "Setujui / sembunyikan / blokir"],
      ];
      let si = 0;
      f = f.replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>\s*<span style="display: flex; align-items: center; gap: 10px;[\s\S]*?<strong style="font-size: 13px; font-weight: 700">)[^<]*(<\/strong><span style="font-size: 12px; color: #5F6B7D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/span>)/g, (_m, a: string, b: string, c2: string, d: string) => {
        const s = steps[si++];
        return s ? `${a}${esc(s[0])}${b}${esc(s[1])}${c2}${esc(s[2])}${d}` : _m;
      });
      f = f.replace(/<a href="#" style="flex: none; width: 236px/g, '<span style="flex: none; width: 236px').replace(/<\/span><\/span><\/a><\/div>/g, "</span></span></span></div>");
      h = h.slice(0, wrapStart) + f + h.slice(wrapEnd);
    }
  }

  // Filter otomatis.
  const sw = (aria: RegExp, key: string, on: boolean, label?: string) => {
    h = h.replace(rx(`<button role="switch" aria-checked="(?:true|false)" aria-label="${aria.source}"[^>]*>[\\s\\S]*?</button>`), switchBtn(on, `data-cm-setting="${key}" aria-label="${label ?? key}"`));
  };
  sw(/Tahan komentar berisi tautan/, "hold_links", st.settings.hold_links, "Tahan komentar berisi tautan");
  sw(/Deteksi janji imbal hasil &(?:amp;)? pump/, "detect_pump", st.settings.detect_pump, "Deteksi janji imbal hasil & pump");
  sw(/Sembunyikan setelah 3 laporan/, "hide_after_reports", st.settings.hide_after_reports, "Sembunyikan setelah laporan");
  sw(/Akun baru (?:<|&lt;) 24 jam wajib review/, "hold_new_accounts", st.settings.hold_new_accounts, "Akun baru wajib review");
  h = h.replace(/>Sembunyikan setelah 3 laporan</, `>Sembunyikan setelah ${st.settings.report_threshold} laporan<`);
  h = h.replace(/>Kata kunci: profit dijamin, pasti naik, sinyal VIP</, `>Kata kunci: ${esc(st.words.slice(0, 3).join(", ") || "tambahkan di bawah")}<`);
  h = h.replace(/(>Kata terlarang<span style="([^"]*)">)[\s\S]*?(<\/span><\/label>)/, (_m, _a: string, style: string) =>
    `>Kata terlarang <span style="font-size: 12px">(ketuk × untuk menghapus)</span><span data-cm="words" style="${style}">${st.words
      .map((w) => `<button type="button" data-cm-word="${esc(w)}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: #374151; background: #EFF0F2; padding: 5px 10px; border-radius: 999px; white-space: nowrap; border: 0; cursor: pointer">${esc(w)} ×</button>`)
      .join("")}<input data-cm="word-input" placeholder="Tambah kata lalu Enter" maxlength="60" style="flex: 1 1 140px; min-width: 120px; border: 0; outline: none; font-size: 14px; padding: 4px 6px"></span></label>`,
  );
  return h;
}

// ======================================================================= media
const KIND: Record<string, string> = { photo: "Foto", chart: "Grafik", illustration: "Ilustrasi", video: "Video" };
const LIC: Record<string, string> = { none: "Belum ada lisensi", owned: "Milik OceanBird", licensed: "Berlisensi", editorial: "Editorial", cc: "Creative Commons" };
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function licPill(m: MediaItem, sz = 11): string {
  if (m.license === "none") return pill("Belum ada lisensi", "red", sz);
  if (m.expired) return pill("Lisensi kedaluwarsa", "red", sz);
  if (m.expires_soon) return pill(`Kedaluwarsa ${fmtDate(m.license_until!)}`, "yellow", sz);
  if (m.license === "licensed" && m.license_until) return pill(`Berlisensi s/d ${fmtDate(m.license_until)}`, "green", sz);
  return pill(LIC[m.license] ?? m.license, m.license === "owned" ? "blue" : "green", sz);
}

export function bindMedia(html: string, opts: { lib: MediaLibrary; filter: string; selected: MediaItem | null; canManage: boolean }): string {
  const { lib, filter, selected, canManage } = opts;
  let h = html;
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Filter</a>`), `<span style="display: flex"><input data-md="search" type="search" placeholder="Cari judul / nama berkas" style="min-height: 46px; padding: 0 18px; border-radius: 999px; border: 1px solid #E3EBF7; font-size: 14px; min-width: 220px"></span>`);
  h = h.replace(/>Seret file ke sini atau pilih dari komputer</, ">Seret foto ke sini atau pilih dari perangkat<");
  h = h.replace(/>Foto tanpa lisensi tidak bisa dipakai saat artikel diterbitkan\.</, ">JPG, PNG, WebP, atau GIF · maks. 4 MB (foto besar dikecilkan otomatis). Isi lisensi setelah unggah.<");
  h = h.replace(rx(`<a href="#"( class=ob-anim[^>]*>)(${SVG})Pilih file</a>`), '<a href="#" data-md-action="pick"$1$2Pilih file</a><input type="file" accept="image/*" multiple data-md="file" hidden>');
  h = h.replace('<div style="border-radius: 24px; border: 2px dashed #BFD3F5;', '<div data-md="drop" style="border-radius: 24px; border: 2px dashed #BFD3F5;');
  h = h.replace(/>JPG, PNG, MP4 · maks 20 MB</, ">JPG, PNG, WebP · maks 4 MB<");
  const c = lib.counts;
  h = tabs(
    h,
    [
      ["", "Semua", c.all, "/admin/media"],
      ["unlicensed", "Tanpa lisensi", c.unlicensed, "/admin/media?filter=unlicensed"],
      ["expiring", "Segera kedaluwarsa", c.expiring, "/admin/media?filter=expiring"],
      ["video", "Video", c.video, "/admin/media?filter=video"],
    ],
    filter,
  );
  // Grid.
  const cards = h.match(/<a href="\/admin\/media" style="display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: 22px;[\s\S]*?<\/span><\/span><\/a>/g);
  if (!cards || cards.length < 2) throw new Error("binder admin: kartu media tidak ditemukan");
  const sel = cards[0]!;
  const norm = cards[1]!;
  const grid = lib.data
    .map((m) => {
      let card = (selected?.id === m.id ? sel : norm).replace('href="/admin/media"', `href="/admin/media?${filter ? `filter=${filter}&amp;` : ""}id=${m.id}" data-md-card="${m.id}"`);
      card = card
        .replace(/<img src="[^"]*" alt=""/, `<img src="${esc(m.url)}" alt="${esc(m.alt)}" loading="lazy"`)
        .replace(/(<span style="position: absolute; left: 8px; top: 8px">)<span[^>]*>[^<]*<\/span>/, `$1${pill(KIND[m.kind] ?? "Foto", "gray", 11)}`)
        .replace(/(<strong style="font-size: 13px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(m.title || m.file_name || "Tanpa judul")}$2`)
        .replace(/(<\/strong>)<span style="display: inline-flex[^"]*">[^<]*<\/span>/, `$1${licPill(m)}`);
      return card;
    })
    .join("");
  const first = h.indexOf(cards[0]!);
  const last = h.lastIndexOf(cards[cards.length - 1]!) + cards[cards.length - 1]!.length;
  h = h.slice(0, first) + (grid || `<div style="grid-column: 1 / -1; padding: 30px; text-align: center; font-size: 14px; color: #5F6B7D">Belum ada media di sini. Unggah foto lewat tombol di atas.</div>`) + h.slice(last);

  // Detail.
  const at = h.indexOf("DETAIL MEDIA");
  const secStart = h.indexOf("<section", at);
  const secEnd = closeOf(h, secStart, "section");
  if (!selected) {
    return h.slice(0, secStart) + `<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; font-size: 14px; color: #5F6B7D">Pilih media untuk mengisi lisensi dan teks alternatif.</section>` + h.slice(secEnd);
  }
  const m = selected;
  let s = h.slice(secStart, secEnd);
  s = s
    .replace(/<img src="[^"]*" alt=""/, `<img src="${esc(m.url)}" alt="${esc(m.alt)}"`)
    .replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">)[^<]*(<\/h2>)/, `$1${esc(m.title || "Tanpa judul")}$2`)
    .replace(/(<span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(m.file_name || m.mime)}${m.width && m.height ? ` · ${m.width}×${m.height}` : ""} · ${size(m.size)}$2`)
    .replace(/(<span style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex: none">)<span[^>]*>[^<]*<\/span>/, `$1${licPill(m, 12)}`);
  const field = "min-height: 46px; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px; color: #0B0B0F";
  s = s.replace(/(>Sumber \/ fotografer)<input value="" placeholder="([^"]*)" style="([^"]*)">/, `>Judul<input data-md="title" value="${esc(m.title)}" maxlength="120" style="${field}"></label><label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Jenis<select data-md="kind" style="${field}">${Object.entries(KIND).map(([k, l]) => `<option value="${k}"${k === m.kind ? " selected" : ""}>${l}</option>`).join("")}</select></label><label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Sumber / fotografer<input data-md="source" value="${esc(m.source)}" maxlength="160" placeholder="$2" style="$3">`);
  s = s.replace(rx(`(>Jenis lisensi)<span style="([^"]*)">Pilih lisensi(${SVG})</span>`), (_m, pre: string, st: string) => `${pre}<select data-md="license" style="${st}; width: 100%; font-family: inherit; color: #0B0B0F">${Object.entries(LIC).map(([k, l]) => `<option value="${k}"${k === m.license ? " selected" : ""}>${k === "none" ? "Belum ada lisensi" : l}</option>`).join("")}</select>`);
  s = s.replace(rx(`(>Berlaku sampai)<span style="([^"]*)">Tidak ada batas(${SVG})</span>`), (_m, pre: string, st: string) => `${pre}<input type="date" data-md="until" value="${esc(m.license_until ?? "")}" style="${st}; font-family: inherit"><span style="font-size: 12px">Kosongkan bila tidak ada batas.</span>`);
  s = s.replace(/(>Teks alternatif)<textarea rows="2" style="([^"]*)">[\s\S]*?<\/textarea><span style="([^"]*)">\d+\/125<\/span>/, `$1<textarea data-md="alt" rows="2" maxlength="125" placeholder="Jelaskan isi gambar untuk pembaca tunanetra" style="$2">${esc(m.alt)}</textarea><span data-md-count style="$3">${[...m.alt].length}/125</span>`);
  const facts = [m.used_in ? `${num(m.used_in)} artikel${m.used_title ? ` · ${m.used_title.length > 28 ? m.used_title.slice(0, 26) + "…" : m.used_title}` : ""}` : "Belum dipakai", `${fmtDate(m.created_at)}${m.uploaded_by_name ? ` · ${m.uploaded_by_name}` : ""}`];
  let fi = 0;
  s = s.replace(/(<span style="text-align: right; font-weight: 500">)[^<]*(<\/span>)/g, (_m, a: string, b: string) => `${a}${esc(facts[fi++] ?? "")}${b}`);
  s = s.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Hapus</a>`), canManage && !m.used_in ? `<a href="#" data-md-action="delete" data-id="${m.id}"$1Hapus</a>` : "");
  s = s.replace(rx(`<a href="#"( class=ob-anim[^>]*>)(${SVG})Simpan lisensi</a>`), canManage ? `<a href="#" data-md-action="save" data-id="${m.id}"$1$2Simpan</a>` : "");
  s = s.replace("<section ", `<section data-md="detail" data-id="${m.id}" `);
  return h.slice(0, secStart) + s + h.slice(secEnd);
}

// ======================================================================= log aktivitas
const ACTION: Record<string, string> = {
  "article.create": "Membuat artikel",
  "article.draft": "Menyimpan draf",
  "article.review": "Mengirim ke review",
  "article.publish": "Menerbitkan artikel",
  "article.schedule": "Menjadwalkan artikel",
  "article.reject": "Meminta revisi",
  "article.unpublish": "Menarik artikel",
  "article.archive": "Mengarsipkan artikel",
  "article.delete": "Menghapus artikel",
  "category.create": "Membuat kategori",
  "category.update": "Mengubah kategori",
  "category.delete": "Menghapus kategori",
  "category.reorder": "Mengurutkan menu",
  "tag.create": "Membuat tag",
  "tag.update": "Mengubah tag",
  "tag.delete": "Menghapus tag",
  "tag.merge": "Menggabungkan tag",
  "comment.approve": "Menyetujui komentar",
  "comment.hide": "Menyembunyikan komentar",
  "comment.word_add": "Menambah kata terlarang",
  "comment.word_remove": "Menghapus kata terlarang",
  "media.upload": "Mengunggah media",
  "media.update": "Mengubah lisensi media",
  "media.delete": "Menghapus media",
  "rbac.matrix": "Mengubah izin",
  "rbac.role_create": "Membuat role",
  "rbac.role_delete": "Menghapus role",
  "rbac.invite": "Mengundang staf",
  "rbac.invite_revoke": "Membatalkan undangan",
  "rbac.user_role": "Mengganti role",
  "staff.invite_accept": "Menerima undangan",
  "users.block": "Memblokir pengguna",
  "users.unblock": "Membuka blokir",
  "users.warn": "Mengirim peringatan",
  "settings.moderation": "Mengubah filter komentar",
  "ads.create": "Membuat kampanye",
  "ads.update": "Mengubah kampanye",
  "ads.status": "Mengubah status kampanye",
  "ads.slot": "Mengubah slot iklan",
  "market.create": "Menambah simbol",
  "market.update": "Mengubah simbol",
  "auth.2fa": "Masuk dengan 2 langkah",
};
const GROUP_PILL: Record<string, [string, Tone]> = {
  article: ["Konten", "orange"],
  category: ["Konten", "orange"],
  tag: ["Konten", "orange"],
  media: ["Konten", "orange"],
  comment: ["Komentar", "orange"],
  rbac: ["Izin", "red"],
  staff: ["Izin", "red"],
  users: ["Akun", "red"],
  auth: ["Akun", "red"],
  ads: ["Iklan", "yellow"],
  market: ["Sistem", "gray"],
  settings: ["Sistem", "gray"],
};

function device(ua: string | null): string {
  if (!ua) return "Server";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|node|Go-http/i.test(ua) ? "API" : "Web";
  return [br, os].filter(Boolean).join(" · ");
}

function objectText(e: AuditEntry): string {
  const d = e.data ?? {};
  const pick = (...k: string[]) => k.map((x) => d[x]).find((v) => typeof v === "string" && v) as string | undefined;
  const t = pick("title", "name", "email", "slug", "role", "word");
  if (t) return t;
  if (e.action === "rbac.matrix") return Object.keys(d).map((r) => `Role ${r}`).join(", ") || "Matriks izin";
  if (e.entity_id && e.entity_id.length > 24) return `${e.entity} ${e.entity_id.slice(0, 8)}…`;
  return e.entity_id ?? e.entity;
}

function diff(e: AuditEntry): [string, string] {
  const d = e.data ?? {};
  if (e.action === "rbac.matrix") {
    const before: string[] = [];
    const after: string[] = [];
    for (const [role, v] of Object.entries(d)) {
      const x = v as { before?: string[]; after?: string[] };
      const b = new Set(x.before ?? []);
      const a = new Set(x.after ?? []);
      for (const p of a) if (!b.has(p)) (before.push(`${role}: ${p} = false`), after.push(`${role}: ${p} = true`));
      for (const p of b) if (!a.has(p)) (before.push(`${role}: ${p} = true`), after.push(`${role}: ${p} = false`));
    }
    return [before.join("\n") || "—", after.join("\n") || "—"];
  }
  if ("before" in d || "after" in d) return [JSON.stringify(d.before ?? "—"), JSON.stringify(d.after ?? "—")];
  const rest = Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return ["—", rest.join("\n") || "—"];
}

export function bindActivity(html: string, opts: { page: AuditPage; group: string; selected: AuditEntry | null; canExport: boolean }): string {
  const { page, group, selected } = opts;
  let h = html;
  const days = page.days;
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Rentang: 7 hari</a>`), `<span style="display: flex; gap: 6px">${[1, 7, 30, 90]
    .map((d) => `<a href="/admin/aktivitas?days=${d}${group ? `&amp;group=${group}` : ""}" style="min-height: 48px; display: flex; align-items: center; padding: 0 16px; border-radius: 999px; border: 1px solid ${d === days ? "#4285F4" : "#E3EBF7"}; background: ${d === days ? "#E5ECFF" : "#FFFFFF"}; font-size: 14px; font-weight: 500">${d === 1 ? "24 jam" : `${d} hari`}</a>`)
    .join("")}</span>`);
  h = h.replace(rx(`<a href="#"( class=ob-anim[^>]*>)(${SVG})Ekspor CSV</a>`), `<a href="#" data-act-action="csv"$1$2Ekspor CSV</a>`);
  const g = page.groups;
  h = tabs(
    h,
    [
      ["", "Semua", g.all ?? 0, `/admin/aktivitas?days=${days}`],
      ["content", "Konten", g.content ?? 0, `/admin/aktivitas?days=${days}&group=content`],
      ["access", "Izin & akun", g.access ?? 0, `/admin/aktivitas?days=${days}&group=access`],
      ["ads", "Iklan", g.ads ?? 0, `/admin/aktivitas?days=${days}&group=ads`],
      ["system", "Sistem", g.system ?? 0, `/admin/aktivitas?days=${days}&group=system`],
    ],
    group,
  );
  h = h.replace(rx(`<span style="margin-left: auto; display: flex; gap: 8px"><a href="#"[^>]*>(?:${SVG})?Staf</a><a href="#"[^>]*>(?:${SVG})?Aksi</a></span>`), "");

  const rows = blocks(h, '<div style="display: grid; grid-template-columns: .9fr 1.4fr 1.1fr 1.4fr .9fr 36px; gap: 12px; align-items: center;');
  if (!rows.length) throw new Error("binder admin: baris log tidak ditemukan");
  const tpl = rows[0]!.html;
  const built = page.data
    .map((e) => {
      let r = tpl.replace("<div ", `<div data-act-row="${e.id}" `).replace(/<div style="display: grid;/, selected?.id === e.id ? '<div style="background: #F4F8FF; display: grid;' : '<div style="display: grid;');
      const who = e.actor_name ?? "Sistem";
      r = r
        .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #0B0B0F">)[^<]*(<\/span>)/, `$1${esc(fmtDate(e.created_at, true))}$2`)
        .replace(/(font-size: 11px; font-weight: 700">)[^<]*(<\/span>)/, `$1${esc(e.actor_name ? initials(who) : "S")}$2`)
        .replace(/(<strong style="font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/strong>)/, `$1${esc(who)}$2`)
        .replace(/(<span style="font-size: 12px; color: #5F6B7D; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">)[^<]*(<\/span>)/, `$1${esc(e.actor_role ?? "Otomatis")}$2`)
        .replace(/(<strong style="font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(ACTION[e.action] ?? e.action)}$2`)
        .replace(/(<span style="color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(objectText(e))}$2`)
        .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(device(e.user_agent))}$2`)
        .replace(/<button aria-label="Buka detail" aria-expanded="false"/, `<button data-act-open="/admin/aktivitas?days=${days}${group ? `&amp;group=${group}` : ""}&amp;id=${e.id}" aria-label="Buka detail" aria-expanded="${selected?.id === e.id}"`);
      return r;
    })
    .join("");
  h = h.slice(0, rows[0]!.start) + (built || emptyRow("Belum ada aktivitas pada rentang ini.")) + h.slice(rows[rows.length - 1]!.end);
  if (page.data.length >= 60) {
    const last = page.data[page.data.length - 1]!;
    const sec = h.indexOf("</section>", h.indexOf(`data-act-row="${last.id}"`));
    h = h.slice(0, sec) + `<a href="/admin/aktivitas?days=${days}${group ? `&amp;group=${group}` : ""}&amp;before=${last.id}" style="display: block; padding: 14px 18px; border-top: 1px solid #E3EBF7; text-align: center; font-size: 14px; color: #2F74EB">Muat yang lebih lama</a>` + h.slice(sec);
  }

  // Detail perubahan.
  const e = selected ?? page.data[0] ?? null;
  const at = h.indexOf(">Detail perubahan<");
  const secStart = h.lastIndexOf("<section", at);
  const secEnd = closeOf(h, secStart, "section");
  if (!e) return h.slice(0, secStart) + h.slice(secEnd);
  let s = h.slice(secStart, secEnd);
  const [b, a] = diff(e);
  const [gl, gt] = GROUP_PILL[e.entity] ?? ["Sistem", "gray"];
  s = s
    .replace(/(<span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span><\/span><span style="margin-left: auto)/, `$1${esc(fmtDate(e.created_at, true))} · ${esc(e.actor_name ?? "Sistem")}${e.ip ? ` · IP ${esc(e.ip)}` : ""}$2`)
    .replace(/(<span style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex: none">)<span[^>]*>[^<]*<\/span>/, `$1${pill(gl, gt)}`)
    .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #991B1B">)[^<]*(<\/span>)/, `$1<span style="white-space: pre-wrap; word-break: break-word">${esc(b)}</span>$2`)
    .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #166534">)[^<]*(<\/span>)/, `$1<span style="white-space: pre-wrap; word-break: break-word">${esc(a)}</span>$2`)
    .replace(/>Log tidak bisa diubah atau dihapus\. Disimpan 2 tahun\.</, `>${esc(ACTION[e.action] ?? e.action)} · ${esc(objectText(e))}. Log tidak bisa diubah atau dihapus.<`);
  return h.slice(0, secStart) + s + h.slice(secEnd);
}

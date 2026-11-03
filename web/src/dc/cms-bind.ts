import "server-only";
import type { AdminArticle, AdminCategory, AdminTag, RbacState } from "@/lib/admin";
import { displayStatus } from "@/lib/admin";
import { esc } from "./bind";
import { blocks, closeOf, compact, emptyRow, fmtDate, grab, num, pill, rx, SVG, switchBtn, type Tone } from "./kit";

/**
 * Binder "Kategori & tag" (admin-categories) dan form kategori (admin-category-form).
 * Data dari tabel categories, tags, article_tags, user_topics, category_redirects.
 */

const STATUS: Record<string, [string, Tone]> = { active: ["Aktif", "green"], draft: ["Draf", "gray"], archived: ["Arsip", "yellow"] };
const ART: Record<string, [string, Tone]> = {
  review: ["Review", "orange"],
  published: ["Terbit", "green"],
  scheduled: ["Terjadwal", "blue"],
  revision: ["Revisi", "red"],
  draft: ["Draf", "gray"],
  archived: ["Arsip", "yellow"],
};

/** Ikon ilustrasi kategori (nama sama dengan pilihan di form). */
export const CAT_ICONS = ["candle", "drop", "coin", "globe", "bars", "reader"] as const;
export const CAT_COLORS: [string, string][] = [
  ["Peach", "#F5C9A0"],
  ["Teal", "#A9D4D3"],
  ["Lavender", "#D4CCF4"],
  ["Hijau", "#BFE3C8"],
  ["Kuning", "#F4E1A1"],
  ["Biru", "#CFE0F5"],
];

export interface CatData {
  categories: AdminCategory[];
  tags: AdminTag[];
  tag_total: number;
  tag_unused: number;
}

function iconFor(h: string, icon: string): string | null {
  const m = rx(`aria-label="Ilustrasi ${icon}"[^>]*>(${SVG})`).exec(h);
  return m ? m[1]! : null;
}

// ======================================================================= daftar kategori & tag
export function bindCategories(html: string, opts: { data: CatData; tab: string; selected: AdminCategory | null; recent: AdminArticle[]; icons: Record<string, string>; canManage: boolean }): string {
  const { data, tab, selected, recent, icons, canManage } = opts;
  let h = html;
  const cats = data.categories;
  const parents = cats.filter((c) => !c.parent_id);
  const subs = cats.filter((c) => c.parent_id);
  const active = parents.filter((c) => c.status === "active");
  const empty = cats.filter((c) => c.articles === 0);

  // Kartu ringkasan.
  const card = (title: string, value: string, pillHtml: string, caption: string) => {
    const re = rx(`(<h3 style="margin: 0; font-size: 15px; font-weight: 500">${title}</h3>[\\s\\S]*?letter-spacing: -.01em">)[^<]*(</span><span style="margin-left: auto">)<span[^>]*>[^<]*</span>(</span></div>\\s*<span style="font-size: 13px; line-height: 1.45; color: #5F6B7D">)[^<]*(</span>)`);
    h = h.replace(re, `$1${esc(value)}$2${pillHtml}$3${esc(caption)}$4`);
  };
  card("Kategori aktif", num(active.length), pill(`${active.filter((c) => c.in_menu).length} di menu`, "lime"), `${parents.length - active.length} draf/arsip.`);
  card("Subkategori", num(subs.length), pill("Normal", "blue"), subs.length ? subs.slice(0, 4).map((s) => s.name).join(", ") + (subs.length > 4 ? ", dan lainnya." : ".") : "Belum ada subkategori.");
  card("Tag", num(data.tag_total), pill(`${data.tag_unused} tanpa artikel`, data.tag_unused ? "yellow" : "green"), data.tag_unused ? "Hapus atau gabungkan tag yang tidak dipakai." : "Semua tag dipakai.");
  h = h.replace(">Tanpa kategori</h3>", ">Kategori kosong</h3>");
  card("Kategori kosong", num(empty.length), pill(empty.length ? "Perlu cek" : "Aman", empty.length ? "orange" : "green"), empty.length ? `${empty.slice(0, 3).map((c) => c.name).join(", ")} belum punya artikel.` : "Semua kategori punya artikel.");
  h = h.replace('href="/admin/konten" aria-label="Detail Tanpa kategori"', 'href="/admin/kategori?tab=kategori" aria-label="Detail Kategori kosong"');
  h = h.replace('href="#" aria-label="Detail Tag"', 'href="#tag" aria-label="Detail Tag"').replace('href="#" aria-label="Detail Subkategori"', 'href="/admin/kategori?tab=sub" aria-label="Detail Subkategori"').replace('href="#" aria-label="Detail Kategori aktif"', 'href="/admin/kategori?tab=kategori" aria-label="Detail Kategori aktif"');

  // Tombol atas.
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Atur urutan menu</a>`), canManage ? '<a href="#" data-cat-action="save-order"$1Simpan urutan menu</a>' : "");
  h = h.replace(rx(`<a href="[^"]*"([^>]*>(?:${SVG})?)Tambah kategori</a>`), canManage ? '<a href="/admin/kategori/form"$1Tambah kategori</a>' : "");

  // Tab.
  const tablist = grab(h, /<div role="tablist"[^>]*>([\s\S]*?)<\/div>/, "tab kategori");
  const tabs = tablist[1]!.match(/<a href="#" role="tab"[\s\S]*?<\/a>/g)!;
  const tabOn = tabs[0]!;
  const tabOff = tabs[1]!;
  const mk = (key: string, label: string, n: number, i: number) =>
    (key === tab ? tabOn : tabs[i]!.replace(/aria-selected="true"/, 'aria-selected="false"'))
      .replace('href="#"', key === "tag" ? 'href="#tag"' : `href="/admin/kategori?tab=${key}"`)
      .replace(/(font-size: 13px; font-weight: 700">)[^<]*(<\/span>)/, `$1${num(n)}$2`)
      .replace(/(<span style="font-size: 16px; font-weight: (?:500|400)">)[^<]*(<\/span>)/, `$1${label}$2`);
  void tabOff;
  h = h.replace(tablist[0], tablist[0].replace(tablist[1]!, mk("kategori", "Kategori", parents.length, 0) + mk("sub", "Subkategori", subs.length, 1) + mk("tag", "Tag", data.tag_total, 2)));

  // Tabel kategori.
  const rowStart = '<div style="display: grid; grid-template-columns: 22px 2.2fr .6fr .7fr .7fr .7fr 124px; gap: 12px; align-items: center;';
  const rows = blocks(h, rowStart);
  if (rows.length < 2) throw new Error("binder admin: baris kategori tidak ditemukan");
  const rowSel = rows[0]!.html;
  const rowNorm = rows[1]!.html;
  const list = tab === "sub" ? subs : parents;
  const built = list
    .map((c) => {
      let r = (selected?.id === c.id ? rowSel : rowNorm).replace("<div ", `<div data-cat-row="${c.id}" draggable="${canManage}" `);
      const icon = icons[c.icon] ?? "";
      r = r
        .replace(/(<span style="flex: none; width: 40px; height: 40px; border-radius: 14px; background: )#[0-9A-Fa-f]{6}(; display: flex; align-items: center; justify-content: center">)(?:<svg[\s\S]*?<\/svg>)?(<\/span>)/, `$1${c.color}$2${icon}$3`)
        .replace(/(<strong style="font-weight: 500; line-height: 1.35">)[^<]*(<\/strong>)/, `$1${esc(c.name)}$2`)
        .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1/${esc(c.slug)}${c.parent_name ? ` · induk ${esc(c.parent_name)}` : ""}$2`);
      const monos = [num(c.articles), c.followers ? compact(c.followers) : "—"];
      let mi = 0;
      r = r.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #0B0B0F">)[^<]*(<\/span>)/g, (_m, a: string, b: string) => `${a}${monos[mi++] ?? ""}${b}`);
      r = r.replace(/<button role="switch"[\s\S]*?<\/button>/, canManage ? switchBtn(c.in_menu, `data-cat-menu="${c.id}" aria-label="Tampil di menu ${esc(c.name)}"`) : switchBtn(c.in_menu, 'disabled aria-label="Tampil di menu"'));
      const [st, tone] = STATUS[c.status] ?? STATUS.active!;
      r = r.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;[^"]*">[^<]*<\/span>/, pill(st, tone));
      r = r
        .replace(/href="\/admin\/kategori" aria-label="Lihat [^"]*"/, `href="/admin/kategori?tab=${tab}&amp;id=${c.id}" aria-label="Lihat ${esc(c.name)}"`)
        .replace(/href="\/admin\/kategori\/form" aria-label="Edit [^"]*"/, `href="/admin/kategori/form?id=${c.id}" aria-label="Edit ${esc(c.name)}"`)
        .replace(/<a href="[^"]*" aria-label="(?:Hapus|Arsipkan|Lainnya)[^"]*"[^>]*>(?:<svg[\s\S]*?<\/svg>)?<\/a>/, "");
      return r;
    })
    .join("");
  h = h.slice(0, rows[0]!.start) + (built || emptyRow(tab === "sub" ? "Belum ada subkategori." : "Belum ada kategori.")) + h.slice(rows[rows.length - 1]!.end);
  h = h.replace(/(<span style="margin-left: auto">)\d+ kategori(<\/span>)/, `$1${list.length} ${tab === "sub" ? "subkategori" : "kategori"}$2`);
  if (!canManage) h = h.replace(/Seret ⋮⋮ untuk mengubah urutan menu/, "Urutan menu diatur editor/admin");

  // Bagian tag.
  h = h.replace('<h2 style="margin: 0; font-size: 18px; font-weight: 700">Tag</h2>', '<h2 id="tag" style="margin: 0; font-size: 18px; font-weight: 700">Tag</h2>');
  h = h.replace(/>\d+ tag · gabungkan tag yang mirip agar pencarian rapi</, `>${num(data.tag_total)} tag · ${data.tag_unused} tanpa artikel · gabungkan tag yang mirip agar pencarian rapi<`);
  h = h.replace(rx(`<a href="#"([^>]*>(?:${SVG})?)Tambah tag</a>`), canManage ? '<a href="#" data-tag-action="create"$1Tambah tag</a>' : "");
  const tagStart = '<div style="display: grid; grid-template-columns: 1.2fr .6fr 1fr 128px; gap: 12px; align-items: center;';
  const tagRows = blocks(h, tagStart);
  if (tagRows.length) {
    const tpl = tagRows[0]!.html;
    const tbuilt = data.tags
      .slice(0, 100)
      .map((t) => {
        let r = tpl.replace("<div ", `<div data-tag-row="${t.id}" data-tag-slug="${esc(t.slug)}" data-tag-name="${esc(t.name)}" `);
        const vals = [`#${t.slug}`, num(t.articles)];
        let i = 0;
        r = r.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #0B0B0F">)[^<]*(<\/span>)/g, (_m, a: string, b: string) => `${a}${esc(vals[i++] ?? "")}${b}`);
        r = r.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px;[^"]*">[^<]*<\/span>/, t.main_category ? pill(t.main_category, "gray", 11) : pill("—", "gray", 11));
        r = r.replace(/aria-label="Ubah tag [^"]*"/, `data-tag-action="rename" aria-label="Ubah tag ${esc(t.slug)}"`).replace(/aria-label="Gabungkan tag [^"]*"/, `data-tag-action="merge" aria-label="Gabungkan tag ${esc(t.slug)}"`).replace(/aria-label="Hapus tag [^"]*"/, `data-tag-action="delete" aria-label="Hapus tag ${esc(t.slug)}"`);
        if (!canManage) r = r.replace(/<span style="display: flex; gap: 6px">[\s\S]*<\/span><\/span><\/div>$/, '<span style="display: flex; gap: 6px"></span></span></div>');
        return r;
      })
      .join("");
    h = h.slice(0, tagRows[0]!.start) + (tbuilt || emptyRow("Belum ada tag.")) + h.slice(tagRows[tagRows.length - 1]!.end);
    // Daftar pilihan tag (untuk gabung).
    h = h.replace('<h2 id="tag"', `<datalist id="ob-tags">${data.tags.map((t) => `<option value="${esc(t.slug)}" data-id="${t.id}">${esc(t.name)}</option>`).join("")}</datalist><h2 id="tag"`);
  }

  // Panel detail.
  h = bindCatDetail(h, selected, cats, recent, icons, canManage);
  return h;
}

function bindCatDetail(html: string, c: AdminCategory | null, all: AdminCategory[], recent: AdminArticle[], icons: Record<string, string>, canManage: boolean): string {
  const h = html;
  const i = h.indexOf("LIHAT KATEGORI");
  if (i < 0) return h;
  const secStart = h.indexOf("<section", i);
  const secEnd = closeOf(h, secStart, "section");
  if (!c) {
    return h.slice(0, secStart) + `<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; font-size: 14px; color: #5F6B7D">Belum ada kategori. <a href="/admin/kategori/form" style="color: #2F74EB">Tambah kategori</a></section>` + h.slice(secEnd);
  }
  let s = h.slice(secStart, secEnd);
  const head = h.slice(i, secStart).replace(/<span style="display: inline-flex[^"]*">[^<]*<\/span>/, pill(...(STATUS[c.status] ?? STATUS.active!)));
  s = s
    .replace(/(<div style="position: relative; border-radius: 20px; background: )#[0-9A-Fa-f]{6}/, `$1${c.color}`)
    .replace(/(<span style="position: absolute; right: 10px; top: 8px">)(?:<svg[\s\S]*?<\/svg>)?(<\/span>)/, `$1${icons[c.icon] ?? ""}$2`)
    .replace(/(<span style="position: relative; font-size: 12px; color: #5A3A1A">)[^<]*(<\/span>)/, `$1oceanbird.id/${esc(c.slug)}$2`)
    .replace(/(<strong style="position: relative; font-size: 26px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(c.name)}$2`)
    .replace(/(<p style="margin: 0; font-size: 14px; line-height: 1.55; color: #5F6B7D">)[^<]*(<\/p>)/, `$1${esc(c.description || "Belum ada deskripsi.")}$2`)
    .replace(">Views 30h<", ">Total views<");
  const stats = [num(c.articles), c.followers ? compact(c.followers) : "—", compact(c.views)];
  let k = 0;
  s = s.replace(/(<strong style="font-size: 20px; font-weight: 500">)[^<]*(<\/strong>)/g, (_m, a: string, b: string) => `${a}${stats[k++] ?? ""}${b}`);
  // Subkategori.
  const kids = all.filter((x) => x.parent_id === c.id);
  s = s.replace(/(<strong style="font-size: 14px; font-weight: 500">Subkategori<\/strong><div style="display: flex; flex-wrap: wrap; gap: 6px">)[\s\S]*?(<a href="\/admin\/kategori\/form")/, (_m, a: string, b: string) => `${a}${kids.map((x) => `<a href="/admin/kategori?tab=sub&amp;id=${x.id}">${pill(x.name, "blue", 13)}</a>`).join("") || '<span style="font-size: 13px; color: #5F6B7D">Belum ada.</span>'}${b}`);
  s = s.replace('<a href="/admin/kategori/form" style="display: inline-flex', canManage ? `<a href="/admin/kategori/form?parent=${c.id}" style="display: inline-flex` : '<a hidden href="#" style="display: inline-flex');
  // Rincian.
  const siblings = all.filter((x) => (x.parent_id ?? "") === (c.parent_id ?? ""));
  const order = siblings.findIndex((x) => x.id === c.id) + 1;
  const where = c.in_menu ? (c.parent_id ? "Web & aplikasi (submenu)" : "Web, aplikasi, story row") : "Tidak tampil di menu";
  const facts = [c.editor_name ?? "Belum ditentukan", `${order} dari ${siblings.length}`, where, `${fmtDate(c.created_at)}${c.created_by_name ? ` · ${c.created_by_name}` : ""}`];
  let f = 0;
  s = s.replace(/(<span style="text-align: right; font-weight: 500">)[^<]*(<\/span>)/g, (_m, a: string, b: string) => `${a}${esc(facts[f++] ?? "")}${b}`);
  // Artikel terbaru.
  const linkRe = /<a href="\/admin\/konten" style="display: flex; align-items: center; gap: 12px; min-height: 52px; border-top: [^"]*">[\s\S]*?<\/a>/g;
  const links = s.match(linkRe) ?? [];
  if (links.length) {
    const tpl = links[1] ?? links[0]!;
    const items = recent.slice(0, 3).map((a, idx) => {
      const ds = displayStatus(a);
      const [lbl, tone] = ART[ds] ?? ART.draft!;
      return tpl
        .replace('href="/admin/konten"', `href="/admin/tulis?id=${a.id}"`)
        .replace(/border-top: [^"]*"/, `border-top: ${idx ? "1px solid #E3EBF7" : "0"}"`)
        .replace(/(<span style="flex: 1; font-size: 14px; line-height: 1.35">)[^<]*(<\/span>)/, `$1${esc(a.title)}$2`)
        .replace(/<span style="display: inline-flex[^"]*">[^<]*<\/span>/, pill(lbl, tone, 11));
    });
    const first = s.indexOf(links[0]!);
    const last = s.lastIndexOf(links[links.length - 1]!) + links[links.length - 1]!.length;
    s = s.slice(0, first) + (items.join("") || '<span style="font-size: 13px; color: #5F6B7D; padding: 8px 0">Belum ada artikel di kategori ini.</span>') + s.slice(last);
  }
  // Tombol.
  s = s.replace(rx(`<a href="/admin/kategori/form"([^>]*>(?:${SVG})?)Hapus</a>`), canManage ? `<a href="/admin/kategori/form?id=${c.id}#hapus"$1Hapus</a>` : "");
  s = s.replace(rx(`<a href="/admin/kategori/form"( class=ob-anim[^>]*>(?:${SVG})?)Edit kategori</a>`), canManage ? `<a href="/admin/kategori/form?id=${c.id}"$1Edit kategori</a>` : "");
  return h.slice(0, i) + head + s + h.slice(secEnd);
}

/** Ikon ilustrasi dari form desain (dipakai juga di daftar & panel). */
export function catIcons(formHtml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CAT_ICONS) {
    const svg = iconFor(formHtml, k);
    if (svg) out[k] = svg;
  }
  return out;
}

// ======================================================================= form kategori
export function bindCategoryForm(html: string, opts: { cat: AdminCategory | null; all: AdminCategory[]; staff: RbacState["staff"]; parentId: string; canManage: boolean }): string {
  const { cat: c, all, staff, parentId } = opts;
  let h = html;
  const edit = !!c;
  const v = {
    name: c?.name ?? "",
    slug: c?.slug ?? "",
    parent: c?.parent_id ?? parentId,
    editor: c?.editor_id ?? "",
    order: String(c?.sort_order ?? all.filter((x) => !x.parent_id).length + 1),
    status: c?.status ?? "active",
    desc: c?.description ?? "",
    inMenu: c?.in_menu ?? true,
    follow: c?.followable ?? true,
    color: c?.color ?? CAT_COLORS[1]![1],
    icon: c?.icon && (CAT_ICONS as readonly string[]).includes(c.icon) ? c.icon : "bars",
    seoTitle: c?.seo_title ?? "",
    seoDesc: c?.seo_description ?? "",
  };

  // Judul.
  h = h.replace(/(<h1\b[^>]*>)Tambah kategori(<\/h1>)/, `$1${edit ? `Edit kategori: ${esc(c!.name)}` : "Tambah kategori"}$2`);
  h = h.replace(/>Form yang sama dipakai untuk mengedit kategori — judul berubah menjadi “Edit kategori: Saham”\.</, `>${edit ? "Perubahan langsung tampil di menu web & aplikasi setelah disimpan." : "Isi info dasar, tampilan, dan SEO lalu publikasikan."}<`);
  h = h.replace(/>Tambah kategori baru</, `>${edit ? esc(c!.name) : "Tambah kategori baru"}<`);
  h = h.replace(/(Tambah kategori baru<\/span><\/span><span style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex: none">)<span[^>]*>[^<]*<\/span>/, `$1${pill(...(STATUS[v.status] ?? STATUS.active!))}`);
  if (edit) h = h.replace(/(<\/span><\/span><span style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex: none">)<span style="display: inline-flex[^"]*">Draf<\/span>/, `$1${pill(...(STATUS[v.status] ?? STATUS.active!))}`);

  const input = (label: string, name: string, value: string, extra = "") => {
    h = h.replace(rx(`(>${label})<input value="[^"]*" placeholder="" style="([^"]*)">`), `$1<input data-cf="${name}" value="${esc(value)}" ${extra} style="$2">`);
  };
  input("Nama kategori", "name", v.name, 'maxlength="40" placeholder="mis. Energi"');
  h = h.replace(/(oceanbird\.id\/<\/span>)<input value="[^"]*" style="([^"]*)">/, `$1<input data-cf="slug" value="${esc(v.slug)}" maxlength="40" placeholder="energi" style="$2">`);
  input("Urutan di menu", "order", v.order, 'type="number" min="0" max="999" inputmode="numeric"');
  const select = (label: string, sample: string, name: string, options: [string, string][], value: string) => {
    h = h.replace(rx(`(>${label})<span style="([^"]*)">${sample}(${SVG})</span>`), (_m, pre: string, st: string, svg: string) => {
      const o = options.map(([k, t]) => `<option value="${esc(k)}"${k === value ? " selected" : ""}>${esc(t)}</option>`).join("");
      return `${pre}<span style="position: relative; display: block"><select data-cf="${name}" aria-label="${label}" style="${st}; width: 100%; appearance: none; -webkit-appearance: none; font-family: inherit; color: #0B0B0F; cursor: pointer">${o}</select><span aria-hidden="true" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; display: flex">${svg}</span></span>`;
    });
  };
  select("Induk kategori", "Komoditas", "parent", [["", "— Tidak ada (kategori utama)"], ...all.filter((x) => !x.parent_id && x.id !== c?.id).map((x) => [x.id, x.name] as [string, string])], v.parent);
  select("Editor penanggung jawab", "Sinta Rahayu", "editor", [["", "— Belum ditentukan"], ...staff.filter((s) => !s.blocked_at).map((s) => [s.id, `${s.full_name} · ${s.role_name}`] as [string, string])], v.editor);
  select("Status", "Draf", "status", [["active", "Aktif"], ["draft", "Draf"], ["archived", "Arsip"]], v.status);
  h = h.replace(/(>Deskripsi singkat)<textarea rows="2" style="([^"]*)">[\s\S]*?<\/textarea><span style="([^"]*)">\d+\/160<\/span>/, `$1<textarea data-cf="desc" rows="2" maxlength="160" placeholder="Ringkasan isi kategori" style="$2">${esc(v.desc)}</textarea><span data-cf-count="desc" style="$3">${[...v.desc].length}/160</span>`);
  const sw = (aria: string, name: string, on: boolean) => {
    h = h.replace(rx(`<button role="switch" aria-checked="(?:true|false)" aria-label="${aria}"[^>]*>[\\s\\S]*?</button>`), switchBtn(on, `data-cf-switch="${name}" aria-label="${aria}"`));
  };
  sw("Tampil di menu web & aplikasi", "in_menu", v.inMenu);
  sw("Izinkan pembaca mengikuti", "followable", v.follow);
  // Warna & ilustrasi.
  h = h.replace(/<button aria-label="Warna ([^"]+)" aria-pressed="(?:true|false)" style="([^"]*?)background: (#[0-9A-Fa-f]{6}); border: [^;]*;/g, (_m, name: string, pre: string, bg: string) =>
    `<button type="button" data-cf-color="${bg}" aria-label="Warna ${name}" aria-pressed="${bg.toUpperCase() === v.color.toUpperCase()}" style="${pre}background: ${bg}; border: ${bg.toUpperCase() === v.color.toUpperCase() ? "3px solid #4285F4" : "1px solid #E3EBF7"}; cursor: pointer;`,
  );
  h = h.replace(/<button aria-label="Ilustrasi ([a-z]+)" aria-pressed="(?:true|false)" style="([^"]*?)border: [^;]*;/g, (_m, name: string, pre: string) =>
    `<button type="button" data-cf-icon="${name}" aria-label="Ilustrasi ${name}" aria-pressed="${name === v.icon}" style="${pre}border: ${name === v.icon ? "2px solid #4285F4" : "1px solid #E3EBF7"}; cursor: pointer;`,
  );
  // SEO.
  input("Judul SEO", "seo_title", v.seoTitle, 'maxlength="70" placeholder="Judul di hasil pencarian Google"');
  h = h.replace(/(>Meta deskripsi)<textarea rows="2" style="([^"]*)">[\s\S]*?<\/textarea><span style="([^"]*)">\d+\/155<\/span>/, `$1<textarea data-cf="seo_desc" rows="2" maxlength="160" placeholder="Deskripsi di hasil pencarian" style="$2">${esc(v.seoDesc)}</textarea><span data-cf-count="seo_desc" style="$3">${[...v.seoDesc].length}/160</span>`);
  h = h.replace(/(<span style="font-size: 12px; color: #1A7F37">)[^<]*(<\/span>)/, `$1<span data-pv="url">oceanbird.id › ${esc(v.slug || "kategori")}</span>$2`);
  h = h.replace(/(<strong style="font-size: 16px; font-weight: 500; color: #1A47B8">)[^<]*(<\/strong>)/, `$1<span data-pv="seo-title">${esc(v.seoTitle || `${v.name || "Kategori"} | OceanBird`)}</span>$2`);
  h = h.replace(/(color: #1A47B8">[\s\S]*?<\/strong><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1<span data-pv="seo-desc">${esc(v.seoDesc || v.desc || "Deskripsi kategori tampil di sini.")}</span>$2`);
  // Pratinjau langsung.
  h = h.replace(/<div style="(position: relative; height: 140px; border-radius: 22px; background: )#[0-9A-Fa-f]{6}/, `<div data-pv="card" style="$1${v.color}`);
  h = h.replace(/(<span style="position: absolute; right: 8px; top: 8px">)(?:<svg[\s\S]*?<\/svg>)?(<\/span><strong style="position: relative; font-size: 22px; font-weight: 700">)[^<]*(<\/strong>)/, (_m, a: string, b: string, c2: string) => `${a.replace('<span ', '<span data-pv="icon" ')}${iconFor(html, v.icon) ?? ""}${b.replace("<strong ", '<strong data-pv="name" ')}${esc(v.name || "Kategori")}${c2}`);
  h = h.replace(/(font-size: 12px; font-weight: 700">)ENE(<\/span>)/, `$1<span data-pv="abbr">${esc((v.name || "KAT").slice(0, 3).toUpperCase())}</span>$2`);
  h = h.replace(/(<span style="font-size: 11px">)Energi(<\/span>)/, `$1<span data-pv="name2">${esc(v.name || "Kategori")}</span>$2`);
  const tabsRow = all.filter((x) => !x.parent_id && x.status === "active" && x.in_menu && x.id !== c?.id).slice(0, 3);
  h = h.replace(/(<span style="flex: 1; display: flex; gap: 16px; border-bottom[^"]*">)[\s\S]*?(<\/span><\/div>)/, (_m, a: string, b: string) => `${a}${tabsRow.map((x) => `<span style="padding: 8px 0">${esc(x.name)}</span>`).join("")}<span data-pv="name3" style="padding: 8px 0; color: #2F74EB; font-weight: 500; border-bottom: 2px solid #4285F4">${esc(v.name || "Kategori")}</span>${b}`);
  // Tombol simpan.
  h = h.replace(rx(`<a href="/admin/kategori"( class=ob-anim[^>]*>)(${SVG})Simpan &(?:amp;)? publikasikan</a>`), `<a href="#" data-cf-action="publish"$1$2${edit ? "Simpan perubahan" : "Simpan & publikasikan"}</a>`);
  h = h.replace(/<a href="\/admin\/kategori"([^>]*)>Simpan sebagai draf<\/a>/, '<a href="#" data-cf-action="draft"$1>Simpan sebagai draf</a>');
  // Keadaan desain: berhasil/validasi disembunyikan (umpan balik lewat toast & sorot isian).
  h = h.replace(/<section style="[^"]*"><span style="[^"]*">STATE · BERHASIL DISIMPAN<\/span>[\s\S]*?<\/section>/, "");
  h = h.replace(/<section style="[^"]*"><span style="[^"]*">STATE · VALIDASI GAGAL<\/span>[\s\S]*?<\/section>/, "");
  // Hapus kategori (hanya mode edit).
  const delRe = /<section style="([^"]*border: 2px solid #F5C2C2)"><span style="[^"]*">STATE · KONFIRMASI HAPUS<\/span>([\s\S]*?)<\/section>/;
  if (!edit || !opts.canManage) {
    h = h.replace(delRe, "");
  } else {
    h = h.replace(delRe, (_m, st: string, body: string) => {
      const others = all.filter((x) => x.id !== c!.id);
      let b = body
        .replace(/(<strong style="font-size: 17px; font-weight: 700">)[^<]*(<\/strong>)/, `$1Hapus kategori “${esc(c!.name)}”?$2`)
        .replace(/(<span style="font-size: 13px; line-height: 1.5; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${c!.articles ? `Kategori ini punya ${num(c!.articles)} artikel${c!.followers ? ` dan ${num(c!.followers)} pengikut` : ""}. Artikel tidak ikut terhapus — pindahkan ke kategori lain.` : "Kategori ini belum punya artikel."}$2`)
        .replace(rx(`(>)Pindahkan \\d+ artikel ke<span style="([^"]*)">Analisis(${SVG})</span>`), (_m, gt: string, st2: string, svg: string) =>
          `${gt}Pindahkan ${num(c!.articles)} artikel ke<span style="position: relative; display: block"><select data-cf="move_to" style="${st2}; width: 100%; appearance: none; -webkit-appearance: none; font-family: inherit; color: #0B0B0F"><option value="">— Pilih kategori tujuan</option>${others.map((x) => `<option value="${x.id}" data-slug="${esc(x.slug)}">${esc(x.name)}</option>`).join("")}</select><span aria-hidden="true" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; display: flex">${svg}</span></span>`,
        )
        .replace(/<input type="checkbox" checked style="([^"]*)">Alihkan URL lama \/opini ke \/analisis \(301\)/, `<input type="checkbox" data-cf="redirect" checked style="$1"><span data-cf-redirect-label>Alihkan URL lama /${esc(c!.slug)} ke kategori tujuan (301)</span>`)
        .replace(/>Ketik OPINI untuk konfirmasi<input value="OPINI" placeholder="" style="([^"]*)">/, `>Ketik ${esc(c!.slug.toUpperCase())} untuk konfirmasi<input data-cf="confirm" data-expect="${esc(c!.slug.toUpperCase())}" value="" autocomplete="off" style="$1">`)
        .replace(/<a href="\/admin\/kategori"([^>]*)>Batal<\/a>/, '<a href="/admin/kategori"$1>Batal</a>')
        .replace(rx(`<a href="/admin/kategori"([^>]*>)(${SVG})Hapus kategori</a>`), '<a href="#" data-cf-action="delete"$1$2Hapus kategori</a>');
      if (!c!.articles) b = b.replace(/<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Pindahkan[\s\S]*?<\/label>\s*<label style="display: flex; align-items: center[\s\S]*?<\/label>/, "");
      return `<section id="hapus" data-cf-delete style="${st}">${b}</section>`;
    });
  }
  h = h.replace(rx(`<a href="/admin/kategori"([^>]*>(?:${SVG})?)Kembali ke kategori</a>`), '<a href="/admin/kategori"$1Kembali ke kategori</a>');
  void blocks;
  return h;
}

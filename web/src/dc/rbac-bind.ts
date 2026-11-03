import "server-only";
import type { RbacState } from "@/lib/admin";
import type { Category } from "@/lib/types";
import { esc, initials } from "./bind";

/**
 * Binder halaman "Role & Akses" (admin-roles): kartu peran, matriks izin, undangan staf, dan anggota staf
 * diisi dari database (tabel roles, permissions, role_permissions, staff_invitations, users).
 * Interaksi (ubah matriks, role baru, undang, cabut, ubah role, blokir) dijalankan enhancer "rbac".
 */

const SVG = String.raw`<svg(?:(?!<\/svg>)[\s\S])*<\/svg>`;
const re = (s: string, f = "") => new RegExp(s, f);

function grab(h: string, r: RegExp, where: string): RegExpExecArray {
  const m = r.exec(h);
  if (!m) throw new Error(`rbac-bind: ${where} tidak ditemukan`);
  return m;
}

const fmtDay = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(new Date(iso));
const SHORT: Record<string, string> = { superadmin: "Super", admin: "Admin", editor: "Editor", author: "Penulis", ads: "Ads", data: "Data", support: "Support" };

export function bindRoles(html: string, opts: { rbac: RbacState; categories: Category[] }): string {
  const { rbac, categories } = opts;
  let h = html;
  const roles = rbac.roles.filter((r) => r.is_staff);

  // ---------------------------------------------------------------- tombol kepala halaman
  h = h.replace(re(`<a href="#"([^>]*>)(${SVG})Log aktivitas</a>(?=<a href="#" class=ob-anim)`), '<a href="/admin/aktivitas"$1$2Log aktivitas</a>');
  h = h.replace(re(`<a href="#"( class=ob-anim[^>]*>)(${SVG})Role baru</a>`), '<a href="#" data-rb-action="new-role"$1$2Role baru</a>');
  // Form role baru (tersembunyi sampai tombol ditekan).
  const newRole = `<section data-rb="new-role" hidden style="background: #FFFFFF; border: 1px solid #C9DBFB; border-radius: 24px; padding: 18px; display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end"><label style="flex: 1 1 200px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Nama role<input data-rb="role-name" maxlength="40" placeholder="mis. Analis Pasar" style="min-height: 46px; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EBF7; font-size: 15px; color: #0B0B0F"></label><label style="flex: 2 1 280px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #5F6B7D">Deskripsi<input data-rb="role-desc" maxlength="160" placeholder="Tugas singkat role ini" style="min-height: 46px; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EBF7; font-size: 15px; color: #0B0B0F"></label><a href="#" data-rb-action="create-role" class=ob-anim style="min-height: 46px; display: flex; align-items: center; padding: 0 22px; border-radius: 999px; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; font-size: 14px; font-weight: 500">Buat role</a><a href="#" data-rb-action="cancel-role" style="min-height: 46px; display: flex; align-items: center; padding: 0 12px; font-size: 14px; color: #5F6B7D">Batal</a><span style="flex-basis: 100%; font-size: 12px; color: #5F6B7D">Role baru dibuat tanpa izin; centang izinnya di matriks lalu simpan.</span></section>`;

  // ---------------------------------------------------------------- kartu peran
  const cardsM = grab(h, /<div class="scroll-x" style="display: flex; gap: 12px; overflow-x: auto">((?:<a href="\/admin\/role"[\s\S]*?<\/a>)+)<\/div>/, "kartu role");
  const cards = cardsM[1]!.match(/<a href="\/admin\/role"[\s\S]*?<\/a>/g)!;
  const plain = cards.find((c) => !c.includes("ob-anim"))!;
  const icons = cards.map((c) => grab(c, re(`<span style="flex: none; width: 36px; height: 36px;[^"]*">${SVG}</span>`), "ikon role")[0]);
  const built = roles
    .map((r, i) => {
      let c = plain
        .replace('<a href="/admin/role"', `<a href="#matriks" data-rb-role="${esc(r.key)}"`)
        .replace(re(`<span style="flex: none; width: 36px; height: 36px;[^"]*">${SVG}</span>`), icons[i % icons.length]!)
        .replace(/(<span style="font-size: 22px; font-weight: 500">)\d+(<\/span>)/, `$1${r.members}$2`)
        .replace(/(<strong style="font-size: 15px; font-weight: 700">)[^<]*(<\/strong>)/, `$1${esc(r.name)}$2`)
        .replace(/(<span style="font-size: 12px; line-height: 1.4; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(r.description || "Role buatan admin.")}$2`);
      if (!r.is_system && r.members === 0) {
        c = c.replace(/<\/a>$/, `<span role="button" tabindex="0" data-rb-delete-role="${esc(r.key)}" style="font-size: 12px; color: #B3261E; text-decoration: underline; align-self: flex-start">Hapus role</span></a>`);
      }
      return c;
    })
    .join("");
  h = h.replace(cardsM[0], `${newRole}<div class="scroll-x" style="display: flex; gap: 12px; overflow-x: auto">${built}</div>`);

  // ---------------------------------------------------------------- matriks izin
  h = h.replace(re(`<a href="#"( class=ob-anim[^>]*)>Simpan perubahan</a>`), '<a href="#" data-rb-action="save-matrix"$1>Simpan perubahan</a>');
  h = h.replace('Klik lingkaran untuk mengubah · perubahan berlaku setelah disimpan', "Klik lingkaran untuk mengubah · berlaku untuk semua anggota role setelah disimpan · Super Admin selalu punya semua izin");
  h = h.replace('<h2 style="margin: 0; font-size: 18px; font-weight: 700">Matriks izin</h2>', '<h2 id="matriks" style="margin: 0; font-size: 18px; font-weight: 700">Matriks izin</h2>');
  const gridM = grab(h, /<div style="min-width: 760px">([\s\S]*?)<\/div><\/div><div style="height: 10px"><\/div><\/section>/, "matriks");
  const inner = gridM[1]!;
  const headRow = grab(inner, /<div style="display: grid; grid-template-columns: 2.2fr repeat\(7, minmax\(44px, 1fr\)\);[^"]*align-items: end">[\s\S]*?<\/div>/, "kepala matriks")[0];
  const groupDiv = grab(inner, /<div style="(padding: 14px 18px 6px;[^"]*)">KONTEN<\/div>/, "grup izin");
  const rowM = grab(inner, /<div style="(display: grid; grid-template-columns: 2\.2fr repeat\(7, minmax\(44px, 1fr\)\); gap: 8px; padding: 6px 18px; align-items: center)">([\s\S]*?)<\/div>/, "baris izin");
  const labelSpan = grab(rowM[2]!, /<span style="display: flex; flex-direction: column">[\s\S]*?<\/span><\/span>/, "label izin")[0];
  const onBtn = grab(inner, re(`<button role="checkbox" aria-checked="true" aria-label="[^"]*" style="([^"]*)">(${SVG})</button>`), "lingkaran aktif");
  const offBtn = grab(inner, /<button role="checkbox" aria-checked="false" aria-label="[^"]*" style="([^"]*)"><\/button>/, "lingkaran mati");
  const head = headRow
    .replace("repeat(7, minmax(44px, 1fr))", `repeat(${roles.length}, minmax(44px, 1fr))`)
    .replace(/(<span>Izin<\/span>)[\s\S]*(<\/div>)$/, (_m, a: string, b: string) => a + roles.map((r) => `<span style="text-align: center" title="${esc(r.name)}">${esc(SHORT[r.key] ?? r.name)}</span>`).join("") + b);
  let lastGroup = "";
  const rows = rbac.permissions
    .map((p) => {
      let out = "";
      if (p.group !== lastGroup) {
        lastGroup = p.group;
        out += `<div style="${groupDiv[1]}">${esc(p.group)}</div>`;
      }
      const label = labelSpan.replace(/(<span style="font-size: 14px">)[^<]*(<\/span>)/, `$1${esc(p.label)}$2`).replace(/(monospace; font-size: 11px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(p.key)}$2`);
      const cells = roles
        .map((r) => {
          const on = r.key === "superadmin" || (rbac.matrix[r.key] ?? []).includes(p.key);
          const lock = r.key === "superadmin";
          const aria = `${esc(p.label)}: ${esc(r.name)}`;
          const attrs = `data-rb-cell data-role="${esc(r.key)}" data-perm="${esc(p.key)}"${lock ? ' aria-disabled="true" title="Super Admin selalu punya semua izin"' : ""}`;
          const btn = on
            ? `<button type="button" role="checkbox" aria-checked="true" aria-label="${aria}" ${attrs} style="${onBtn[1]}; cursor: ${lock ? "not-allowed" : "pointer"}${lock ? "; opacity: .55" : ""}">${onBtn[2]}</button>`
            : `<button type="button" role="checkbox" aria-checked="false" aria-label="${aria}" ${attrs} style="${offBtn[1]}; cursor: pointer"></button>`;
          return `<span style="display: flex; justify-content: center">${btn}</span>`;
        })
        .join("");
      return out + `<div style="${rowM[1]!.replace("repeat(7, minmax(44px, 1fr))", `repeat(${roles.length}, minmax(44px, 1fr))`)}">${label}${cells}</div>`;
    })
    .join("");
  h = h.replace(gridM[0], `<div data-rb="matrix" data-on-style="${esc(onBtn[1]!)}" data-off-style="${esc(offBtn[1]!)}" data-check="${esc(onBtn[2]!)}" style="min-width: ${Math.max(560, 260 + roles.length * 64)}px">${head}${rows}</div></div><div style="height: 10px"></div></section>`);

  // ---------------------------------------------------------------- alur undangan (teks sesuai perilaku nyata)
  h = h.replace(">Link 48 jam + 2FA<", ">Masuk/daftar ≤ 48 jam<").replace(">Verifikasi<", ">Masuk dengan email itu<");
  h = h.replace(">Staf wajib mengaktifkan verifikasi 2 langkah<", ">Role diterapkan otomatis saat pemilik email masuk atau mendaftar (berlaku 48 jam).<");

  // ---------------------------------------------------------------- form undangan
  h = h.replace(/<input value="" placeholder="nama@oceanbird\.id" style="([^"]*)">/, '<input type="email" data-rb="invite-email" autocomplete="off" inputmode="email" placeholder="nama@oceanbird.id" style="$1">');
  h = h.replace(re(`(>Role)<span style="([^"]*)">Penulis(${SVG})</span>`), (_m, pre: string, st: string, svg: string) => {
    const opts = roles
      .filter((r) => r.key !== "superadmin")
      .map((r) => `<option value="${esc(r.key)}"${r.key === "author" ? " selected" : ""}>${esc(r.name)}</option>`)
      .join("");
    return `${pre}<span style="position: relative; display: block"><select data-rb="invite-role" aria-label="Role" style="${st}; width: 100%; appearance: none; -webkit-appearance: none; font-family: inherit; color: #0B0B0F; cursor: pointer">${opts}</select><span aria-hidden="true" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); pointer-events: none; display: flex">${svg}</span></span>`;
  });
  h = h.replace(re(`(>Kategori yang dipegang)<span style="[^"]*">Saham, Komoditas${SVG}</span>`), (_m, pre: string) => {
    const chips = categories
      .map((c) => `<button type="button" data-rb-cat="${esc(c.slug)}" aria-pressed="false" style="min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid #E3EBF7; background: #FFFFFF; color: #0B0B0F; font-size: 13px; cursor: pointer">${esc(c.name)}</button>`)
      .join("");
    return `${pre} <span style="font-size: 12px">(opsional)</span><span data-rb="invite-cats" style="display: flex; flex-wrap: wrap; gap: 6px">${chips}</span>`;
  });
  h = h.replace(re(`<a href="#"( class=ob-anim[^>]*>)(${SVG})Kirim undangan</a>`), '<a href="#" data-rb-action="invite"$1$2Kirim undangan</a>');

  // ---------------------------------------------------------------- undangan tertunda
  const invSec = grab(h, /(<h2 style="margin: 0; font-size: 18px; font-weight: 700">Undangan tertunda<\/h2>[\s\S]*?<\/div>)((?:<div style="display: flex; align-items: center; gap: 12px; min-height: 58px;[\s\S]*?<\/span><\/div>)+)(<\/section>)/, "undangan");
  const invRows = invSec[2]!.match(/<div style="display: flex; align-items: center; gap: 12px; min-height: 58px;[\s\S]*?<\/span><\/div>/g)!;
  const rowTpl = invRows[1]!; // border-top
  const pillWait = grab(invRows[0]!, /<span style="([^"]*)">Menunggu<\/span>/, "pill menunggu");
  const pillExp = grab(invRows[1]!, /<span style="([^"]*)">Kedaluwarsa<\/span>/, "pill kedaluwarsa");
  const pill = (status: string) =>
    status === "pending"
      ? `<span style="${pillWait[1]}">Menunggu</span>`
      : status === "expired"
        ? `<span style="${pillExp[1]}">Kedaluwarsa</span>`
        : `<span style="${pillWait[1]!.replace("#854D0E", "#166534").replace("#FEF3C7", "#DCFCE7")}">Diterima</span>`;
  const invList = rbac.invitations.length
    ? rbac.invitations
        .map((v, i) => {
          let r = rowTpl
            .replace(/(font-size: 12px; font-weight: 700">)DP(<\/span>)/, `$1${esc(initials(v.email.split("@")[0]!.replace(/[._-]+/g, " ")))}$2`)
            .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(v.email)}$2`)
            .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(v.role_name)} · dikirim ${esc(fmtDay(v.created_at))}${v.categories.length ? ` · ${esc(v.categories.join(", "))}` : ""}$2`)
            .replace(/<span style="[^"]*">Kedaluwarsa<\/span>/, pill(v.status));
          if (i === 0) r = r.replace("border-top: 1px solid #E3EBF7", "border-top: 0");
          if (v.status === "pending" || v.status === "expired") {
            r = r.replace(/<\/div>$/, `<a href="#" data-rb-revoke="${esc(v.id)}" title="Batalkan undangan" style="font-size: 13px; color: #B3261E; text-decoration: underline">Batalkan</a></div>`);
          }
          return r;
        })
        .join("")
    : `<div style="font-size: 14px; color: #5F6B7D; padding: 6px 0">Belum ada undangan.</div>`;
  h = h.replace(invSec[0], `${invSec[1]}${invList}${invSec[3]}`);

  // ---------------------------------------------------------------- anggota staf (ubah role / blokir)
  const roleOpts = (cur: string) =>
    rbac.roles.map((r) => `<option value="${esc(r.key)}"${r.key === cur ? " selected" : ""}>${esc(r.is_staff ? r.name : `${r.name} (cabut akses)`)}</option>`).join("");
  const members = rbac.staff
    .map((m, i) => {
      const self = m.id === rbac.me;
      const blocked = !!m.blocked_at;
      return `<div data-rb-member="${esc(m.id)}" style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-height: 58px; padding: 8px 0; border-top: ${i ? "1px solid #E3EBF7" : "0"}"><span style="flex: none; width: 36px; height: 36px; border-radius: 999px; background: #E5ECFF; color: #1E40AF; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700">${esc(initials(m.full_name))}</span><span style="flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column"><strong style="font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(m.full_name)}${self ? " (Anda)" : ""}${blocked ? ' <span style="color: #B3261E">· diblokir</span>' : ""}</strong><span style="font-size: 12px; color: #5F6B7D; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${esc(m.email)}${m.desks.length ? ` · ${esc(m.desks.join(", "))}` : ""}</span></span><select data-rb-user-role="${esc(m.id)}" aria-label="Role ${esc(m.full_name)}"${self ? ' disabled title="Role sendiri tidak bisa diubah"' : ""} style="min-height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 14px; font-family: inherit; color: #0B0B0F">${roleOpts(m.role)}</select>${self ? "" : `<a href="#" data-rb-block="${esc(m.id)}" data-blocked="${blocked}" style="font-size: 13px; color: ${blocked ? "#166534" : "#B3261E"}; text-decoration: underline">${blocked ? "Buka blokir" : "Blokir"}</a>`}</div>`;
    })
    .join("");
  const staffSec = `<section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 6px; min-width: 0"><div style="display: flex; align-items: flex-start; gap: 12px"><span style="display: flex; flex-direction: column; gap: 4px; min-width: 0"><h2 style="margin: 0; font-size: 18px; font-weight: 700">Anggota staf</h2><span style="font-size: 13px; color: #5F6B7D">${rbac.staff.length} orang · ganti role langsung berlaku; pilih “Pembaca” untuk mencabut akses panel</span></span></div>${members || '<div style="font-size: 14px; color: #5F6B7D">Belum ada staf.</div>'}</section>`;
  const endInv = h.indexOf(invSec[3]!, h.indexOf(">Undangan tertunda<")) + invSec[3]!.length;
  h = h.slice(0, endInv) + staffSec + h.slice(endInv);

  return h;
}

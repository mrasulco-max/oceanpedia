import "server-only";
import type { AdminSlot, AdminUser, AdsState, Campaign, FeedRow, MarketState, SymbolState, UserDetail, UserStats } from "@/lib/admin";
import type { Category } from "@/lib/types";
import { esc, initials } from "./bind";
import {
  actionBtn,
  ago,
  blocks,
  closeOf,
  compact,
  dotCells,
  dotGrid,
  emptyRow,
  field,
  flowSteps,
  fmtDate,
  grab,
  input,
  num,
  pill,
  recolorAvatar,
  rx,
  select,
  statCard,
  SVG,
  switchBtn,
  tabsBar,
  type Dot,
  type Step,
  type Tone,
} from "./kit";

/**
 * Binder Pengguna (admin-users), Iklan (admin-ads), Data Pasar (admin-market) dan Detail simbol (admin-symbol).
 * Data dari tabel users/user_warnings/comment_reports, ad_campaigns/ad_slots, instruments/market_cache/market_usage.
 */

const WIB = "Asia/Jakarta";
const dayKey = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: WIB }).format(d); // YYYY-MM-DD
const shortDate = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: WIB, day: "numeric", month: "short" }).format(new Date(iso)).replace(".", "");

/** Ganti seluruh baris tabel (template baris terpilih + baris biasa) di antara baris pertama & terakhir. */
function replaceRows(h: string, rowPrefix: string, render: (tplSel: string, tpl: string) => string): string {
  const rows = blocks(h, rowPrefix);
  if (rows.length < 2) throw new Error("binder admin: baris tabel tidak ditemukan");
  const sel = rows.find((r) => r.html.includes("background: #F4F8FF")) ?? rows[0]!;
  const plain = rows.find((r) => !r.html.includes("background: #F4F8FF")) ?? rows[1]!;
  return h.slice(0, rows[0]!.start) + render(sel.html, plain.html) + h.slice(rows[rows.length - 1]!.end);
}

/** Tombol buka/tutup detail di ujung baris → tautan. */
function detailLink(row: string, href: string, open: boolean): string {
  return row.replace(rx(`<button aria-label="(?:Buka|Tutup) detail" aria-expanded="(?:true|false)" style="([^"]*)transform: rotate\\(\\d+deg\\)">(${SVG})</button>`), (_m, st: string, svg: string) =>
    `<a href="${href}" aria-label="${open ? "Tutup" : "Buka"} detail" aria-expanded="${open}" style="${st}transform: rotate(${open ? 180 : 0}deg)">${svg}</a>`,
  );
}

/** Isi sel (span min-width: 0) ke-i pada baris grid. */
function cells(row: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = row.indexOf('<span style="min-width: 0">', from);
    if (i < 0) break;
    const end = closeOf(row, i, "span");
    out.push(row.slice(i, end));
    from = end;
  }
  return out;
}
function setCells(row: string, values: (string | null)[]): string {
  const cs = cells(row);
  let out = row;
  cs.forEach((c, i) => {
    const v = values[i];
    if (v !== null && v !== undefined) out = out.replace(c, `<span style="min-width: 0">${v}</span>`);
  });
  return out;
}
const mono = (t: string, color = "#0B0B0F") => `<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: ${color}">${esc(t)}</span>`;
const avatar = (txt: string, seed: string) =>
  recolorAvatar(`<span style="flex: none; width: 32px; height: 32px; border-radius: 999px; background: #E5ECFF; color: #1E40AF; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700">${esc(txt)}</span>`, seed);
const person = (av: string, title: string, sub: string) =>
  `<span style="display: flex; align-items: center; gap: 10px">${av}<span style="display: flex; flex-direction: column; line-height: 1.3; min-width: 0"><strong style="font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${esc(title)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(sub)}</span></span></span>`;

/** Baris info "label — nilai" di panel detail. */
function infoRows(rows: [string, string][]): string {
  return rows
    .map(
      ([k, v], i) =>
        `<div style="display: flex; justify-content: space-between; gap: 14px; padding: 11px 0; border-top: ${i ? "1px solid #E3EBF7" : "0"}; font-size: 14px"><span style="color: #5F6B7D">${esc(k)}</span><span style="text-align: right; font-weight: 500">${esc(v)}</span></div>`,
    )
    .join("");
}

/** 3 minggu terakhir (Senin–Minggu) dari daftar hari. */
function weeks(days: { day: string; active: boolean; reported: boolean }[]): [string, Dot[]][] {
  const today = dayKey();
  const out: [string, Dot[]][] = [];
  for (let w = 0; w < 3; w++) {
    const ds = days.slice(w * 7, w * 7 + 7).map((d): Dot => {
      if (d.reported) return "missed";
      if (d.active) return "done";
      if (d.day > today) return "scheduled";
      if (d.day === today) return "running";
      return "empty";
    });
    out.push([`Mg ${w + 1}`, ds]);
  }
  return out;
}

// ======================================================================= pengguna
const USER_TABS: [string, string, keyof UserStats][] = [
  ["reader", "Pembaca", "readers"],
  ["staff", "Staf", "staff"],
  ["reported", "Dilaporkan", "reported"],
  ["blocked", "Diblokir", "blocked"],
];
const USER_STATUS: Record<AdminUser["status"], [string, Tone]> = { active: ["Aktif", "green"], warned: ["Peringatan", "yellow"], blocked: ["Diblokir", "red"] };

function userStatus(u: AdminUser): string {
  if (u.status === "blocked") return pill(u.blocked_until ? `Diblokir s/d ${shortDate(u.blocked_until)}` : "Diblokir permanen", "red");
  if (!u.verified) return pill("Belum verifikasi", "gray");
  const [l, t] = USER_STATUS[u.status];
  return pill(l, t);
}

export function bindUsers(
  html: string,
  opts: { list: AdminUser[]; stats: UserStats; tab: string; q: string; detail: UserDetail | null; canBan: boolean; canWarn: boolean; canInvite: boolean; me: string },
): string {
  const { list, stats: st, tab, q, detail, canBan, canWarn, canInvite, me } = opts;
  let h = html;
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ tab, ...(q ? { q } : {}), ...extra });
    return `/admin/pengguna?${p}`;
  };

  // Kepala & tombol.
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Ekspor</a>`), '<a href="#" data-us-action="csv"$1$2Ekspor CSV</a>');
  if (!canInvite) h = h.replace(rx(`<a href="/admin/role"[^>]*>(?:${SVG})?Undang staf</a>`), "");

  // Kartu.
  h = statCard(h, "Pengguna terdaftar", num(st.total), pill(st.new_month ? `+${num(st.new_month)} bulan ini` : "Stabil", st.new_month ? "lime" : "gray"), `${num(st.readers)} pembaca · ${num(st.staff)} staf. Bulan lalu +${num(st.prev_month)}.`, { arrow: st.new_month > st.prev_month ? "up" : null });
  h = statCard(h, "Aktif harian", num(st.active_24h), pill(st.total ? `${Math.round((st.active_24h / Math.max(1, st.total)) * 100)}% akun` : "—", "blue"), "Masuk atau memperbarui sesi dalam 24 jam terakhir.", { rename: "Aktif 24 jam" });
  h = statCard(h, "Laporan terbuka", num(st.reported), pill(st.reported ? "Perlu cek" : "Aman", st.reported ? "orange" : "green"), `Pengguna dengan komentar dilaporkan (30 hari). ${num(st.warnings_week)} peringatan minggu ini.`, { rename: "Dilaporkan" });
  h = statCard(h, "Diblokir", num(st.blocked), pill("Saat ini", "gray"), `${num(st.blocked_permanent)} permanen, ${num(st.blocked_temporary)} sementara.`);

  // Tab + pencarian.
  h = tabsBar(h, USER_TABS.map(([k, l, key]) => [k, l, st[key] as number, `/admin/pengguna?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`] as [string, string, number, string]), tab);
  h = h.replace(/(<div role="tablist" class="scroll-x"[^>]*>[\s\S]*?<\/div>)(<\/div>)/, `$1<input type="search" data-us="search" value="${esc(q)}" placeholder="Cari nama / email" aria-label="Cari pengguna" style="margin-left: auto; min-height: 44px; min-width: 200px; padding: 0 16px; border-radius: 999px; border: 1px solid #E3EBF7; font-size: 14px">$2`);

  // Tabel.
  const selId = detail?.user.id ?? "";
  h = replaceRows(h, '<div style="display: grid; grid-template-columns: 2.2fr .9fr .7fr .9fr .9fr 36px; gap: 12px; align-items: center; min-height: 60px;', (tplSel, tpl) => {
    if (!list.length) return emptyRow(q ? `Tidak ada pengguna yang cocok dengan “${q}”.` : "Belum ada pengguna di tab ini.");
    return list
      .map((u) => {
        const on = u.id === selId;
        let r = (on ? tplSel : tpl).replace("<div ", `<div data-us-row="${u.id}" data-href="${esc(href({ id: u.id }))}" `);
        r = setCells(r, [
          person(avatar(initials(u.full_name), u.email), u.full_name + (u.id === me ? " (Anda)" : ""), u.email),
          pill(u.role_name, u.is_staff ? "blue" : "gray"),
          mono(u.last_login_at ? ago(u.last_login_at) : "—"),
          mono(u.platforms.join(", ") || "—"),
          userStatus(u),
          null,
        ]);
        return detailLink(r, on ? href({}) : href({ id: u.id }), on);
      })
      .join("");
  });

  // Alur moderasi & panel detail.
  const flowRe = /<span style="font-size: 13px; color: #5F6B7D">Alur moderasi · [^<]*<\/span>/;
  const panelStart = h.indexOf('<div class="" style="flex: 1 1 380px;');
  if (!detail) {
    const fm = flowRe.exec(h);
    if (fm) {
      const ws = h.lastIndexOf('<div style="display: flex; flex-direction: column; gap: 8px">', fm.index);
      h = h.slice(0, ws) + h.slice(closeOf(h, ws));
    }
    const ps = h.indexOf('<div class="" style="flex: 1 1 380px;');
    if (ps >= 0) {
      const pe = closeOf(h, ps);
      h = h.slice(0, ps) + `<div class="" style="flex: 1 1 380px; min-width: 0"><section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 22px">${emptyRow("Pilih pengguna untuk melihat detail.")}</section></div>` + h.slice(pe);
    }
    return h;
  }
  if (panelStart < 0) throw new Error("binder admin: panel pengguna tidak ditemukan");
  const u = detail.user;
  const lastWarn = detail.warnings[0];
  const steps: Step[] = [
    { when: fmtDate(u.created_at), title: "Bergabung", sub: u.verified ? "Email terverifikasi" : "Belum verifikasi email", state: "done" },
    { when: u.reported ? "30 hari" : "—", title: "Laporan", sub: u.reported ? `${u.reported} komentar dilaporkan` : "Belum ada laporan", state: u.reported ? "done" : "todo" },
    { when: lastWarn ? fmtDate(lastWarn.created_at, true) : "—", title: "Peringatan", sub: lastWarn ? `${u.warnings}× · ${lastWarn.reason}` : "Notifikasi ke akun", state: u.warnings ? "done" : "todo" },
    { when: u.blocked_until ? `s/d ${shortDate(u.blocked_until)}` : "Jika terulang", title: "Blokir sementara", sub: "7 hari · sesi dicabut", state: u.status === "blocked" && u.blocked_until ? "done" : "todo" },
    { when: "Jika terulang lagi", title: "Blokir permanen", sub: u.block_reason || "Butuh Admin", state: u.status === "blocked" && !u.blocked_until ? "done" : "todo" },
  ];
  const firstTodo = steps.findIndex((s) => s.state === "todo");
  if (firstTodo > 0 && u.reported) steps[firstTodo]!.state = "current";
  h = flowSteps(h, flowRe, `Alur moderasi · ${u.full_name}`, steps);

  const ps = h.indexOf('<div class="" style="flex: 1 1 380px;');
  const pe = closeOf(h, ps);
  let p = h.slice(ps, pe);
  p = p.replace(/(<span style="flex: none; width: 56px; height: 56px; border-radius: 999px; )background: #[0-9A-Fa-f]{6}; color: #[0-9A-Fa-f]{6}(;[^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string) => recolorAvatar(`${a}background: #000000; color: #000000${b}${esc(initials(u.full_name))}${c}`, u.email));
  p = p.replace(/(<strong style="font-size: 18px; font-weight: 700">)[^<]*(<\/strong><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(u.full_name)}$2${esc(u.email)} · bergabung ${esc(fmtDate(u.created_at))}$3`);
  p = p.replace(/(<span style="margin-left: auto">)<span style="display: inline-flex[^>]*>[^<]*<\/span>(<\/span><\/div>)/, `$1${userStatus(u)}$2`);
  const info: [string, string][] = [
    ["Role", u.role_name],
    ["Masuk terakhir", u.last_login_at ? `${fmtDate(u.last_login_at, true)} (${ago(u.last_login_at)})` : "Belum pernah"],
    ["Perangkat", u.platforms.join(", ") || "—"],
    ["Artikel disimpan", num(u.bookmarks)],
    ["Komentar", `${num(u.comments)} · ${num(u.reported)} dilaporkan`],
    ["Watchlist", `${num(u.watchlist)} aset`],
  ];
  if (u.status === "blocked") info.push(["Diblokir", `${u.blocked_until ? `s/d ${fmtDate(u.blocked_until, true)}` : "Permanen"}${u.block_reason ? ` · ${u.block_reason}` : ""}`]);
  p = p.replace(/(<div style="display: flex; flex-direction: column">)<div style="display: flex; justify-content: space-between[\s\S]*?(<\/div><div style="display: flex; flex-direction: column; gap: 10px">)/, `$1${infoRows(info)}$2`);
  p = p.replace(">Aktivitas membaca 3 minggu<", ">Aktivitas 3 minggu<");
  p = dotGrid(p, "Aktivitas 3 minggu", weeks(detail.activity), dotCells(html));
  p = p.replace(">Hijau = aktif · merah = komentar dilaporkan hari itu<", ">Hijau = aktif (masuk, komentar, simpan) · merah = komentar dilaporkan<");
  const self = u.id === me;
  const acts = [
    canBan && !self && u.status === "blocked" ? actionBtn(p, "Blokir 7 hari", `data-us-action="unblock" data-id="${u.id}"`, "Buka blokir") : "",
    canBan && !self && u.status !== "blocked" ? actionBtn(p, "Blokir 7 hari", `data-us-action="suspend" data-days="7" data-id="${u.id}"`) : "",
    canBan && !self && !(u.status === "blocked" && !u.blocked_until) && u.status === "blocked" ? actionBtn(p, "Blokir 7 hari", `data-us-action="suspend" data-days="0" data-id="${u.id}"`, "Blokir permanen") : "",
    canWarn && !self ? actionBtn(p, "Kirim peringatan", `data-us-action="warn" data-id="${u.id}"`) : "",
    // Pemulihan akun: pengguna kehilangan ponsel autentikator & kode cadangan.
    canBan && !self && u.totp ? actionBtn(p, "Kirim peringatan", `data-us-action="reset2fa" data-id="${u.id}"`, "Reset 2FA") : "",
  ].join("");
  p = p.replace(/(<div style="display: flex; gap: 10px; flex-wrap: wrap">)[\s\S]*?(<\/div><\/section>)/, `$1${acts || '<span style="font-size: 13px; color: #5F6B7D">Tidak ada aksi untuk akun ini.</span>'}$2`);
  return h.slice(0, ps) + p + h.slice(pe);
}

// ======================================================================= iklan
const AD_STATUS: Record<Campaign["status"], [string, Tone]> = {
  pending: ["Menunggu", "yellow"],
  live: ["Tayang", "green"],
  paused: ["Dijeda", "orange"],
  rejected: ["Ditolak", "red"],
  finished: ["Selesai", "gray"],
};
const AD_TABS: [Campaign["status"], string][] = [
  ["pending", "Menunggu"],
  ["live", "Tayang"],
  ["paused", "Dijeda"],
  ["rejected", "Ditolak"],
  ["finished", "Selesai"],
];
const PLACEMENT: Record<string, string> = {
  below_header: "Billboard",
  in_content: "Medium Rectangle",
  rail_left: "Skyscraper kiri",
  rail_right: "Skyscraper kanan",
  in_feed: "Native In-Feed",
  sticky_bottom: "Mobile Banner",
};
const ABBR: Record<string, string> = { below_header: "BB", in_content: "MPU", rail_left: "SKY", rail_right: "SKY", in_feed: "NAT", sticky_bottom: "MB" };
export function slotName(s: { placement: string; width: number; height: number; surface?: string; code?: string }): string {
  const base = PLACEMENT[s.placement] ?? s.placement;
  const size = s.width && s.height ? ` ${s.width}×${s.height}` : s.width ? ` ${s.width}px` : "";
  return `${base}${size}`;
}
const slotSize = (s: { width: number; height: number }) => (s.width && s.height ? `${s.width}×${s.height}` : s.width ? `lebar ${s.width}` : "responsif");
export function docsMissing(c: Campaign): string[] {
  const m: string[] = [];
  if (!c.docs_company) m.push("Akta & NIB");
  if (c.regulated && !c.docs_license) m.push("Izin OJK/Bappebti");
  if (!c.docs_creative) m.push("Materi kreatif");
  if (!c.docs_claims) m.push("Klaim & disclaimer");
  return m;
}
const period = (c: Campaign) => `${shortDate(c.start_date)}–${shortDate(c.end_date)}`;
const days = (c: Campaign) => Math.round((Date.parse(c.end_date) - Date.parse(c.start_date)) / 86400000) + 1;
const usd = (n: number) => `$${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`;

function campaignForm(c: Campaign | null, slots: AdminSlot[]): string {
  const v = c ?? ({ name: "", advertiser: "", industry: "", slot_code: slots.find((s) => s.active)?.code ?? "", start_date: dayKey(), end_date: dayKey(new Date(Date.now() + 13 * 86400000)), regulated: false, docs_company: false, docs_license: false, docs_creative: false, docs_claims: false, creative_url: "", target_url: "", budget_usd: 0, note: "" } as unknown as Campaign);
  const chk = (k: keyof Campaign, label: string) =>
    `<label style="display: flex; align-items: center; gap: 10px; font-size: 14px; min-height: 40px"><input type="checkbox" data-adf="${k}"${v[k] ? " checked" : ""} style="width: 18px; height: 18px">${esc(label)}</label>`;
  const two = (a: string, b: string) => `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">${a}${b}</div>`;
  return `<section data-adf-form="${c?.id ?? ""}" style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 22px; display: flex; flex-direction: column; gap: 14px; min-width: 0">
<div style="display: flex; align-items: flex-start; gap: 12px"><span style="display: flex; flex-direction: column; gap: 4px"><h2 style="margin: 0; font-size: 18px; font-weight: 700">${c ? "Edit kampanye" : "Kampanye baru"}</h2><span style="font-size: 13px; color: #5F6B7D">${c ? "Kampanye tayang yang dokumennya dicabut kembali menunggu verifikasi." : "Kampanye baru selalu melewati verifikasi sebelum tayang."}</span></span></div>
${field("Nama kampanye", input('data-adf="name" maxlength="80" required', v.name))}
${two(field("Pengiklan", input('data-adf="advertiser" maxlength="80"', v.advertiser)), field("Industri", input('data-adf="industry" maxlength="40" placeholder="crypto, travel, F&B"', v.industry)))}
${field("Slot", select('data-adf="slot_code"', slots.map((s) => [s.code, `${slotName(s)} · ${s.surface === "web" ? "Web" : "Aplikasi"}${s.active ? "" : " (nonaktif)"}`]), v.slot_code))}
${two(field("Mulai", input('type="date" data-adf="start_date"', v.start_date)), field("Selesai", input('type="date" data-adf="end_date"', v.end_date)))}
${two(field("Anggaran (USD)", input('type="number" min="0" step="1" data-adf="budget_usd"', String(v.budget_usd || ""))), field("URL tujuan (https://)", input('type="url" data-adf="target_url" placeholder="https://"', v.target_url ?? "")))}
${field("URL materi kreatif (gambar)", input('type="url" data-adf="creative_url" placeholder="https://… atau unggah di Media"', v.creative_url ?? ""))}
<div style="display: flex; flex-direction: column"><strong style="font-size: 14px; font-weight: 500">Verifikasi</strong>
${chk("regulated", "Produk keuangan / kripto (wajib izin regulator)")}${chk("docs_company", "Akta & NIB perusahaan diterima")}${chk("docs_license", "Izin OJK / Bappebti diterima")}${chk("docs_creative", "Materi kreatif sesuai ukuran slot")}${chk("docs_claims", "Klaim & disclaimer risiko sudah dicek")}</div>
${field("Catatan", `<textarea data-adf="note" rows="2" maxlength="500" style="border-radius: 16px; border: 1px solid #E3EBF7; padding: 12px 16px; font-size: 14px; resize: vertical">${esc(v.note)}</textarea>`)}
<div style="display: flex; gap: 10px; flex-wrap: wrap"><a href="/admin/iklan${c ? `?id=${c.id}` : ""}" style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 0 22px; border-radius: 999px; background: #FFFFFF; color: #0B0B0F; border: 1px solid #E3EBF7; font-size: 14px; font-weight: 500">Batal</a><a href="#" data-adf-action="save" class=ob-anim style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 0 22px; border-radius: 999px; background: linear-gradient(110deg, #2563EB 0%, #4285F4 35%, #63A4FA 55%, #4285F4 75%, #2563EB 100%); color: #FFFFFF; border: 1px solid transparent; font-size: 14px; font-weight: 500">${c ? "Simpan perubahan" : "Ajukan kampanye"}</a></div>
</section>`;
}

export function bindAds(html: string, opts: { st: AdsState; status: Campaign["status"]; selected: Campaign | null; form: "new" | "edit" | null }): string {
  const { st, status, selected: sel, form } = opts;
  const manage = st.can_manage;
  let h = html;
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Kampanye baru</a>`), manage ? '<a href="/admin/iklan?id=new"$1$2Kampanye baru</a>' : "");
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Laporan</a>`), '<a href="/admin/aktivitas?group=ads"$1$2Riwayat</a>');

  // Kartu.
  const c = st.counts;
  const live = st.campaigns.filter((x) => x.status === "live");
  const activeSlots = st.slots.filter((s) => s.active);
  const fill = activeSlots.length ? Math.round(activeSlots.reduce((a, s) => a + s.fill, 0) / activeSlots.length) : 0;
  const impr = st.campaigns.reduce((a, x) => a + x.impressions, 0);
  const clicks = st.campaigns.reduce((a, x) => a + x.clicks, 0);
  h = statCard(h, "Impresi 7 hari", num(c.live), pill(c.pending ? `${c.pending} menunggu` : "Lancar", c.pending ? "yellow" : "green"), `${activeSlots.length}/${st.slots.length} slot aktif di web & aplikasi.`, { rename: "Kampanye tayang" });
  h = statCard(h, "CTR", impr ? `${((clicks / impr) * 100).toFixed(2).replace(".", ",")}%` : "—", pill(impr ? `${compact(impr)} impresi` : "Belum ada data", "gray"), "Klik ÷ impresi dari kampanye tayang & selesai.");
  h = statCard(h, "Fill rate", `${fill}%`, pill(fill >= 80 ? "Baik" : "Di bawah target", fill >= 80 ? "green" : "orange"), "Rata-rata hari terisi kampanye (30 hari), target minimal 80%.");
  h = statCard(h, "Pendapatan 7 hari", usd(live.reduce((a, x) => a + x.budget_usd, 0)), pill(`${live.length} kampanye`, "lime"), "Total nilai kontrak kampanye yang sedang tayang.", { rename: "Kontrak aktif" });

  h = tabsBar(h, AD_TABS.map(([k, l]) => [k, l, c[k] ?? 0, `/admin/iklan?status=${k}`] as [string, string, number, string]), status);

  // Tabel kampanye.
  const rowsOf = st.campaigns.filter((x) => x.status === status);
  h = replaceRows(h, '<div style="display: grid; grid-template-columns: 1.5fr 1.4fr 1fr 1fr .8fr 36px; gap: 12px; align-items: center; min-height: 60px;', (tplSel, tpl) => {
    if (!rowsOf.length) return emptyRow(status === "pending" ? "Tidak ada kampanye yang menunggu verifikasi." : "Belum ada kampanye di sini.");
    return rowsOf
      .map((x) => {
        const on = x.id === sel?.id && !form;
        const miss = docsMissing(x);
        let r = (on ? tplSel : tpl).replace("<div ", `<div data-ad-row="${x.id}" data-href="/admin/iklan?status=${x.status}&amp;id=${x.id}" `);
        const [sl, stone] = AD_STATUS[x.status];
        r = setCells(r, [
          `<span style="display: flex; flex-direction: column; gap: 2px"><strong style="font-weight: 500; line-height: 1.35">${esc(x.name)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(period(x))}</span></span>`,
          person(avatar(x.advertiser.slice(0, 2).toUpperCase(), x.advertiser), x.advertiser, x.industry || "—"),
          mono(slotName({ placement: x.slot_label, width: x.slot_width, height: x.slot_height })),
          x.status === "rejected" ? pill("Ditolak", "red") : miss.length ? pill(`${miss.length} dokumen kurang`, "yellow") : pill("Terverifikasi", "green"),
          pill(sl, stone),
          null,
        ]);
        return detailLink(r, on ? `/admin/iklan?status=${x.status}` : `/admin/iklan?status=${x.status}&id=${x.id}`, on);
      })
      .join("");
  });

  // Alur verifikasi.
  const flowRe = /<span style="font-size: 13px; color: #5F6B7D">Alur verifikasi · [^<]*<\/span>/;
  if (sel) {
    const docsOk = sel.docs_company && (!sel.regulated || sel.docs_license);
    const creativeOk = sel.docs_creative && sel.docs_claims;
    const live2 = sel.status === "live" || sel.status === "paused" || sel.status === "finished";
    const steps: Step[] = [
      { when: fmtDate(sel.created_at), title: "Pengajuan", sub: sel.created_by_name ? `oleh ${sel.created_by_name}` : "Form & kreatif diterima", state: "done" },
      { when: docsOk ? "Lengkap" : "Berikutnya", title: "Verifikasi izin", sub: sel.regulated ? "Akta/NIB + izin OJK/Bappebti" : "Akta & NIB", state: docsOk ? "done" : "current" },
      { when: creativeOk ? "Lengkap" : "Berikutnya", title: "Review kreatif", sub: "Tanpa janji imbal hasil", state: creativeOk ? "done" : docsOk ? "current" : "todo" },
      { when: live2 ? shortDate(sel.start_date) : "Berikutnya", title: sel.status === "rejected" ? "Ditolak" : "Tayang", sub: sel.status === "rejected" ? sel.note || "Lihat catatan" : `${slotName({ placement: sel.slot_label, width: sel.slot_width, height: sel.slot_height })}`, state: live2 || sel.status === "rejected" ? "done" : docsOk && creativeOk ? "current" : "todo" },
    ];
    h = flowSteps(h, flowRe, `Alur verifikasi · ${sel.name}`, steps);
  } else {
    const fm = flowRe.exec(h);
    if (fm) {
      const ws = h.lastIndexOf('<div style="display: flex; flex-direction: column; gap: 8px">', fm.index);
      h = h.slice(0, ws) + h.slice(closeOf(h, ws));
    }
  }

  // Pengiriman minggu ini per slot.
  const today = dayKey();
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.parse(today) - dow * 86400000);
  const weekDays = Array.from({ length: 7 }, (_, i) => dayKey(new Date(monday.getTime() + i * 86400000 + 12 * 3600000)));
  const delivering = st.slots.filter((s) => st.campaigns.some((x) => x.slot_code === s.code && ["live", "paused", "finished"].includes(x.status) && x.end_date >= weekDays[0]! && x.start_date <= weekDays[6]!)).slice(0, 5);
  const grid: [string, Dot[]][] = (delivering.length ? delivering : activeSlots.slice(0, 3)).map((s) => [
    ABBR[s.placement] ?? s.code.slice(0, 3).toUpperCase(),
    weekDays.map((d): Dot => {
      const cs = st.campaigns.filter((x) => x.slot_code === s.code && x.start_date <= d && x.end_date >= d && ["live", "paused", "finished"].includes(x.status));
      if (!cs.length) return d > today ? "empty" : "empty";
      if (cs.every((x) => x.status === "paused") && d <= today) return "missed";
      if (d < today) return "done";
      if (d === today) return "running";
      return "scheduled";
    }),
  ]);
  h = dotGrid(h, "Pengiriman kampanye aktif", grid, dotCells(html));
  h = h.replace(">Target tayang harian per slot<", `>Minggu ini · ${delivering.length ? `${delivering.length} slot berisi kampanye` : "belum ada kampanye tayang"}<`);
  h = h.replace("</svg></span>Terbit</span>", "</svg></span>Tayang</span>").replace("</svg></span>Terlewat</span>", "</svg></span>Dijeda</span>").replace("></span>Berjalan</span>", "></span>Hari ini</span>");

  // Inventori slot.
  const invAt = h.indexOf(">Inventori slot<");
  const secStart = h.lastIndexOf("<section ", invAt);
  const secEnd = closeOf(h, secStart, "section");
  let sec = h.slice(secStart, secEnd);
  const slotRows = blocks(sec, '<div style="display: flex; align-items: center; gap: 12px; min-height: 54px;');
  if (slotRows.length) {
    const tpl0 = slotRows[0]!.html;
    const tpl1 = slotRows[1]?.html ?? tpl0;
    const built = st.slots
      .map((s, i) =>
        (i ? tpl1 : tpl0)
          .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(PLACEMENT[s.placement] ?? s.placement)} · ${s.surface === "web" ? "Web" : "Aplikasi"}$2`)
          .replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(slotSize(s))} · ${esc(s.code)}$2`)
          .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${s.active ? `${s.fill}% terisi${s.live ? ` · ${s.live} tayang` : ""}` : "Nonaktif"}$2`)
          .replace(/<button role="switch"[\s\S]*?<\/button>/, manage ? switchBtn(s.active, `data-ad-slot="${esc(s.code)}" aria-label="${esc(slotName(s))}"`) : switchBtn(s.active, `disabled aria-label="${esc(slotName(s))}"`)),
      )
      .join("");
    sec = sec.slice(0, slotRows[0]!.start) + built + sec.slice(slotRows[slotRows.length - 1]!.end);
    h = h.slice(0, secStart) + sec + h.slice(secEnd);
  }

  // Panel kanan: form atau detail kampanye.
  const ps = h.indexOf('<div class="" style="flex: 1 1 380px;');
  if (ps < 0) throw new Error("binder admin: panel iklan tidak ditemukan");
  const pe = closeOf(h, ps);
  let p = h.slice(ps, pe);
  if (form) {
    p = `<div class="" style="flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 20px">${campaignForm(form === "edit" ? sel : null, st.slots)}</div>`;
    return h.slice(0, ps) + p + h.slice(pe);
  }
  if (!sel) {
    p = `<div class="" style="flex: 1 1 380px; min-width: 0"><section style="background: #FFFFFF; border: 1px solid #E3EBF7; border-radius: 24px; padding: 22px">${emptyRow("Pilih kampanye untuk melihat verifikasinya.")}</section></div>`;
    return h.slice(0, ps) + p + h.slice(pe);
  }
  const [sl, stone] = AD_STATUS[sel.status];
  p = p.replace(/(<h2 style="margin: 0; font-size: 18px; font-weight: 700">)[^<]*(<\/h2><span style="font-size: 13px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(sel.name)}$2${esc(sel.advertiser)} · ${esc(slotName({ placement: sel.slot_label, width: sel.slot_width, height: sel.slot_height }))} · ${days(sel)} hari$3`);
  p = p.replace(/(<span style="margin-left: auto; display: flex; gap: 8px; align-items: center; flex: none">)<span style="display: inline-flex[^>]*>[^<]*<\/span>/, `$1${pill(sl, stone)}`);
  const box = /<span style="flex: none; width: 150px; height: 125px; border-radius: 18px;[^"]*">[^<]*<\/span>/;
  p = p.replace(box, (m) =>
    sel.creative_url
      ? `<a href="${esc(sel.target_url ?? sel.creative_url)}" target="_blank" rel="noopener sponsored" style="flex: none; width: 150px; height: 125px; border-radius: 18px; overflow: hidden; background: #EDE9FE; display: flex"><img src="${esc(sel.creative_url)}" alt="Materi ${esc(sel.name)}" style="width: 100%; height: 100%; object-fit: contain"></a>`
      : m.replace(/>[^<]*<\/span>$/, `>${esc(sel.slot_width && sel.slot_height ? `${sel.slot_width} × ${sel.slot_height}` : "Responsif")}</span>`),
  );
  const desc = [sel.note && `Catatan: ${sel.note}`, sel.regulated ? "Iklan aset kripto & investasi wajib menyertakan izin regulator dan tidak boleh menjanjikan imbal hasil." : "", sel.target_url ? `Tujuan: ${sel.target_url}` : "", `Anggaran ${usd(sel.budget_usd)}.`]
    .filter(Boolean)
    .join(" ");
  p = p.replace(/(<span style="flex: 1 1 160px; font-size: 13px; line-height: 1.5; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(desc)}$2`);
  // Dokumen: baris bisa diketuk untuk menandai diterima/belum (pengelola iklan).
  const docRows = blocks(p, '<div style="display: flex; align-items: center; gap: 12px; min-height: 52px;');
  if (docRows.length) {
    const ok = grab(p, rx(`<span title="Terbit"[^>]*>${SVG}</span>`), "ikon dokumen")[0];
    const no = (rx(`<span title="Terlewat"[^>]*>${SVG}</span>`).exec(p) ?? [ok])[0];
    const editable = manage && (sel.status === "pending" || sel.status === "paused");
    const docs: [keyof Campaign, string][] = [
      ["docs_company", "Akta & NIB perusahaan"],
      ...(sel.regulated ? ([["docs_license", "Izin OJK / Bappebti"]] as [keyof Campaign, string][]) : []),
      ["docs_creative", `Materi kreatif ${sel.slot_width && sel.slot_height ? `${sel.slot_width}×${sel.slot_height}` : ""}`.trim()],
      ["docs_claims", "Klaim & disclaimer risiko"],
    ];
    const built = docs
      .map(([k, label], i) => {
        const on = !!sel[k];
        const tag = editable ? "button" : "div";
        return `<${tag} ${editable ? `type="button" data-ad-doc="${k}" data-on="${on}" title="Ketuk untuk menandai ${on ? "belum diterima" : "diterima"}" ` : ""}style="display: flex; align-items: center; gap: 12px; min-height: 52px; border: 0; border-top: ${i ? "1px solid #E3EBF7" : "0"}; width: 100%; background: transparent; padding: 0; text-align: left; font: inherit; color: inherit;${editable ? " cursor: pointer" : ""}">${on ? ok : no}<span style="flex: 1; font-size: 14px">${esc(label)}</span>${pill(on ? "Diterima" : "Belum ada", on ? "green" : "red")}</${tag}>`;
      })
      .join("");
    p = p.slice(0, docRows[0]!.start) + built + p.slice(docRows[docRows.length - 1]!.end);
  }
  const miss = docsMissing(sel);
  const a = (label: string, attrs: string, nl?: string) => actionBtn(p, label, attrs, nl);
  const acts = !manage
    ? ""
    : [
        sel.status === "pending" || sel.status === "paused" || sel.status === "live" ? a("Tolak", `data-ad-action="reject" data-id="${sel.id}"`) : "",
        sel.status === "pending" && miss.length ? a("Minta dokumen", `data-ad-action="request_docs" data-id="${sel.id}"`) : "",
        sel.status !== "finished" && sel.status !== "rejected" ? `<a href="/admin/iklan?id=${sel.id}&amp;edit=1" style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 22px; border-radius: 999px; background: #FFFFFF; color: #0B0B0F; border: 1px solid #E3EBF7; font-size: 14px; font-weight: 500; white-space: nowrap">Edit</a>` : "",
        sel.status === "rejected" ? a("Tolak", `data-ad-action="delete" data-id="${sel.id}"`, "Hapus") : "",
        sel.status === "live" ? a("Minta dokumen", `data-ad-action="pause" data-id="${sel.id}"`, "Jeda") : "",
        sel.status === "live" || sel.status === "paused" ? a("Minta dokumen", `data-ad-action="finish" data-id="${sel.id}"`, "Selesaikan") : "",
        sel.status === "pending" ? a("Setujui", `data-ad-action="approve" data-id="${sel.id}"${miss.length ? ` data-missing="${esc(miss.join(", "))}"` : ""}`, miss.length ? `Setujui (${miss.length} kurang)` : "Setujui & tayangkan") : "",
        sel.status === "paused" ? a("Setujui", `data-ad-action="resume" data-id="${sel.id}"`, "Lanjutkan tayang") : "",
      ].join("");
  p = p.replace(/(<div style="display: flex; gap: 10px; flex-wrap: wrap">)[\s\S]*?(<\/div>\s*<\/section>)/, `$1${acts || '<span style="font-size: 13px; color: #5F6B7D">Hanya-baca untuk peran Anda.</span>'}$2`);
  p = p.replace("<section ", `<section data-ad-json="${esc(JSON.stringify(sel))}" `);
  return h.slice(0, ps) + p + h.slice(pe);
}

// ======================================================================= data pasar
const CLASS: Record<FeedRow["asset_class"], string> = { equity: "Saham", index: "Indeks", crypto: "Crypto", commodity: "Komoditas", forex: "Valas" };
export type FeedStatus = "live" | "delayed" | "error" | "idle" | "inactive";
export function feedStatus(f: FeedRow, ttlS: number): FeedStatus {
  if (!f.active) return "inactive";
  if (f.error) return "error";
  if (!f.fetched_at) return "idle";
  const age = (Date.now() - Date.parse(f.fetched_at)) / 1000;
  const fresh = Math.max(f.saver_mode ? 300 : ttlS, 60) * 2;
  return age <= fresh ? "live" : "delayed";
}
const FEED_PILL: Record<FeedStatus, [string, Tone]> = {
  live: ["Live", "green"],
  delayed: ["Tertunda", "yellow"],
  error: ["Error", "red"],
  idle: ["Belum diminta", "gray"],
  inactive: ["Nonaktif", "gray"],
};
export const MARKET_TABS: [FeedStatus | "all", string][] = [
  ["all", "Semua"],
  ["live", "Live"],
  ["delayed", "Tertunda"],
  ["error", "Error"],
  ["inactive", "Nonaktif"],
];
function price(v: number, cur: string): string {
  const dec = v === 0 ? 2 : Math.abs(v) < 10 ? 4 : cur === "IDR" && Math.abs(v) >= 1000 ? 0 : 2;
  const s = new Intl.NumberFormat("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  return cur === "USD" ? `$${s}` : s;
}
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2).replace(".", ",")}%`;
const ageText = (iso: string | null) => (iso ? ago(iso).replace("baru saja", "< 1 mnt") : "—");
const displaySym = (f: { symbol: string; asset_class: string }) => (f.asset_class === "crypto" || f.asset_class === "forex" || f.asset_class === "commodity") && f.symbol.length === 6 ? `${f.symbol.slice(0, 3)}/${f.symbol.slice(3)}` : f.symbol;

/** Cincin 60 garis (kuota). */
function ring(used: number, total: number): string {
  const n = 60;
  const on = Math.round(Math.min(1, total ? used / total : 0) * n);
  const color = used / Math.max(1, total) >= 0.85 ? "#EF4444" : "#FACC15";
  let s = `<svg viewBox="0 0 180 180" width="160" height="160" role="img" aria-label="${used} kredit terpakai">`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const x1 = 90 + 62 * Math.sin(a), y1 = 90 - 62 * Math.cos(a), x2 = 90 + 84 * Math.sin(a), y2 = 90 - 84 * Math.cos(a);
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i < on ? color : "#E5E7EB"}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return s + "</svg>";
}

export function bindMarket(html: string, opts: { st: MarketState; tab: FeedStatus | "all"; src: string }): string {
  const { st, tab, src } = opts;
  const manage = st.can_manage;
  let h = html;
  const rows = st.data.map((f) => ({ f, s: feedStatus(f, st.quote_ttl_s) }));
  const count = (k: FeedStatus | "all") => (k === "all" ? rows.filter((r) => r.s !== "inactive").length : rows.filter((r) => r.s === k).length);

  h = h.replace(/(<span style="font-size: 15px; color: #5F6B7D">)Sumber: Twelve Data[^<]*(<\/span>)/, "$1Sumber: Twelve Data (saham, indeks, emas, valas) & Binance (kripto) → cache bersama di server → web & aplikasi. Kunci API hanya di server.$2");
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Log API</a>`), '<a href="/admin/aktivitas?group=system"$1$2Log API</a>');
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Tambah simbol</a>`), manage ? '<a href="/admin/simbol?new=1"$1$2Tambah simbol</a>' : "");

  // Alur insiden (masalah teratas saat ini).
  const bad = rows.filter((r) => r.s === "error" || r.s === "delayed");
  const td = st.stats.usage.find((u) => u.provider === "twelvedata");
  const limited = st.stats.usage.reduce((a, u) => a + u.limited, 0);
  const worst = bad[0];
  const steps: Step[] = worst
    ? [
        { when: worst.f.fetched_at ? fmtDate(worst.f.fetched_at, true) : "—", title: "Terdeteksi", sub: `${displaySym(worst.f)} ${worst.s === "error" ? "error" : "tertunda"}${bad.length > 1 ? ` (+${bad.length - 1})` : ""}`, state: "done" },
        { when: "Otomatis", title: "Fallback cache", sub: worst.s === "error" ? (worst.f.error.slice(0, 40) || "Simbol tidak tersedia") : "Tampilkan harga terakhir", state: "done" },
        { when: limited ? `${limited}× hari ini` : "Hari ini", title: "Batas kuota", sub: limited ? "429 · jeda 65 dtk" : "Tidak ada 429", state: limited ? "done" : "todo" },
        { when: "Sekarang", title: "Uji koneksi", sub: "Ambil harga langsung", state: "current" },
      ]
    : [
        { when: "Sekarang", title: "Semua sehat", sub: `${count("live")} simbol live`, state: "done" },
        { when: "Otomatis", title: "Cache bersama", sub: `TTL ${Math.round(st.quote_ttl_s / 60)} mnt per simbol`, state: "done" },
        { when: "Hari ini", title: "Kuota", sub: `${td?.calls ?? 0}/${st.daily_credits} kredit`, state: "done" },
        { when: "Kapan saja", title: "Uji koneksi", sub: "Ambil harga langsung", state: "todo" },
      ];
  h = flowSteps(h, /<span style="font-size: 13px; color: #5F6B7D">Alur insiden terakhir[^<]*<\/span>/, worst ? `Alur insiden · ${bad.length} simbol bermasalah` : "Alur feed · tidak ada insiden", steps);

  h = tabsBar(h, MARKET_TABS.map(([k, l]) => [k, l, count(k), `/admin/pasar?status=${k}`] as [string, string, number, string]), tab);

  const shown = rows.filter((r) => (tab === "all" ? r.s !== "inactive" : r.s === tab));
  h = replaceRows(h, '<div style="display: grid; grid-template-columns: 1.4fr 1fr .8fr 1fr .7fr .8fr 36px; gap: 12px; align-items: center; min-height: 60px;', (_sel, tpl) => {
    if (!shown.length) return emptyRow("Tidak ada simbol di sini.");
    return shown
      .map(({ f, s }) => {
        const q = f.quote;
        const [pl, pt] = FEED_PILL[s];
        let r = tpl.replace("<div ", `<div data-mk-row="${esc(f.symbol)}" data-href="/admin/simbol?s=${encodeURIComponent(f.symbol)}" `);
        r = setCells(r, [
          person(avatar(f.symbol.slice(0, 1), f.symbol), displaySym(f), `${CLASS[f.asset_class]} · ${f.exchange}${f.saver_mode ? " · hemat" : ""}`),
          mono(q ? price(q.price, f.currency) : "—"),
          q ? mono(pct(q.change_percent), q.change_percent > 0 ? "#166534" : q.change_percent < 0 ? "#991B1B" : "#0B0B0F") : mono("—"),
          mono(ageText(f.fetched_at)),
          mono(f.latency_ms != null ? `${num(f.latency_ms)} ms` : "—"),
          `<span title="${esc(f.error)}">${pill(pl, pt)}</span>`,
          null,
        ]);
        return r.replace('href="/admin/simbol"', `href="/admin/simbol?s=${encodeURIComponent(f.symbol)}"`);
      })
      .join("");
  });

  // Kuota hari ini.
  const used = td?.calls ?? 0;
  const savers = st.data.filter((f) => f.saver_mode && f.active).length;
  h = h.replace(/(<span style="font-size: 13px; color: #5F6B7D">)Grow plan · 800 kredit\/hari \(contoh\)(<\/span>)/, `$1Twelve Data · ${num(st.daily_credits)} kredit/hari · Binance tanpa kuota$2`);
  h = h.replace(/<svg viewBox="0 0 180 180" width="160" height="160" role="img" aria-label="[^"]*">[\s\S]*?<\/svg>/, ring(used, st.daily_credits));
  h = h.replace(/(<strong style="font-size: 26px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${num(used)}$2`);
  h = h.replace(/(<span style="flex: 1 1 120px; font-size: 13px; line-height: 1.5; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${num(Math.max(0, st.daily_credits - used))} kredit tersisa hari ini. ${savers} simbol mode hemat (harga diperbarui tiap 5 menit); lainnya di-cache ${Math.round(st.quote_ttl_s / 60)} menit dan dibagi semua pengunjung.$2`);

  // Aturan peringatan.
  const sw = (aria: string, key: keyof MarketState["alerts"], label: string) => {
    h = h.replace(rx(`<button role="switch" aria-checked="(?:true|false)" aria-label="${aria}"[^>]*>[\\s\\S]*?</button>`), switchBtn(st.alerts[key], `data-mk-alert="${key}" aria-label="${esc(label)}"${manage ? "" : " disabled"}`));
  };
  sw("Latensi p95 (?:>|&gt;) 2 detik", "latency", "Latensi p95 > 2 detik");
  sw("Error 429 dari Twelve Data", "rate_limit", "Error 429 dari Twelve Data");
  sw("Kuota harian (?:>|&gt;) 85%", "quota", "Kuota harian > 85%");
  sw("Koneksi WS turun (?:>|&gt;) 20%", "ws_drop", "Koneksi kripto turun");
  h = h.replace(/>Koneksi WS turun (?:>|&gt;) 20%</, ">Feed kripto (Binance) error<").replace(/>Dibanding rata-rata 1 jam</, ">Error beruntun dari Binance<");
  h = h.replace(/(<span style="font-size: 13px; color: #5F6B7D">)Dikirim ke Slack #data-pasar dan email on-call(<\/span>)/, "$1Aturan tersimpan di server; tampil di panel ini & log aktivitas$2");

  // Kesehatan feed per sumber.
  const provider = src === "binance" ? "binance" : "twelvedata";
  const u = st.stats.usage.find((x) => x.provider === provider);
  const wk = st.stats.week.find((x) => x.provider === provider);
  const up = u && u.calls ? ((u.calls - u.errors) / u.calls) * 100 : null;
  const upWeek = wk && wk.calls ? ((wk.calls - wk.errors) / wk.calls) * 100 : null;
  h = h.replace(/(<div role="tablist" style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center">)[\s\S]*?(<\/div>)/, (_m, a: string, b: string) => {
    const tab2 = (key: string, label: string) =>
      `<a href="/admin/pasar?status=${tab}&amp;src=${key}" role="tab" aria-selected="${key === provider}" style="min-height: 38px; display: inline-flex; align-items: center; padding: 0 18px; border-radius: 999px; border: 1px solid ${key === provider ? "#FFFFFF" : "#E3EBF7"}; background: ${key === provider ? "#FFFFFF" : "transparent"}; color: #0B0B0F; font-size: 13px; font-weight: ${key === provider ? 500 : 400}">${label}</a>`;
    return `${a}${tab2("twelvedata", "Twelve Data")}${tab2("binance", "Binance (kripto)")}${b}`;
  });
  h = h.replace(/>Uptime 24 jam per sumber data</, ">Keberhasilan panggilan hari ini per sumber<");
  h = h.replace(/(<span style="font-size: clamp\(56px, 6vw, 76px\); line-height: 1; font-weight: 300; letter-spacing: -.02em">)[^<]*(<span)/, `$1${up == null ? "—" : up.toFixed(1).replace(".", ",")}$2`);
  if (up == null) h = h.replace(/(letter-spacing: -.02em">—)<span style="font-size: .45em; font-weight: 400">%<\/span>/, "$1");
  const delta = up != null && upWeek != null ? up - upWeek : null;
  h = h.replace(/(<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: )#[0-9A-F]{6}; background: #[0-9A-F]{6}(; padding: 5px 10px; border-radius: 999px; white-space: nowrap">)[^<]*(<\/span>)/, (_m, a: string, b: string, c: string) => {
    if (delta == null) return `${a}#374151; background: #EFF0F2${b}${u ? `${num(u.calls)} panggilan` : "Belum ada panggilan"}${c}`;
    const good = delta >= 0;
    return `${a}${good ? "#3F6212; background: #E4F8C9" : "#991B1B; background: #FDE2E2"}${b}${good ? "▲" : "▼"} ${Math.abs(delta).toFixed(1).replace(".", ",")}% vs 7 hari${c}`;
  });
  h = h.replace(/>Di bawah 97,5% = kirim peringatan ke tim data</, `>${u ? `${num(u.calls)} panggilan · ${num(u.errors)} gagal · rata-rata ${num(Math.round(u.latency_ms / Math.max(1, u.calls)))} ms` : "Belum ada panggilan ke penyedia hari ini"}<`);
  h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Uji koneksi sekarang</a>`), `<a href="#" data-mk-action="test" data-symbol="${provider === "binance" ? "BTCUSD" : (st.data.find((f) => f.active && f.asset_class === "commodity") ?? st.data.find((f) => f.active && f.asset_class !== "crypto"))?.symbol ?? "XAUUSD"}"$1$2Uji koneksi sekarang</a>`);

  // Kartu kecil.
  const p95 = st.stats.p95_ms;
  h = statCard(h, "Latensi p95", p95 ? `${num(p95)} ms` : "—", pill(p95 <= 1500 ? "Normal" : "Lambat", p95 <= 1500 ? "lime" : "orange"), "Panggilan terakhir per simbol. Target < 1.500 ms.");
  h = statCard(h, "Koneksi WS", compact(st.stats.watchers), pill(`${st.data.reduce((a, f) => a + f.watchers, 0)} pantauan`, "lime"), "Pengguna dengan simbol di watchlist.", { rename: "Pemantau" });
  const freshPct = st.stats.cache_keys ? Math.round((st.stats.cache_fresh / st.stats.cache_keys) * 100) : 0;
  h = statCard(h, "Cache hit", `${freshPct}%`, pill(freshPct >= 50 ? "Baik" : "Dingin", freshPct >= 50 ? "lime" : "gray"), `${st.stats.cache_fresh}/${st.stats.cache_keys} harga di cache < 15 menit.`, { rename: "Cache segar" });
  h = statCard(h, "Error 429", num(limited), pill(limited ? "Kuota menit habis" : "Aman", limited ? "red" : "lime"), "Hari ini. Setelah 429 penyedia dijeda 65 detik.");
  return h;
}

// ======================================================================= detail simbol
export function bindSymbol(html: string, opts: { st: SymbolState | null; categories: Category[]; ttlS: number; isNew: boolean }): string {
  const { st, categories, ttlS, isNew } = opts;
  let h = html;
  const manage = isNew || !!st?.can_manage;
  const f = st?.instrument;
  const q = st?.quote ?? null;
  const sym = f?.symbol ?? "";

  // Header.
  if (isNew || !f) {
    h = h.replace(/(<span style="flex: none; width: 64px; height: 64px;[^"]*">)[^<]*(<\/span>)/, "$1+$2");
    h = h.replace(/(<h1 style="margin: 0; font-size: 34px; font-weight: 700">)[^<]*(<\/h1>)/, "$1Simbol baru$2");
    h = h.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: #166534; background: #DCF5E4;[^"]*"><span class="live-dot"[\s\S]*?<\/span> Live<\/span>/, "");
    h = h.replace(/(<span style="font-size: 15px; color: #5F6B7D">)[^<]*(<\/span>)/, "$1Isi kode Twelve Data (mis. BBCA:IDX, XAU/USD) — simbol kripto otomatis memakai Binance.$2");
    h = h.replace(/<span style="display: flex; flex-direction: column; align-items: flex-end; margin-left: auto">[\s\S]*?<\/span><\/span>\s*<\/div>/, "</div>");
    // Tanpa grafik/statistik/artikel/kesehatan/alert untuk simbol baru.
    const btns = h.indexOf('<div style="display: flex; flex-wrap: wrap; gap: 10px">', h.indexOf("<h1"));
    if (btns > 0) h = h.slice(0, btns) + h.slice(closeOf(h, btns));
    const left = h.indexOf('<div style="flex: 1.7 1 620px;');
    if (left > 0) h = h.slice(0, left) + h.slice(closeOf(h, left));
    for (const title of ["Kesehatan feed simbol", "Alert internal"]) {
      const at = h.indexOf(`>${title}<`);
      if (at > 0) {
        const s0 = h.lastIndexOf("<section ", at);
        h = h.slice(0, s0) + h.slice(closeOf(h, s0, "section"));
      }
    }
  } else {
    const s = feedStatus(f, ttlS);
    const [pl, pt] = FEED_PILL[s];
    h = h.replace(/(<span style="flex: none; width: 64px; height: 64px;[^"]*">)[^<]*(<\/span>)/, (_m, a: string, b: string) => recolorAvatar(`${a}${esc(sym.slice(0, 2))}${b}`, sym));
    h = h.replace(/(<h1 style="margin: 0; font-size: 34px; font-weight: 700">)[^<]*(<\/h1>)/, `$1${esc(displaySym(f))}$2`);
    h = h.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: #166534; background: #DCF5E4;[^"]*"><span class="live-dot"[\s\S]*?<\/span> Live<\/span>/, (m) => (s === "live" ? m : pill(pl, pt)));
    const cat = categories.find((c) => c.slug === f.category_slug);
    h = h.replace(/(<span style="font-size: 15px; color: #5F6B7D">)Bank Central Asia[^<]*(<\/span>)/, `$1${esc([f.name, f.exchange, CLASS[f.asset_class] + (f.sector ? ` › ${f.sector}` : ""), cat ? `berita: ${cat.name}` : ""].filter(Boolean).join(" · "))}$2`);
    h = h.replace(/(<span style="font-family: 'Roboto Mono', monospace; font-size: 40px; font-weight: 400">)[^<]*(<\/span>)/, `$1<span data-lg="C">${q ? esc(price(q.price, f.currency)) : "—"}</span>$2`);
    h = h.replace(/<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: #166534; background: #DCF5E4; padding: 5px 10px; border-radius: 999px; white-space: nowrap">[^<]*<\/span>/, () => {
      if (!q) return pill(f.error ? "Data tidak tersedia" : "Belum ada harga", "gray", 13);
      const upMove = q.change >= 0;
      return `<span data-lg="chg" style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: ${upMove ? "#166534" : "#991B1B"}; background: ${upMove ? "#DCF5E4" : "#FDE2E2"}; padding: 5px 10px; border-radius: 999px; white-space: nowrap">${upMove ? "▲" : "▼"} ${esc(price(Math.abs(q.change), f.currency).replace("$", ""))} (${pct(q.change_percent)})</span>`;
    });
    h = h.replace(rx(`<a href="/admin/tulis"([^>]*>)(${SVG})Tulis artikel BBCA</a>`), `<a href="/admin/tulis?symbol=${encodeURIComponent(sym)}"$1$2Tulis artikel ${esc(displaySym(f))}</a>`);
    h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Lihat di website</a>`), `<a href="/market/${encodeURIComponent(sym)}" target="_blank" rel="noopener"$1$2Lihat di website</a>`);
    h = h.replace(rx(`<a href="#"([^>]*>)(${SVG})Uji koneksi</a>`), `<a href="#" data-sy-action="test" data-symbol="${esc(sym)}"$1$2Uji koneksi</a>`);

    // Grafik: wadah Lightweight Charts (enhancer "lwchart") + tombol timeframe.
    const TF: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1H": "1J", "4H": "4J", "1D": "1D", "1W": "1W", "1M": "1M" };
    h = h.replace(/<button role="radio" aria-checked="(true|false)"( class=ob-anim)? style="([^"]*)">([^<]+)<\/button>/g, (m, _c, _a, _s, label: string) => (TF[label] ? m.replace("<button ", `<button type="button" data-tf="${TF[label]}" `) : m));
    h = h.replace(/<div role="tablist" style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center"><button role="tab" aria-selected="true"[^>]*>Candle<\/button>[\s\S]*?<\/div>/, "");
    const dec = !q || q.price === 0 ? 2 : q.price < 10 ? 4 : q.price < 1000 ? 2 : 0;
    const pair = f.asset_class === "crypto" && f.symbol.endsWith("USD") ? `${f.symbol.slice(0, -3)}USDT` : "";
    const legend = q
      ? `<span>${esc(fmtDate(q.as_of, true))}</span><span>O <span data-lg="O">${esc(price(q.open, f.currency))}</span></span><span>H <span data-lg="H">${esc(price(q.high, f.currency))}</span></span><span>L <span data-lg="L">${esc(price(q.low, f.currency))}</span></span><span>C <span data-lg="C">${esc(price(q.price, f.currency))}</span></span><span>Vol <span data-lg="v">${q.volume ? compact(q.volume) : "—"}</span></span>`
      : "<span>Belum ada data harga untuk simbol ini.</span>";
    h = h.replace(/(<span style="display: flex; flex-wrap: wrap; gap: 14px; font-family: 'Roboto Mono', monospace; font-size: 12px; color: #5F6B7D">)[\s\S]*?(<\/span>\s*<svg)/, `$1${legend}$2`);
    const chartSvg = /(\s*)(<svg viewBox="0 0 \d+ \d+"[^>]*>(?:(?!<\/svg>)[\s\S])*<\/svg>)(\s*<span style="font-size: 12px; color: #5F6B7D">)Penanda biru[^<]*(<\/span>)/;
    h = h.replace(chartSvg, (_m, sp: string, svg: string, cap: string, end: string) =>
      f.active && !f.error
        ? `${sp}<div data-lw="${esc(sym)}"${pair ? ` data-lw-binance="${pair}"` : ""} data-lw-dec="${dec}"${q?.previous_close ? ` data-lw-prev="${q.previous_close}"` : ""} data-lw-exch="${esc(f.exchange)}" data-dc-keep style="position: relative; height: 380px">${svg}</div>${cap}Sumber ${f.asset_class === "crypto" ? "Binance" : "Twelve Data"} · data nyata · klik timeframe untuk mengganti${end}`
        : `${sp}${emptyRow(f.active ? `Grafik tidak tersedia: ${f.error}` : "Simbol nonaktif — aktifkan untuk menampilkan grafik.")}${cap}${f.active ? "Simbol ini tidak termasuk paket penyedia data." : ""}${end}`,
    );
    // Statistik.
    const stat = (label: string, v: string, nl?: string) => {
      h = h.replace(rx(`(<span style="font-size: 12px; color: #5F6B7D">)${label}(</span>\\s*<strong style="font-family: 'Roboto Mono', monospace; font-size: 17px; font-weight: 500">)[^<]*(</strong>)`), `$1${esc(nl ?? label)}$2${esc(v)}$3`);
    };
    stat("Pembukaan", q ? price(q.open, f.currency) : "—");
    stat("Tertinggi hari ini", q ? price(q.high, f.currency) : "—");
    stat("Terendah hari ini", q ? price(q.low, f.currency) : "—");
    stat("Volume", q?.volume ? compact(q.volume) : "—");
    stat("Kapitalisasi", q?.previous_close ? price(q.previous_close, f.currency) : "—", "Penutupan sebelumnya");
    stat("Rentang 52 minggu", q?.week52_low && q.week52_high ? `${price(q.week52_low, f.currency)}–${price(q.week52_high, f.currency)}` : "—");

    // Artikel terkait.
    const arts = st!.articles;
    h = h.replace(">Dampak harga dihitung otomatis dari waktu terbit<", `>${arts.length} artikel menautkan ${esc(displaySym(f))}<`);
    h = h.replace(/<a href="\/admin\/cari\/hasil"([^>]*)>Lihat semua<\/a>/, `<a href="/admin/konten?status=published&amp;q=${encodeURIComponent(sym)}"$1>Lihat semua</a>`);
    const artRows = blocks(h, '<a href="/admin/versi" style="display: flex; align-items: center; gap: 12px; min-height: 62px;', "a");
    if (artRows.length) {
      const tpl = artRows[0]!.html;
      const built = arts.length
        ? arts
            .slice(0, 6)
            .map((a, i) =>
              tpl
                .replace('href="/admin/versi"', `href="/admin/tulis?id=${a.id}"`)
                .replace("border-top: 0", `border-top: ${i ? "1px solid #E3EBF7" : "0"}`)
                .replace(/(font-size: 12px; font-weight: 700">)\d+(<\/span>)/, `$1${i + 1}$2`)
                .replace(/(<strong style="font-weight: 500; line-height: 1.35">)[^<]*(<\/strong>)/, `$1${esc(a.title)}$2`)
                .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(a.published_at ? fmtDate(a.published_at, true) : "Belum terbit")} · ${esc(a.author_name || "—")}$2`)
                .replace(/(<span style="margin-left: auto">)<span[^>]*>[^<]*<\/span>/, `$1${pill(a.status === "published" ? "Terbit" : a.status === "draft" ? "Draf" : a.status === "review" ? "Review" : a.status === "archived" ? "Arsip" : a.status, a.status === "published" ? "green" : "gray", 11)}`),
            )
            .join("")
        : emptyRow("Belum ada artikel yang menautkan simbol ini.");
      h = h.slice(0, artRows[0]!.start) + built + h.slice(artRows[artRows.length - 1]!.end);
    }

    // Kesehatan feed simbol.
    h = h.replace(/(<span style="font-size: 13px; color: #5F6B7D">)Twelve Data · BBCA:IDX(<\/span>)/, `$1${f.asset_class === "crypto" ? "Binance" : "Twelve Data"} · ${esc(f.provider_symbol)}$2`);
    stat("Status", pl);
    stat("Update terakhir", ageText(f.fetched_at));
    stat("Latensi p95", f.latency_ms != null ? `${num(f.latency_ms)} ms` : "—", "Latensi terakhir");
    stat("Kredit / hari", f.saver_mode ? "5 menit" : `${Math.round(ttlS / 60)} menit`, "Umur cache");
    h = h.replace(/<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; color: #5F6B7D">Latensi 24 jam<\/span>[\s\S]*?<\/svg><\/div>/, f.error ? `<span style="font-size: 13px; color: #991B1B">Error terakhir: ${esc(f.error)}</span>` : `<span style="font-size: 12px; color: #5F6B7D">${num(f.watchers)} pengguna memantau · ${num(f.articles)} artikel</span>`);

    // Alert internal.
    const al = st!.alerts;
    const asw = (aria: string, key: keyof SymbolState["alerts"], label: string) => {
      h = h.replace(rx(`<button role="switch" aria-checked="(?:true|false)" aria-label="${aria}"[^>]*>[\\s\\S]*?</button>`), switchBtn(al[key], `data-sy-alert="${key}" aria-label="${esc(label)}"${manage ? "" : " disabled"}`));
    };
    asw("Naik/turun (?:>|&gt;) 3% dalam sehari", "move3", "Naik/turun > 3% dalam sehari");
    asw("Auto-reject / suspensi IDX", "halt", "Auto-reject / suspensi");
    asw("Volume 3× rata-rata", "volume3x", "Volume 3× rata-rata");
    h = h.replace(rx(`<a href="#"[^>]*>(?:${SVG})?Tambah</a>`), "");
    h = h.replace(">Kabari tim redaksi<", ">Tersimpan per simbol untuk tim redaksi<").replace(/>Ke Slack #redaksi-saham</g, ">Aturan pemantauan redaksi<").replace(">Ke editor piket + push<", ">Aturan pemantauan redaksi<");
  }

  // Pengaturan simbol (form).
  const at = h.indexOf(">Pengaturan simbol<");
  const s0 = h.lastIndexOf("<section ", at);
  const s1 = closeOf(h, s0, "section");
  let sec = h.slice(s0, s1);
  const classOpts: [string, string][] = (Object.keys(CLASS) as FeedRow["asset_class"][]).map((k) => [k, CLASS[k]]);
  const catOpts: [string, string][] = [["", "— Tidak ada —"], ...categories.map((c) => [c.slug, c.name] as [string, string])];
  const formHead = sec.slice(0, sec.indexOf("<label "));
  const swRow = (key: string, title: string, sub: string, on: boolean, first: boolean) =>
    `<div style="display: flex; align-items: center; gap: 12px; min-height: 56px; border-top: ${first ? "0" : "1px solid #E3EBF7"}"><span style="flex: 1; display: flex; flex-direction: column"><strong style="font-size: 14px; font-weight: 500">${esc(title)}</strong><span style="font-size: 12px; color: #5F6B7D">${esc(sub)}</span></span>${switchBtn(on, `data-sy-switch="${key}" aria-label="${esc(title)}"${manage ? "" : " disabled"}`)}</div>`;
  const btnRow = sec.match(/<div style="display: flex; gap: 10px">[\s\S]*?<\/div>\s*<\/section>$/)?.[0] ?? "</section>";
  const deact = actionBtn(btnRow, "Nonaktifkan", `data-sy-action="active" data-on="${f?.active ? "false" : "true"}"`, f?.active ? "Nonaktifkan" : "Aktifkan");
  const save = actionBtn(btnRow, "Simpan", 'data-sy-action="save"', isNew ? "Tambah simbol" : "Simpan");
  const ro = manage ? "" : " disabled";
  sec =
    formHead.replace(">Perubahan tercatat di log aktivitas<", isNew ? ">Kode internal dipakai di URL & ticker<" : ">Perubahan tercatat di log aktivitas<") +
    (isNew ? field("Kode simbol", input(`data-sy="symbol" maxlength="24" placeholder="mis. BBRI, XAUUSD" style-upper${ro}`, "")).replace(" style-upper", ' autocapitalize="characters"') : "") +
    field("Nama tampilan", input(`data-sy="name" maxlength="80"${ro}`, f?.name ?? "")) +
    `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">${field("Kode di Twelve Data", input(`data-sy="provider_symbol" maxlength="24" placeholder="BBRI:IDX"${ro}`, f?.provider_symbol ?? ""))}${field("Kelas aset", select(`data-sy="asset_class"${ro}`, classOpts, f?.asset_class ?? "equity"))}</div>` +
    `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">${field("Bursa / sumber", input(`data-sy="exchange" maxlength="20" placeholder="IDX, NASDAQ, FX"${ro}`, f?.exchange ?? ""))}${field("Mata uang", input(`data-sy="currency" maxlength="3" placeholder="IDR / USD"${ro}`, f?.currency ?? ""))}</div>` +
    field("Sektor (opsional)", input(`data-sy="sector" maxlength="60" placeholder="Perbankan"${ro}`, f?.sector ?? "")) +
    field("Kategori berita", select(`data-sy="category_slug"${ro}`, catOpts, f?.category_slug ?? "")) +
    swRow("in_ticker", "Tampil di story row & ticker", "Web dan aplikasi", f?.in_ticker ?? true, true) +
    swRow("saver_mode", "Mode hemat kredit", "Perbarui tiap 5 menit dari cache", f?.saver_mode ?? false, false) +
    (manage ? `<div style="display: flex; gap: 10px">${isNew ? "" : deact}${save}</div></section>` : `<span style="font-size: 13px; color: #5F6B7D">Hanya-baca untuk peran Anda.</span></section>`);
  h = h.slice(0, s0) + sec + h.slice(s1);

  // Alur menambah simbol.
  const flowRe = /<span style="font-size: 13px; color: #5F6B7D">Alur menambah simbol<\/span>/;
  if (flowRe.test(h)) {
    const s = f ? feedStatus(f, ttlS) : "idle";
    h = flowSteps(h, flowRe, "Alur menambah simbol", [
      { when: "Langkah 1", title: "Tambah simbol", sub: f ? f.symbol : "Kode & nama", state: f ? "done" : "current" },
      { when: "Langkah 2", title: "Mapping", sub: f ? `${f.symbol} → ${f.provider_symbol}` : "Kode Twelve Data", state: f ? "done" : "todo" },
      { when: "Langkah 3", title: "Uji harga", sub: s === "live" ? "Harga diterima" : s === "error" ? "Tidak di paket" : "Tekan Uji koneksi", state: s === "live" ? "done" : f ? "current" : "todo" },
      { when: "Langkah 4", title: "Tampil", sub: f?.in_ticker ? "Story row & ticker" : "Hanya halaman simbol", state: f && f.active && s === "live" ? "done" : "todo" },
    ]);
  }
  return h;
}

// ======================================================================= verifikasi 2 langkah staf
export function bindTwoFactor(html: string, opts: { email: string; next: string; method?: "email" | "totp" }): string {
  let h = html;
  const totp = opts.method === "totp";
  const masked = opts.email.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => a + "•".repeat(Math.min(6, Math.max(1, b.length))) + c);
  h = h.replace(/(<span style="font-size: 15px; line-height: 1.55; color: #5F6B7D">)Masukkan kode 6 digit dari aplikasi authenticator untuk <strong([^>]*)>[^<]*<\/strong>\./, `$1${totp ? "Masukkan kode 6 digit dari aplikasi autentikator untuk" : "Masukkan 6 karakter kode yang kami kirim ke email"} <strong$2>${esc(masked || "akun staf Anda")}</strong>. Kode berlaku 10 menit.`);
  let i = 0;
  h = h.replace(/<input aria-label="Digit (\d)" value="[^"]*" maxlength="1" inputmode="numeric" style="([^"]*)">/g, (_m, d: string, st: string) => {
    const s = st.replace("border: 2px solid #4285F4", "border: 1px solid #E3EBF7");
    return `<input aria-label="Karakter ${d}" data-tf-digit="${i++}" value="" maxlength="1" autocomplete="${i === 1 ? "one-time-code" : "off"}" autocapitalize="characters" style="${s}; text-transform: uppercase">`;
  });
  h = h.replace(/<span style="font-size: 13px; color: #5F6B7D">Kode berganti dalam <strong[^>]*>[^<]*<\/strong>\s*<\/span>/, `<span data-tf="resend-note" style="font-size: 13px; color: #5F6B7D">${totp ? "Kode di aplikasi berganti setiap 30 detik." : "Tidak menerima kode? Periksa folder spam."}</span>`);
  h = h.replace(/<input type="checkbox" style="width: 18px; height: 18px">Jangan minta lagi di perangkat ini selama 30 hari/, '<input type="checkbox" data-tf="remember" style="width: 18px; height: 18px">Jangan minta lagi di perangkat ini selama 30 hari');
  h = h.replace(/<a href="\/admin"( class=ob-anim[^>]*)>Verifikasi &(?:amp;)? masuk<\/a>/, `<a href="#" data-tf="submit" data-email="${esc(opts.email)}" data-next="${esc(opts.next)}"$1>Verifikasi &amp; masuk</a>`);
  h = h.replace(
    /Tidak bisa akses aplikasi\? <a href="#"([^>]*)>Pakai kode cadangan<\/a>/,
    totp
      ? 'Tidak bisa membuka aplikasi? <a href="#" data-tf="recovery"$1>Pakai kode cadangan</a><br><span style="font-size: 13px">Kode cadangan juga hilang? <a href="/bantuan#kontak"$1>Hubungi bantuan</a></span>'
      : 'Belum menerima email? <a href="#" data-tf="resend"$1>Kirim ulang kode</a>',
  );
  if (totp) {
    // Kolom kode cadangan (tersembunyi sampai "Pakai kode cadangan" diketuk).
    h = h.replace(
      /(<label[^>]*><input type="checkbox" data-tf="remember")/,
      `<label data-tf="recovery-box" style="display: none; flex-direction: column; gap: 6px; font-size: 14px; color: #5F6B7D">Kode cadangan (sekali pakai)<input data-tf="recovery-input" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="11" placeholder="ABCDE-FGH23" style="min-height: 52px; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EBF7; background: #FFFFFF; font-size: 18px; letter-spacing: .15em; text-align: center; font-family: 'Roboto Mono', monospace; text-transform: uppercase"></label>$1`,
    );
  }
  return h;
}

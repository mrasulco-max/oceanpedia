import "server-only";
import type { Profile, Session } from "@/lib/me";
import { esc, initials, relTime } from "./bind";

const API_PUBLIC = (process.env.API_PUBLIC_URL ?? process.env.API_INTERNAL_URL ?? "http://localhost:8080").replace(/\/$/, "");
/** URL foto profil (endpoint media publik API), atau null. */
export const avatarUrl = (p: { avatar_id?: string | null }) => (p.avatar_id && /^[0-9a-f-]{36}$/i.test(p.avatar_id) ? `${API_PUBLIC}/v1/media/${p.avatar_id}` : null);
const avatarImg = (url: string, name: string) =>
  `<img src="${esc(url)}" alt="Foto profil ${esc(name)}" style="position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 999px; object-fit: cover">`;

/**
 * Binder halaman profil (app-20, web-akun) dan pengaturan (app-21) dengan data akun asli:
 * profil, ringkasan aktivitas, preferensi tersimpan, ganti kata sandi, dan perangkat yang masuk.
 * Interaksinya dijalankan enhancer "profile".
 */

const localPhone = (p?: string | null) => (p ? p.replace(/^\+62/, "") : "");
const plural = (n: number, one: string) => `${n} ${one}`;

function completeness(p: Profile): number {
  const steps = [p.email_verified, !!p.phone, p.stats.watchlist > 0, p.stats.alerts_active > 0, p.stats.topics > 0];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

const topicsText = (p: Profile) => (p.topics.length ? p.topics.slice(0, 3).map((t) => t.name).join(", ") + (p.topics.length > 3 ? ` +${p.topics.length - 3}` : "") : "Belum mengikuti topik");

/** Profil aplikasi (app-20). */
export function bindProfileApp(html: string, p: Profile): string {
  let h = html;
  const ini = esc(initials(p.full_name).slice(0, 1) || "?");
  const av = avatarUrl(p);
  h = h.replace(/(font-size: 26px; font-weight: 500">)N(\s*)<span aria-label="Ubah foto" style="/, (_m, a: string, sp: string) =>
    `${a}${ini}${av ? avatarImg(av, p.full_name) : ""}${sp}<span role="button" tabindex="0" data-avatar-pick aria-label="Ubah foto" title="Ubah foto profil" style="cursor: pointer; `);
  // Ketuk lingkaran foto juga membuka pemilih foto.
  h = h.replace('<span style="position: relative; flex: none; width: 76px; height: 76px; border-radius: 999px;', '<span data-avatar-pick style="cursor: pointer; position: relative; flex: none; width: 76px; height: 76px; border-radius: 999px;');
  // Kelengkapan profil.
  const pct = completeness(p);
  h = h.replace('aria-valuenow="40"', `aria-valuenow="${pct}"`).replace("width: 40%; border-radius: 999px; background: #FFD45C", `width: ${pct}%; border-radius: 999px; background: #FFD45C`);
  h = h.replace(/>40%</, `>${pct}%<`);
  // Aktivitas akun.
  h = h.replace(">12 saham, crypto &amp; komoditas dipantau<", `>${p.stats.watchlist ? plural(p.stats.watchlist, "aset dipantau") : "Belum ada aset dipantau"}<`);
  h = h.replace(">12 saham, crypto & komoditas dipantau<", `>${p.stats.watchlist ? plural(p.stats.watchlist, "aset dipantau") : "Belum ada aset dipantau"}<`);
  h = h.replace(">3 alert harga aktif<", `>${p.stats.alerts_active ? plural(p.stats.alerts_active, "alert harga aktif") : "Belum ada alert aktif"}<`);
  h = h.replace(/<span([^>]*)>1 terpicu<\/span>/, (_m, a: string) => (p.stats.alerts_triggered ? `<span${a}>${p.stats.alerts_triggered} terpicu</span>` : ""));
  h = h.replace(">8 artikel untuk dibaca nanti<", `>${p.stats.bookmarks ? plural(p.stats.bookmarks, "artikel untuk dibaca nanti") : "Belum ada artikel tersimpan"}<`);
  h = h.split(">IHSG, The Fed, Bitcoin<").join(`>${esc(topicsText(p))}<`);
  // Lembar "Edit profil": nilai asli, email hanya-baca (perubahan email perlu verifikasi).
  const field = "height: 50px; box-sizing: border-box; padding: 0 16px; border-radius: 16px; border: 1px solid #E3EAF4; background: #F6F8FC";
  h = h.replace(/<input type="text" placeholder="Nadia Putri"/, `<input type="text" data-prof-name autocomplete="name" value="${esc(p.full_name)}" placeholder="Nama lengkap"`);
  h = h.replace(/<input type="email" placeholder="nadia\.putri@email\.com" style="[^"]*"/, `<input type="email" data-prof-email readonly value="${esc(p.email)}" title="Email tidak dapat diubah di sini" style="${field}; color: #5F6B7D; outline: none"`);
  h = h.replace(/<input type="tel" placeholder="\+62 812-\*\*\*\*-7890"/, `<input type="tel" data-prof-phone autocomplete="tel-national" inputmode="tel" value="${esc(localPhone(p.phone))}" placeholder="812 3456 7890"`);
  h = h.replace(/<button onClick="\{\{ f1 \}\}"([^>]*)>Simpan perubahan<\/button>/, '<button data-prof-save$1>Simpan perubahan</button>');
  return h;
}

const SWITCH_ON = "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end";
const SWITCH_OFF = "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start";
const WEB_PREFS: [string, string, boolean][] = [["Breaking news", "breaking", true], ["Ringkasan pagi", "morning_digest", true], ["Rilis data berdampak tinggi", "high_impact", true], ["Promo &amp; penawaran", "promo", false], ["Promo & penawaran", "promo", false]];

/** Akun versi web (web-akun). */
export function bindProfileWeb(html: string, p: Profile, alertLimit: number): string {
  let h = html;
  // Menu samping: tautan sungguhan.
  const nav: Record<string, string> = { Profil: "/akun", Watchlist: "/watchlist", "Price alert": "/alert", Tersimpan: "/tersimpan", "Notifikasi &amp; newsletter": "/newsletter", "Notifikasi & newsletter": "/newsletter", Langganan: "/plus", Keamanan: "/pengaturan" };
  h = h.replace(/<a href="#"([^>]*)>(<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?([^<]+)<\/a>/g, (whole, attrs: string, icon: string | undefined, label: string) => {
    const to = nav[label.trim()];
    return to ? `<a href="${to}"${attrs}>${icon ?? ""}${label}</a>` : whole;
  });
  h = h.replace(/color: \[[\d, ]+\]; (font-size: 14px; font-weight: 500">(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?Keluar)/, "color: #DC2626; $1");
  const av = avatarUrl(p);
  h = h.replace(/<span class="ob-anim" style="(width: 76px; height: 76px; border-radius: 999px;[^"]*font-size: 30px; font-weight: 700)">N<\/span>/, (_m, st: string) =>
    `<span data-avatar-pick class="ob-anim" title="Ubah foto profil" style="position: relative; cursor: pointer; flex: none; ${st}">${esc(initials(p.full_name).slice(0, 1) || "?")}${av ? avatarImg(av, p.full_name) : ""}</span>`);
  h = h.replace(/<a href="#"([^>]*>(?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Ubah foto<\/a>/, (_m, rest: string) =>
    `<a href="#" data-avatar-pick${rest}Ubah foto</a>` +
    (av ? `<a href="#" data-avatar-remove style="height: 42px; display: inline-flex; align-items: center; padding: 0 14px; font-size: 14px; font-weight: 500; color: #DC2626">Hapus foto</a>` : ""));
  if (p.plan) {
    h = h.replace(">Paket kamu: Gratis<", ">Paket kamu: Ocean Pedia Plus<").replace(">Upgrade ke Ocean Pedia Plus untuk Analisis AI, tanpa iklan, dan price alert tanpa batas.<", ">Analisis AI, tanpa iklan, dan price alert tanpa batas sudah aktif.<");
  }
  // Ringkasan.
  const stat = (label: string, v: string) => {
    h = h.replace(new RegExp(`(<span style="font-size: 13px; color: #5F6B7D">${label}</span><strong[^>]*>)[^<]*(</strong>)`), `$1${v}$2`);
  };
  stat("Watchlist", String(p.stats.watchlist));
  stat("Price alert", alertLimit ? `${p.stats.alerts_active}/${alertLimit}` : String(p.stats.alerts_active));
  stat("Tersimpan", String(p.stats.bookmarks));
  stat("Topik diikuti", String(p.stats.topics));
  // Data diri.
  h = h.replace(/<input type="text" value="Nadia Putri" placeholder=""/, `<input type="text" data-prof-name autocomplete="name" value="${esc(p.full_name)}" placeholder="Nama lengkap"`);
  h = h.replace(/<input type="text" value="Nadia" placeholder=""/, `<input type="text" data-prof-display value="${esc(p.display_name ?? "")}" placeholder="${esc(p.full_name.split(/\s+/)[0] ?? "")}"`);
  h = h.replace(/<input type="text" value="nadia\.putri@email\.com" placeholder="" style="([^"]*)"/, `<input type="email" data-prof-email readonly value="${esc(p.email)}" title="Email tidak dapat diubah di sini" style="$1; color: #5F6B7D"`);
  h = h.replace(/<input type="text" value="\+62 812-\*\*\*\*-7890" placeholder=""/, `<input type="tel" data-prof-phone inputmode="tel" value="${esc(localPhone(p.phone))}" placeholder="812 3456 7890"`);
  h = h.replace(/<a href="#"([^>]*)>Batal<\/a>/, '<a href="#" data-prof-reset$1>Batal</a>');
  h = h.replace(/<a href="#"([^>]*)>((?:<svg(?:(?!<\/svg>)[\s\S])*<\/svg>)?)Simpan perubahan<\/a>/, '<a href="#" data-prof-save$1>$2Simpan perubahan</a>');
  // Preferensi tersimpan.
  for (const [label, key, def] of WEB_PREFS) {
    const on = typeof p.preferences[key] === "boolean" ? (p.preferences[key] as boolean) : def;
    h = h.replace(new RegExp(`<button role="switch" aria-checked="(?:true|false)" aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" style="[^"]*"`), `<button role="switch" data-pref="${key}" aria-checked="${on}" aria-label="${label}" style="${on ? SWITCH_ON : SWITCH_OFF}"`);
  }
  return h;
}

// Pengaturan aplikasi (app-21): kunci state desain ↔ preferensi.
export const SWITCH_PREFS: [string, string, boolean][] = [["u2", "reduce_motion", false], ["u3", "autoplay_video", true], ["u4", "breaking", true], ["u5", "price_alert", true], ["u6", "topics_notif", true], ["u7", "morning_digest", true], ["u8", "comment_replies", false]];
export const OPTION_PREFS: [string, string, string[]][] = [
  ["quiet", "quiet_hours", ["off", "21-06", "22-06", "23-07"]],
  ["lang", "language", ["id", "en"]],
  ["tz", "timezone", ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]],
  ["num", "number_format", ["id", "en", "space"]],
];
const THEMES = ["light", "dark", "system"];

/** State awal desain dari preferensi tersimpan (diteruskan lewat ctx.state). */
export function settingsState(p: Profile): string {
  const u: Record<string, boolean[]> = {};
  const o: Record<string, number[]> = {};
  const theme = p.preferences.theme;
  if (typeof theme === "string" && THEMES.includes(theme)) u.u1 = THEMES.map((t) => t === theme);
  for (const [k, key] of SWITCH_PREFS) if (typeof p.preferences[key] === "boolean") u[k] = [p.preferences[key] as boolean];
  for (const [k, key, vals] of OPTION_PREFS) {
    const i = vals.indexOf(String(p.preferences[key] ?? ""));
    if (i >= 0) o[k] = [i];
  }
  return JSON.stringify({ u, o });
}

function device(ua: string): string {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [b, os].filter(Boolean).join(" · ") || "Perangkat lain";
}

/** Pengaturan aplikasi (app-21): sandi, perangkat aktif, topik, 2 langkah. */
export function bindSettingsApp(html: string, p: Profile, sessions: Session[]): string {
  let h = html;
  h = h.split(">IHSG, The Fed, Bitcoin<").join(`>${esc(topicsText(p))}<`);
  // Ganti kata sandi.
  h = h.replace(/(Kata sandi lama)<input type="password"/, '$1<input type="password" data-pw-old autocomplete="current-password"');
  h = h.replace(/(Kata sandi baru)<input type="password" placeholder="Minimal 8 karakter"/, '$1<input type="password" data-pw-new autocomplete="new-password" placeholder="Min. 8, huruf &amp; angka, 1 huruf besar"');
  h = h.replace(/(Ulangi kata sandi baru)<input type="password"/, '$1<input type="password" data-pw-confirm autocomplete="new-password"');
  h = h.replace(/<button onClick="\{\{ f9 \}\}"([^>]*)>Simpan kata sandi<\/button>/, '<button data-pw-save$1>Simpan kata sandi</button>');
  // Verifikasi 2 langkah belum tersedia (jujur ke pengguna, bukan tampilan contoh).
  h = h.replace(/<a tabindex="0" role="button" onClick="\{\{ open_tfa \}\}"/, '<a tabindex="0" role="button" data-soon="Verifikasi 2 langkah segera hadir."');
  h = h.replace("{{ op_tfa.val }}", "Segera hadir");
  // Perangkat aktif.
  h = h.replace(">2 perangkat aktif<", `>${sessions.length} perangkat aktif<`);
  h = h.replace(/(aria-label="Riwayat masuk"[\s\S]*?<\/div><div style="display: flex; flex-direction: column">)([\s\S]*?)(<\/div><\/div><div role="dialog")/, (_m, head: string, rows: string, tail: string) => {
    const tpl = rows.match(/<div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: [^"]*">[\s\S]*?<\/span><\/div>/)?.[0];
    if (!tpl) return _m;
    const list = sessions.length
      ? sessions
          .map((s, i) => {
            const right = s.current
              ? '<span style="font-size: 11px; font-weight: 700; color: #15803D; background: #E7F6EC; padding: 4px 8px; border-radius: 999px">Perangkat ini</span>'
              : `<button type="button" data-session-revoke="${esc(s.id)}" style="border: 0; background: none; padding: 4px; font-size: 13px; font-weight: 500; color: #DC2626; cursor: pointer">Keluar</button>`;
            return tpl
              .replace(/border-top: [^;"]*/, i ? "border-top: 1px solid #E3EAF4" : "border-top: 0")
              .replace(/(<strong style="font-size: 14px; font-weight: 500">)[^<]*(<\/strong>)/, `$1${esc(device(s.user_agent))}$2`)
              .replace(/(<span style="font-size: 12px; color: #5F6B7D">)[^<]*(<\/span>)/, `$1${esc(s.ip || "IP tidak diketahui")} · masuk ${esc(relTime(s.created_at))}$2`)
              .replace(/<span style="font-size: 1[13]px; font-weight: [57]00; color: #(?:15803D|DC2626)[^"]*">[^<]*<\/span><\/div>$/, `${right}</div>`)
              .replace("<div ", `<div data-session-row="${esc(s.id)}" `);
          })
          .join("")
      : '<p style="margin: 0; padding: 12px 0; font-size: 14px; color: #5F6B7D">Tidak ada perangkat aktif.</p>';
    return head + list + tail;
  });
  return h;
}

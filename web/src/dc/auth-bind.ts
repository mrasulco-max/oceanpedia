import "server-only";
import { esc } from "./bind";

/**
 * Binder alur akun: daftar (app-24 & web-login di /daftar), verifikasi OTP (app-04),
 * dan tambahan halaman masuk (lupa kata sandi, masuk dengan kode, Google/Apple).
 * Perilakunya dijalankan enhancer "auth".
 */

const RULES: [string, string][] = [["len", "Min. 8 karakter"], ["alnum", "Huruf &amp; angka"], ["upper", "1 huruf besar"]];
const ruleHtml = (key: string, label: string) =>
  `<span data-rule="${key}" style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6B7280"><span data-rule-dot style="width: 14px; height: 14px; border-radius: 999px; background: #E3EAF4; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700">✓</span>${label}</span>`;
const rulesRow = () => `<div style="display: flex; flex-wrap: wrap; gap: 10px 14px">${RULES.map(([k, l]) => ruleHtml(k, l)).join("")}</div>`;

function socialSoon(h: string): string {
  return h.replace(/<a href="\/"([^>]*>(?:<svg[\s\S]*?<\/svg>)?)(Google|Apple)<\/a>/g, (_m, rest: string, name: string) => `<a href="#" data-auth-soon="${name}"${rest}${name}</a>`);
}

/** Form daftar aplikasi (app-24). */
export function bindRegisterApp(html: string): string {
  let h = html;
  const input = (sample: string, attrs: string) => {
    h = h.replace(new RegExp(`<input type="text" value="${sample}" placeholder=""`), `<input ${attrs} value=""`);
  };
  input("Nadia Putri", 'type="text" data-reg-name autocomplete="name" placeholder="Nama sesuai identitas"');
  input("nadia\\.putri@email\\.com", 'type="email" data-reg-email autocomplete="email" inputmode="email" placeholder="nama@email.com"');
  input("812 3456 7890", 'type="tel" data-reg-phone autocomplete="tel-national" inputmode="tel" placeholder="812 3456 7890"');
  h = h.replace(/<input type="\{\{ pwType \}\}" value="•+" placeholder=""/, '<input type="{{ pwType }}" data-reg-password autocomplete="new-password" placeholder="Buat kata sandi" value=""');
  // Indikator aturan kata sandi (diperbarui saat mengetik).
  h = h.replace(/<div style="display: flex; flex-wrap: wrap; gap: 10px 14px">(?:<span style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #[0-9A-F]{6}">[\s\S]*?<\/span>){3}<\/div>/, rulesRow());
  // Persetujuan: mulai belum dicentang.
  h = h.replace(
    /<span role="checkbox" aria-checked="true" style="display: flex"><span style="flex: none; width: 22px; height: 22px; border-radius: 7px; background: #4285F4; border: 0;/,
    '<span role="checkbox" aria-checked="false" tabindex="0" data-reg-terms style="display: flex; cursor: pointer"><span data-reg-terms-box style="flex: none; width: 22px; height: 22px; border-radius: 7px; background: #FFFFFF; border: 1.5px solid #C9D3E1; box-sizing: border-box;',
  );
  h = h.replace(/<a href="\/verifikasi" class="ob-anim"([^>]*)>Daftar<\/a>/, '<a href="/verifikasi" data-reg-submit class="ob-anim"$1>Daftar</a>');
  return socialSoon(h);
}

const TAB_ON = "flex: 1; height: 42px; border-radius: 999px; border: 0; background: #FFFFFF; outline: 1px solid #E3EAF4; font-size: 15px; font-weight: 700";
const TAB_OFF = "flex: 1; height: 42px; border-radius: 999px; border: 0; background: transparent; color: #5F6B7D; font-size: 15px; font-weight: 500";
const tabs = (active: "masuk" | "daftar") =>
  `<a href="/masuk" style="${active === "masuk" ? TAB_ON : TAB_OFF}; display: flex; align-items: center; justify-content: center">Masuk</a><a href="/daftar" style="${active === "daftar" ? TAB_ON : TAB_OFF}; display: flex; align-items: center; justify-content: center">Daftar</a>`;
const TABS_RE = /<button style="flex: 1; height: 42px;[^"]*">Masuk<\/button><button style="flex: 1; height: 42px;[^"]*">Daftar<\/button>/;

/** Halaman masuk: tab, lupa kata sandi, masuk dengan kode OTP, Google/Apple. */
export function bindLoginExtras(html: string): string {
  let h = html.replace(TABS_RE, tabs("masuk"));
  h = h.replace(/<a href="#"([^>]*)>Lupa kata sandi\?<\/a>/, '<a href="#" data-auth-forgot$1>Lupa kata sandi?</a>');
  h = h.replace(/<a href="\/verifikasi"([^>]*)>([\s\S]*?)Masuk dengan kode OTP<\/a>/, '<a href="/verifikasi?mode=login" data-auth-otp$1>$2Masuk dengan kode OTP</a>');
  // Lembar "Lupa kata sandi" (app-03): kirim kode reset ke email.
  h = h.replace("Kami akan mengirim tautan untuk membuat kata sandi baru.", "Kami akan mengirim kode ke email kamu untuk membuat kata sandi baru.");
  h = h.replace(/<input type="email" placeholder="nama@email\.com"/, '<input type="email" data-forgot-email autocomplete="email" placeholder="nama@email.com"');
  h = h.replace(/<button onClick="\{\{ f1 \}\}"([^>]*)>Kirim tautan reset<\/button>/, '<button data-forgot-submit$1>Kirim kode reset</button>');
  return socialSoon(h);
}

/** web-login pada /daftar: form masuk diubah menjadi form daftar (gaya desain yang sama). */
export function bindRegisterWeb(html: string): string {
  let h = html.replace(TABS_RE, tabs("daftar"));
  h = h.replace(">Selamat datang kembali</h2>", ">Buat akun</h2>");
  h = h.replace(">Masuk untuk melanjutkan ke OceanBird.</p>", ">Gratis. Simpan watchlist, atur price alert, dan dapat notifikasi berita besar.</p>");
  // Kolom email → nama, email, nomor HP (meniru gaya kolom desain).
  h = h.replace(/<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500">Email atau nomor HP<span style="([^"]*)">(<span style="color: #5F6B7D; display: flex">[\s\S]*?<\/span>)<input type="text" value="nadia\.putri@email\.com" placeholder="" style="([^"]*)"><\/span><\/label>/, (_m, box: string, icon: string, inp: string) => {
    const plain = box.replace("border: 2px solid #4285F4; background: #FFFFFF", "border: 1px solid #E3EAF4; background: #F6F8FC");
    const field = (label: string, input: string, extra = "", hint = "") =>
      `<label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500">${label}<span style="${plain}">${extra}<input ${input} value="" style="${inp}"></span>${hint}</label>`;
    return (
      field("Nama lengkap", 'type="text" data-reg-name autocomplete="name" placeholder="Nama sesuai identitas"') +
      field("Email", 'type="email" data-reg-email autocomplete="email" inputmode="email" placeholder="nama@email.com"', icon) +
      field("Nomor HP", 'type="tel" data-reg-phone autocomplete="tel-national" inputmode="tel" placeholder="812 3456 7890"', '<span style="font-size: 15px; color: #5F6B7D">+62</span>', '<span style="font-size: 12px; font-weight: 400; color: #5F6B7D">Opsional · untuk keamanan akun</span>')
    );
  });
  h = h.replace(/(Kata sandi<span[^>]*>[\s\S]*?)<input type="password" value="•+" placeholder=""/, '$1<input type="password" data-reg-password autocomplete="new-password" placeholder="Buat kata sandi" value=""');
  h = h.replace(/(<input type="password" data-reg-password[^>]*><\/span><\/label>)/, `$1${rulesRow()}`);
  // Baris "Ingat saya / Lupa kata sandi" → persetujuan.
  h = h.replace(
    /<div style="display: flex; justify-content: space-between; font-size: 14px"><label[\s\S]*?Lupa kata sandi\?<\/a><\/div>/,
    `<label style="display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.5; color: #5F6B7D"><span role="checkbox" aria-checked="false" tabindex="0" data-reg-terms style="display: flex; cursor: pointer"><span data-reg-terms-box style="flex: none; width: 22px; height: 22px; border-radius: 7px; background: #FFFFFF; border: 1.5px solid #C9D3E1; box-sizing: border-box; color: #FFFFFF; display: flex; align-items: center; justify-content: center; margin-top: 1px; font-size: 13px; font-weight: 700">✓</span></span><span>Saya setuju dengan <a href="/legal" style="color: #2F74EB; font-weight: 500">Syarat &amp; Ketentuan</a>, <a href="/legal" style="color: #2F74EB; font-weight: 500">Kebijakan Privasi</a>, dan memahami konten OceanBird bukan ajakan investasi.</span></label>`,
  );
  h = h.replace(/<a href="\/" class="ob-anim"([^>]*)>Masuk<\/a>/, '<a href="/verifikasi" data-reg-submit class="ob-anim"$1>Daftar</a>');
  h = h.replace(/Dengan masuk kamu menyetujui <a href="\/legal"[^>]*>Syarat &(?:amp;)? Ketentuan<\/a> dan <a href="\/legal"[^>]*>Kebijakan Privasi<\/a>\./, 'Sudah punya akun? <a href="/masuk" style="color: #2F74EB; font-weight: 500">Masuk</a>');
  return socialSoon(h);
}

export type OtpMode = "signup" | "login" | "reset";

function maskEmail(e: string): string {
  const [name, dom] = e.split("@");
  if (!name || !dom) return e;
  const keep = Math.min(2, name.length);
  return `${name.slice(0, keep)}${"*".repeat(Math.max(1, name.length - keep))}@${dom}`;
}

/** Halaman verifikasi kode (app-04). */
export function bindVerify(html: string, o: { email: string; mode: OtpMode; next: string }): string {
  let h = html;
  const title = o.mode === "reset" ? "Atur ulang kata sandi" : o.mode === "login" ? "Masuk dengan kode" : "Verifikasi email";
  h = h.replace(">Verifikasi kode</h1>", `>${title}</h1>`);
  const fieldStyle = "min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 16px; border: 1px solid #E3EAF4; background: #F6F8FC";
  const inputStyle = "flex: 1; min-width: 0; border: 0; background: transparent; font-size: 15px; color: #0B0B0F; outline: none";
  h = h.replace(
    /Masukkan 6 digit kode yang kami kirim lewat SMS ke <strong([^>]*)>[^<]*<\/strong>\./,
    o.email
      ? `Masukkan 6 karakter kode (huruf &amp; angka) yang kami kirim ke email <strong$1 data-otp-target>${esc(maskEmail(o.email))}</strong>. Periksa juga folder spam.`
      : `Masukkan email akun kamu, lalu kami kirim 6 karakter kode (huruf &amp; angka).</p><label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: #0B0B0F; margin-top: 12px">Email<span style="${fieldStyle}"><input type="email" data-otp-email-input autocomplete="email" inputmode="email" placeholder="nama@email.com" value="" style="${inputStyle}"><button type="button" data-otp-send style="border: 0; background: none; color: #2F74EB; font-size: 14px; font-weight: 500; padding: 4px">Kirim kode</button></span></label><p style="display: none">`,
  );
  // Kotak kode + input asli (dukung ketik, tempel, dan isi otomatis kode dari email/SMS).
  h = h.replace(
    /<div role="group" aria-label="Kode OTP" style="([^"]*)">/,
    `<div role="group" aria-label="Kode OTP" data-otp data-otp-email="${esc(o.email)}" data-otp-mode="${o.mode}" data-otp-next="${esc(o.next)}" style="$1; position: relative"><input data-otp-input type="text" inputmode="text" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="one-time-code" maxlength="6" pattern="[A-Za-z0-9]*" aria-label="Kode verifikasi 6 karakter (huruf dan angka)"${o.email ? " autofocus" : ""} style="position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; font-size: 16px; z-index: 1; border: 0; background: transparent; color: transparent; caret-color: transparent">`,
  );
  h = h.replace(/<span aria-label="Digit (\d)" style="height: 60px; border-radius: 16px; border: [^;]*; background: #[0-9A-F]{6};([^"]*)">[\s\S]*?(?=<span aria-label="Digit|<\/div>)/g, (_m, n: string, rest: string) =>
    `<span aria-label="Digit ${n}" data-otp-box style="height: 60px; border-radius: 16px; border: 1px solid #E3EAF4; background: #FFFFFF;${rest}"></span>`,
  );
  const back = o.mode === "signup" ? "/daftar" : "/masuk";
  h = h.replace(
    /<span style="font-size: 14px; color: #6B7280">Kirim ulang kode dalam <strong([^>]*)>00:45<\/strong> · <a href="\/daftar"([^>]*)>Ganti nomor<\/a><\/span>/,
    `<span data-otp-resend-row style="font-size: 14px; color: #6B7280"><span data-otp-wait>Kirim ulang kode dalam <strong$1 data-otp-timer>00:45</strong></span><a href="#" data-otp-resend style="display: none; color: #2F74EB; font-weight: 500">Kirim ulang kode</a> · <a href="${back}"$2>${o.mode === "signup" ? "Ganti email" : "Kembali ke masuk"}</a></span>`,
  );
  if (o.mode === "reset") {
    h = h.replace(
      /(<a href="\/" class="ob-anim")/,
      `<div style="display: flex; flex-direction: column; gap: 8px"><label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: #0B0B0F">Kata sandi baru<span style="${fieldStyle}"><input type="password" data-reg-password data-otp-password autocomplete="new-password" placeholder="Buat kata sandi baru" value="" style="${inputStyle}"></span></label>${rulesRow()}</div>$1`,
    );
  }
  h = h.replace(/<a href="\/" class="ob-anim"([^>]*)>Verifikasi<\/a>/, `<a href="#" data-otp-submit class="ob-anim"$1>${o.mode === "reset" ? "Simpan kata sandi" : o.mode === "login" ? "Masuk" : "Verifikasi"}</a>`);
  h = h.replace(/href="\/daftar" aria-label="Kembali"/, `href="${back}" aria-label="Kembali"`);
  // Papan angka desain disembunyikan: kode berisi huruf & angka, jadi memakai keyboard perangkat.
  h = h.replace(/<div aria-hidden="true" (style="position: absolute; left: 0; right: 0; bottom: 0; background: #EEF1F6;[^"]*")>([\s\S]*?)<\/div>\n?\s*<\/div>\s*$/, (_m, st: string, keys: string) =>
    `<div data-otp-keypad ${st.replace("display: grid", "display: none")}>${keys.replace(/<span style="([^"]*)">([0-9⌫]?)<\/span>/g, (_k, s2: string, k: string) => (k ? `<span role="button" tabindex="-1" data-key="${k === "⌫" ? "del" : k}" style="${s2}; cursor: pointer; user-select: none">${k}</span>` : `<span style="${s2}"></span>`))}</div>\n  </div>`,
  );
  return h;
}

export interface AccountUser {
  full_name: string;
  email: string;
  phone?: string | null;
  created_at?: string;
}

/** Pengguna yang sudah masuk: ikon Masuk → Akun, dan data contoh akun diganti data asli. */
export function bindAccount(html: string, u: AccountUser): string {
  let h = html.split('href="/masuk" aria-label="Masuk"').join('href="/akun" aria-label="Akun"');
  const first = u.full_name.split(/\s+/)[0] ?? u.full_name;
  h = h.split("Nadia Putri").join(esc(u.full_name)).split("nadia.putri@email.com").join(esc(u.email)).split('value="Nadia"').join(`value="${esc(first)}"`);
  const phone = u.phone ? `${u.phone.slice(0, 6)}-****-${u.phone.slice(-4)}` : "";
  h = h.split('value="+62 812-****-7890"').join(`value="${esc(phone)}" placeholder="Belum diisi"`);
  if (u.created_at) {
    const since = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(u.created_at));
    h = h.split("bergabung Okt 2026").join(`bergabung ${esc(since)}`);
  }
  return h;
}

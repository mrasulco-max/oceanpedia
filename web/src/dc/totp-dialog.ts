/**
 * Dialog aplikasi autentikator (TOTP): aktifkan (pindai QR / salin kunci → masukkan kode) atau matikan.
 * QR dibuat di perangkat (lib/qr) — rahasia tidak dikirim ke layanan pihak ketiga.
 */
import { qrSvg } from "@/lib/qr";

type Res = { ok: boolean; status: number; data: { detail?: string; title?: string; errors?: Record<string, string>; secret?: string; uri?: string } };
async function call(method: string, url: string, body?: unknown): Promise<Res> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Res["data"] };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}
const why = (r: Res, fb: string) => (r.data.errors && Object.values(r.data.errors)[0]) || r.data.detail || r.data.title || fb;
const BTN = "min-height: 48px; border: 0; border-radius: 14px; font-size: 15px; font-weight: 500; cursor: pointer; font-family: inherit";

/** Membuka dialog; resolve true bila berhasil (aktif / mati), false bila dibatalkan. */
export function totpDialog(mode: "enable" | "disable"): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", mode === "enable" ? "Aktifkan aplikasi autentikator" : "Matikan aplikasi autentikator");
    wrap.style.cssText = "position: fixed; inset: 0; z-index: 1000; background: rgba(11,11,15,.5); display: flex; align-items: flex-end; justify-content: center; font-family: Roboto, Arial, sans-serif";
    const box = document.createElement("div");
    box.style.cssText = "width: 100%; max-width: 440px; max-height: 92dvh; overflow-y: auto; background: #FFFFFF; color: #0B0B0F; border-radius: 24px 24px 0 0; padding: 20px 20px max(20px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; box-sizing: border-box";
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    const close = (ok: boolean) => {
      wrap.remove();
      document.removeEventListener("keydown", onEsc);
      resolve(ok);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onEsc);
    wrap.addEventListener("click", (e) => e.target === wrap && close(false));

    const codeField = (ph: string) =>
      `<input data-totp-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${ph}" style="min-height: 52px; border-radius: 14px; border: 1px solid #E3EAF4; background: #F6F8FC; padding: 0 16px; font-size: 22px; letter-spacing: .3em; text-align: center; font-family: 'Roboto Mono', monospace">`;
    const err = `<p data-totp-err role="alert" style="margin: 0; min-height: 18px; font-size: 13px; color: #B42318"></p>`;
    const actions = (label: string) =>
      `<div style="display: flex; gap: 10px"><button type="button" data-totp-cancel style="${BTN}; flex: 1; background: #F1F5F9; color: #0B0B0F">Batal</button><button type="button" data-totp-ok style="${BTN}; flex: 2; background: #2F74EB; color: #FFFFFF">${label}</button></div>`;
    const q = <T extends HTMLElement>(s: string) => box.querySelector<T>(s);
    const fail = (t: string) => {
      const e = q<HTMLElement>("[data-totp-err]");
      if (e) e.textContent = t;
    };

    const bind = (submit: () => Promise<void>) => {
      q("[data-totp-cancel]")?.addEventListener("click", () => close(false));
      q("[data-totp-ok]")?.addEventListener("click", () => void submit());
      const inp = q<HTMLInputElement>("[data-totp-code]");
      inp?.addEventListener("keydown", (e) => e.key === "Enter" && void submit());
      inp?.addEventListener("input", () => {
        if (inp.inputMode === "numeric") inp.value = inp.value.replace(/\D/g, "").slice(0, 6);
      });
      inp?.focus();
    };

    if (mode === "disable") {
      box.innerHTML = `<strong style="font-size: 18px">Matikan aplikasi autentikator</strong><p style="margin: 0; font-size: 14px; line-height: 1.5; color: #5F6B7D">Masukkan kode 6 digit dari aplikasi autentikator. Tidak bisa membuka aplikasinya? Isi kata sandi akun.</p>${codeField("000000")}<input data-totp-pw type="password" autocomplete="current-password" placeholder="atau kata sandi" style="min-height: 48px; border-radius: 14px; border: 1px solid #E3EAF4; background: #F6F8FC; padding: 0 16px; font-size: 15px">${err}${actions("Matikan")}`;
      bind(async () => {
        const code = q<HTMLInputElement>("[data-totp-code]")?.value.trim() ?? "";
        const password = q<HTMLInputElement>("[data-totp-pw]")?.value ?? "";
        if (code.length !== 6 && !password) return fail("Isi kode 6 digit atau kata sandi.");
        const r = await call("POST", "/api/me/2fa/totp/disable", { code, password });
        if (!r.ok) return fail(why(r, "Gagal mematikan."));
        close(true);
      });
      return;
    }

    box.innerHTML = `<strong style="font-size: 18px">Aktifkan aplikasi autentikator</strong><p style="margin: 0; font-size: 14px; color: #5F6B7D">Menyiapkan…</p>`;
    void call("POST", "/api/me/2fa/totp/setup").then((r) => {
      if (!r.ok || !r.data.secret || !r.data.uri) {
        box.innerHTML = `<strong style="font-size: 18px">Aktifkan aplikasi autentikator</strong>${err}${actions("Tutup")}`;
        fail(why(r, "Penyiapan gagal. Coba lagi."));
        bind(async () => close(false));
        return;
      }
      const secret = r.data.secret;
      const pretty = secret.replace(/(.{4})/g, "$1 ").trim();
      box.innerHTML = `<strong style="font-size: 18px">Aktifkan aplikasi autentikator</strong>
<ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.55; color: #374151; display: flex; flex-direction: column; gap: 4px">
<li>Buka Google Authenticator, Microsoft Authenticator, Authy, atau 1Password.</li>
<li>Pindai kode QR ini, atau ketuk <b>Buka di aplikasi</b> bila memakai ponsel yang sama.</li>
<li>Masukkan kode 6 digit yang muncul.</li></ol>
<div style="align-self: center; padding: 10px; border: 1px solid #E3EAF4; border-radius: 16px; background: #FFFFFF; line-height: 0">${qrSvg(r.data.uri, 200)}</div>
<a href="${r.data.uri.replace(/"/g, "&quot;")}" style="align-self: center; font-size: 14px; font-weight: 500; color: #2F74EB; text-decoration: none">Buka di aplikasi autentikator</a>
<div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 14px; background: #F6F8FC"><span style="font-size: 12px; color: #5F6B7D">Atau masukkan kunci ini secara manual</span><span style="display: flex; align-items: center; gap: 8px"><code data-totp-secret style="flex: 1; font-size: 15px; letter-spacing: .04em; word-break: break-all">${pretty}</code><button type="button" data-totp-copy style="border: 1px solid #E3EAF4; background: #FFFFFF; border-radius: 999px; padding: 6px 12px; font-size: 13px; cursor: pointer">Salin</button></span></div>
${codeField("Kode 6 digit")}${err}${actions("Aktifkan")}`;
      q("[data-totp-copy]")?.addEventListener("click", () => void navigator.clipboard?.writeText(secret).then(() => fail("")));
      bind(async () => {
        const code = q<HTMLInputElement>("[data-totp-code]")?.value.trim() ?? "";
        if (code.length !== 6) return fail("Masukkan 6 digit kode dari aplikasi.");
        const rr = await call("POST", "/api/me/2fa/totp/enable", { code });
        if (!rr.ok) return fail(why(rr, "Kode tidak cocok."));
        close(true);
      });
    });
  });
}

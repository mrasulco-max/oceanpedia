/**
 * Dialog aplikasi autentikator (TOTP): aktifkan (pindai QR / salin kunci → masukkan kode → simpan kode cadangan),
 * matikan, atau buat ulang kode cadangan.
 * QR dibuat di perangkat (lib/qr) — rahasia tidak dikirim ke layanan pihak ketiga.
 */
import { qrSvg } from "@/lib/qr";

type Res = { ok: boolean; status: number; data: { detail?: string; title?: string; errors?: Record<string, string>; secret?: string; uri?: string; recovery_codes?: string[] } };
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
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Kode 6 digit dari aplikasi, atau kode cadangan "ABCDE-FGH23". */
const isTotp = (v: string) => /^\d{6}$/.test(v);
const isRecovery = (v: string) => v.replace(/[\s-]/g, "").length === 10 && /^[A-Za-z0-9\s-]+$/.test(v);

/** Membuka dialog; resolve true bila berhasil, false bila dibatalkan. */
export function totpDialog(mode: "enable" | "disable" | "recovery"): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", mode === "enable" ? "Aktifkan aplikasi autentikator" : mode === "disable" ? "Matikan aplikasi autentikator" : "Kode cadangan");
    wrap.style.cssText = "position: fixed; inset: 0; z-index: 1000; background: rgba(11,11,15,.5); display: flex; align-items: flex-end; justify-content: center; font-family: Roboto, Arial, sans-serif";
    const box = document.createElement("div");
    box.style.cssText = "width: 100%; max-width: 440px; max-height: 92dvh; overflow-y: auto; background: #FFFFFF; color: #0B0B0F; border-radius: 24px 24px 0 0; padding: 20px 20px max(20px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; box-sizing: border-box";
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    // Saat kode cadangan sedang ditampilkan, dialog tidak boleh tertutup tanpa sengaja.
    let locked = false;
    let result = false;
    const close = (ok: boolean) => {
      wrap.remove();
      document.removeEventListener("keydown", onEsc);
      resolve(ok);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && !locked && close(result);
    document.addEventListener("keydown", onEsc);
    wrap.addEventListener("click", (e) => e.target === wrap && !locked && close(result));

    const codeField = (ph: string, recovery = false) =>
      recovery
        ? `<input data-totp-code autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="11" placeholder="${ph}" style="min-height: 52px; border-radius: 14px; border: 1px solid #E3EAF4; background: #F6F8FC; padding: 0 16px; font-size: 20px; letter-spacing: .18em; text-align: center; font-family: 'Roboto Mono', monospace; text-transform: uppercase">`
        : `<input data-totp-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${ph}" style="min-height: 52px; border-radius: 14px; border: 1px solid #E3EAF4; background: #F6F8FC; padding: 0 16px; font-size: 22px; letter-spacing: .3em; text-align: center; font-family: 'Roboto Mono', monospace">`;
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
      let busy = false;
      const go = async () => {
        if (busy) return;
        busy = true;
        q("[data-totp-ok]")?.setAttribute("aria-busy", "true");
        try {
          await submit();
        } finally {
          busy = false;
          q("[data-totp-ok]")?.removeAttribute("aria-busy");
        }
      };
      q("[data-totp-ok]")?.addEventListener("click", () => void go());
      const inp = q<HTMLInputElement>("[data-totp-code]");
      inp?.addEventListener("keydown", (e) => e.key === "Enter" && void go());
      inp?.addEventListener("input", () => {
        if (inp.inputMode === "numeric") inp.value = inp.value.replace(/\D/g, "").slice(0, 6);
      });
      inp?.focus();
    };

    /** Tampilkan kode cadangan (sekali saja) — wajib dikonfirmasi sudah disimpan sebelum menutup. */
    const showCodes = (codes: string[], intro: string) => {
      locked = true;
      result = true;
      const list = codes.map((c) => `<code style="padding: 8px 0; text-align: center; font-size: 16px; letter-spacing: .06em; background: #F6F8FC; border-radius: 10px">${esc(c)}</code>`).join("");
      box.innerHTML = `<strong style="font-size: 18px">Simpan kode cadangan</strong>
<p style="margin: 0; font-size: 14px; line-height: 1.5; color: #5F6B7D">${intro} Setiap kode hanya bisa dipakai <b>sekali</b> untuk masuk bila ponsel hilang. Simpan di tempat aman (pengelola kata sandi atau kertas). Kode ini <b>tidak akan ditampilkan lagi</b>.</p>
<div data-totp-codes style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: 'Roboto Mono', monospace">${list}</div>
<div style="display: flex; gap: 10px"><button type="button" data-totp-copy style="${BTN}; flex: 1; background: #F1F5F9; color: #0B0B0F">Salin</button><button type="button" data-totp-dl style="${BTN}; flex: 1; background: #F1F5F9; color: #0B0B0F">Unduh .txt</button></div>
<label style="display: flex; gap: 10px; align-items: center; font-size: 14px; color: #374151"><input type="checkbox" data-totp-saved style="width: 20px; height: 20px">Saya sudah menyimpan kode cadangan ini</label>
${err}<button type="button" data-totp-done disabled style="${BTN}; background: #2F74EB; color: #FFFFFF; opacity: .5">Selesai</button>`;
      const text = `Kode cadangan OceanBird (masing-masing sekali pakai)\nDibuat: ${new Date().toLocaleString("id-ID")}\n\n${codes.join("\n")}\n`;
      q("[data-totp-copy]")?.addEventListener("click", () => {
        void navigator.clipboard?.writeText(text).then(
          () => fail(""),
          () => fail("Tidak bisa menyalin otomatis. Catat kode secara manual."),
        );
      });
      q("[data-totp-dl]")?.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        a.download = "oceanbird-kode-cadangan.txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      const saved = q<HTMLInputElement>("[data-totp-saved]");
      const done = q<HTMLButtonElement>("[data-totp-done]");
      saved?.addEventListener("change", () => {
        if (!done) return;
        done.disabled = !saved.checked;
        done.style.opacity = saved.checked ? "1" : ".5";
      });
      done?.addEventListener("click", () => close(true));
    };

    if (mode === "disable" || mode === "recovery") {
      const title = mode === "disable" ? "Matikan aplikasi autentikator" : "Buat kode cadangan baru";
      const intro =
        mode === "disable"
          ? "Masukkan kode 6 digit dari aplikasi atau salah satu kode cadangan. Tidak punya keduanya? Isi kata sandi akun."
          : "Konfirmasi dengan kode 6 digit dari aplikasi, kode cadangan, atau kata sandi. Semua kode cadangan lama langsung tidak berlaku.";
      box.innerHTML = `<strong style="font-size: 18px">${title}</strong><p style="margin: 0; font-size: 14px; line-height: 1.5; color: #5F6B7D">${intro}</p>${codeField("Kode 6 digit / cadangan", true)}<input data-totp-pw type="password" autocomplete="current-password" placeholder="atau kata sandi" style="min-height: 48px; border-radius: 14px; border: 1px solid #E3EAF4; background: #F6F8FC; padding: 0 16px; font-size: 15px">${err}${actions(mode === "disable" ? "Matikan" : "Buat kode baru")}`;
      bind(async () => {
        const code = q<HTMLInputElement>("[data-totp-code]")?.value.trim() ?? "";
        const password = q<HTMLInputElement>("[data-totp-pw]")?.value ?? "";
        if (!isTotp(code) && !isRecovery(code) && !password) return fail("Isi kode 6 digit, kode cadangan, atau kata sandi.");
        const r = await call("POST", mode === "disable" ? "/api/me/2fa/totp/disable" : "/api/me/2fa/totp/recovery", { code, password });
        if (!r.ok) return fail(why(r, mode === "disable" ? "Gagal mematikan." : "Gagal membuat kode baru."));
        if (mode === "recovery" && r.data.recovery_codes?.length) return showCodes(r.data.recovery_codes, "Kode cadangan baru sudah dibuat dan kode lama tidak berlaku.");
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
        if (rr.data.recovery_codes?.length) return showCodes(rr.data.recovery_codes, "Aplikasi autentikator sudah aktif.");
        close(true);
      });
    });
  });
}

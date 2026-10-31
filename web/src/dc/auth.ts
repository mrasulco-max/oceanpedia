/**
 * Enhancer "auth": alur akun sungguhan di atas desain.
 *  - Daftar: validasi + POST /api/auth/register → halaman verifikasi kode (OTP dikirim ke email).
 *  - Verifikasi: 6 karakter huruf & angka (ketik, tempel, atau isi otomatis) → POST /api/auth/verify → langsung masuk.
 *  - Lupa kata sandi & masuk dengan kode: kirim kode → verifikasi → atur sandi baru / masuk.
 * Akun yang sudah terverifikasi masuk biasa tanpa OTP (lihat enhancer "login").
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

type Problem = { title?: string; detail?: string; errors?: Record<string, string>; type?: string; masked_email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RULES = {
  len: (p: string) => p.length >= 8,
  alnum: (p: string) => /[A-Za-z]/.test(p) && /[0-9]/.test(p),
  upper: (p: string) => /[A-Z]/.test(p),
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Problem & Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Problem & Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function problemText(p: Problem, fallback: string): string {
  if (p.errors) {
    const first = Object.values(p.errors)[0];
    if (first) return first;
  }
  return p.detail || p.title || fallback;
}

/** Arahkan ke halaman verifikasi kode. */
export function verifyUrl(email: string, mode: "signup" | "login" | "reset", next?: string): string {
  const q = new URLSearchParams({ email, mode });
  if (next && next.startsWith("/") && !next.startsWith("//")) q.set("next", next);
  return `/verifikasi?${q.toString()}`;
}

export function auth(host: HTMLElement, { router, ctx }: Env): Cleanup {
  const offs: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, capture = true) => {
    host.addEventListener(type, fn as EventListener, capture);
    offs.push(() => host.removeEventListener(type, fn as EventListener, capture));
  };
  const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel);
  let busy = false;

  // ---------------------------------------------------------------- indikator aturan kata sandi
  const paintRules = () => {
    const pw = $<HTMLInputElement>("[data-reg-password]")?.value ?? "";
    host.querySelectorAll<HTMLElement>("[data-rule]").forEach((el) => {
      const ok = RULES[el.dataset.rule as keyof typeof RULES]?.(pw) ?? false;
      el.style.color = ok ? "#166534" : "#6B7280";
      const dot = el.querySelector<HTMLElement>("[data-rule-dot]");
      if (dot) dot.style.background = ok ? "#22C55E" : "#E3EAF4";
    });
  };
  on("input", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.matches("[data-reg-password]")) paintRules();
  });
  paintRules();

  // ---------------------------------------------------------------- persetujuan syarat
  const setTerms = (el: HTMLElement, v: boolean) => {
    el.setAttribute("aria-checked", v ? "true" : "false");
    const box = el.querySelector<HTMLElement>("[data-reg-terms-box]");
    if (box) {
      box.style.background = v ? "#4285F4" : "#FFFFFF";
      box.style.border = v ? "0" : "1.5px solid #C9D3E1";
    }
  };
  const toggleTerms = (e: Event) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-reg-terms]") : null;
    if (!t || (e.target instanceof Element && e.target.closest("a"))) return false;
    e.preventDefault();
    e.stopPropagation();
    setTerms(t, t.getAttribute("aria-checked") !== "true");
    return true;
  };
  on("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && e.target instanceof HTMLElement && e.target.matches("[data-reg-terms]")) toggleTerms(e);
  });

  // ---------------------------------------------------------------- daftar
  const register = async (btn: Element) => {
    const val = (sel: string) => $<HTMLInputElement>(sel)?.value.trim() ?? "";
    const full_name = val("[data-reg-name]");
    const email = val("[data-reg-email]").toLowerCase();
    const phone = val("[data-reg-phone]");
    const password = $<HTMLInputElement>("[data-reg-password]")?.value ?? "";
    if (full_name.length < 2) return toast(host, "Isi nama lengkap.");
    if (!EMAIL_RE.test(email)) return toast(host, "Format email tidak valid.");
    if (!Object.values(RULES).every((r) => r(password))) return toast(host, "Kata sandi min. 8 karakter, berisi huruf & angka, dan 1 huruf besar.");
    if ($("[data-reg-terms]")?.getAttribute("aria-checked") !== "true") return toast(host, "Setujui Syarat & Ketentuan terlebih dahulu.");
    busy = true;
    btn.setAttribute("aria-busy", "true");
    try {
      const r = await post("/api/auth/register", { full_name, email, phone, password });
      if (r.status === 202) {
        toast(host, r.data.otp_sent === false ? "Akun dibuat. Kode belum terkirim, ketuk “Kirim ulang kode”." : "Kode verifikasi dikirim ke email kamu.", "ok");
        router.push(verifyUrl(email, "signup", ctx.next));
      } else if (r.status === 409) {
        toast(host, problemText(r.data, "Email sudah terdaftar. Silakan masuk."));
      } else toast(host, problemText(r.data, "Gagal mendaftar. Coba lagi."));
    } catch {
      toast(host, "Koneksi bermasalah. Coba lagi.");
    } finally {
      busy = false;
      btn.removeAttribute("aria-busy");
    }
  };

  // ---------------------------------------------------------------- kirim kode (lupa sandi / masuk dengan kode)
  const loginEmail = () => ($<HTMLInputElement>("[data-forgot-email]")?.value.trim() || $<HTMLInputElement>("[data-login-email]")?.value.trim() || "").toLowerCase();
  const sendCode = async (email: string, mode: "login" | "reset") => {
    if (!EMAIL_RE.test(email)) return toast(host, "Isi email akun kamu terlebih dahulu.");
    busy = true;
    try {
      const r = await post("/api/auth/otp", { email });
      if (r.ok) {
        toast(host, "Jika email terdaftar, kode dikirim ke email tersebut.", "ok");
        router.push(verifyUrl(email, mode, ctx.next));
      } else toast(host, problemText(r.data, "Gagal mengirim kode. Coba lagi."));
    } catch {
      toast(host, "Koneksi bermasalah. Coba lagi.");
    } finally {
      busy = false;
    }
  };

  // ---------------------------------------------------------------- verifikasi kode
  const group = $<HTMLElement>("[data-otp]");
  const input = $<HTMLInputElement>("[data-otp-input]");
  let email = group?.dataset.otpEmail ?? "";
  const mode = (group?.dataset.otpMode ?? "signup") as "signup" | "login" | "reset";
  const next = group?.dataset.otpNext || "/";
  let timer = 0;

  const paintBoxes = () => {
    if (!group || !input) return;
    const v = input.value;
    group.querySelectorAll<HTMLElement>("[data-otp-box]").forEach((b, i) => {
      b.textContent = v[i] ?? "";
      const active = i === Math.min(v.length, 5) && document.activeElement === input;
      b.style.border = active ? "2px solid #4285F4" : "1px solid #E3EAF4";
      b.style.background = v[i] || active ? "#FFFFFF" : "#F6F8FC";
    });
  };
  const setCode = (v: string) => {
    if (!input) return;
    input.value = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
    paintBoxes();
    if (input.value.length === 6 && mode !== "reset") void submitCode();
  };
  const startTimer = (sec: number) => {
    window.clearInterval(timer);
    const wait = $<HTMLElement>("[data-otp-wait]");
    const resend = $<HTMLElement>("[data-otp-resend]");
    const t = $<HTMLElement>("[data-otp-timer]");
    let left = sec;
    const tick = () => {
      if (t) t.textContent = `00:${String(Math.max(left, 0)).padStart(2, "0")}`;
      if (left <= 0) {
        window.clearInterval(timer);
        if (wait) wait.style.display = "none";
        if (resend) resend.style.display = "inline";
      }
      left--;
    };
    if (wait) wait.style.display = "inline";
    if (resend) resend.style.display = "none";
    tick();
    timer = window.setInterval(tick, 1000);
  };
  const submitCode = async () => {
    if (busy || !input) return;
    const code = input.value;
    if (!email) return toast(host, "Isi email lalu ketuk “Kirim kode”.");
    if (code.length !== 6) return toast(host, "Masukkan 6 karakter kode dari email.");
    const pw = $<HTMLInputElement>("[data-otp-password]")?.value ?? "";
    if (mode === "reset" && !Object.values(RULES).every((r) => r(pw))) return toast(host, "Kata sandi baru min. 8 karakter, berisi huruf & angka, dan 1 huruf besar.");
    busy = true;
    const btn = $("[data-otp-submit]");
    btn?.setAttribute("aria-busy", "true");
    try {
      const r = mode === "reset" ? await post("/api/auth/reset", { email, code, password: pw }) : await post("/api/auth/verify", { email, code });
      if (r.ok) {
        toast(host, mode === "reset" ? "Kata sandi diperbarui. Kamu sudah masuk." : mode === "signup" ? "Akun terverifikasi. Selamat datang!" : "Berhasil masuk.", "ok");
        window.clearInterval(timer);
        router.push(next);
        router.refresh();
      } else {
        toast(host, problemText(r.data, "Kode salah atau kedaluwarsa."));
        setCode("");
        input.focus();
      }
    } catch {
      toast(host, "Koneksi bermasalah. Coba lagi.");
    } finally {
      busy = false;
      btn?.removeAttribute("aria-busy");
    }
  };
  const resend = async () => {
    if (!EMAIL_RE.test(email)) return toast(host, "Isi email akun kamu terlebih dahulu.");
    const r = await post("/api/auth/otp", { email }).catch(() => null);
    if (!r) return toast(host, "Koneksi bermasalah. Coba lagi.");
    if (r.ok) {
      toast(host, "Kode baru dikirim. Periksa email (dan folder spam).", "ok");
      startTimer(45);
    } else toast(host, problemText(r.data, "Gagal mengirim kode."));
  };

  if (group && input) {
    if (email) {
      startTimer(45);
      input.focus();
    }
    paintBoxes();
    const onInput = () => setCode(input.value);
    const onFocus = () => paintBoxes();
    input.addEventListener("input", onInput);
    input.addEventListener("focus", onFocus);
    input.addEventListener("blur", onFocus);
    offs.push(() => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onFocus);
      window.clearInterval(timer);
    });
  }

  // ---------------------------------------------------------------- klik (fase capture: sebelum perilaku contoh desain)
  on("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (toggleTerms(e)) return;
    const hit = (sel: string) => t.closest<HTMLElement>(sel);
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    let el: HTMLElement | null;
    if ((el = hit("[data-reg-submit]"))) {
      stop();
      if (!busy) void register(el);
    } else if ((el = hit("[data-auth-soon]"))) {
      stop();
      toast(host, `Masuk dengan ${el.dataset.authSoon} belum tersedia. Gunakan email.`);
    } else if (hit("[data-forgot-submit]")) {
      stop();
      if (!busy) void sendCode(loginEmail(), "reset");
    } else if (hit("[data-auth-forgot]")) {
      stop();
      const em = loginEmail();
      if (em) void sendCode(em, "reset");
      else router.push("/verifikasi?mode=reset");
    } else if (hit("[data-auth-otp]")) {
      stop();
      const em = loginEmail();
      if (em) void sendCode(em, "login");
      else router.push("/verifikasi?mode=login");
    } else if (hit("[data-otp-submit]")) {
      stop();
      void submitCode();
    } else if (hit("[data-otp-resend]")) {
      stop();
      void resend();
    } else if (hit("[data-otp-send]")) {
      stop();
      const em = $<HTMLInputElement>("[data-otp-email-input]")?.value.trim().toLowerCase() ?? "";
      if (!EMAIL_RE.test(em)) return toast(host, "Format email tidak valid.");
      email = em;
      if (group) group.dataset.otpEmail = em;
      void resend().then(() => input?.focus());
    } else if ((el = hit("[data-key]"))) {
      stop();
      const k = el.dataset.key!;
      if (input) setCode(k === "del" ? input.value.slice(0, -1) : input.value + k);
    }
  });
  on("keydown", (e) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      if (e.target.matches("[data-reg-name],[data-reg-email],[data-reg-phone],[data-reg-password]") && $("[data-reg-submit]")) {
        e.preventDefault();
        $<HTMLElement>("[data-reg-submit]")?.click();
      } else if (e.target.matches("[data-otp-input],[data-otp-password]")) {
        e.preventDefault();
        void submitCode();
      } else if (e.target.matches("[data-otp-email-input]")) {
        e.preventDefault();
        $<HTMLElement>("[data-otp-send]")?.click();
      } else if (e.target.matches("[data-forgot-email]")) {
        e.preventDefault();
        void sendCode(loginEmail(), "reset");
      }
    }
  });

  return () => offs.forEach((f) => f());
}

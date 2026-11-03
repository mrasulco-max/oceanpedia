/**
 * Enhancer: perilaku nyata yang ditempelkan ke board desain setelah tampil,
 * tanpa mengubah tampilannya (mis. form login memanggil API sungguhan).
 */
import type { useRouter } from "next/navigation";
import { toast } from "./toast";
import { content, editor } from "./editorial";
import { tvchart } from "./tvchart";
import { lwchart } from "./lwchart";
import { ai } from "./ai";
import { auth, verifyUrl } from "./auth";
import { search } from "./search";
import { profile } from "./profile";
import { rbac } from "./rbac";
import { activity, catform, medialib, moderation, taxonomy } from "./cms";
import { ops, twofa } from "./ops";
import { reader } from "./reader";

export type EnhancerId = "login" | "logout" | "editor" | "content" | "tvchart" | "lwchart" | "ai" | "auth" | "search" | "profile" | "rbac" | "taxonomy" | "catform" | "moderation" | "medialib" | "activity" | "ops" | "twofa" | "reader";

export interface Env {
  router: ReturnType<typeof useRouter>;
  ctx: Record<string, string>;
}

export type Cleanup = (() => void) | void;

/** Form login (app, web, admin): input email + sandi → /api/auth/login (cookie httpOnly). */
function login(host: HTMLElement, { router, ctx }: Env): Cleanup {
  let busy = false;
  const onClick = async (e: Event) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-login-submit]") : null;
    if (!btn || !host.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const scope = btn.closest("[data-login-form]") ?? host;
    const email = scope.querySelector<HTMLInputElement>("input[data-login-email]")?.value.trim() ?? "";
    const password = scope.querySelector<HTMLInputElement>("input[data-login-password]")?.value ?? "";
    if (!email || !password) {
      toast(host, "Isi email dan kata sandi terlebih dahulu.");
      return;
    }
    busy = true;
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: { role?: string; is_staff?: boolean }; detail?: string; type?: string; errors?: Record<string, string> };
      if (res.status === 403 && data.type?.includes("verification-required")) {
        // Akun baru yang belum konfirmasi OTP: kode sudah dikirim, lanjut ke verifikasi.
        toast(host, data.detail ?? "Konfirmasi akun dengan kode yang dikirim ke email.", "ok");
        router.push(verifyUrl(data.errors?.email ?? email, "signup", ctx.next));
        return;
      }
      if (res.status === 403 && data.type?.includes("two-factor-required")) {
        // Staf: verifikasi 2 langkah — kode dikirim ke email, challenge disimpan untuk langkah berikutnya.
        try {
          sessionStorage.setItem("ob_2fa", data.errors?.challenge ?? "");
        } catch {
          /* penyimpanan diblokir */
        }
        toast(host, data.detail ?? "Kode verifikasi dikirim ke email Anda.", "ok");
        const nx = ctx.next?.startsWith("/admin") ? ctx.next : "/admin";
        router.push(`/admin/masuk/verifikasi?email=${encodeURIComponent(data.errors?.email ?? email)}&next=${encodeURIComponent(nx)}`);
        return;
      }
      if (!res.ok) {
        toast(host, data.detail ?? "Gagal masuk. Coba lagi.");
        return;
      }
      // Panel admin: akses ditentukan izin peran di database (RBAC), bukan daftar peran tetap.
      if (ctx.requireStaff === "1" && !data.user?.is_staff) {
        await fetch("/api/auth/logout", { method: "POST" });
        toast(host, "Akun ini tidak punya akses ke panel admin.");
        return;
      }
      toast(host, "Berhasil masuk.", "ok");
      // Navigasi baru selalu merender ulang halaman dinamis dengan sesi terbaru.
      router.push(ctx.next || "/");
    } catch {
      toast(host, "Koneksi bermasalah. Coba lagi.");
    } finally {
      busy = false;
      btn.removeAttribute("aria-busy");
    }
  };
  // Fase capture: berjalan sebelum handler desain & navigasi tautan.
  host.addEventListener("click", onClick, true);
  // Enter pada input sandi = kirim.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement) || !e.target.matches("[data-login-password],[data-login-email]")) return;
    const scope = e.target.closest("[data-login-form]") ?? host;
    scope.querySelector<HTMLElement>("[data-login-submit]")?.click();
  };
  host.addEventListener("keydown", onKey);
  return () => {
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("keydown", onKey);
  };
}

/** Tombol keluar: elemen [data-logout] → hapus sesi. */
function logout(host: HTMLElement, { router }: Env): Cleanup {
  const onClick = async (e: Event) => {
    const btn = e.target instanceof Element ? e.target.closest("[data-logout]") : null;
    if (!btn || !host.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    toast(host, "Kamu sudah keluar.", "ok");
    router.push(btn.getAttribute("data-logout") || "/");
    router.refresh();
  };
  host.addEventListener("click", onClick, true);
  return () => host.removeEventListener("click", onClick, true);
}

const REGISTRY: Record<EnhancerId, (host: HTMLElement, env: Env) => Cleanup> = { login, logout, editor, content, tvchart, lwchart, ai, auth, search, profile, rbac, taxonomy, catform, moderation, medialib, activity, ops, twofa, reader };

export function runEnhancer(id: EnhancerId, host: HTMLElement, env: Env): Cleanup {
  return REGISTRY[id]?.(host, env);
}

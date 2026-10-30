/**
 * Enhancer: perilaku nyata yang ditempelkan ke board desain setelah tampil,
 * tanpa mengubah tampilannya (mis. form login memanggil API sungguhan).
 */
import type { useRouter } from "next/navigation";

export type EnhancerId = "login" | "logout";

interface Env {
  router: ReturnType<typeof useRouter>;
  ctx: Record<string, string>;
}

type Cleanup = (() => void) | void;

function toast(_host: Element, text: string, kind: "error" | "ok" = "error"): void {
  let el = document.querySelector<HTMLDivElement>(".dc-flash");
  if (!el) {
    el = document.createElement("div");
    el.className = "dc-flash";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.kind = kind;
  el.dataset.on = "1";
  window.clearTimeout(Number(el.dataset.t ?? 0));
  el.dataset.t = String(window.setTimeout(() => el && (el.dataset.on = "0"), 3200));
}

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
      const data = (await res.json().catch(() => ({}))) as { user?: { role?: string }; detail?: string };
      if (!res.ok) {
        toast(host, data.detail ?? "Gagal masuk. Coba lagi.");
        return;
      }
      const need = ctx.requireRole?.split(",").filter(Boolean) ?? [];
      if (need.length && !need.includes(data.user?.role ?? "")) {
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
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(btn.getAttribute("data-logout") || "/");
  };
  host.addEventListener("click", onClick, true);
  return () => host.removeEventListener("click", onClick, true);
}

const REGISTRY: Record<EnhancerId, (host: HTMLElement, env: Env) => Cleanup> = { login, logout };

export function runEnhancer(id: EnhancerId, host: HTMLElement, env: Env): Cleanup {
  return REGISTRY[id]?.(host, env);
}

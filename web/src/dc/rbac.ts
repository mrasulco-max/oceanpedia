/**
 * Enhancer "rbac" (halaman Role & Akses): matriks izin, role baru, undangan staf, ubah role & blokir.
 * Semua lewat BFF /api/admin/* → API Go /v1/admin/rbac*, /v1/admin/users/* (izin dicek di server dari database).
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

interface Problem {
  title?: string;
  detail?: string;
  errors?: Record<string, string>;
}

async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Problem & Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as Problem & Record<string, unknown>);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}
const msg = (d: Problem, fb: string) => (d.errors && Object.values(d.errors)[0]) || d.detail || d.title || fb;

export function rbac(host: HTMLElement, { router }: Env): Cleanup {
  const matrix = host.querySelector<HTMLElement>('[data-rb="matrix"]');
  const onStyle = matrix?.dataset.onStyle ?? "";
  const offStyle = matrix?.dataset.offStyle ?? "";
  const check = matrix?.dataset.check ?? "";
  let dirty = false;
  let busy = false;

  const setCell = (btn: HTMLElement, on: boolean) => {
    btn.setAttribute("aria-checked", String(on));
    btn.setAttribute("style", `${on ? onStyle : offStyle}; cursor: pointer`);
    btn.innerHTML = on ? check : "";
  };

  const collect = (): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    host.querySelectorAll<HTMLElement>("[data-rb-cell]").forEach((b) => {
      const role = b.dataset.role!;
      out[role] ??= [];
      if (b.getAttribute("aria-checked") === "true") out[role]!.push(b.dataset.perm!);
    });
    delete out.superadmin;
    return out;
  };

  const run = async (el: HTMLElement, fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    el.setAttribute("aria-busy", "true");
    try {
      await fn();
    } finally {
      busy = false;
      el.removeAttribute("aria-busy");
    }
  };

  const done = (text: string) => {
    toast(host, text, "ok");
    dirty = false;
    router.refresh();
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    const cell = t.closest<HTMLElement>("[data-rb-cell]");
    if (cell) {
      stop();
      if (cell.getAttribute("aria-disabled") === "true") return toast(host, "Super Admin selalu punya semua izin.");
      setCell(cell, cell.getAttribute("aria-checked") !== "true");
      dirty = true;
      return;
    }
    const cat = t.closest<HTMLElement>("[data-rb-cat]");
    if (cat) {
      stop();
      const on = cat.getAttribute("aria-pressed") !== "true";
      cat.setAttribute("aria-pressed", String(on));
      cat.style.background = on ? "#E5ECFF" : "#FFFFFF";
      cat.style.borderColor = on ? "#4285F4" : "#E3EBF7";
      cat.style.color = on ? "#1E40AF" : "#0B0B0F";
      return;
    }
    const del = t.closest<HTMLElement>("[data-rb-delete-role]");
    if (del) {
      stop();
      const key = del.dataset.rbDeleteRole!;
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "Ketuk lagi untuk hapus";
        return;
      }
      void run(del, async () => {
        const r = await call("DELETE", `rbac/roles/${encodeURIComponent(key)}`);
        if (!r.ok) return toast(host, msg(r.data, "Role gagal dihapus."));
        done("Role dihapus.");
      });
      return;
    }
    const revoke = t.closest<HTMLElement>("[data-rb-revoke]");
    if (revoke) {
      stop();
      void run(revoke, async () => {
        const r = await call("DELETE", `rbac/invitations/${revoke.dataset.rbRevoke}`);
        if (!r.ok) return toast(host, msg(r.data, "Undangan gagal dibatalkan."));
        done("Undangan dibatalkan.");
      });
      return;
    }
    const block = t.closest<HTMLElement>("[data-rb-block]");
    if (block) {
      stop();
      const blocked = block.dataset.blocked !== "true";
      if (blocked && block.dataset.armed !== "1") {
        block.dataset.armed = "1";
        block.textContent = "Ketuk lagi untuk blokir";
        return;
      }
      void run(block, async () => {
        const r = await call("POST", `users/${block.dataset.rbBlock}/block`, { blocked });
        if (!r.ok) return toast(host, msg(r.data, "Gagal mengubah status blokir."));
        done(blocked ? "Akun diblokir dan semua sesinya dikeluarkan." : "Blokir dibuka.");
      });
      return;
    }
    const act = t.closest<HTMLElement>("[data-rb-action]");
    if (!act) return;
    stop();
    const action = act.dataset.rbAction;
    const form = host.querySelector<HTMLElement>('[data-rb="new-role"]');
    if (action === "new-role" && form) {
      form.hidden = false;
      form.scrollIntoView({ block: "center", behavior: "smooth" });
      host.querySelector<HTMLInputElement>('[data-rb="role-name"]')?.focus({ preventScroll: true });
    } else if (action === "cancel-role" && form) {
      form.hidden = true;
    } else if (action === "create-role") {
      const name = host.querySelector<HTMLInputElement>('[data-rb="role-name"]')?.value.trim() ?? "";
      const description = host.querySelector<HTMLInputElement>('[data-rb="role-desc"]')?.value.trim() ?? "";
      if (name.length < 2) return toast(host, "Isi nama role (minimal 2 karakter).");
      void run(act, async () => {
        const r = await call("POST", "rbac/roles", { name, description });
        if (!r.ok) return toast(host, msg(r.data, "Role gagal dibuat."));
        done(`Role “${name}” dibuat. Centang izinnya di matriks lalu simpan.`);
      });
    } else if (action === "save-matrix") {
      if (!dirty) return toast(host, "Belum ada perubahan izin.");
      void run(act, async () => {
        const r = await call("PUT", "rbac/matrix", { matrix: collect() });
        if (!r.ok) return toast(host, msg(r.data, "Matriks gagal disimpan."));
        done("Matriks izin disimpan & tercatat di log aktivitas.");
      });
    } else if (action === "invite") {
      const email = host.querySelector<HTMLInputElement>('[data-rb="invite-email"]')?.value.trim() ?? "";
      const role = host.querySelector<HTMLSelectElement>('[data-rb="invite-role"]')?.value ?? "";
      const categories = [...host.querySelectorAll<HTMLElement>('[data-rb-cat][aria-pressed="true"]')].map((c) => c.dataset.rbCat!);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(host, "Isi email kerja yang valid.");
      void run(act, async () => {
        const r = await call("POST", "rbac/invitations", { email, role, categories });
        if (!r.ok) return toast(host, msg(r.data, "Undangan gagal dikirim."));
        if (r.data.email_sent) return done(`Email undangan terkirim ke ${email}. Role berlaku saat ia masuk/daftar dalam 48 jam.`);
        const link = String(r.data.invite_url ?? "");
        try {
          await navigator.clipboard.writeText(link);
          done(`Undangan dibuat, tapi email belum bisa dikirim. Tautan pendaftaran disalin — kirim ke ${email}.`);
        } catch {
          done(`Undangan dibuat. Kirim tautan ini ke ${email}: ${link}`);
        }
      });
    }
  };

  const onChange = (e: Event) => {
    const sel = e.target instanceof HTMLSelectElement && e.target.dataset.rbUserRole ? e.target : null;
    if (!sel) return;
    const prev = [...sel.options].find((o) => o.defaultSelected)?.value ?? "";
    void run(sel, async () => {
      const r = await call("PATCH", `users/${sel.dataset.rbUserRole}/role`, { role: sel.value });
      if (!r.ok) {
        sel.value = prev;
        return toast(host, msg(r.data, "Role gagal diubah."));
      }
      done("Role diperbarui. Izin baru langsung berlaku.");
    });
  };

  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) e.preventDefault();
  };

  host.addEventListener("click", onClick, true);
  host.addEventListener("change", onChange);
  window.addEventListener("beforeunload", beforeUnload);
  return () => {
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("change", onChange);
    window.removeEventListener("beforeunload", beforeUnload);
  };
}

/**
 * Enhancer "profile": halaman profil & pengaturan tersambung ke API (/api/me/*).
 *  - simpan data diri, preferensi (sakelar web & state desain aplikasi), ganti kata sandi,
 *    keluarkan perangkat lain, dan fitur yang belum tersedia diberi keterangan jujur.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

type Res = { ok: boolean; status: number; data: { detail?: string; title?: string; errors?: Record<string, string> } & Record<string, unknown> };

async function call(method: string, url: string, body?: unknown): Promise<Res> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as Res["data"]);
  return { ok: res.ok, status: res.status, data };
}
const msg = (r: Res, fb: string) => (r.data.errors && Object.values(r.data.errors)[0]) || r.data.detail || r.data.title || fb;

const SWITCH_ON = "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #4285F4; display: flex; justify-content: flex-end";
const SWITCH_OFF = "flex: none; width: 50px; height: 30px; border-radius: 999px; border: 0; padding: 3px; background: #D6DEEA; display: flex; justify-content: flex-start";
const RULES = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p) && /[A-Z]/.test(p);

// State desain pengaturan (app-21) ↔ preferensi.
const SWITCH: [string, string][] = [["u2", "reduce_motion"], ["u3", "autoplay_video"], ["u4", "breaking"], ["u5", "price_alert"], ["u6", "topics_notif"], ["u7", "morning_digest"], ["u8", "comment_replies"]];
const OPTION: [string, string, string[]][] = [
  ["quiet", "quiet_hours", ["off", "21-06", "22-06", "23-07"]],
  ["lang", "language", ["id", "en"]],
  ["tz", "timezone", ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]],
  ["num", "number_format", ["id", "en", "space"]],
];
const THEMES = ["light", "dark", "system"];

function prefsFromState(st: { u?: Record<string, boolean[]>; o?: Record<string, number[]> }): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {};
  const t = st.u?.u1?.indexOf(true) ?? -1;
  if (t >= 0) out.theme = THEMES[t]!;
  for (const [k, key] of SWITCH) if (st.u?.[k]) out[key] = !!st.u[k]![0];
  for (const [k, key, vals] of OPTION) {
    const i = st.o?.[k]?.[0];
    if (i != null && vals[i]) out[key] = vals[i]!;
  }
  return out;
}

/** Kecilkan foto ke persegi maks. 512px (potong tengah), JPEG ~85%. */
async function squareJpeg(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const out = Math.min(size, side);
  const c = document.createElement("canvas");
  c.width = c.height = out;
  const g = c.getContext("2d")!;
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, out, out);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
  bmp.close();
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/jpeg", 0.85));
}

export function profile(host: HTMLElement, { router }: Env): Cleanup {
  const offs: (() => void)[] = [];
  const $ = <T extends Element = HTMLInputElement>(sel: string) => host.querySelector<T>(sel);
  const closeSheet = (el: Element) => el.closest('[role="dialog"]')?.querySelector<HTMLElement>('[aria-label="Tutup"]')?.click();
  let busy = false;

  // ---------------------------------------------------------------- preferensi aplikasi: ikuti state desain
  let last = "";
  let timer = 0;
  const onState = (e: Event) => {
    const prefs = prefsFromState((e as CustomEvent).detail ?? {});
    const s = JSON.stringify(prefs);
    if (s === last) return; // mis. lembar dibuka/ditutup tanpa perubahan
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const r = await call("PATCH", "/api/me", { preferences: prefs }).catch(() => null);
      if (r?.ok) last = s;
      else toast(host, r ? msg(r, "Preferensi gagal disimpan.") : "Koneksi bermasalah. Preferensi belum tersimpan.");
    }, 400);
  };
  host.addEventListener("dc:state", onState);
  offs.push(() => {
    host.removeEventListener("dc:state", onState);
    window.clearTimeout(timer);
  });

  // ---------------------------------------------------------------- klik
  const onClick = async (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const hit = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    let el: HTMLElement | null;
    if ((el = hit("[data-avatar-pick]"))) {
      stop();
      if (busy) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast(host, "Pilih berkas foto (JPG, PNG, atau WebP).");
        if (file.size > 20 * 1024 * 1024) return toast(host, "Foto terlalu besar (maks. 20 MB sebelum dikecilkan).");
        busy = true;
        toast(host, "Mengunggah foto…");
        try {
          const blob = await squareJpeg(file).catch(() => null);
          if (!blob) return toast(host, "Foto tidak dapat dibaca. Coba format JPG atau PNG.");
          const fd = new FormData();
          fd.append("file", blob, "avatar.jpg");
          const res = await fetch("/api/me/avatar", { method: "POST", body: fd });
          const data = (await res.json().catch(() => ({}))) as Res["data"];
          if (!res.ok) return toast(host, msg({ ok: false, status: res.status, data }, "Foto gagal diunggah."));
          toast(host, "Foto profil diperbarui.");
          router.refresh();
        } catch {
          toast(host, "Koneksi bermasalah. Foto belum terunggah.");
        } finally {
          busy = false;
        }
      };
      input.click();
      return;
    }
    if ((el = hit("[data-avatar-remove]"))) {
      stop();
      if (busy) return;
      busy = true;
      const r = await call("DELETE", "/api/me/avatar").catch(() => null);
      busy = false;
      if (!r?.ok) return toast(host, r ? msg(r, "Foto gagal dihapus.") : "Koneksi bermasalah.");
      toast(host, "Foto profil dihapus.");
      router.refresh();
      return;
    }
    if ((el = hit("[data-soon]"))) {
      stop();
      toast(host, el.dataset.soon || "Fitur ini segera hadir.");
    } else if ((el = hit("[data-pref]"))) {
      // Sakelar preferensi (web): simpan langsung.
      stop();
      const key = el.dataset.pref!;
      const on = el.getAttribute("aria-checked") !== "true";
      el.setAttribute("aria-checked", String(on));
      el.setAttribute("style", on ? SWITCH_ON : SWITCH_OFF);
      const r = await call("PATCH", "/api/me", { preferences: { [key]: on } }).catch(() => null);
      if (r?.ok) toast(host, "Preferensi disimpan.", "ok");
      else {
        el.setAttribute("aria-checked", String(!on));
        el.setAttribute("style", !on ? SWITCH_ON : SWITCH_OFF);
        toast(host, r ? msg(r, "Gagal menyimpan.") : "Koneksi bermasalah.");
      }
    } else if ((el = hit("[data-prof-reset]"))) {
      stop();
      host.querySelectorAll<HTMLInputElement>("[data-prof-name],[data-prof-display],[data-prof-phone]").forEach((i) => (i.value = i.defaultValue));
    } else if ((el = hit("[data-prof-save]"))) {
      stop();
      if (busy) return;
      const body: Record<string, string> = {};
      const name = $("[data-prof-name]");
      const disp = $("[data-prof-display]");
      const phone = $("[data-prof-phone]");
      if (name) body.full_name = name.value.trim();
      if (disp) body.display_name = disp.value.trim();
      if (phone) body.phone = phone.value.trim();
      if ((body.full_name ?? "x").length < 2) return toast(host, "Nama minimal 2 karakter.");
      busy = true;
      el.setAttribute("aria-busy", "true");
      const r = await call("PATCH", "/api/me", body).catch(() => null);
      busy = false;
      el.removeAttribute("aria-busy");
      if (r?.ok) {
        toast(host, "Profil disimpan.", "ok");
        closeSheet(el);
        router.refresh();
      } else toast(host, r ? msg(r, "Gagal menyimpan profil.") : "Koneksi bermasalah.");
    } else if ((el = hit("[data-pw-save]"))) {
      stop();
      if (busy) return;
      const oldPw = $("[data-pw-old]")?.value ?? "";
      const newPw = $("[data-pw-new]")?.value ?? "";
      const conf = $("[data-pw-confirm]")?.value ?? "";
      if (!oldPw) return toast(host, "Isi kata sandi lama.");
      if (!RULES(newPw)) return toast(host, "Kata sandi baru min. 8 karakter, berisi huruf & angka, dan 1 huruf besar.");
      if (newPw !== conf) return toast(host, "Ulangi kata sandi baru dengan sama persis.");
      busy = true;
      const r = await call("POST", "/api/me/password", { current_password: oldPw, new_password: newPw }).catch(() => null);
      busy = false;
      if (r?.ok) {
        host.querySelectorAll<HTMLInputElement>("[data-pw-old],[data-pw-new],[data-pw-confirm]").forEach((i) => (i.value = ""));
        toast(host, "Kata sandi diperbarui. Perangkat lain sudah dikeluarkan.", "ok");
        closeSheet(el);
        router.refresh();
      } else toast(host, r ? msg(r, "Gagal mengganti kata sandi.") : "Koneksi bermasalah.");
    } else if ((el = hit("[data-session-revoke]"))) {
      stop();
      const id = el.dataset.sessionRevoke!;
      const r = await call("DELETE", `/api/me/sessions/${encodeURIComponent(id)}`).catch(() => null);
      if (r?.ok) {
        host.querySelector(`[data-session-row="${CSS.escape(id)}"]`)?.remove();
        toast(host, "Perangkat dikeluarkan.", "ok");
        router.refresh();
      } else toast(host, r ? msg(r, "Gagal mengeluarkan perangkat.") : "Koneksi bermasalah.");
    }
  };
  host.addEventListener("click", onClick, true);
  offs.push(() => host.removeEventListener("click", onClick, true));
  return () => offs.forEach((f) => f());
}

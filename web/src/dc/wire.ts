/**
 * Enhancer "wire": ikuti kategori/penulis, tambah ke watchlist dari Market web, cari FAQ, formulir
 * Pasang iklan, verifikasi Student, permintaan data pribadi, hapus cache, coba lagi.
 * Semua lewat BFF (/api/me/*, /api/v1/*) — token di cookie httpOnly.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

type Res = { ok: boolean; status: number; data: { title?: string; detail?: string; errors?: Record<string, string> } & Record<string, unknown> };
async function api(method: string, url: string, body?: unknown): Promise<Res> {
  try {
    const r = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = r.status === 204 ? {} : ((await r.json().catch(() => ({}))) as Res["data"]);
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}
const why = (r: Res, fb: string) => (r.data.errors && Object.values(r.data.errors)[0]) || r.data.detail || r.data.title || fb;
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")} rb` : String(n));

export function wire(host: HTMLElement, { router }: Env): Cleanup {
  const offs: (() => void)[] = [];
  const follow = new Map<string, { on: boolean; n?: number }>();
  let busy = false;
  const login = () => router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };

  const apply = () => {
    for (const [key, v] of follow) {
      host.querySelectorAll<HTMLElement>(`[data-follow="${CSS.escape(key)}"]`).forEach((b) => {
        b.setAttribute("aria-pressed", String(v.on));
        const lab = b.querySelector<HTMLElement>("[data-follow-label]");
        if (lab) lab.textContent = v.on ? (b.dataset.on && b.dataset.on !== "Ikuti" && b.dataset.on !== "Notifikasi" ? b.dataset.on : b.hasAttribute("data-follow-alt") ? "Notifikasi aktif" : "Mengikuti") : b.hasAttribute("data-follow-alt") ? "Notifikasi" : "Ikuti";
      });
      if (v.n !== undefined) host.querySelectorAll<HTMLElement>(`[data-follow-count="${CSS.escape(key)}"]`).forEach((c) => (c.textContent = fmt(v.n!)));
    }
  };
  host.addEventListener("dc:state", apply);
  offs.push(() => host.removeEventListener("dc:state", apply));

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !host.contains(t)) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const el = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);

    // Ikuti kategori / penulis.
    const fb = el("[data-follow]");
    if (fb) {
      const design = fb.hasAttribute("data-ev-click");
      if (fb.dataset.logged !== "1") {
        stop();
        return login();
      }
      if (!design) stop();
      const key = fb.dataset.follow!;
      const [kind, slug] = key.split(":") as [string, string];
      const was = follow.get(key)?.on ?? fb.getAttribute("aria-pressed") === "true";
      void run(async () => {
        const r = await api(was ? "DELETE" : "PUT", `/api/me/${kind === "author" ? "authors" : "categories"}/${encodeURIComponent(slug)}`);
        if (r.status === 401) return login();
        if (!r.ok) {
          toast(host, why(r, "Gagal memperbarui."));
          return router.refresh();
        }
        const d = r.data as { following?: boolean; followers?: number };
        follow.set(key, { on: !!d.following, n: d.followers });
        apply();
        toast(host, d.following ? (kind === "author" ? "Kamu mengikuti penulis ini. Tulisan baru masuk ke notifikasi." : "Kategori diikuti. Artikel baru masuk ke notifikasi.") : "Berhenti mengikuti.", "ok");
      });
      return;
    }

    // Market web: tambah ke watchlist.
    const wl = el("[data-wl-sym]");
    if (wl) {
      stop();
      if (wl.dataset.logged !== "1") return login();
      const sym = wl.dataset.wlSym!;
      void run(async () => {
        const r = await api("POST", "/api/me/watchlist", { symbol: sym });
        if (r.status === 401) return login();
        if (!r.ok && r.status !== 409) return toast(host, why(r, "Gagal menambah ke watchlist."));
        toast(host, `${sym} ada di watchlist kamu.`, "ok");
      });
      return;
    }

    if (el("[data-reload]")) {
      stop();
      location.reload();
      return;
    }

    if (el("[data-faq-go]")) {
      stop();
      filterFaq();
      return;
    }

    // Pasang iklan: kirim permintaan ke tim sales.
    if (el('[data-adq="submit"]')) {
      stop();
      const v = (k: string) => host.querySelector<HTMLInputElement>(`[data-adq="${k}"]`)?.value.trim() ?? "";
      const company = v("company");
      const email = v("email");
      if (!company || !email) return toast(host, "Isi nama perusahaan dan email kerja.");
      void run(async () => {
        const r = await api("POST", "/api/v1/ads/inquiries", { company, email, budget: v("budget") });
        if (!r.ok) return toast(host, why(r, "Permintaan gagal dikirim."));
        host.querySelectorAll<HTMLInputElement>("[data-adq]").forEach((i) => "value" in i && (i.value = ""));
        toast(host, "Terima kasih! Tim sales akan menghubungi kamu maks. 1 hari kerja.", "ok");
      });
      return;
    }

    // Verifikasi Student.
    const sb = el('[data-student="submit"]');
    if (sb) {
      stop();
      if (sb.dataset.logged !== "1") return login();
      if (sb.dataset.verified === "1") return router.push("/plus/checkout?plan=student");
      const email = host.querySelector<HTMLInputElement>('[data-student="email"]')?.value.trim() ?? "";
      const nim = host.querySelector<HTMLInputElement>('[data-student="nim"]')?.value.trim() ?? "";
      if (!email || !nim) return toast(host, "Isi email kampus dan NIM.");
      void run(async () => {
        const r = await api("POST", "/api/me/student", { campus_email: email, student_id: nim });
        if (r.status === 401) return login();
        if (!r.ok) return toast(host, why(r, "Pengajuan gagal dikirim."));
        if ((r.data as { verified?: boolean }).verified) return router.push("/plus/checkout?plan=student");
        host.querySelector<HTMLElement>('[role="dialog"] [aria-label="Tutup"]')?.click();
        toast(host, "Pengajuan dikirim. Kami periksa maks. 2 hari kerja; hasilnya masuk ke notifikasi.", "ok");
      });
      return;
    }

    // Permintaan data pribadi.
    const pv = el("[data-privacy]");
    if (pv) {
      if (pv.dataset.logged !== "1") {
        stop();
        return login();
      }
      // Unduh data & hapus akun kini mandiri di halaman Privasi & data.
      stop();
      return router.push("/akun/data");
    }

    // Hapus cache peramban (data offline & gambar).
    if (el("[data-cache-clear]")) {
      void (async () => {
        try {
          if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
          for (const k of Object.keys(localStorage)) if (k.startsWith("ob_cache") || k.startsWith("ob_offline")) localStorage.removeItem(k);
        } catch {
          /* abaikan */
        }
      })();
    }
  };
  host.addEventListener("click", onClick, true);
  offs.push(() => host.removeEventListener("click", onClick, true));

  // Cari FAQ: saring daftar pertanyaan sambil mengetik.
  const filterFaq = () => {
    const q = (host.querySelector<HTMLInputElement>("[data-faq-q]")?.value ?? "").trim().toLowerCase();
    let shown = 0;
    host.querySelectorAll<HTMLElement>("[data-faq]").forEach((f) => {
      const on = !q || (f.textContent ?? "").toLowerCase().includes(q);
      f.style.display = on ? "" : "none";
      if (on) shown++;
    });
    if (q && !shown) toast(host, "Belum ada jawaban untuk itu. Hubungi kami lewat email atau WhatsApp di bawah.");
  };
  const onInput = (e: Event) => {
    if (e.target instanceof HTMLInputElement && e.target.matches("[data-faq-q]")) filterFaq();
  };
  host.addEventListener("input", onInput);
  offs.push(() => host.removeEventListener("input", onInput));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.matches("[data-faq-q]")) {
      e.preventDefault();
      filterFaq();
    }
  };
  host.addEventListener("keydown", onKey);
  offs.push(() => host.removeEventListener("keydown", onKey));

  return () => offs.forEach((f) => f());
}

/**
 * Enhancer Ocean Short ("shorts"): suka, simpan, bagikan (WhatsApp/Telegram/X/salin), dan komentar.
 * Semua lewat BFF /api/v1/shorts/* (token di cookie httpOnly). Board dirender ulang (morph) setiap state
 * desain berubah, jadi status tombol & angka disimpan di sini lalu diterapkan ulang setelah render.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";
import { onMeteredConnection } from "@/lib/display-prefs";

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
const fmt = (n: number) => {
  const nf = new Intl.NumberFormat("id-ID");
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} jt`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")} rb`;
  return nf.format(n);
};

export function shorts(host: HTMLElement, { router }: Env): Cleanup {
  // Putar video otomatis hanya saat Wi-Fi: di data seluler / mode hemat data video tidak diputar sendiri.
  if (onMeteredConnection()) {
    host.querySelectorAll<HTMLVideoElement>("video[autoplay]").forEach((v) => {
      v.autoplay = false;
      v.removeAttribute("autoplay");
      v.pause();
      v.preload = "metadata";
    });
  }
  const meta = host.querySelector<HTMLElement>("[data-sh-meta]");
  if (!meta) return;
  const id = meta.dataset.id ?? "";
  const raw = meta.dataset.url || location.href;
  // Domain aktif pengunjung + path short ini.
  const url = location.origin + (raw.startsWith("/") ? raw : new URL(raw, location.origin).pathname + new URL(raw, location.origin).search);
  const title = meta.dataset.title ?? "Ocean Short";
  const logged = meta.dataset.logged === "1";
  const login = meta.dataset.login || "/masuk";
  const st = { liked: meta.dataset.liked === "1", saved: meta.dataset.saved === "1", likes: Number(meta.dataset.likes ?? 0), comments: Number(meta.dataset.comments ?? 0) };
  const gone = new Set<string>();
  // Keterangan panjang yang sedang dibuka ("selengkapnya") — dipertahankan saat halaman dirender ulang.
  const capOpen = new Set<string>();
  const setCap = (box: HTMLElement, on: boolean) => {
    const s = box.querySelector<HTMLElement>("[data-sh-cap-s]");
    const f = box.querySelector<HTMLElement>("[data-sh-cap-f]");
    const b = box.querySelector<HTMLElement>('[data-sh="cap"]');
    if (s) s.hidden = on;
    if (f) f.hidden = !on;
    if (b) {
      const en = document.documentElement.lang === "en";
      b.textContent = on ? (en ? "less" : "sembunyikan") : en ? "more" : "selengkapnya";
      b.setAttribute("aria-expanded", on ? "true" : "false");
    }
  };
  let busy = false;
  const offs: (() => void)[] = [];

  const apply = () => {
    for (const b of host.querySelectorAll<HTMLElement>('[data-sh="like"], [data-sh="save"]')) {
      const on = b.dataset.sh === "like" ? st.liked : st.saved;
      b.setAttribute("aria-pressed", String(on));
      if (b.tagName === "BUTTON") {
        // Aplikasi: lingkaran ikon biru saat aktif.
        const dot = b.querySelector<HTMLElement>("span");
        if (dot) dot.style.background = on ? "#2F74EB" : "rgba(255,255,255,.18)";
        if (b.dataset.sh === "save") {
          const txt = [...b.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
          if (txt) txt.textContent = on ? "Tersimpan" : "Simpan";
        }
      } else {
        b.style.borderColor = on ? "#2F74EB" : "#E3EAF4";
        b.style.color = on ? "#2F74EB" : "";
        b.style.background = on ? "#EEF5FF" : "";
        const t = b.querySelector<HTMLElement>('[data-sh-t="save"]');
        if (t) t.textContent = on ? "Tersimpan" : "Simpan";
      }
    }
    for (const el of host.querySelectorAll<HTMLElement>('[data-sh-n="likes"]')) el.textContent = fmt(st.likes);
    for (const el of host.querySelectorAll<HTMLElement>('[data-sh-n="comments"]')) el.textContent = fmt(st.comments);
    for (const g of gone) host.querySelectorAll<HTMLElement>(`[data-sh-comment="${CSS.escape(g)}"]`).forEach((el) => (el.style.display = "none"));
    host.querySelectorAll<HTMLElement>("[data-sh-cap]").forEach((box) => setCap(box, capOpen.has(box.dataset.shCap ?? "")));
  };
  host.addEventListener("dc:state", apply);
  offs.push(() => host.removeEventListener("dc:state", apply));
  apply();

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const needLogin = (r: Res) => {
    if (r.status !== 401) return false;
    router.push(login);
    return true;
  };

  const share = (ch: string) => {
    const text = `${title} — Ocean Short`;
    const links: Record<string, string> = {
      wa: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      tg: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    };
    if (links[ch]) window.open(links[ch], "_blank", "noopener,noreferrer");
    else void navigator.clipboard?.writeText(url).catch(() => undefined);
    if (id) void api("POST", `/api/v1/shorts/${id}/share`, { channel: ch });
  };

  const postComment = (inp: HTMLInputElement | null) =>
    run(async () => {
      if (!logged) return router.push(login);
      const body = inp?.value.trim() ?? "";
      if (!body) return toast(host, "Tulis komentar terlebih dahulu.");
      const parent = inp?.dataset.parent ?? "";
      const r = await api("POST", `/api/v1/shorts/${id}/comments`, parent ? { body, parent_id: parent } : { body });
      if (needLogin(r)) return;
      if (!r.ok) return toast(host, why(r, "Komentar gagal dikirim."));
      if (inp) {
        inp.value = "";
        resetReply(inp);
      }
      const pending = (r.data as { status?: string }).status !== "visible";
      toast(host, pending ? "Komentar terkirim dan menunggu moderasi." : parent ? "Balasan terkirim." : "Komentar terkirim.", "ok");
      router.refresh();
    });

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !host.contains(t)) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const el = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);

    const capBtn = el('[data-sh="cap"]');
    if (capBtn) {
      stop();
      const box = capBtn.closest<HTMLElement>("[data-sh-cap]");
      if (!box) return;
      const k = box.dataset.shCap ?? "";
      const on = !capOpen.has(k);
      if (on) capOpen.add(k);
      else capOpen.delete(k);
      setCap(box, on);
      return;
    }

    const tog = el('[data-sh="like"], [data-sh="save"]');
    if (tog) {
      stop();
      if (!logged) return router.push(login);
      const kind = tog.dataset.sh as "like" | "save";
      const was = kind === "like" ? st.liked : st.saved;
      void run(async () => {
        const r = await api(was ? "DELETE" : "POST", `/api/v1/shorts/${id}/${kind}`);
        if (needLogin(r)) return;
        if (!r.ok) return toast(host, why(r, "Gagal menyimpan. Coba lagi."));
        if (kind === "like") {
          st.liked = !was;
          st.likes = Number((r.data as { likes?: number }).likes ?? st.likes);
          toast(host, st.liked ? "Kamu menyukai video ini" : "Batal menyukai", "ok");
        } else {
          st.saved = !was;
          toast(host, st.saved ? "Video disimpan ke Tersimpan" : "Video dihapus dari Tersimpan", "ok");
        }
        apply();
      });
      return;
    }
    const sh = el("[data-sh-share]");
    if (sh) {
      // Biarkan desain menutup lembar & menampilkan toast; buka kanal sungguhan.
      share(sh.dataset.shShare!);
      return;
    }
    if (el('[data-sh="share"]')) {
      stop();
      if (typeof navigator.share === "function") {
        void navigator.share({ title, url }).then(
          () => id && void api("POST", `/api/v1/shorts/${id}/share`, { channel: "native" }),
          () => undefined,
        );
      } else {
        share("copy");
        toast(host, "Tautan video disalin.", "ok");
      }
      return;
    }
    if (el('[data-sh="goto-comments"]')) {
      stop();
      host.querySelector("#komentar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      (host.querySelector<HTMLInputElement>('input[data-sh="comment"]') ?? null)?.focus();
      return;
    }
    const del = el('[data-sh="comment-del"]');
    if (del) {
      stop();
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "Yakin hapus?";
        window.setTimeout(() => {
          if (del.isConnected) {
            del.dataset.armed = "";
            del.textContent = "Hapus";
          }
        }, 4000);
        return;
      }
      const cid = del.dataset.cid!;
      void run(async () => {
        const r = await api("DELETE", `/api/v1/shorts/${id}/comments/${cid}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal menghapus komentar."));
        gone.add(cid);
        st.comments = Math.max(0, st.comments - 1);
        apply();
        toast(host, "Komentar dihapus.", "ok");
      });
      return;
    }
    // Balas komentar: kolom komentar masuk mode balasan (Esc untuk batal).
    const rp = el('[data-sh="reply"]');
    if (rp) {
      stop();
      if (!logged) return router.push(login);
      const inp = host.querySelector<HTMLInputElement>('input[data-sh="comment"]');
      if (!inp) return;
      inp.dataset.parent = rp.dataset.id!;
      inp.dataset.ph ??= inp.placeholder;
      inp.placeholder = `Balas ${rp.dataset.name ?? "komentar"}… (Esc untuk batal)`;
      inp.focus();
      return;
    }
    if (el('[data-sh="comment-send"]')) {
      stop();
      void postComment(host.querySelector<HTMLInputElement>('input[data-sh="comment"]'));
      return;
    }
    const ci = el<HTMLInputElement>('input[data-sh="comment"][data-login]');
    if (ci) {
      stop();
      router.push(ci.dataset.login!);
    }
  };
  host.addEventListener("click", onClick, true);
  offs.push(() => host.removeEventListener("click", onClick, true));

  const onSubmit = (e: SubmitEvent) => {
    const f = e.target instanceof HTMLFormElement && e.target.matches('[data-sh="comment-form"]') ? e.target : null;
    if (!f) return;
    e.preventDefault();
    void postComment(f.querySelector<HTMLInputElement>('input[data-sh="comment"]'));
  };
  host.addEventListener("submit", onSubmit, true);
  offs.push(() => host.removeEventListener("submit", onSubmit, true));

  function resetReply(inp: HTMLInputElement) {
    delete inp.dataset.parent;
    if (inp.dataset.ph) inp.placeholder = inp.dataset.ph;
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && e.target instanceof HTMLInputElement && e.target.dataset.parent) return resetReply(e.target);
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement) || !e.target.matches('input[data-sh="comment"]') || e.target.form) return;
    e.preventDefault();
    void postComment(e.target);
  };
  host.addEventListener("keydown", onKey);
  offs.push(() => host.removeEventListener("keydown", onKey));

  return () => offs.forEach((f) => f());
}

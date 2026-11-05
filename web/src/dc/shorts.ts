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
        // Aplikasi: warna ikon aktif (hati merah, bookmark kuning) diatur CSS lewat aria-pressed.
        const t = b.querySelector<HTMLElement>('[data-sh-t="save"]');
        if (t) t.textContent = on ? "Tersimpan" : "Simpan";
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

  // Pemutar aplikasi (layar penuh): ketuk untuk putar/jeda, progres & waktu nyata, pesan bila format tak didukung.
  const mmss = (t: number) => (Number.isFinite(t) && t > 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");
  const vid = () => host.querySelector<HTMLVideoElement>("video[data-short]");
  const sync = () => {
    const v = vid();
    if (!v) return;
    const btn = host.querySelector<HTMLElement>("[data-sh-play]");
    if (btn) {
      btn.style.opacity = v.paused ? "1" : "0";
      btn.style.pointerEvents = v.paused ? "auto" : "none";
      btn.setAttribute("aria-label", v.paused ? "Putar video" : "Jeda video");
    }
    const pct = v.duration > 0 ? (v.currentTime / v.duration) * 100 : 0;
    const bar = host.querySelector<HTMLElement>("[data-sh-bar]");
    if (bar) bar.style.width = `${pct}%`;
    const prog = host.querySelector<HTMLElement>("[data-sh-prog]");
    if (prog) {
      prog.setAttribute("aria-valuenow", String(Math.round(pct)));
      const time = prog.nextElementSibling as HTMLElement | null;
      if (time && v.duration > 0) time.textContent = `${mmss(v.currentTime)} / ${mmss(v.duration)}`;
    }
  };
  const onMedia = (e: Event) => {
    if (!(e.target instanceof HTMLVideoElement) || !e.target.matches("video[data-short]")) return;
    if (e.type === "error") {
      const v = e.target;
      if (v.dataset.failed) return;
      v.dataset.failed = "1";
      const note = document.createElement("div");
      note.setAttribute("role", "alert");
      note.style.cssText = "position: absolute; left: 24px; right: 24px; top: 40%; z-index: 3; padding: 14px 16px; border-radius: 16px; background: rgba(11,11,15,.82); color: #FFFFFF; font-size: 14px; line-height: 1.5; text-align: center";
      note.textContent = "Video tidak bisa diputar di perangkat ini. Coba buka di browser lain, atau minta redaksi mengunggah ulang dalam format MP4 (H.264).";
      v.parentElement?.appendChild(note);
      return;
    }
    sync();
  };
  for (const ev of ["play", "pause", "timeupdate", "loadedmetadata", "ended", "error"]) {
    host.addEventListener(ev, onMedia, true);
    offs.push(() => host.removeEventListener(ev, onMedia, true));
  }
  const toggle = () => {
    const v = vid();
    if (!v) return;
    // Diputar otomatis tanpa suara → ketukan pertama menyalakan suara.
    if (!v.paused && v.muted && v.dataset.autoMuted) {
      v.muted = false;
      delete v.dataset.autoMuted;
      return;
    }
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };

  // ------------------------------------------------ Geser atas/bawah ala Reels (tampilan aplikasi)
  const SH_DIR = "ob-sh-dir";
  const metaNow = () => host.querySelector<HTMLElement>("[data-sh-meta]");
  const stage = () => host.querySelector<HTMLElement>(":scope > :not([data-sh-meta])");
  let navigating = false;
  const go = (dir: "next" | "prev") => {
    const m = metaNow();
    const target = dir === "next" ? m?.dataset.next : m?.dataset.prev;
    const st = stage();
    if (!target) {
      // Ujung daftar: pantulan kecil + info.
      if (st) {
        st.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
        st.style.transform = "translateY(0)";
      }
      toast(host, dir === "next" ? "Ini video terakhir." : "Ini video pertama.");
      return;
    }
    if (navigating) return;
    navigating = true;
    vid()?.pause();
    try {
      sessionStorage.setItem(SH_DIR, dir);
    } catch {
      /* penyimpanan diblokir */
    }
    if (st) {
      st.style.transition = "transform .28s cubic-bezier(.4,0,.2,1), opacity .28s";
      st.style.transform = `translateY(${dir === "next" ? "-100%" : "100%"})`;
      st.style.opacity = "0.4";
    }
    window.setTimeout(() => router.push(`/short?v=${encodeURIComponent(target)}`, { scroll: false }), 200);
  };
  // Video berikutnya: siapkan halaman & awal video agar perpindahan terasa instan.
  const warm = () => {
    const m = metaNow();
    if (m?.dataset.next) router.prefetch?.(`/short?v=${encodeURIComponent(m.dataset.next)}`);
    if (m?.dataset.prev) router.prefetch?.(`/short?v=${encodeURIComponent(m.dataset.prev)}`);
    const src = m?.dataset.nextSrc;
    if (src && !onMeteredConnection() && !document.querySelector(`link[data-sh-warm="${CSS.escape(src)}"]`)) {
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "video";
      l.href = src;
      l.dataset.shWarm = src;
      document.head.appendChild(l);
    }
  };
  let shownId = "";
  // Masuk dari geseran: geser masuk dari arah yang sesuai, lalu putar otomatis.
  const enter = () => {
    const m = metaNow();
    const cid = m?.dataset.id ?? "";
    if (!cid || cid === shownId) return;
    shownId = cid;
    navigating = false;
    let dir: string | null = null;
    try {
      dir = sessionStorage.getItem(SH_DIR);
      sessionStorage.removeItem(SH_DIR);
    } catch {
      /* penyimpanan diblokir */
    }
    const st = stage();
    if (st && m?.dataset.app === "1") {
      host.style.background = "#0B0B0F";
      host.style.overflow = "hidden";
      st.style.transition = "none";
      st.style.opacity = "1";
      st.style.transform = dir ? `translateY(${dir === "next" ? "100%" : "-100%"})` : "translateY(0)";
      if (dir) {
        void st.offsetHeight;
        st.style.transition = "transform .3s cubic-bezier(.2,.8,.2,1)";
        st.style.transform = "translateY(0)";
      }
    }
    warm();
    const v = vid();
    // Diputar otomatis tanpa suara (preferensi video otomatis): ketukan pertama menyalakan suara.
    if (v && v.muted && v.autoplay) v.dataset.autoMuted = "1";
    const auto = dir !== null || (m?.dataset.app === "1" && !onMeteredConnection() && !/(?:^|;\s*)ob_prefs=[^;]*a%3D0/.test(document.cookie));
    if (v && auto && m?.dataset.app === "1") {
      void v.play().catch(() => {
        // Browser menolak suara tanpa interaksi → putar tanpa suara; ketuk untuk suara.
        v.muted = true;
        v.dataset.autoMuted = "1";
        void v.play().catch(() => undefined);
      });
    }
  };
  enter();
  const onState = () => enter();
  host.addEventListener("dc:state", onState);
  offs.push(() => host.removeEventListener("dc:state", onState));

  // Sentuhan: seret mengikuti jari; lepas > 18% tinggi layar atau sapuan cepat → pindah video.
  let y0 = 0, x0 = 0, t0 = 0, dy = 0, dragging = false, locked: "y" | "x" | null = null;
  const blocked = (t: EventTarget | null) =>
    t instanceof Element && !!t.closest('[role="dialog"], input, textarea, select, [data-sh-list], .ob-scroll, iframe');
  const sheetOpen = () => [...host.querySelectorAll<HTMLElement>('[role="dialog"]')].some((d) => {
    const r = d.getBoundingClientRect();
    return r.height > 0 && r.top < window.innerHeight - 40;
  });
  const onStart = (e: TouchEvent) => {
    if (metaNow()?.dataset.app !== "1" || e.touches.length !== 1 || blocked(e.target) || sheetOpen()) return;
    y0 = e.touches[0]!.clientY;
    x0 = e.touches[0]!.clientX;
    t0 = performance.now();
    dy = 0;
    locked = null;
    dragging = true;
  };
  const onMove = (e: TouchEvent) => {
    if (!dragging) return;
    const ddy = e.touches[0]!.clientY - y0;
    const ddx = e.touches[0]!.clientX - x0;
    if (!locked && Math.abs(ddy) + Math.abs(ddx) > 8) locked = Math.abs(ddy) > Math.abs(ddx) ? "y" : "x";
    if (locked !== "y") return;
    e.preventDefault();
    const m = metaNow();
    // Tanpa video di arah itu: tarikan diredam (efek karet).
    dy = (ddy < 0 && !m?.dataset.next) || (ddy > 0 && !m?.dataset.prev) ? ddy * 0.25 : ddy;
    const st = stage();
    if (st) {
      st.style.transition = "none";
      st.style.transform = `translateY(${dy}px)`;
    }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    if (locked !== "y") return;
    const v = Math.abs(dy) / Math.max(1, performance.now() - t0);
    const far = Math.abs(dy) > window.innerHeight * 0.18 || (v > 0.5 && Math.abs(dy) > 40);
    if (far) go(dy < 0 ? "next" : "prev");
    else {
      const st = stage();
      if (st) {
        st.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
        st.style.transform = "translateY(0)";
      }
    }
  };
  host.addEventListener("touchstart", onStart, { passive: true });
  host.addEventListener("touchmove", onMove, { passive: false });
  host.addEventListener("touchend", onEnd);
  host.addEventListener("touchcancel", onEnd);
  // Roda tetikus / touchpad & tombol panah (desktop yang membuka tampilan aplikasi, dan papan ketik).
  let wheelLock = 0;
  const onWheel = (e: WheelEvent) => {
    if (metaNow()?.dataset.app !== "1" || blocked(e.target) || sheetOpen() || Math.abs(e.deltaY) < 30) return;
    e.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelLock = now + 700;
    go(e.deltaY > 0 ? "next" : "prev");
  };
  host.addEventListener("wheel", onWheel, { passive: false });
  const onArrow = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (metaNow()?.dataset.app !== "1" || sheetOpen()) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
      e.preventDefault();
      go("next");
    } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
      e.preventDefault();
      go("prev");
    }
  };
  window.addEventListener("keydown", onArrow);
  offs.push(() => {
    host.removeEventListener("touchstart", onStart);
    host.removeEventListener("touchmove", onMove);
    host.removeEventListener("touchend", onEnd);
    host.removeEventListener("touchcancel", onEnd);
    host.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onArrow);
  });

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

    if (el("[data-sh-play]") || (t instanceof HTMLVideoElement && t.matches("video[data-short]:not([controls])"))) {
      stop();
      toggle();
      return;
    }
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

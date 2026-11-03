/**
 * Enhancer panel redaksi lanjutan ("newsroom"): pulihkan versi, breaking & live blog, newsletter.
 * Semua lewat BFF /api/admin/* (izin diperiksa API).
 */
import type { Cleanup, Env } from "./enhancers";
import { armed, call, msg, onCapture, shrink, stop } from "./cms";
import { toast } from "./toast";

export function newsroom(host: HTMLElement, { router }: Env): Cleanup {
  let busy = false;
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const done = (ok: boolean, data: Parameters<typeof msg>[0], okText: string, fb: string) => {
    if (!ok) return toast(host, msg(data, fb));
    toast(host, okText, "ok");
    router.refresh();
  };

  const off = onCapture(host, async (t, e) => {
    // ------------------------------------------------------------ riwayat versi
    const ver = t.closest<HTMLElement>("[data-ver]");
    if (ver) {
      stop(e);
      if (ver.dataset.ver === "copy") {
        const panel = host.querySelector<HTMLElement>('[data-ver-text]') ?? host;
        void navigator.clipboard?.writeText(panel.innerText.slice(0, 20000)).then(() => toast(host, "Teks versi disalin.", "ok"));
        return;
      }
      if (!armed(ver, `Ya, pulihkan v${ver.dataset.n}?`)) return;
      await run(async () => {
        const r = await call("POST", `articles/${ver.dataset.article}/versions/${ver.dataset.version}/restore`, {});
        done(r.ok, r.data, `v${ver.dataset.n} dipulihkan sebagai versi baru.`, "Gagal memulihkan versi.");
      });
      return;
    }
    // ------------------------------------------------------------ breaking & live
    const sw = t.closest<HTMLElement>("[data-live-pin]");
    if (sw) {
      stop(e);
      const on = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(on));
      sw.style.background = on ? "#4285F4" : "#DCE3EE";
      sw.style.justifyContent = on ? "flex-end" : "flex-start";
      return;
    }
    const lv = t.closest<HTMLElement>("[data-live]");
    if (lv && lv.dataset.live !== "body") {
      stop(e);
      const id = lv.dataset.id ?? "";
      await run(async () => {
        switch (lv.dataset.live) {
          case "extend": {
            const r = await call("POST", `breaking/${id}`, { hours: 2 });
            return done(r.ok, r.data, "Breaking diperpanjang 2 jam.", "Gagal memperpanjang breaking.");
          }
          case "end-breaking": {
            if (!armed(lv, "Ya, akhiri")) return;
            const r = await call("POST", `breaking/${id}`, { hours: 0 });
            return done(r.ok, r.data, "Breaking diakhiri. Artikel tetap terbit.", "Gagal mengakhiri breaking.");
          }
          case "edit-breaking":
            router.push(`/admin/tulis?id=${id}`);
            return;
          case "start": {
            const title = window.prompt("Judul live blog (mis. Perdagangan IHSG hari ini):")?.trim();
            if (!title) return;
            const symbol = window.prompt("Simbol untuk widget harga (opsional, mis. IHSG):")?.trim().toUpperCase() ?? "";
            const closes = new Date();
            closes.setHours(closes.getHours() + 8);
            const r = await call("POST", "live", { title, symbol, closes_at: closes.toISOString() });
            return done(r.ok, r.data, "Live blog dibuka.", "Gagal membuka live blog.");
          }
          case "post": {
            if (!id) return toast(host, "Buka live blog terlebih dahulu.");
            const ta = host.querySelector<HTMLTextAreaElement>('textarea[data-live="body"]');
            const body = ta?.value.trim() ?? "";
            if (!body) return toast(host, "Tulis isi pembaruan dulu.");
            const pinned = host.querySelector("[data-live-pin]")?.getAttribute("aria-checked") === "true";
            const r = await call("POST", `live/${id}/posts`, { body, kind: "update", pinned });
            if (r.ok && ta) ta.value = "";
            return done(r.ok, r.data, "Pembaruan terkirim.", "Gagal mengirim pembaruan.");
          }
          case "pin": {
            const r = await call("PATCH", `live/posts/${id}`, { pinned: lv.dataset.on === "1" });
            return done(r.ok, r.data, lv.dataset.on === "1" ? "Disematkan." : "Sematan dilepas.", "Gagal memperbarui.");
          }
          case "del": {
            if (!armed(lv, "Yakin?")) return;
            const r = await call("DELETE", `live/posts/${id}`);
            return done(r.ok, r.data, "Pembaruan dihapus.", "Gagal menghapus.");
          }
          case "end": {
            if (!armed(lv, "Ya, tutup")) return;
            const r = await call("POST", `live/${id}/end`, {});
            return done(r.ok, r.data, "Live blog ditutup.", "Gagal menutup live blog.");
          }
        }
      });
      return;
    }
    // ------------------------------------------------------------ Ocean Short (admin)
    const sa = t.closest<HTMLElement>("[data-sha]");
    if (sa) {
      stop(e);
      const id = sa.dataset.id ?? "";
      await run(async () => {
        switch (sa.dataset.sha) {
          case "create": {
            const v = (k: string) => (host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-shf="${k}"]`)?.value ?? "").trim();
            const title = v("title");
            if (title.length < 4) return toast(host, "Judul minimal 4 karakter.");
            const status = sa.dataset.status === "draft" ? "draft" : "published";
            const r = await call("POST", "shorts", { title, caption: v("caption"), video_url: v("video"), cover_url: v("cover"), symbol: v("symbol").toUpperCase(), duration_s: Math.max(0, Math.round(Number(v("duration")) || 0)), status });
            return done(r.ok, r.data, (r.data as { status?: string }).status === "draft" ? "Short disimpan sebagai draf." : "Short ditayangkan.", "Gagal menyimpan short.");
          }
          case "publish":
          case "draft":
          case "archive": {
            const status = sa.dataset.sha === "archive" ? "archived" : sa.dataset.sha === "draft" ? "draft" : "published";
            if (status === "archived" && !armed(sa, "Yakin?")) return;
            const r = await call("POST", `shorts/${id}/status`, { status });
            return done(r.ok, r.data, status === "published" ? "Short ditayangkan." : status === "draft" ? "Short dijadikan draf." : "Short diarsipkan.", "Gagal mengubah status.");
          }
          case "c-visible":
          case "c-hidden": {
            const status = sa.dataset.sha === "c-visible" ? "visible" : "hidden";
            const r = await call("POST", `short-comments/${id}/status`, { status });
            return done(r.ok, r.data, status === "visible" ? "Komentar ditampilkan." : "Komentar disembunyikan.", "Gagal memoderasi komentar.");
          }
        }
      });
      return;
    }
    // ------------------------------------------------------------ newsletter
    const nl = t.closest<HTMLElement>("[data-nl]");
    if (nl && (nl.dataset.nl === "save" || nl.dataset.nl === "save-send" || nl.dataset.nl === "send")) {
      stop(e);
      await run(async () => {
        if (nl.dataset.nl === "send") {
          if (!armed(nl, "Kirim ke semua?")) return;
          const r = await call("POST", `newsletter/issues/${nl.dataset.id}/send`, {});
          return done(r.ok, r.data, `Newsletter terkirim ke ${(r.data as { recipients?: number }).recipients ?? 0} pelanggan.`, "Gagal mengirim newsletter.");
        }
        const val = (k: string) => host.querySelector<HTMLInputElement>(`[data-nl="${k}"]`)?.value.trim() ?? "";
        const ids = [...host.querySelectorAll<HTMLInputElement>('input[data-nl="article"]:checked')].map((x) => x.value);
        const send = nl.dataset.nl === "save-send";
        if (send && !armed(nl, "Kirim ke semua pelanggan?")) return;
        const r = await call("POST", "newsletter/issues", { list: val("list"), subject: val("subject"), intro: val("intro"), article_ids: ids, send });
        done(r.ok, r.data, send ? "Newsletter terkirim." : "Draf edisi disimpan.", "Gagal menyimpan edisi.");
      });
    }
  });
  // Unggah sampul short → isi URL sampul.
  const onChange = async (e: Event) => {
    const f = e.target instanceof HTMLInputElement && e.target.matches('[data-shf="cover-file"]') ? e.target : null;
    const file = f?.files?.[0];
    if (!f || !file) return;
    toast(host, "Mengunggah sampul…");
    const fd = new FormData();
    fd.append("file", await shrink(file), file.name);
    const r = await call("POST", "media", fd);
    f.value = "";
    if (!r.ok) return toast(host, msg(r.data, "Gagal mengunggah sampul."));
    const inp = host.querySelector<HTMLInputElement>('[data-shf="cover"]');
    if (inp) inp.value = String(r.data.url ?? "");
    toast(host, "Sampul terunggah.", "ok");
  };
  host.addEventListener("change", onChange);
  return () => {
    off();
    host.removeEventListener("change", onChange);
  };
}

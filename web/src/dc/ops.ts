/**
 * Enhancer "ops": Pengguna (blokir, peringatan, ekspor), Iklan (kampanye, dokumen, slot),
 * Data Pasar (aturan peringatan, uji koneksi) dan Detail simbol (simpan, nonaktifkan, alert).
 * Semua lewat BFF /api/admin/* — izin diperiksa lagi di API.
 */
import type { Cleanup, Env } from "./enhancers";
import { armed, call, msg, onCapture, setSwitch, stop } from "./cms";
import { toast } from "./toast";

const on = (el: Element | null) => el?.getAttribute("aria-checked") === "true";

function csv(rows: string[][], name: string) {
  const body = rows.map((r) => r.map((c) => `"${c.replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ops(host: HTMLElement, { router }: Env): Cleanup {
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
  const done = (text: string) => {
    toast(host, text, "ok");
    router.refresh();
  };

  const off = onCapture(host, async (t, e) => {
    // Baris tabel → detail (kecuali klik tautan/tombol di dalamnya).
    const row = t.closest<HTMLElement>("[data-us-row],[data-ad-row],[data-mk-row]");
    if (row && !t.closest("a,button,input,select,label")) {
      stop(e);
      router.push(row.dataset.href!);
      return;
    }

    // ------------------------------------------------------------ pengguna
    const us = t.closest<HTMLElement>("[data-us-action]");
    if (us) {
      stop(e);
      const id = us.dataset.id;
      const a = us.dataset.usAction;
      if (a === "csv") {
        const rows = [...host.querySelectorAll<HTMLElement>("[data-us-row]")].map((r) => [...r.querySelectorAll<HTMLElement>(':scope > span[style^="min-width: 0"]')].slice(0, 5).map((c) => c.innerText));
        if (!rows.length) return toast(host, "Tidak ada baris untuk diekspor.");
        csv([["Pengguna", "Role", "Login terakhir", "Platform", "Status"], ...rows], "pengguna");
        return;
      }
      if (a === "suspend") {
        const days = Number(us.dataset.days || "7");
        const reason = window.prompt(days ? `Alasan blokir ${days} hari:` : "Alasan blokir permanen:", "Pelanggaran pedoman komentar")?.trim();
        if (reason === undefined || reason === null) return;
        await run(async () => {
          const r = await call("POST", `users/${id}/suspend`, { days, reason });
          if (!r.ok) return toast(host, msg(r.data, "Gagal memblokir."));
          done(days ? `Diblokir ${days} hari. Semua sesinya dikeluarkan.` : "Diblokir permanen.");
        });
      } else if (a === "unblock") {
        if (!armed(us, "Ketuk lagi untuk buka blokir")) return;
        await run(async () => {
          const r = await call("POST", `users/${id}/unblock`);
          if (!r.ok) return toast(host, msg(r.data, "Gagal membuka blokir."));
          done("Blokir dibuka.");
        });
      } else if (a === "reset2fa") {
        if (!armed(us, "Ketuk lagi: matikan autentikator & keluarkan semua sesi")) return;
        await run(async () => {
          const r = await call("POST", `users/${id}/2fa/reset`);
          if (!r.ok) return toast(host, msg(r.data, "Gagal mereset verifikasi 2 langkah."));
          done("Verifikasi 2 langkah direset. Pengguna diberi tahu lewat email dan perlu masuk ulang.");
        });
      } else if (a === "warn") {
        const reason = window.prompt("Isi peringatan (dikirim ke notifikasi akun pengguna):", "Komentar Anda melanggar pedoman komunitas OceanBird.")?.trim();
        if (!reason) return;
        await run(async () => {
          const r = await call("POST", `users/${id}/warn`, { reason });
          if (!r.ok) return toast(host, msg(r.data, "Gagal mengirim peringatan."));
          done("Peringatan terkirim ke akun pengguna.");
        });
      }
      return;
    }

    // ------------------------------------------------------------ iklan
    const slot = t.closest<HTMLElement>("[data-ad-slot]");
    if (slot) {
      stop(e);
      const next = !on(slot);
      setSwitch(slot, next);
      await run(async () => {
        const r = await call("PATCH", `ads/slots/${slot.dataset.adSlot}`, { active: next });
        if (!r.ok) {
          setSwitch(slot, !next);
          return toast(host, msg(r.data, "Gagal mengubah slot."));
        }
        done(next ? "Slot diaktifkan." : "Slot dimatikan — tata letak halaman tetap.");
      });
      return;
    }
    const doc = t.closest<HTMLElement>("[data-ad-doc]");
    if (doc) {
      stop(e);
      const sec = doc.closest<HTMLElement>("[data-ad-json]");
      const c = sec ? (JSON.parse(sec.dataset.adJson!) as Record<string, unknown>) : null;
      if (!c) return;
      const key = doc.dataset.adDoc!;
      const KEYS = ["name", "advertiser", "industry", "slot_code", "start_date", "end_date", "regulated", "docs_company", "docs_license", "docs_creative", "docs_claims", "creative_url", "target_url", "budget_usd", "note"];
      const body: Record<string, unknown> = Object.fromEntries(KEYS.map((k) => [k, c[k]]));
      body[key] = !c[key];
      await run(async () => {
        const r = await call("PUT", `ads/campaigns/${c.id}`, body);
        if (!r.ok) return toast(host, msg(r.data, "Gagal menyimpan dokumen."));
        done(body[key] ? "Dokumen ditandai diterima." : "Dokumen ditandai belum ada.");
      });
      return;
    }
    const ad = t.closest<HTMLElement>("[data-ad-action]");
    if (ad) {
      stop(e);
      const id = ad.dataset.id!;
      const a = ad.dataset.adAction!;
      if (a === "delete") {
        if (!armed(ad, "Ketuk lagi untuk hapus")) return;
        await run(async () => {
          const r = await call("DELETE", `ads/campaigns/${id}`);
          if (!r.ok) return toast(host, msg(r.data, "Gagal menghapus."));
          toast(host, "Kampanye dihapus.", "ok");
          router.push("/admin/iklan");
        });
        return;
      }
      if (a === "approve" && ad.dataset.missing) return toast(host, `Lengkapi dulu: ${ad.dataset.missing}. Ketuk dokumen untuk menandai diterima.`);
      let note = "";
      if (a === "reject") {
        note = window.prompt("Alasan penolakan (dikirim ke pengiklan):", "")?.trim() ?? "";
        if (!note) return;
      } else if (a === "request_docs") {
        note = window.prompt("Pesan permintaan dokumen:", "")?.trim() ?? "";
      } else if ((a === "finish" || a === "pause") && !armed(ad, a === "finish" ? "Ketuk lagi untuk selesaikan" : "Ketuk lagi untuk jeda")) return;
      await run(async () => {
        const r = await call("POST", `ads/campaigns/${id}/status`, { action: a, note });
        if (!r.ok) return toast(host, msg(r.data, "Gagal memperbarui kampanye."));
        const st = String(r.data.status ?? "");
        toast(host, { approve: "Kampanye tayang.", resume: "Kampanye tayang lagi.", reject: "Kampanye ditolak.", pause: "Kampanye dijeda.", finish: "Kampanye selesai.", request_docs: "Permintaan dokumen dicatat." }[a] ?? "Tersimpan.", "ok");
        router.push(`/admin/iklan?status=${st}&id=${id}`);
      });
      return;
    }
    if (t.closest('[data-adf-action="save"]')) {
      stop(e);
      const form = host.querySelector<HTMLElement>("[data-adf-form]")!;
      const val = (k: string) => form.querySelector<HTMLInputElement>(`[data-adf="${k}"]`);
      const body: Record<string, unknown> = {};
      for (const k of ["name", "advertiser", "industry", "slot_code", "start_date", "end_date", "target_url", "creative_url", "note"]) body[k] = val(k)?.value ?? "";
      for (const k of ["regulated", "docs_company", "docs_license", "docs_creative", "docs_claims"]) body[k] = !!val(k)?.checked;
      body.budget_usd = Number(val("budget_usd")?.value || 0);
      const id = form.dataset.adfForm;
      await run(async () => {
        const r = await call(id ? "PUT" : "POST", id ? `ads/campaigns/${id}` : "ads/campaigns", body);
        if (!r.ok) {
          const bad = r.data.errors ? Object.keys(r.data.errors)[0] : "";
          if (bad) val(bad)?.focus();
          return toast(host, msg(r.data, "Kampanye gagal disimpan."));
        }
        const cid = (r.data.id as string) ?? id;
        toast(host, id ? "Kampanye diperbarui." : "Kampanye diajukan — menunggu verifikasi.", "ok");
        router.push(`/admin/iklan?status=${(r.data.status as string) ?? "pending"}&id=${cid}`);
      });
      return;
    }

    // ------------------------------------------------------------ data pasar
    const al = t.closest<HTMLElement>("[data-mk-alert]");
    if (al) {
      stop(e);
      setSwitch(al, !on(al));
      const body: Record<string, boolean> = {};
      host.querySelectorAll<HTMLElement>("[data-mk-alert]").forEach((b) => (body[b.dataset.mkAlert!] = on(b)));
      await run(async () => {
        const r = await call("PUT", "market/alerts", body);
        if (!r.ok) {
          setSwitch(al, !on(al));
          return toast(host, msg(r.data, "Gagal menyimpan aturan."));
        }
        toast(host, "Aturan peringatan disimpan.", "ok");
      });
      return;
    }
    const test = t.closest<HTMLElement>('[data-mk-action="test"],[data-sy-action="test"]');
    if (test) {
      stop(e);
      await run(async () => {
        toast(host, `Menguji ${test.dataset.symbol}…`, "ok");
        const r = await call("POST", "market/test", { symbol: test.dataset.symbol });
        if (!r.ok) return toast(host, msg(r.data, "Uji koneksi gagal."));
        if (r.data.ok) done(`Terhubung: ${r.data.symbol} ${r.data.price} (${r.data.source}) dalam ${r.data.latency_ms} ms.`);
        else toast(host, `${r.data.symbol}: ${r.data.error} (${r.data.latency_ms} ms)`);
      });
      return;
    }

    // ------------------------------------------------------------ detail simbol
    const ssw = t.closest<HTMLElement>("[data-sy-switch]");
    if (ssw) {
      stop(e);
      if (!ssw.hasAttribute("disabled")) setSwitch(ssw, !on(ssw));
      return;
    }
    const sal = t.closest<HTMLElement>("[data-sy-alert]");
    if (sal) {
      stop(e);
      if (sal.hasAttribute("disabled")) return;
      setSwitch(sal, !on(sal));
      const body: Record<string, boolean> = {};
      host.querySelectorAll<HTMLElement>("[data-sy-alert]").forEach((b) => (body[b.dataset.syAlert!] = on(b)));
      const sym = new URLSearchParams(location.search).get("s") ?? "";
      await run(async () => {
        const r = await call("PUT", `market/instruments/${encodeURIComponent(sym)}/alerts`, body);
        if (!r.ok) {
          setSwitch(sal, !on(sal));
          return toast(host, msg(r.data, "Gagal menyimpan alert."));
        }
        toast(host, "Alert simbol disimpan.", "ok");
      });
      return;
    }
    const sa = t.closest<HTMLElement>("[data-sy-action]");
    if (sa) {
      stop(e);
      const sym = new URLSearchParams(location.search).get("s") ?? "";
      if (sa.dataset.syAction === "active") {
        const next = sa.dataset.on === "true";
        if (!next && !armed(sa, "Ketuk lagi untuk nonaktifkan")) return;
        await run(async () => {
          const r = await call("POST", `market/instruments/${encodeURIComponent(sym)}/active`, { active: next });
          if (!r.ok) return toast(host, msg(r.data, "Gagal mengubah status."));
          done(next ? "Simbol diaktifkan." : "Simbol dinonaktifkan — hilang dari ticker & daftar pasar.");
        });
        return;
      }
      if (sa.dataset.syAction === "save") {
        const v = (k: string) => host.querySelector<HTMLInputElement>(`[data-sy="${k}"]`)?.value.trim() ?? "";
        const body = {
          symbol: v("symbol") || sym,
          name: v("name"),
          provider_symbol: v("provider_symbol"),
          asset_class: v("asset_class"),
          exchange: v("exchange"),
          currency: v("currency"),
          sector: v("sector") || null,
          category_slug: v("category_slug") || null,
          in_ticker: on(host.querySelector('[data-sy-switch="in_ticker"]')),
          saver_mode: on(host.querySelector('[data-sy-switch="saver_mode"]')),
        };
        const isNew = !sym;
        await run(async () => {
          const r = await call(isNew ? "POST" : "PUT", isNew ? "market/instruments" : `market/instruments/${encodeURIComponent(sym)}`, body);
          if (!r.ok) {
            const bad = r.data.errors ? Object.keys(r.data.errors)[0] : "";
            if (bad) host.querySelector<HTMLInputElement>(`[data-sy="${bad}"]`)?.focus();
            return toast(host, msg(r.data, "Simbol gagal disimpan."));
          }
          toast(host, isNew ? "Simbol ditambahkan. Uji koneksi untuk memastikan harga masuk." : "Pengaturan simbol disimpan.", "ok");
          if (isNew) router.push(`/admin/simbol?s=${encodeURIComponent(String(r.data.symbol))}`);
          else router.refresh();
        });
      }
    }
  });

  // Pencarian pengguna (tunda 400 ms).
  let timer = 0;
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset?.us !== "search") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const u = new URL(location.href);
      u.searchParams.delete("id");
      if (el.value.trim()) u.searchParams.set("q", el.value.trim());
      else u.searchParams.delete("q");
      router.replace(u.pathname + u.search);
    }, 400);
  };
  host.addEventListener("input", onInput);
  host.querySelectorAll<HTMLElement>("[data-us-row],[data-ad-row],[data-mk-row]").forEach((r) => (r.style.cursor = "pointer"));
  return () => {
    off();
    host.removeEventListener("input", onInput);
    window.clearTimeout(timer);
  };
}

/** Enhancer "twofa": isi kode email (6 karakter), kirim bersama challenge dari langkah kata sandi. */
export function twofa(host: HTMLElement, { router }: Env): Cleanup {
  const digits = [...host.querySelectorAll<HTMLInputElement>("[data-tf-digit]")];
  const submit = host.querySelector<HTMLElement>('[data-tf="submit"]');
  const email = submit?.dataset.email ?? "";
  const next = submit?.dataset.next ?? "/admin";
  let challenge = "";
  try {
    challenge = sessionStorage.getItem("ob_2fa") ?? "";
  } catch {
    /* penyimpanan diblokir */
  }
  if (!challenge) {
    toast(host, "Sesi verifikasi berakhir. Masuk lagi dengan kata sandi.");
    router.replace(next.startsWith("/admin") ? `/admin/masuk?next=${encodeURIComponent(next)}` : `/masuk?next=${encodeURIComponent(next)}`);
    return;
  }
  let busy = false;
  const recoveryBox = host.querySelector<HTMLElement>('[data-tf="recovery-box"]');
  const recoveryInput = host.querySelector<HTMLInputElement>('[data-tf="recovery-input"]');
  const recoveryMode = () => !!recoveryBox && recoveryBox.style.display !== "none";
  const code = () => (recoveryMode() ? (recoveryInput?.value ?? "").replace(/[\s-]/g, "").toUpperCase() : digits.map((d) => d.value.trim().toUpperCase()).join(""));
  const send = async () => {
    if (busy) return;
    const c = code();
    if (recoveryMode()) {
      if (!/^[A-Z0-9]{10}$/.test(c)) {
        recoveryInput?.focus();
        return toast(host, "Kode cadangan terdiri dari 10 huruf & angka, mis. ABCDE-FGH23.");
      }
    } else if (c.length < 6) {
      digits.find((d) => !d.value)?.focus();
      return toast(host, "Masukkan 6 karakter kode verifikasi.");
    }
    busy = true;
    submit?.setAttribute("aria-busy", "true");
    try {
      const remember = !!host.querySelector<HTMLInputElement>('[data-tf="remember"]')?.checked;
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: c, challenge, remember }) });
      const data = (await res.json().catch(() => ({}))) as { detail?: string; errors?: Record<string, string>; user?: { is_staff?: boolean } };
      if (!res.ok) {
        digits.forEach((d) => (d.value = ""));
        if (recoveryInput) recoveryInput.value = "";
        if (recoveryMode()) recoveryInput?.focus();
        else digits[0]?.focus();
        if (res.status === 403) {
          toast(host, data.detail ?? "Verifikasi kedaluwarsa. Masuk lagi.");
          router.replace(next.startsWith("/admin") ? `/admin/masuk?next=${encodeURIComponent(next)}` : `/masuk?next=${encodeURIComponent(next)}`);
          return;
        }
        return toast(host, (data.errors && Object.values(data.errors)[0]) || data.detail || "Kode salah atau kedaluwarsa.");
      }
      try {
        sessionStorage.removeItem("ob_2fa");
      } catch {
        /* abaikan */
      }
      const left = res.headers.get("x-recovery-codes-left");
      toast(host, left != null ? `Berhasil masuk dengan kode cadangan. Sisa ${left} kode${Number(left) <= 3 ? " — buat kode baru di Pengaturan." : "."}` : "Berhasil masuk.", "ok");
      router.push(data.user?.is_staff ? next : next.startsWith("/admin") ? "/" : next);
    } finally {
      busy = false;
      submit?.removeAttribute("aria-busy");
    }
  };
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (!el.matches("[data-tf-digit]")) return;
    const v = el.value.replace(/[^0-9a-z]/gi, "").toUpperCase();
    const i = Number(el.dataset.tfDigit);
    if (v.length > 1) {
      // Tempel seluruh kode.
      [...v.slice(0, 6)].forEach((ch, k) => digits[i + k] && (digits[i + k]!.value = ch));
      digits[Math.min(5, i + v.length)]?.focus();
    } else {
      el.value = v;
      if (v) digits[i + 1]?.focus();
    }
    if (!recoveryMode() && code().length === 6) void send();
  };
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLInputElement;
    if (el.matches?.('[data-tf="recovery-input"]')) {
      if (e.key === "Enter") {
        e.preventDefault();
        void send();
      }
      return;
    }
    if (!el.matches?.("[data-tf-digit]")) return;
    const i = Number(el.dataset.tfDigit);
    if (e.key === "Backspace" && !el.value) digits[i - 1]?.focus();
    if (e.key === "Enter") void send();
  };
  const off = onCapture(host, async (t, e) => {
    if (t.closest('[data-tf="submit"]')) {
      stop(e);
      await send();
    } else if (t.closest('[data-tf="recovery"]')) {
      stop(e);
      if (!recoveryBox) return;
      const on = !recoveryMode();
      recoveryBox.style.display = on ? "flex" : "none";
      const link = t.closest<HTMLElement>('[data-tf="recovery"]');
      if (link) link.textContent = on ? "Pakai kode dari aplikasi" : "Pakai kode cadangan";
      if (on) recoveryInput?.focus();
      else digits[0]?.focus();
    } else if (t.closest('[data-tf="resend"]')) {
      stop(e);
      const r = await fetch("/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = (await r.json().catch(() => ({}))) as { detail?: string };
      toast(host, r.ok ? "Kode baru dikirim ke email Anda." : d.detail ?? "Belum bisa mengirim ulang.", r.ok ? "ok" : "error");
    }
  });
  host.addEventListener("input", onInput);
  host.addEventListener("keydown", onKey);
  digits[0]?.focus();
  return () => {
    off();
    host.removeEventListener("input", onInput);
    host.removeEventListener("keydown", onKey);
  };
}

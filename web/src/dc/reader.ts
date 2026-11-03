/**
 * Enhancer fitur pembaca ("reader"): watchlist, price alert, tersimpan, notifikasi, kalender ekonomi,
 * reaksi/komentar/simpan artikel, dan impresi iklan. Semua lewat BFF (/api/me/*, /api/v1/*) dengan
 * token di cookie httpOnly — tidak ada kunci API di peramban.
 *
 * Board desain dirender ulang (morph) setiap state desain berubah, sehingga perubahan DOM dari enhancer
 * (filter, baris terhapus, status tombol) disimpan di sini dan diterapkan ulang setelah setiap render.
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

type DesignState = { u?: Record<string, boolean[]>; o?: Record<string, number[]>; read?: boolean };
const COND = ["price_above", "price_below", "change_pct", "news"];
const FREQ = ["once", "every_time", "daily"];
const CHAN = ["push", "email", "in_app"];
const idx = (a: boolean[] | undefined, d = 0) => {
  const i = a?.indexOf(true) ?? -1;
  return i < 0 ? d : i;
};
const num = (s: string) => {
  // "10.400" (id) / "67412.5" / "1,0835" → angka
  const t = s.trim().replace(/\s/g, "");
  if (/,\d+$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
};

export function reader(host: HTMLElement, { router }: Env): Cleanup {
  const offs: (() => void)[] = [];
  let st: DesignState = {};
  let busy = false;
  const gone = new Set<string>(); // selektor baris yang sudah dihapus
  const pressed = new Map<string, boolean>(); // selektor tombol → aria-pressed
  const readIds = new Set<string>();
  let allRead = false;
  let wlTab = "semua";
  let bmTab = "all";
  let ntTab = "all";
  let editMode = false;
  let targetVal: string | null = null; // nilai input target (morph mengembalikan atribut value)
  let tabLook: { on: { st: string; cls: string | null; span: string }; off: { st: string; cls: string | null; span: string } } | null = null;
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)];
  /** Tampil/sembunyi tanpa menghapus nilai display bawaan desain (mis. flex). */
  const show = (el: HTMLElement, on: boolean) => {
    if (!on) {
      if (el.dataset.disp === undefined) el.dataset.disp = el.style.display;
      el.style.display = "none";
    } else if (el.dataset.disp !== undefined) {
      el.style.display = el.dataset.disp;
      delete el.dataset.disp;
    }
  };

  // ---------------------------------------------------------------- terapkan ulang setelah render
  const apply = () => {
    for (const sel of gone) $$(sel).forEach((el) => show(el, false));
    // Watchlist: tab kelas aset + urutan + mode ubah.
    const wlRows = $$("[data-wl-row]");
    if (wlRows.length) {
      for (const r of wlRows) if (![...gone].some((g) => r.matches(g))) show(r, wlTab === "semua" || r.dataset.wlClass === wlTab);
      const sort = st.o?.wsort?.[0] ?? 0;
      if (sort) {
        const parent = wlRows[0]!.parentElement!;
        const key = (r: HTMLElement) => (sort === 1 ? r.dataset.wlName ?? "" : Number(sort === 2 ? r.dataset.wlChg : r.dataset.wlPrice) || 0);
        const sorted = [...wlRows].sort((a, b) => {
          const x = key(a), y = key(b);
          return typeof x === "string" ? x.localeCompare(String(y)) : (y as number) - x;
        });
        if (sorted.some((r, i) => r !== wlRows[i])) sorted.forEach((r) => parent.appendChild(r));
      }
      $$("button[data-wl-remove]").forEach((b) => (b.style.display = editMode ? "flex" : "none")); // bawaan desain: none
      $$("[data-wl-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.wlTab === wlTab)));
    }
    // Web watchlist: gaya tab statis mengikuti pilihan (templat gaya diambil dari render awal).
    const webTabs = $$("button[data-wl-tab]").filter((b) => !b.hasAttribute("data-ev-click"));
    if (webTabs.length > 1) {
      const look = (b: HTMLElement) => ({ st: b.getAttribute("style") ?? "", cls: b.getAttribute("class"), span: b.querySelector("span")?.getAttribute("style") ?? "" });
      tabLook ??= { on: look(webTabs[0]!), off: look(webTabs[1]!) };
      webTabs.forEach((b) => {
        const l = b.dataset.wlTab === wlTab ? tabLook!.on : tabLook!.off;
        b.setAttribute("style", l.st);
        if (l.cls) b.setAttribute("class", l.cls);
        else b.removeAttribute("class");
        b.querySelector("span")?.setAttribute("style", l.span);
        b.setAttribute("aria-selected", String(b.dataset.wlTab === wlTab));
      });
    }
    // Tersimpan.
    for (const r of $$("[data-bm-row]")) if (![...gone].some((g) => r.matches(g))) show(r, bmTab === "all" || (bmTab === "premium" && r.dataset.bmKind === "premium") || (bmTab === "video" && r.dataset.bmKind === "video"));
    // Notifikasi.
    for (const r of $$("[data-nt-row]")) {
      show(r, ntTab === "all" || r.dataset.ntKind === ntTab);
      if (allRead || readIds.has(r.dataset.ntRow!)) r.style.background = "";
    }
    // Kalender (aplikasi): hari, negara, dampak.
    const calRows = $$("[data-cal-row]");
    if (calRows.length && st.u?.u1) {
      const day = $$("[data-cal-day]")[idx(st.u.u1)]?.dataset.calDay ?? "";
      const ctry = ["", "ID", "US", "CN"][idx(st.u.u2)] ?? "";
      const high = !!st.u.u3?.[0];
      let shown = 0;
      for (const r of calRows) {
        const ok = r.dataset.day === day && (!ctry || r.dataset.country === ctry) && (!high || r.dataset.impact === "high");
        r.hidden = false;
        show(r, ok);
        if (ok) shown++;
      }
      const empty = host.querySelector<HTMLElement>("[data-cal-empty]");
      if (empty) empty.hidden = shown > 0;
    }
    // Tombol bertoggle (pengingat kalender, simpan artikel).
    for (const [sel, on] of pressed) {
      $$(sel).forEach((b) => {
        b.setAttribute("aria-pressed", String(on));
        if (b.matches("[data-cal-remind]")) {
          b.style.background = on ? "#EEF5FF" : b.closest("[data-cal-row]") ? "#FFFFFF" : "#F6F8FC";
          b.style.color = on ? "#2F74EB" : "#9AA6B8";
          if (b.closest("[data-cal-row]")) b.style.borderColor = on ? "#4285F4" : "#E3EAF4";
        } else if (b.matches("[data-topic-follow]") && !b.hasAttribute("data-ev-click")) {
          const svg = b.querySelector("svg")?.outerHTML ?? "";
          b.innerHTML = svg + (on ? "Mengikuti" : "Ikuti topik");
        } else if (b.matches('a[data-art="bookmark"]') && !b.hasAttribute("data-ev-click")) {
          b.style.background = on ? "#EEF5FF" : "";
          b.style.color = on ? "#2F74EB" : "";
          b.style.borderColor = on ? "#4285F4" : "";
        }
      });
    }
    alertDelta();
  };

  // ---------------------------------------------------------------- price alert: selisih target
  const target = () => host.querySelector<HTMLInputElement>('input[data-al="target"]');
  const alertDelta = () => {
    const t = target();
    if (t && targetVal != null && t.value !== targetVal) t.value = targetVal;
    const out = host.querySelector<HTMLElement>('[data-al="delta"]');
    if (!t || !out) return;
    const base = Number(t.dataset.base) || 0;
    const v = num(t.value);
    if (!base || !isFinite(v) || !v) {
      out.textContent = "";
      return;
    }
    const d = ((v - base) / base) * 100;
    out.textContent = `${d >= 0 ? "▲ +" : "▼ −"}${Math.abs(d).toFixed(2).replace(".", ",")}% dari sekarang`;
    out.style.color = d >= 0 ? "#16A34A" : "#DC2626";
  };
  const setTarget = (v: number) => {
    const t = target();
    if (!t) return;
    const dec = Number(t.dataset.dec) || 0;
    t.value = targetVal = v.toFixed(dec);
    alertDelta();
  };

  // ---------------------------------------------------------------- impresi iklan
  const seen = new Set<string>();
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              const id = (en.target as HTMLElement).dataset.adImp;
              if (!en.isIntersecting || !id || seen.has(id)) continue;
              seen.add(id);
              void api("POST", `/api/v1/ads/${id}/impression`, {});
            }
          },
          { threshold: 0.5 },
        );
  const watchAds = () => $$("[data-ad-imp]").forEach((el) => io?.observe(el));
  if (io) offs.push(() => io.disconnect());

  const onState = (e: Event) => {
    st = ((e as CustomEvent).detail ?? {}) as DesignState;
    if (st.read) allRead = true;
    apply();
    watchAds();
  };
  host.addEventListener("dc:state", onState);
  offs.push(() => host.removeEventListener("dc:state", onState));

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
    toast(host, "Masuk dulu untuk memakai fitur ini.");
    window.setTimeout(() => router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`), 600);
    return true;
  };

  // ---------------------------------------------------------------- klik
  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || !host.contains(t)) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const el = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);

    // Watchlist: tambah aset.
    if (el('[data-wl-action="add"]')) {
      stop();
      const s = window.prompt("Kode aset yang ingin dipantau (mis. BBCA, BTCUSD, XAUUSD):")?.trim().toUpperCase().replace("/", "");
      if (!s) return;
      void run(async () => {
        const r = await api("POST", "/api/me/watchlist", { symbol: s });
        if (needLogin(r)) return;
        if (!r.ok) return toast(host, why(r, "Gagal menambah aset."));
        toast(host, `${s} ditambahkan ke watchlist.`, "ok");
        router.refresh();
      });
      return;
    }
    const rm = el("[data-wl-remove]");
    if (rm) {
      stop();
      const sym = rm.dataset.wlRemove!;
      void run(async () => {
        const r = await api("DELETE", `/api/me/watchlist/${encodeURIComponent(sym)}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal menghapus aset."));
        gone.add(`[data-wl-row="${CSS.escape(sym)}"]`);
        apply();
        toast(host, `${sym} dihapus dari watchlist.`, "ok");
        router.refresh();
      });
      return;
    }
    const wt = el("[data-wl-tab]");
    if (wt) {
      wlTab = wt.dataset.wlTab!;
      if (!wt.hasAttribute("data-ev-click")) stop();
      apply();
      return;
    }

    // Price alert.
    const step = el("[data-al-step]");
    if (step) {
      stop();
      const tg = target();
      if (!tg) return;
      const base = Number(tg.dataset.base) || 0;
      const cur = num(tg.value) || base;
      const inc = base >= 1000 ? Math.pow(10, Math.max(0, Math.floor(Math.log10(base)) - 2)) * (base >= 10000 ? 2.5 : 1) : base * 0.005 || 0.01;
      setTarget(Math.max(0, cur + Number(step.dataset.alStep) * inc));
      return;
    }
    const pre = el("[data-al-preset]");
    if (pre) {
      const tg = target();
      const base = Number(tg?.dataset.base) || 0;
      if (base) window.setTimeout(() => setTarget(base * (1 + Number(pre.dataset.alPreset) / 100)), 0);
      return;
    }
    const del = el("[data-al-delete]");
    if (del) {
      stop();
      void run(async () => {
        const r = await api("DELETE", `/api/me/alerts/${del.dataset.alDelete}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal menghapus alert."));
        toast(host, "Price alert dihapus.", "ok");
        router.refresh();
      });
      return;
    }
    const save = el('[data-al="save"]');
    if (save) {
      stop();
      if (save.dataset.logged !== "1") {
        router.push(`/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      const tg = target();
      const base = Number(tg?.dataset.base) || 0;
      const v = tg ? num(tg.value) : NaN;
      const condition = COND[idx(st.u?.u1)] ?? "price_above";
      const channels = CHAN.filter((_, i) => (st.u?.u3 ? !!st.u.u3[i] : i !== 1));
      let threshold: number | null = null;
      if (condition === "price_above" || condition === "price_below") {
        if (!isFinite(v) || v <= 0) return toast(host, "Isi harga target yang valid.");
        threshold = v;
      } else if (condition === "change_pct") {
        const d = base && isFinite(v) ? Math.abs(((v - base) / base) * 100) : 0;
        threshold = Math.max(0.1, Math.round(d * 100) / 100);
      }
      const note = host.querySelector<HTMLInputElement>('input[data-al="note"]')?.value.trim() || undefined;
      void run(async () => {
        const r = await api("POST", "/api/me/alerts", { symbol: save.dataset.symbol, condition, threshold, frequency: FREQ[idx(st.u?.u2)] ?? "once", channels: channels.length ? channels : ["in_app"], note });
        if (needLogin(r)) return;
        if (!r.ok) return toast(host, why(r, "Gagal menyimpan price alert."));
        toast(host, "Price alert disimpan. Kami kabari saat target tercapai.", "ok");
        router.refresh();
      });
      return;
    }

    // Tersimpan.
    const bmr = el("[data-bm-remove]");
    if (bmr) {
      stop();
      const slug = bmr.dataset.bmRemove!;
      void run(async () => {
        const r = slug.startsWith("short:") ? await api("DELETE", `/api/v1/shorts/${encodeURIComponent(slug.slice(6))}/save`) : await api("DELETE", `/api/me/bookmarks/${encodeURIComponent(slug)}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal menghapus."));
        gone.add(`[data-bm-row="${CSS.escape(slug)}"]`);
        apply();
        toast(host, "Dihapus dari tersimpan.", "ok");
      });
      return;
    }
    const bt = el("[data-bm-tab]");
    if (bt) {
      bmTab = bt.dataset.bmTab!;
      apply();
      return;
    }

    // Notifikasi.
    if (el('[data-nt="read-all"]')) {
      allRead = true;
      void api("POST", "/api/me/notifications/read", {}).then((r) => {
        if (!r.ok) toast(host, why(r, "Gagal menandai notifikasi."));
      });
      window.setTimeout(apply, 0);
      return;
    }
    const nr = el("[data-nt-row]");
    if (nr && !allRead && !readIds.has(nr.dataset.ntRow!)) {
      readIds.add(nr.dataset.ntRow!);
      void api("POST", "/api/me/notifications/read", { ids: [nr.dataset.ntRow] });
      // tautan tetap berjalan
    }
    const ntb = el("[data-nt-tab]");
    if (ntb) {
      ntTab = ntb.dataset.ntTab!;
      window.setTimeout(apply, 0);
      return;
    }

    // Kalender: pengingat.
    const rem = el("[data-cal-remind]");
    if (rem) {
      stop();
      const id = rem.dataset.calRemind!;
      const sel = `[data-cal-remind="${CSS.escape(id)}"]`;
      const on = !(pressed.get(sel) ?? rem.getAttribute("aria-pressed") === "true");
      void run(async () => {
        const r = await api(on ? "PUT" : "DELETE", `/api/me/reminders/${id}`);
        if (needLogin(r)) return;
        if (!r.ok) return toast(host, why(r, "Gagal mengatur pengingat."));
        pressed.set(sel, on);
        apply();
        toast(host, on ? "Pengingat aktif · 15 menit sebelum rilis." : "Pengingat dimatikan.", "ok");
      });
      return;
    }
    if (el("[data-cal-day],[data-cal-country],[data-cal-high]")) {
      window.setTimeout(apply, 0);
      return;
    }

    // Newsletter publik: pilih daftar & langganan.
    const nls = el("[data-nlp-list]");
    if (nls) {
      stop();
      const on = nls.getAttribute("aria-checked") !== "true";
      nls.setAttribute("aria-checked", String(on));
      nls.style.background = on ? "#4285F4" : "#D6DEEA";
      nls.style.justifyContent = on ? "flex-end" : "flex-start";
      return;
    }
    if (el('[data-nlp="subscribe"]')) {
      stop();
      const email = host.querySelector<HTMLInputElement>('input[data-nlp="email"]')?.value.trim() ?? "";
      const lists = $$("[data-nlp-list]").filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.dataset.nlpList!);
      if (!email) return toast(host, "Masukkan email kamu dulu.");
      if (!lists.length) return toast(host, "Pilih minimal satu newsletter.");
      void run(async () => {
        const r = await api("POST", "/api/v1/newsletter/subscribe", { email, lists });
        if (!r.ok) return toast(host, why(r, "Gagal mendaftar newsletter."));
        toast(host, (r.data as { new?: boolean }).new ? "Terdaftar! Edisi berikutnya akan masuk ke inbox kamu." : "Langganan kamu diperbarui.", "ok");
      });
      return;
    }

    // Topik: ikuti / berhenti mengikuti.
    const tf = el("[data-topic-follow]");
    if (tf) {
      const design = tf.hasAttribute("data-ev-click");
      if (tf.dataset.logged !== "1") {
        stop();
        router.push(`/masuk?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      const slug = tf.dataset.topicFollow!;
      const sel = `[data-topic-follow="${CSS.escape(slug)}"]`;
      const was = pressed.get(sel) ?? (design ? !!st.u?.u7?.[0] : tf.getAttribute("aria-pressed") === "true");
      if (!design) stop();
      void run(async () => {
        const r = await api(was ? "DELETE" : "PUT", `/api/me/topics/${encodeURIComponent(slug)}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal memperbarui topik."));
        pressed.set(sel, !was);
        apply();
        toast(host, was ? "Berhenti mengikuti topik." : "Topik diikuti. Artikel baru masuk ke notifikasi.", "ok");
      });
      return;
    }

    // Artikel: simpan, reaksi, komentar, laporkan.
    const bm = el('[data-art="bookmark"]');
    if (bm) {
      const slug = bm.dataset.slug!;
      const sel = `[data-art="bookmark"][data-slug="${CSS.escape(slug)}"]`;
      const was = pressed.get(sel) ?? bm.getAttribute("aria-pressed") === "true";
      const design = bm.hasAttribute("data-ev-click");
      if (!design) stop();
      else e.preventDefault(); // biarkan desain mengganti ikon, jangan pindah ke /tersimpan
      void run(async () => {
        const r = await api(was ? "DELETE" : "PUT", `/api/me/bookmarks/${encodeURIComponent(slug)}`);
        if (needLogin(r)) return;
        if (!r.ok && r.status !== 404) return toast(host, why(r, "Gagal menyimpan artikel."));
        pressed.set(sel, !was);
        apply();
        toast(host, was ? "Dihapus dari tersimpan." : "Artikel disimpan.", "ok");
      });
      return;
    }
    const react = el("[data-art-react]");
    if (react) {
      void run(async () => {
        const r = await api("PUT", `/api/v1/articles/${encodeURIComponent(react.dataset.slug!)}/reaction`, { kind: react.dataset.artReact });
        if (needLogin(r)) return;
        if (!r.ok) toast(host, why(r, "Reaksi gagal disimpan."));
      });
      return;
    }
    const rep = el('[data-art="report"]');
    if (rep) {
      stop();
      const reason = window.prompt("Alasan melaporkan komentar ini (spam, kasar, menyesatkan, …):")?.trim();
      if (!reason) return;
      void run(async () => {
        const r = await api("POST", `/api/v1/comments/${rep.dataset.id}/report`, { reason });
        if (needLogin(r)) return;
        if (!r.ok) return toast(host, why(r, "Laporan gagal dikirim."));
        toast(host, "Terima kasih, laporan diteruskan ke moderator.", "ok");
      });
      return;
    }
    const send = el('[data-art="comment-send"]');
    if (send) {
      stop();
      const inp = host.querySelector<HTMLInputElement>('input[data-art="comment"]');
      if (inp?.dataset.login) return router.push(inp.dataset.login);
      void postComment(send.dataset.slug!, inp);
      return;
    }
    const ci = el<HTMLInputElement>('input[data-art="comment"][data-login]');
    if (ci) {
      stop();
      router.push(ci.dataset.login!);
    }
  };
  host.addEventListener("click", onClick, true);
  offs.push(() => host.removeEventListener("click", onClick, true));

  const postComment = (slug: string, inp: HTMLInputElement | null) =>
    run(async () => {
      const body = inp?.value.trim() ?? "";
      if (!body) return toast(host, "Tulis komentar terlebih dahulu.");
      const r = await api("POST", `/api/v1/articles/${encodeURIComponent(slug)}/comments`, { body });
      if (needLogin(r)) return;
      if (!r.ok) return toast(host, why(r, "Komentar gagal dikirim."));
      if (inp) inp.value = "";
      const pending = (r.data as { status?: string }).status !== "published";
      toast(host, pending ? "Komentar terkirim dan menunggu moderasi." : "Komentar terkirim.", "ok");
      router.refresh();
    });

  const onSubmit = (e: SubmitEvent) => {
    const f = e.target instanceof HTMLFormElement && e.target.matches('[data-art="comment-form"]') ? e.target : null;
    if (!f) return;
    e.preventDefault();
    void postComment(f.dataset.slug!, f.querySelector<HTMLInputElement>('input[data-art="comment"]'));
  };
  host.addEventListener("submit", onSubmit, true);
  offs.push(() => host.removeEventListener("submit", onSubmit, true));

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    if (e.target.matches('input[data-art="comment"][data-slug]') && !e.target.form) {
      e.preventDefault();
      void postComment(e.target.dataset.slug!, e.target);
    }
  };
  host.addEventListener("keydown", onKey);
  offs.push(() => host.removeEventListener("keydown", onKey));

  // Ocean Short: hitung tayang sekali per video saat diputar.
  const played = new Set<string>();
  const onPlay = (e: Event) => {
    const v = e.target instanceof HTMLVideoElement ? e.target : null;
    const id = v?.dataset.short;
    if (!id || played.has(id)) return;
    played.add(id);
    void api("POST", `/api/v1/shorts/${id}/view`, {});
  };
  host.addEventListener("play", onPlay, true);
  offs.push(() => host.removeEventListener("play", onPlay, true));

  const onInput = (e: Event) => {
    if (e.target instanceof HTMLInputElement && e.target.matches('[data-al="target"]')) {
      targetVal = e.target.value;
      alertDelta();
    }
  };
  host.addEventListener("input", onInput);
  offs.push(() => host.removeEventListener("input", onInput));

  // Ganti aset di halaman alert.
  const onChange = (e: Event) => {
    if (e.target instanceof HTMLSelectElement && e.target.matches('[data-al="symbol"]')) router.push(`/alert?symbol=${encodeURIComponent(e.target.value)}`);
  };
  host.addEventListener("change", onChange);
  offs.push(() => host.removeEventListener("change", onChange));

  // Tekan lama baris watchlist (aplikasi) → mode ubah: tombol × muncul.
  let lp = 0;
  const onDown = (e: PointerEvent) => {
    const row = e.target instanceof Element ? e.target.closest("a[data-wl-row]") : null;
    if (!row) return;
    lp = window.setTimeout(() => {
      editMode = !editMode;
      apply();
      toast(host, editMode ? "Mode ubah: ketuk × untuk menghapus aset." : "Mode ubah selesai.", "ok");
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      host.addEventListener("click", swallow, { capture: true, once: true });
    }, 550);
  };
  const cancel = () => window.clearTimeout(lp);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", cancel);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("pointermove", cancel);
  offs.push(() => {
    host.removeEventListener("pointerdown", onDown);
    host.removeEventListener("pointerup", cancel);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("pointermove", cancel);
  });

  apply();
  watchAds();
  return () => offs.forEach((f) => f());
}

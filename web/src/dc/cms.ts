/**
 * Enhancer panel CMS: kategori & tag ("taxonomy"), form kategori ("catform"), komentar ("moderation"),
 * pustaka media ("medialib"), dan log aktivitas ("activity"). Semua lewat BFF /api/admin/*.
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

type Problem = { title?: string; detail?: string; errors?: Record<string, string> };
export async function call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Problem & Record<string, unknown> }> {
  try {
    const isForm = body instanceof FormData;
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const data = res.status === 204 ? {} : ((await res.json().catch(() => ({}))) as Problem & Record<string, unknown>);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Koneksi bermasalah. Coba lagi." } };
  }
}
export const msg = (d: Problem, fb: string) => (d.errors && Object.values(d.errors)[0]) || d.detail || d.title || fb;

export function setSwitch(btn: HTMLElement, on: boolean) {
  btn.setAttribute("aria-checked", String(on));
  btn.style.background = on ? "#4285F4" : "#DCE3EE";
  btn.style.justifyContent = on ? "flex-end" : "flex-start";
}

export function armed(el: HTMLElement, label: string): boolean {
  if (el.dataset.armed === "1") return true;
  const old = el.innerHTML;
  el.dataset.armed = "1";
  el.textContent = label;
  window.setTimeout(() => {
    if (el.isConnected) {
      el.dataset.armed = "";
      el.innerHTML = old;
    }
  }, 4000);
  return false;
}

export function onCapture(host: HTMLElement, fn: (t: Element, e: MouseEvent) => void | Promise<void>): () => void {
  const h = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t) void fn(t, e);
  };
  host.addEventListener("click", h, true);
  return () => host.removeEventListener("click", h, true);
}
export const stop = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
};

// ======================================================================= kategori & tag
export function taxonomy(host: HTMLElement, { router }: Env): Cleanup {
  let busy = false;
  let dragged: HTMLElement | null = null;
  let orderDirty = false;
  const rows = () => [...host.querySelectorAll<HTMLElement>("[data-cat-row]")];
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };
  const off = onCapture(host, async (t, e) => {
    const menu = t.closest<HTMLElement>("[data-cat-menu]");
    if (menu) {
      stop(e);
      const on = menu.getAttribute("aria-checked") !== "true";
      setSwitch(menu, on);
      await run(async () => {
        const r = await call("PATCH", `categories/${menu.dataset.catMenu}/menu`, { in_menu: on });
        if (!r.ok) {
          setSwitch(menu, !on);
          toast(host, msg(r.data, "Gagal menyimpan."));
        } else toast(host, on ? "Tampil di menu." : "Disembunyikan dari menu.", "ok");
      });
      return;
    }
    const act = t.closest<HTMLElement>("[data-cat-action],[data-tag-action]");
    if (!act) return;
    stop(e);
    if (act.dataset.catAction === "save-order") {
      if (!orderDirty) return toast(host, "Seret baris (⋮⋮) untuk mengubah urutan, lalu simpan.");
      await run(async () => {
        const r = await call("POST", "categories/reorder", { ids: rows().map((x) => x.dataset.catRow) });
        if (!r.ok) return toast(host, msg(r.data, "Urutan gagal disimpan."));
        orderDirty = false;
        toast(host, "Urutan menu disimpan.", "ok");
        router.refresh();
      });
      return;
    }
    const tag = act.dataset.tagAction;
    const row = act.closest<HTMLElement>("[data-tag-row]");
    if (tag === "create") {
      const name = window.prompt("Nama tag baru (mis. IHSG)")?.trim();
      if (!name) return;
      await run(async () => {
        const r = await call("POST", "tags", { name });
        if (!r.ok) return toast(host, msg(r.data, "Tag gagal dibuat."));
        toast(host, `Tag #${r.data.slug} dibuat.`, "ok");
        router.refresh();
      });
    } else if (tag === "rename" && row) {
      const name = window.prompt("Nama tag", row.dataset.tagName ?? "")?.trim();
      if (!name) return;
      const slug = window.prompt("Slug (huruf kecil, angka, minus)", row.dataset.tagSlug ?? "")?.trim() ?? "";
      await run(async () => {
        const r = await call("PUT", `tags/${row.dataset.tagRow}`, { name, slug });
        if (!r.ok) return toast(host, msg(r.data, "Tag gagal diubah."));
        toast(host, "Tag diperbarui.", "ok");
        router.refresh();
      });
    } else if (tag === "merge" && row) {
      const into = window.prompt(`Gabungkan #${row.dataset.tagSlug} ke tag (ketik slug tujuan):`)?.trim().replace(/^#/, "");
      if (!into) return;
      const target = host.querySelector<HTMLElement>(`[data-tag-slug="${CSS.escape(into)}"]`) ?? [...host.querySelectorAll<HTMLOptionElement>("#ob-tags option")].find((o) => o.value === into);
      const id = target ? (target as HTMLElement).dataset.tagRow ?? (target as HTMLOptionElement).dataset.id : undefined;
      if (!id) return toast(host, `Tag #${into} tidak ditemukan.`);
      await run(async () => {
        const r = await call("POST", `tags/${row.dataset.tagRow}/merge`, { into: id });
        if (!r.ok) return toast(host, msg(r.data, "Gagal menggabungkan."));
        toast(host, `#${row.dataset.tagSlug} digabung ke #${into}.`, "ok");
        router.refresh();
      });
    } else if (tag === "delete" && row) {
      if (!armed(act, "Ketuk lagi")) return;
      await run(async () => {
        const r = await call("DELETE", `tags/${row.dataset.tagRow}`);
        if (!r.ok) return toast(host, msg(r.data, "Tag gagal dihapus."));
        toast(host, "Tag dihapus.", "ok");
        router.refresh();
      });
    }
  });
  // Seret untuk mengurutkan.
  const dragStart = (e: DragEvent) => {
    dragged = (e.target as Element).closest<HTMLElement>("[data-cat-row]");
    if (dragged) dragged.style.opacity = ".5";
  };
  const dragOver = (e: DragEvent) => {
    const over = (e.target as Element).closest<HTMLElement>("[data-cat-row]");
    if (!dragged || !over || over === dragged) return;
    e.preventDefault();
    const r = over.getBoundingClientRect();
    over.parentElement!.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
    orderDirty = true;
  };
  const dragEnd = () => {
    if (dragged) dragged.style.opacity = "";
    dragged = null;
    if (orderDirty) toast(host, "Urutan berubah — tekan “Simpan urutan menu”.");
  };
  host.addEventListener("dragstart", dragStart);
  host.addEventListener("dragover", dragOver);
  host.addEventListener("dragend", dragEnd);
  return () => {
    off();
    host.removeEventListener("dragstart", dragStart);
    host.removeEventListener("dragover", dragOver);
    host.removeEventListener("dragend", dragEnd);
  };
}

// ======================================================================= form kategori
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function catform(host: HTMLElement, { router, ctx }: Env): Cleanup {
  const $ = <T extends HTMLElement = HTMLInputElement>(k: string) => host.querySelector<T>(`[data-cf="${k}"]`);
  const id = ctx.id || "";
  let slugTouched = !!id;
  let color = host.querySelector<HTMLElement>('[data-cf-color][aria-pressed="true"]')?.dataset.cfColor ?? "#A9D4D3";
  let icon = host.querySelector<HTMLElement>('[data-cf-icon][aria-pressed="true"]')?.dataset.cfIcon ?? "bars";
  let busy = false;
  const pv = (k: string) => host.querySelector<HTMLElement>(`[data-pv="${k}"]`);

  const sync = () => {
    const name = $("name")?.value.trim() || "Kategori";
    const slug = $("slug")?.value.trim() || "kategori";
    for (const k of ["name", "name2", "name3"]) {
      const el = pv(k);
      if (el) el.textContent = name;
    }
    const ab = pv("abbr");
    if (ab) ab.textContent = name.slice(0, 3).toUpperCase();
    const url = pv("url");
    if (url) url.textContent = `oceanbird.id › ${slug}`;
    const st = pv("seo-title");
    if (st) st.textContent = $("seo_title")?.value.trim() || `${name} | OceanBird`;
    const sd = pv("seo-desc");
    if (sd) sd.textContent = $<HTMLTextAreaElement>("seo_desc")?.value.trim() || $<HTMLTextAreaElement>("desc")?.value.trim() || "Deskripsi kategori tampil di sini.";
    const card = pv("card");
    if (card) card.style.background = color;
    for (const k of ["desc", "seo_desc"]) {
      const c = host.querySelector<HTMLElement>(`[data-cf-count="${k}"]`);
      const v = $<HTMLTextAreaElement>(k)?.value ?? "";
      if (c) c.textContent = `${[...v].length}/160`;
    }
  };

  const payload = (status?: string) => ({
    name: $("name")?.value ?? "",
    slug: $("slug")?.value ?? "",
    description: $<HTMLTextAreaElement>("desc")?.value ?? "",
    parent_id: $<HTMLSelectElement>("parent")?.value || null,
    editor_id: $<HTMLSelectElement>("editor")?.value || null,
    sort_order: Number($("order")?.value || 0),
    status: status ?? $<HTMLSelectElement>("status")?.value ?? "active",
    in_menu: host.querySelector('[data-cf-switch="in_menu"]')?.getAttribute("aria-checked") === "true",
    followable: host.querySelector('[data-cf-switch="followable"]')?.getAttribute("aria-checked") === "true",
    color,
    icon,
    seo_title: $("seo_title")?.value ?? "",
    seo_description: $<HTMLTextAreaElement>("seo_desc")?.value ?? "",
  });

  const mark = (field?: string) => {
    host.querySelectorAll<HTMLElement>("[data-cf-bad]").forEach((el) => {
      el.removeAttribute("data-cf-bad");
      el.style.boxShadow = "";
    });
    const map: Record<string, string> = { description: "desc", seo_description: "seo_desc", parent_id: "parent", editor_id: "editor", sort_order: "order" };
    const el = field ? $(map[field] ?? field) : null;
    if (el) {
      el.setAttribute("data-cf-bad", "");
      el.style.boxShadow = "0 0 0 2px #F87171";
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  };

  const save = async (status?: string) => {
    if (busy) return;
    busy = true;
    const r = await call(id ? "PUT" : "POST", id ? `categories/${id}` : "categories", payload(status));
    busy = false;
    if (!r.ok) {
      mark(r.data.errors ? Object.keys(r.data.errors)[0] : undefined);
      return toast(host, msg(r.data, "Kategori gagal disimpan."));
    }
    mark();
    toast(host, status === "draft" ? "Disimpan sebagai draf." : id ? "Perubahan disimpan." : "Kategori dipublikasikan.", "ok");
    router.push(`/admin/kategori?id=${(r.data.id as string) ?? id}`);
  };

  const off = onCapture(host, async (t, e) => {
    const sw = t.closest<HTMLElement>("[data-cf-switch]");
    if (sw) {
      stop(e);
      setSwitch(sw, sw.getAttribute("aria-checked") !== "true");
      return;
    }
    const c = t.closest<HTMLElement>("[data-cf-color]");
    if (c) {
      stop(e);
      color = c.dataset.cfColor!;
      host.querySelectorAll<HTMLElement>("[data-cf-color]").forEach((b) => {
        const on = b === c;
        b.setAttribute("aria-pressed", String(on));
        b.style.border = on ? "3px solid #4285F4" : "1px solid #E3EBF7";
      });
      sync();
      return;
    }
    const ic = t.closest<HTMLElement>("[data-cf-icon]");
    if (ic) {
      stop(e);
      icon = ic.dataset.cfIcon!;
      host.querySelectorAll<HTMLElement>("[data-cf-icon]").forEach((b) => {
        const on = b === ic;
        b.setAttribute("aria-pressed", String(on));
        b.style.border = on ? "2px solid #4285F4" : "1px solid #E3EBF7";
      });
      const pi = pv("icon");
      const svg = ic.querySelector("svg");
      if (pi && svg) pi.innerHTML = svg.outerHTML;
      return;
    }
    const act = t.closest<HTMLElement>("[data-cf-action]")?.dataset.cfAction;
    if (!act) return;
    stop(e);
    if (act === "publish") await save(id ? undefined : "active");
    else if (act === "draft") await save("draft");
    else if (act === "delete") {
      const confirm = $("confirm");
      if (confirm && confirm.value.trim().toUpperCase() !== confirm.dataset.expect) {
        confirm.focus();
        return toast(host, `Ketik ${confirm.dataset.expect} untuk konfirmasi.`);
      }
      const move = $<HTMLSelectElement>("move_to")?.value ?? "";
      const redirect = $<HTMLInputElement>("redirect")?.checked ? "1" : "";
      if ($<HTMLSelectElement>("move_to") && !move) return toast(host, "Pilih kategori tujuan untuk memindahkan artikel.");
      if (busy) return;
      busy = true;
      const r = await call("DELETE", `categories/${id}?move_to=${encodeURIComponent(move)}&redirect=${redirect}`);
      busy = false;
      if (!r.ok) return toast(host, msg(r.data, "Kategori gagal dihapus."));
      toast(host, "Kategori dihapus.", "ok");
      router.push("/admin/kategori");
    }
  });
  const onInput = (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.dataset.cf === "name" && !slugTouched) {
      const s = $("slug");
      if (s) s.value = slugify((t as HTMLInputElement).value);
    }
    if (t.dataset.cf === "slug") slugTouched = true;
    sync();
  };
  host.addEventListener("input", onInput);
  if (location.hash === "#hapus") host.querySelector("#hapus")?.scrollIntoView({ block: "center" });
  sync();
  return () => {
    off();
    host.removeEventListener("input", onInput);
  };
}

// ======================================================================= komentar
export function moderation(host: HTMLElement, { router }: Env): Cleanup {
  let busy = false;
  const setStatus = async (ids: string[], status: string) => {
    if (busy || !ids.length) return;
    busy = true;
    const r = await call("POST", "comments/status", { ids, status });
    busy = false;
    if (!r.ok) return toast(host, msg(r.data, "Gagal memperbarui komentar."));
    toast(host, status === "visible" ? `${ids.length} komentar disetujui.` : "Komentar disembunyikan.", "ok");
    router.refresh();
  };
  const settings = () => {
    const out: Record<string, boolean | number> = { report_threshold: 3 };
    host.querySelectorAll<HTMLElement>("[data-cm-setting]").forEach((b) => (out[b.dataset.cmSetting!] = b.getAttribute("aria-checked") === "true"));
    return out;
  };
  const off = onCapture(host, async (t, e) => {
    const sw = t.closest<HTMLElement>("[data-cm-setting]");
    if (sw) {
      stop(e);
      setSwitch(sw, sw.getAttribute("aria-checked") !== "true");
      const r = await call("PUT", "moderation", settings());
      if (!r.ok) {
        setSwitch(sw, sw.getAttribute("aria-checked") !== "true");
        return toast(host, msg(r.data, "Pengaturan gagal disimpan."));
      }
      toast(host, "Filter otomatis disimpan.", "ok");
      return;
    }
    const word = t.closest<HTMLElement>("[data-cm-word]");
    if (word) {
      stop(e);
      const r = await call("DELETE", `moderation/words?word=${encodeURIComponent(word.dataset.cmWord!)}`);
      if (!r.ok) return toast(host, msg(r.data, "Gagal menghapus kata."));
      word.remove();
      return;
    }
    const act = t.closest<HTMLElement>("[data-cm-action]");
    if (!act) return;
    stop(e);
    const a = act.dataset.cmAction!;
    if (a === "visible" || a === "hidden") await setStatus([act.dataset.id!], a);
    else if (a === "approve-safe") {
      const ids = [...host.querySelectorAll<HTMLElement>("[data-cm-row]")].filter((r) => r.dataset.reports === "0").map((r) => r.dataset.cmRow!);
      if (!ids.length) return toast(host, "Tidak ada komentar tanpa laporan di antrian.");
      if (!armed(act, `Ketuk lagi untuk setujui ${ids.length}`)) return;
      await setStatus(ids, "visible");
    } else if (a === "block") {
      if (!armed(act, "Ketuk lagi untuk blokir")) return;
      const r = await call("POST", `users/${act.dataset.user}/block`, { blocked: true });
      if (!r.ok) return toast(host, msg(r.data, "Gagal memblokir."));
      toast(host, "Pengguna diblokir dan sesinya dikeluarkan.", "ok");
      router.refresh();
    }
  });
  const onKey = async (e: KeyboardEvent) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset?.cm !== "word-input" || e.key !== "Enter") return;
    e.preventDefault();
    const w = t.value.trim().toLowerCase();
    if (w.length < 2) return;
    const r = await call("POST", "moderation/words", { word: w });
    if (!r.ok) return toast(host, msg(r.data, "Gagal menambah kata."));
    t.value = "";
    router.refresh();
  };
  host.addEventListener("keydown", onKey);
  return () => {
    off();
    host.removeEventListener("keydown", onKey);
  };
}

// ======================================================================= media
export async function shrink(file: File, max = 2000): Promise<Blob> {
  if (file.type === "image/gif" && file.size <= 4 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size <= 3.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      bmp.close();
      return file;
    }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/jpeg", 0.86));
  } catch {
    return file;
  }
}

export function medialib(host: HTMLElement, { router }: Env): Cleanup {
  const file = host.querySelector<HTMLInputElement>('[data-md="file"]');
  const drop = host.querySelector<HTMLElement>('[data-md="drop"]');
  let busy = false;
  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return toast(host, "Pilih berkas foto (JPG, PNG, WebP, GIF).");
    busy = true;
    let ok = 0;
    let lastId = "";
    for (const f of imgs) {
      toast(host, `Mengunggah ${f.name}…`);
      const blob = await shrink(f);
      const fd = new FormData();
      fd.append("file", blob, blob === f ? f.name : f.name.replace(/\.[^.]+$/, "") + ".jpg");
      const r = await call("POST", "media", fd);
      if (r.ok) {
        ok++;
        lastId = r.data.id as string;
      } else toast(host, `${f.name}: ${msg(r.data, "gagal diunggah")}`);
    }
    busy = false;
    if (ok) {
      toast(host, `${ok} foto diunggah. Lengkapi lisensinya.`, "ok");
      router.push(`/admin/media?id=${lastId}`);
    }
  };
  const off = onCapture(host, async (t, e) => {
    const act = t.closest<HTMLElement>("[data-md-action]");
    if (!act) return;
    stop(e);
    const a = act.dataset.mdAction;
    if (a === "pick") file?.click();
    else if (a === "save") {
      if (busy) return;
      const d = host.querySelector<HTMLElement>('[data-md="detail"]')!;
      const v = (k: string) => d.querySelector<HTMLInputElement>(`[data-md="${k}"]`)?.value ?? "";
      busy = true;
      const r = await call("PATCH", `media/${act.dataset.id}`, { title: v("title"), kind: v("kind"), source: v("source"), license: v("license"), license_until: v("until") || null, alt: v("alt") });
      busy = false;
      if (!r.ok) return toast(host, msg(r.data, "Gagal menyimpan."));
      toast(host, "Lisensi & keterangan disimpan.", "ok");
      router.refresh();
    } else if (a === "delete") {
      if (!armed(act, "Ketuk lagi untuk hapus")) return;
      const r = await call("DELETE", `media/${act.dataset.id}`);
      if (!r.ok) return toast(host, msg(r.data, "Gagal menghapus."));
      toast(host, "Media dihapus.", "ok");
      router.push("/admin/media");
    }
  });
  const onFile = () => {
    if (file?.files?.length) void upload([...file.files]);
    if (file) file.value = "";
  };
  const over = (e: DragEvent) => {
    e.preventDefault();
    if (drop) drop.style.borderColor = "#4285F4";
  };
  const leave = () => {
    if (drop) drop.style.borderColor = "";
  };
  const dropped = (e: DragEvent) => {
    e.preventDefault();
    leave();
    if (e.dataTransfer?.files.length) void upload([...e.dataTransfer.files]);
  };
  const onInput = (e: Event) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.dataset?.md === "alt") {
      const c = host.querySelector<HTMLElement>("[data-md-count]");
      if (c) c.textContent = `${[...t.value].length}/125`;
    }
  };
  let timer = 0;
  const onSearch = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset?.md !== "search") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const u = new URL(location.href);
      if (t.value.trim()) u.searchParams.set("q", t.value.trim());
      else u.searchParams.delete("q");
      router.replace(u.pathname + u.search);
    }, 400);
  };
  const q = new URLSearchParams(location.search).get("q");
  const search = host.querySelector<HTMLInputElement>('[data-md="search"]');
  if (q && search) search.value = q;
  file?.addEventListener("change", onFile);
  drop?.addEventListener("dragover", over);
  drop?.addEventListener("dragleave", leave);
  drop?.addEventListener("drop", dropped);
  host.addEventListener("input", onInput);
  host.addEventListener("input", onSearch);
  return () => {
    off();
    file?.removeEventListener("change", onFile);
    drop?.removeEventListener("dragover", over);
    drop?.removeEventListener("dragleave", leave);
    drop?.removeEventListener("drop", dropped);
    host.removeEventListener("input", onInput);
    host.removeEventListener("input", onSearch);
    window.clearTimeout(timer);
  };
}

// ======================================================================= log aktivitas
export function activity(host: HTMLElement, { router }: Env): Cleanup {
  const off = onCapture(host, (t, e) => {
    const open = t.closest<HTMLElement>("[data-act-open]");
    const row = t.closest<HTMLElement>("[data-act-row]");
    if (open || (row && !t.closest("a"))) {
      stop(e);
      const target = open ?? row!.querySelector<HTMLElement>("[data-act-open]");
      if (target) router.push(target.dataset.actOpen!);
      return;
    }
    if (t.closest('[data-act-action="csv"]')) {
      stop(e);
      const rows = [...host.querySelectorAll<HTMLElement>("[data-act-row]")].map((r) =>
        [...r.children].slice(0, 5).map((c) => `"${(c.textContent ?? "").replace(/\s+/g, " ").trim().replace(/"/g, '""')}"`).join(","),
      );
      const blob = new Blob([["Waktu,Pelaku,Aksi,Objek,Perangkat", ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `log-aktivitas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
  host.querySelectorAll<HTMLElement>("[data-act-row]").forEach((r) => (r.style.cursor = "pointer"));
  return off;
}

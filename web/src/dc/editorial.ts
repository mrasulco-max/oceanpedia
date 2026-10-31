/**
 * Enhancer panel redaksi:
 *  - editor:  form "Tulis artikel" → simpan draf / kirim review / terbitkan (+ unggah foto, ticker, sakelar).
 *  - content: tabel "Konten" → pilih baris, minta revisi, terbitkan, tarik ke draf.
 * Semua permintaan lewat BFF /api/admin/* (token di cookie httpOnly).
 */
import type { Cleanup, Env } from "./enhancers";
import { toast } from "./toast";

interface Problem {
  title?: string;
  detail?: string;
  errors?: Record<string, string>;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; problem: Problem; status: number }> {
  try {
    const res = await fetch(`/api/admin/${path}`, {
      method,
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, problem: data as Problem, status: res.status };
  } catch {
    return { ok: false, problem: { detail: "Koneksi bermasalah. Coba lagi." }, status: 0 };
  }
}

function problemText(p: Problem): string {
  if (p.errors) return Object.values(p.errors)[0] ?? p.title ?? "Periksa kembali isian.";
  return p.detail ?? p.title ?? "Terjadi kesalahan.";
}

const $ = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T & HTMLElement>(sel);

/** Foto dari kamera HP sering > 4 MB: kecilkan ke sisi terpanjang `max` px (JPEG) sebelum diunggah. */
async function shrink(file: File, max = 1600): Promise<Blob> {
  if (file.type === "image/gif" && file.size <= 4 * 1024 * 1024) return file; // jaga animasi
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size <= 1.5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
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
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/jpeg", 0.85));
  } catch {
    return file; // biar server yang menilai formatnya
  }
}

async function uploadImage(file: File): Promise<{ ok: true; url: string } | { ok: false; msg: string }> {
  if (!file.type.startsWith("image/")) return { ok: false, msg: "Pilih berkas foto." };
  const blob = await shrink(file);
  if (blob.size > 4 * 1024 * 1024) return { ok: false, msg: "Ukuran foto maksimal 4 MB." };
  const fd = new FormData();
  fd.append("file", blob, blob === file ? file.name : "foto.jpg");
  const r = await call<{ id: string; url: string }>("POST", "media", fd);
  return r.ok ? { ok: true, url: r.data.url } : { ok: false, msg: problemText(r.problem) };
}

/** Tombol hapus dua ketukan (tanpa dialog bawaan browser, ramah HP). */
function armed(btn: HTMLElement, label = "Ketuk lagi untuk hapus"): boolean {
  if (btn.dataset.armed === "1") return true;
  const old = btn.textContent;
  btn.dataset.armed = "1";
  btn.textContent = label;
  window.setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed === "1") {
      btn.dataset.armed = "";
      btn.textContent = old;
    }
  }, 4000);
  return false;
}

// ---------------------------------------------------------------------------
// Tulis artikel
// ---------------------------------------------------------------------------
const FIELD_SEL: Record<string, string> = {
  title: '[data-ed="title"]',
  excerpt: '[data-ed="excerpt"]',
  body: '[data-ed="body"]',
  category: '[data-ed="category"]',
  symbols: '[data-ed="symbol-input"]',
  is_breaking: '[data-ed-switch="breaking"]',
  cover_url: '[data-ed="cover-btn"]',
};

export function editor(host: HTMLElement, { router, ctx }: Env): Cleanup {
  let id = ctx.id || "";
  let busy = false;
  let dirty = false;
  const title = $<HTMLInputElement>(host, '[data-ed="title"]');
  const excerpt = $<HTMLTextAreaElement>(host, '[data-ed="excerpt"]');
  const body = $<HTMLTextAreaElement>(host, '[data-ed="body"]');
  const category = $<HTMLSelectElement>(host, '[data-ed="category"]');
  const type = $<HTMLSelectElement>(host, '[data-ed="type"]');
  const chips = $(host, '[data-ed="chips"]');
  const symInput = $<HTMLInputElement>(host, '[data-ed="symbol-input"]');
  const cover = $(host, '[data-ed="cover"]');
  const coverFile = $<HTMLInputElement>(host, '[data-ed="cover-file"]');
  const confirmBox = $(host, '[data-ed="confirm"]');
  const imageFile = $<HTMLInputElement>(host, '[data-ed="image-file"]');
  if (!title || !excerpt || !body || !category || !type || !chips || !symInput || !cover || !coverFile) return;

  const known = new Set([...host.querySelectorAll<HTMLOptionElement>("#ob-symbols option")].map((o) => o.value));
  const chipStyle = chips.getAttribute("data-chip-style") ?? "";

  // Tinggi area isi mengikuti teks.
  const grow = (t: HTMLTextAreaElement, min: number) => {
    t.style.height = "auto";
    t.style.height = `${Math.max(min, t.scrollHeight + 2)}px`;
  };
  grow(body, 380);
  grow(excerpt, 0);

  const sync = () => {
    const n = [...title.value].length;
    const count = $(host, '[data-ed="count"]');
    if (count) {
      count.textContent = `${n}/90 karakter`;
      count.style.color = n > 90 ? "#B3261E" : "";
    }
    const pt = $(host, '[data-ed="pv-title"]');
    if (pt) pt.textContent = title.value.trim() || "Judul artikel";
    const px = $(host, '[data-ed="pv-text"]');
    if (px) px.textContent = excerpt.value.trim() || "Dek artikel tampil di sini.";
  };

  const symbols = () => [...chips.querySelectorAll<HTMLElement>("[data-sym]")].map((c) => c.dataset.sym!);
  const addSymbol = (raw: string) => {
    const s = raw.trim().toUpperCase();
    if (!s) return;
    if (!known.has(s)) {
      toast(host, `Ticker ${s} tidak dikenal.`);
      return;
    }
    if (symbols().includes(s)) return;
    if (symbols().length >= 10) {
      toast(host, "Maksimal 10 ticker.");
      return;
    }
    const el = document.createElement("span");
    el.dataset.sym = s;
    el.setAttribute("style", `${chipStyle}; cursor: pointer`);
    el.title = `Hapus ${s}`;
    el.textContent = `${s} ×`;
    chips.appendChild(el);
    dirty = true;
  };

  const switchOn = (key: string) => $(host, `[data-ed-switch="${key}"]`)?.getAttribute("aria-checked") === "true";
  const setSwitch = (btn: HTMLElement, on: boolean) => {
    btn.setAttribute("aria-checked", String(on));
    btn.style.background = on ? "#4285F4" : "#DCE3EE";
    btn.style.justifyContent = on ? "flex-end" : "flex-start";
  };

  const publishAt = (): string | undefined => {
    const d = $<HTMLInputElement>(host, '[data-ed="date"]')?.value;
    const t = $<HTMLInputElement>(host, '[data-ed="time"]')?.value || "00:00";
    if (!d) return undefined;
    const at = new Date(`${d}T${t}:00+07:00`); // WIB
    return at.getTime() > Date.now() + 60_000 ? at.toISOString() : undefined;
  };

  const mark = (field?: string) => {
    host.querySelectorAll<HTMLElement>("[data-ed-invalid]").forEach((el) => {
      el.removeAttribute("data-ed-invalid");
      el.style.boxShadow = "";
    });
    const sel = field ? FIELD_SEL[field] : undefined;
    const el = sel ? $(host, sel) : null;
    if (el) {
      el.setAttribute("data-ed-invalid", "");
      el.style.boxShadow = "0 0 0 2px #F87171";
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if ("focus" in el) el.focus({ preventScroll: true });
    }
  };

  const save = async (action: "draft" | "review" | "publish") => {
    if (busy) return;
    busy = true;
    const payload = {
      title: title.value,
      excerpt: excerpt.value,
      body: body.value,
      category: category.value,
      is_premium: type.value === "plus",
      is_breaking: switchOn("breaking"),
      symbols: symbols(),
      cover_url: cover.dataset.url || null,
      action,
      publish_at: action === "publish" ? publishAt() : undefined,
    };
    const saved = $(host, '[data-ed="saved"]');
    if (saved) saved.textContent = "Menyimpan…";
    const r = await call<{ id: string; status: string; published_at: string | null; slug: string }>(id ? "PUT" : "POST", id ? `articles/${id}` : "articles", payload);
    busy = false;
    if (!r.ok) {
      if (saved) saved.textContent = "Gagal menyimpan";
      if (r.status === 401) {
        toast(host, "Sesi berakhir. Silakan masuk lagi.");
        router.push(`/admin/masuk?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      mark(r.problem.errors ? Object.keys(r.problem.errors)[0] : undefined);
      toast(host, problemText(r.problem));
      return;
    }
    mark();
    dirty = false;
    const a = r.data;
    id = a.id;
    const now = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date());
    if (saved) saved.textContent = `Terakhir disimpan ${now.replace(".", ":")}`;
    if (action === "draft") {
      toast(host, "Draf tersimpan.", "ok");
      if (!ctx.id) router.replace(`/admin/tulis?id=${a.id}`);
      return;
    }
    const scheduled = a.status === "published" && a.published_at && new Date(a.published_at).getTime() > Date.now();
    toast(host, action === "review" ? "Terkirim ke editor untuk direview." : scheduled ? "Artikel dijadwalkan terbit." : "Artikel terbit di website & aplikasi.", "ok");
    router.push(`/admin/konten?status=${action === "review" ? "review" : scheduled ? "scheduled" : "published"}&id=${a.id}`);
  };

  // Toolbar format: bekerja pada teks terpilih di area isi.
  const edit = (fn: (sel: string, before: string, after: string) => { text: string; caret?: [number, number] }) => {
    const a = body.selectionStart ?? body.value.length;
    const b = body.selectionEnd ?? a;
    const r = fn(body.value.slice(a, b), body.value.slice(0, a), body.value.slice(b));
    body.focus();
    body.setRangeText(r.text, a, b, "end");
    if (r.caret) body.setSelectionRange(a + r.caret[0], a + r.caret[1]);
    body.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const block = (before: string) => (before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "");
  const prefixLines = (sel: string, before: string, mark: string, sample: string) => {
    const lines = (sel || sample).split("\n").map((l) => (l.startsWith(mark) ? l : mark + l));
    const lead = block(before);
    const text = lead + lines.join("\n");
    return { text, caret: sel ? undefined : ([lead.length + mark.length, text.length] as [number, number]) };
  };
  const tool = (key: string) => {
    if (key === "bold") {
      edit((sel) => ({ text: `**${sel || "teks tebal"}**`, caret: sel ? undefined : [2, 12] }));
    } else if (key === "list") {
      edit((sel, before) => prefixLines(sel, before, "- ", "Poin pertama"));
    } else if (key === "quote") {
      edit((sel, before) => prefixLines(sel, before, "> ", "Kutipan narasumber"));
    } else if (key === "link") {
      const url = window.prompt("Alamat tautan (https://…)", "https://");
      if (!url) return;
      if (!/^https?:\/\/[^\s"'<>]+\.[^\s"'<>]+$/.test(url.trim())) {
        toast(host, "Tautan harus diawali https:// dan berupa alamat lengkap.");
        return;
      }
      edit((sel) => {
        const label = (sel || "teks tautan").replace(/[[\]]/g, "");
        return { text: `[${label}](${url.trim()})`, caret: sel ? undefined : [1, 1 + label.length] };
      });
    } else if (key === "image") {
      imageFile?.click();
    } else if (key === "widget") {
      toast(host, "Grafik harga tampil otomatis dari “Ticker terkait”. Tambahkan ticker di sini.");
      symInput.scrollIntoView({ block: "center", behavior: "smooth" });
      symInput.focus({ preventScroll: true });
    }
  };
  const onImage = async () => {
    const f = imageFile?.files?.[0];
    if (!f || !imageFile) return;
    imageFile.value = "";
    toast(host, "Mengunggah gambar…");
    const r = await uploadImage(f);
    if (!r.ok) return toast(host, r.msg);
    edit((_sel, before) => {
      const lead = block(before);
      return { text: `${lead}![Keterangan foto](${r.url})\n\n`, caret: [lead.length + 2, lead.length + 17] };
    });
    toast(host, "Gambar disisipkan. Ganti “Keterangan foto” dengan keterangan & sumbernya.", "ok");
  };

  const remove = async (btn: HTMLElement) => {
    if (!id || busy || !armed(btn)) return;
    busy = true;
    const r = await call<unknown>("DELETE", `articles/${id}`);
    busy = false;
    if (!r.ok) {
      toast(host, problemText(r.problem));
      return;
    }
    dirty = false;
    toast(host, "Artikel dihapus.", "ok");
    router.push("/admin/konten?status=draft");
  };

  const onClick = (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const chip = t.closest<HTMLElement>("[data-sym]");
    if (chip && chips.contains(chip)) {
      chip.remove();
      dirty = true;
      return;
    }
    const sw = t.closest<HTMLElement>("[data-ed-switch]");
    if (sw) {
      e.preventDefault();
      if (sw.getAttribute("aria-disabled") === "true") {
        toast(host, "Hanya editor/admin yang bisa menandai BREAKING.");
        return;
      }
      setSwitch(sw, sw.getAttribute("aria-checked") !== "true");
      dirty = true;
      return;
    }
    const tb = t.closest<HTMLElement>("[data-ed-tool]");
    if (tb) {
      e.preventDefault();
      tool(tb.dataset.edTool!);
      return;
    }
    if (t.closest('[data-ed="cover-btn"]')) {
      e.preventDefault();
      coverFile.click();
      return;
    }
    const act = t.closest<HTMLElement>("[data-ed-action]")?.dataset.edAction;
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    if (act === "delete") {
      void remove(t.closest<HTMLElement>("[data-ed-action]")!);
    } else if (act === "preview") {
      toast(host, "Pratinjau tersedia setelah artikel terbit.");
    } else if (act === "draft" || act === "review") {
      void save(act);
    } else if (act === "publish") {
      if (switchOn("breaking") && confirmBox) {
        confirmBox.hidden = false;
        confirmBox.scrollIntoView({ block: "center", behavior: "smooth" });
      } else void save("publish");
    } else if (act === "confirm") {
      if (confirmBox) confirmBox.hidden = true;
      void save("publish");
    } else if (act === "cancel") {
      if (confirmBox) confirmBox.hidden = true;
    }
  };

  const onInput = (e: Event) => {
    dirty = true;
    if (e.target === body) grow(body, 380);
    if (e.target === excerpt) grow(excerpt, 0);
    sync();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target === symInput && (e.key === "Enter" || e.key === ",")) {
      e.preventDefault();
      addSymbol(symInput.value);
      symInput.value = "";
    } else if (e.target === symInput && e.key === "Backspace" && !symInput.value) {
      chips.querySelector("[data-sym]:last-child")?.remove();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save("draft");
    }
  };
  // Memilih dari daftar saran (datalist) langsung menambah chip.
  const onChange = (e: Event) => {
    if (e.target === symInput && known.has(symInput.value.trim().toUpperCase())) {
      addSymbol(symInput.value);
      symInput.value = "";
    }
  };

  const onFile = async () => {
    const f = coverFile.files?.[0];
    if (!f) return;
    const note = $(host, '[data-ed="cover-note"]');
    if (note) note.textContent = "Mengunggah…";
    const r = await uploadImage(f);
    coverFile.value = "";
    if (!r.ok) {
      if (note) note.textContent = "Gagal mengunggah";
      toast(host, r.msg);
      return;
    }
    cover.dataset.url = r.url;
    cover.style.background = `url("${r.url}") center / cover no-repeat, linear-gradient(150deg, #2C3A63, #1B2235)`;
    if (note) note.textContent = "Foto terpasang";
    const btn = $(host, '[data-ed="cover-btn"]');
    if (btn?.lastChild) btn.lastChild.textContent = "Ganti foto";
    dirty = true;
    toast(host, "Foto sampul diunggah.", "ok");
  };

  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) e.preventDefault();
  };

  host.addEventListener("click", onClick, true);
  host.addEventListener("input", onInput);
  host.addEventListener("keydown", onKey);
  host.addEventListener("change", onChange);
  coverFile.addEventListener("change", onFile);
  imageFile?.addEventListener("change", onImage);
  window.addEventListener("beforeunload", beforeUnload);
  sync();
  return () => {
    host.removeEventListener("click", onClick, true);
    host.removeEventListener("input", onInput);
    host.removeEventListener("keydown", onKey);
    host.removeEventListener("change", onChange);
    coverFile.removeEventListener("change", onFile);
    imageFile?.removeEventListener("change", onImage);
    window.removeEventListener("beforeunload", beforeUnload);
  };
}

// ---------------------------------------------------------------------------
// Konten
// ---------------------------------------------------------------------------
export function content(host: HTMLElement, { router }: Env): Cleanup {
  let busy = false;
  const onClick = async (e: MouseEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const sel = t.closest<HTMLElement>("[data-select]");
    if (sel) {
      e.preventDefault();
      e.stopPropagation();
      router.push(sel.dataset.select!);
      return;
    }
    const act = t.closest<HTMLElement>("[data-cnt-action]");
    if (act) {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      const action = act.dataset.cntAction!;
      const note = host.querySelector<HTMLTextAreaElement>('[data-cnt="note"]')?.value.trim() ?? "";
      if (action === "reject" && !note) {
        toast(host, "Tulis catatan untuk penulis sebelum meminta revisi.");
        host.querySelector<HTMLTextAreaElement>('[data-cnt="note"]')?.focus();
        return;
      }
      if (action === "delete") {
        if (!armed(act)) return;
        busy = true;
        const d = await call<unknown>("DELETE", `articles/${act.dataset.id}`);
        busy = false;
        if (!d.ok) {
          toast(host, problemText(d.problem));
          return;
        }
        toast(host, "Artikel dihapus.", "ok");
        const u = new URL(location.href);
        u.searchParams.delete("id");
        router.replace(u.pathname + u.search);
        router.refresh();
        return;
      }
      busy = true;
      act.setAttribute("aria-busy", "true");
      const r = await call<{ status: string }>("POST", `articles/${act.dataset.id}/status`, { action, note: action === "reject" ? note : "" });
      busy = false;
      act.removeAttribute("aria-busy");
      if (!r.ok) {
        toast(host, problemText(r.problem));
        return;
      }
      const msg: Record<string, string> = {
        publish: "Artikel terbit di website & aplikasi.",
        reject: "Dikembalikan ke penulis dengan catatan.",
        unpublish: "Artikel ditarik ke draf.",
        archive: "Artikel diarsipkan.",
      };
      toast(host, msg[action] ?? "Tersimpan.", "ok");
      const next = action === "publish" ? "published" : action === "reject" ? "revision" : action === "archive" ? "archived" : "draft";
      router.push(`/admin/konten?status=${next}&id=${act.dataset.id}`);
      return;
    }
    // Klik baris (selain tautan/kontrol) → pilih artikel.
    const row = t.closest<HTMLElement>("[data-row]");
    if (row && !t.closest("a,button,input,textarea")) {
      const btn = row.querySelector<HTMLElement>("[data-select]");
      if (btn) router.push(btn.dataset.select!);
    }
  };
  host.addEventListener("click", onClick, true);
  host.querySelectorAll<HTMLElement>("[data-row]").forEach((r) => (r.style.cursor = "pointer"));
  // Di HP panel detail ada di bawah tabel: setelah memilih artikel, gulir ke sana.
  if (new URLSearchParams(location.search).has("id") && window.matchMedia("(max-width: 1023px)").matches) {
    host.querySelector<HTMLElement>("[data-cnt-panel]")?.scrollIntoView({ block: "start" });
  }
  return () => host.removeEventListener("click", onClick, true);
}

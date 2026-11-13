"use client";

import { useRef, useState } from "react";
import { adminCall, btn, field, label, Notice, problemText, Shell, SymbolPicker } from "../ui";

interface Props {
  categories: { slug: string; name: string }[];
  instruments: { symbol: string; name: string }[];
  canRelease: boolean;
  canBreaking: boolean;
}

/** Perkecil foto di peramban (maks. 1600 px, JPEG) agar di bawah batas unggah 4 MB. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
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
    return file;
  }
}

/**
 * Tulis berita dari aplikasi (penulis/editor), tanpa membuka panel CMS:
 * Gambar · Judul · Deskripsi · Market terkait (opsional) · Opsi lainnya.
 */
export default function ArticleForm({ categories, instruments, canRelease, canBreaking }: Props) {
  const [cover, setCover] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [excerpt, setExcerpt] = useState("");
  const [premium, setPremium] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [done, setDone] = useState<{ slug: string; status: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ t: "Pilih berkas foto.", ok: false });
    setUploading(true);
    setMsg(null);
    const blob = await shrink(file);
    if (blob.size > 4 * 1024 * 1024) {
      setUploading(false);
      return setMsg({ t: "Ukuran foto maksimal 4 MB.", ok: false });
    }
    const fd = new FormData();
    fd.append("file", blob, blob === file ? file.name : "foto.jpg");
    const r = await adminCall<{ url: string }>("POST", "media", fd);
    setUploading(false);
    if (r.ok) setCover(r.data.url);
    else setMsg({ t: problemText(r.problem), ok: false });
  };

  const save = async (action: "draft" | "review" | "publish") => {
    if (busy) return;
    setBusy(action);
    setMsg(null);
    const body = desc.trim();
    const dek = excerpt.trim() || body.split(/\n+/)[0]!.slice(0, 280);
    const at = when ? new Date(`${when}:00+07:00`) : null;
    const r = await adminCall<{ id: string; slug: string; status: string; published_at: string | null }>("POST", "articles", {
      title,
      excerpt: dek,
      body,
      category,
      cover_url: cover,
      is_premium: premium,
      is_breaking: breaking,
      symbols,
      action,
      publish_at: action === "publish" && at && at.getTime() > Date.now() + 60_000 ? at.toISOString() : undefined,
    });
    setBusy("");
    if (!r.ok) {
      if (r.status === 401) location.assign(`/masuk?next=${encodeURIComponent("/tulis/artikel")}`);
      return setMsg({ t: problemText(r.problem), ok: false });
    }
    setDone({ slug: r.data.slug, status: r.data.status });
    setMsg({ t: action === "draft" ? "Draf tersimpan." : action === "review" ? "Terkirim ke editor untuk direview." : r.data.published_at && new Date(r.data.published_at).getTime() > Date.now() ? "Berita dijadwalkan terbit." : "Berita terbit di website & aplikasi.", ok: true });
  };

  if (done) {
    return (
      <Shell title="Tulis berita">
        <Notice msg={msg} />
        <div style={{ display: "flex", gap: 10 }}>
          {done.status === "published" ? (
            <a href={`/berita/${done.slug}`} style={{ ...btn("#2F74EB"), display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              Lihat berita
            </a>
          ) : null}
          <button type="button" onClick={() => location.reload()} style={btn("#FFFFFF", "#0B0B0F", "#E3EAF4")}>
            Tulis lagi
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Tulis berita">
      <Notice msg={msg} />
      <section style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, borderRadius: 20, background: "#FFFFFF", border: "1px solid #E3EAF4" }}>
        <div style={label}>
          Gambar Berita
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 16, border: cover ? 0 : "1px dashed #B9C4D4", background: cover ? `#0B0B0F center / cover no-repeat url("${cover}")` : "#F6F8FC", color: "#5F6B7D", fontSize: 14, cursor: "pointer", fontFamily: "inherit", overflow: "hidden" }}
          >
            {uploading ? "Mengunggah…" : cover ? <span style={{ position: "absolute", right: 10, bottom: 10, padding: "6px 12px", borderRadius: 999, background: "rgba(11,11,15,.7)", color: "#FFFFFF", fontSize: 12 }}>Ganti foto</span> : "+ Pilih foto (JPG, PNG, WebP · maks. 4 MB)"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.currentTarget.files?.[0])} />
        </div>
        <label style={label}>
          Judul Berita
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Judul singkat dan jelas (8–200 karakter)" style={field} />
          <span style={{ fontSize: 12, fontWeight: 400, color: [...title].length > 90 ? "#B3261E" : "#8A94A6" }}>{[...title].length}/90 karakter ideal</span>
        </label>
        <label style={label}>
          Deskripsi Berita
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={8} placeholder="Tulis isi berita. Pisahkan paragraf dengan baris kosong." style={{ ...field, minHeight: 180, resize: "vertical", lineHeight: 1.55 }} />
        </label>
        <div style={label}>
          <span>
            Market Terkait <span style={{ fontWeight: 400, color: "#8A94A6" }}>(opsional)</span>
          </span>
          <SymbolPicker instruments={instruments} value={symbols} onChange={setSymbols} max={10} />
          <span style={{ fontSize: 12, fontWeight: 400, color: "#8A94A6" }}>Tag tampil di berita; ketuk tag untuk membuka halaman market-nya.</span>
        </div>
        <details style={{ borderTop: "1px solid #E3EAF4", paddingTop: 12 }}>
          <summary style={{ fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#2F74EB" }}>Opsi Lainnya</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <label style={label}>
              Kategori
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Ringkasan (dek)
              <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={400} placeholder="Kosongkan untuk memakai paragraf pertama" style={{ ...field, resize: "vertical" }} />
            </label>
            <label style={{ ...label, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} /> Khusus pelanggan Plus
            </label>
            {canBreaking ? (
              <label style={{ ...label, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={breaking} onChange={(e) => setBreaking(e.target.checked)} /> Tandai BREAKING
              </label>
            ) : null}
            {canRelease ? (
              <label style={label}>
                Jadwal terbit (WIB, opsional)
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={field} />
              </label>
            ) : null}
          </div>
        </details>
      </section>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" disabled={!!busy || uploading} onClick={() => void save("draft")} style={btn("#FFFFFF", "#0B0B0F", "#E3EAF4")}>
          {busy === "draft" ? "Menyimpan…" : "Simpan draf"}
        </button>
        {canRelease ? (
          <button type="button" disabled={!!busy || uploading} onClick={() => void save("publish")} style={btn("#2F74EB")}>
            {busy === "publish" ? "Menerbitkan…" : when ? "Jadwalkan" : "Terbitkan"}
          </button>
        ) : (
          <button type="button" disabled={!!busy || uploading} onClick={() => void save("review")} style={btn("#2F74EB")}>
            {busy === "review" ? "Mengirim…" : "Kirim review"}
          </button>
        )}
      </div>
    </Shell>
  );
}

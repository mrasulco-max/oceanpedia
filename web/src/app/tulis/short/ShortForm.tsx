"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { adminCall, btn, field, label, Notice, problemText, Shell } from "../ui";

interface Props {
  categories: { slug: string; name: string }[];
  instruments: { symbol: string; name: string }[];
  canRelease: boolean;
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|ogg|3gp|3g2|mkv|avi|mpe?g)$/i;

/** Gambar satu bingkai video menjadi JPEG (sampul Short). */
async function frameAt(video: HTMLVideoElement): Promise<Blob | null> {
  const c = document.createElement("canvas");
  const k = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
  c.width = Math.round(video.videoWidth * k);
  c.height = Math.round(video.videoHeight * k);
  if (!c.width || !c.height) return null;
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return await new Promise<Blob | null>((ok) => c.toBlob((b) => ok(b), "image/jpeg", 0.85));
}

/**
 * Unggah Ocean Short dari aplikasi ala TikTok: pratinjau vertikal layar penuh, sampul dari bingkai video,
 * judul, keterangan, market terkait, dan kategori. Video langsung ke Vercel Blob; sampul ke media API.
 */
export default function ShortForm({ categories, instruments, canRelease }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [coverAt, setCoverAt] = useState(0);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [symbol, setSymbol] = useState("");
  const [category, setCategory] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !VIDEO_EXT.test(f.name)) return setMsg({ t: "Pilih berkas video.", ok: false });
    if (f.size > 500 * 1024 * 1024) return setMsg({ t: "Ukuran video maksimal 500 MB.", ok: false });
    setMsg(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCoverAt(0);
  };

  const seekCover = (t: number) => {
    setCoverAt(t);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = t;
    }
  };

  const submit = async (status: "published" | "draft") => {
    if (busy || !file) return;
    if ([...title.trim()].length < 4) return setMsg({ t: "Judul minimal 4 karakter.", ok: false });
    if (symbol.trim() && !instruments.some((i) => i.symbol === symbol.trim().toUpperCase())) return setMsg({ t: `Ticker ${symbol.trim().toUpperCase()} tidak dikenal.`, ok: false });
    setBusy(true);
    setMsg(null);
    try {
      // Sampul dari bingkai terpilih.
      let coverUrl: string | null = null;
      if (videoRef.current) {
        const jpg = await frameAt(videoRef.current);
        if (jpg) {
          const fd = new FormData();
          fd.append("file", jpg, "sampul.jpg");
          const r = await adminCall<{ url: string }>("POST", "media", fd);
          if (r.ok) coverUrl = r.data.url;
        }
      }
      const { upload } = await import("@vercel/blob/client");
      const safeName = file.name.toLowerCase().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "video.mp4";
      setProgress(0);
      const blob = await upload(`shorts/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/shorts/upload",
        contentType: file.type || "video/mp4",
        multipart: file.size > 50 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      const r = await adminCall<{ id: string; status: string }>("POST", "shorts", {
        title: title.trim(),
        caption: caption.trim(),
        video_url: blob.url,
        cover_url: coverUrl,
        symbol: symbol.trim().toUpperCase() || null,
        category: category || null,
        duration_s: Math.round(duration),
        status,
      });
      if (!r.ok) return setMsg({ t: problemText(r.problem), ok: false });
      setDone(r.data.status);
    } catch (e) {
      setMsg({ t: e instanceof Error ? e.message : "Unggah gagal. Coba lagi.", ok: false });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (done) {
    return (
      <Shell title="Ocean Short" dark>
        <Notice msg={{ t: done === "published" ? "Short ditayangkan." : "Short disimpan sebagai draf dan menunggu editor.", ok: true }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/short" style={{ ...btn("#2F74EB"), display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            Buka Ocean Short
          </Link>
          <button type="button" onClick={() => location.reload()} style={btn("#1A1D24", "#FFFFFF", "#2C303A")}>
            Unggah lagi
          </button>
        </div>
      </Shell>
    );
  }

  const dark = { ...field, background: "#16181F", border: "1px solid #2C303A", color: "#FFFFFF" };
  const darkLabel = { ...label, color: "#C9D1DC" };
  return (
    <Shell title="Unggah Ocean Short" dark>
      <Notice msg={msg} />
      {!preview ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{ width: "100%", maxWidth: 360, alignSelf: "center", aspectRatio: "9 / 16", borderRadius: 24, border: "1px dashed #3A3F4B", background: "#16181F", color: "#C9D1DC", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          <span style={{ width: 64, height: 64, borderRadius: 20, background: "#FE2C55", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>+</span>
          <strong style={{ fontSize: 16 }}>Pilih video</strong>
          <span style={{ fontSize: 13, color: "#8A94A6" }}>Vertikal 9:16 · maks. 500 MB</span>
        </button>
      ) : (
        <div style={{ position: "relative", width: "100%", maxWidth: 360, alignSelf: "center", aspectRatio: "9 / 16", borderRadius: 24, overflow: "hidden", background: "#000000" }}>
          <video ref={videoRef} src={preview} playsInline muted loop autoPlay onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "48px 14px 14px", background: "linear-gradient(transparent, rgba(0,0,0,.75))", display: "flex", flexDirection: "column", gap: 4 }}>
            <strong style={{ fontSize: 15 }}>{title || "Judul short"}</strong>
            {caption ? <span style={{ fontSize: 13, opacity: 0.9 }}>{caption}</span> : null}
            {symbol ? <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,.2)", fontSize: 12 }}>#{symbol.toUpperCase()}</span> : null}
          </div>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ position: "absolute", top: 12, right: 12, border: 0, borderRadius: 999, padding: "6px 12px", background: "rgba(0,0,0,.55)", color: "#FFFFFF", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Ganti video
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => choose(e.currentTarget.files?.[0])} />
      {preview && duration > 0 ? (
        <label style={darkLabel}>
          Sampul (geser untuk memilih bingkai)
          <input type="range" min={0} max={duration} step={0.1} value={coverAt} onChange={(e) => seekCover(Number(e.target.value))} />
        </label>
      ) : null}
      <label style={darkLabel}>
        Judul
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Judul singkat (4–140 karakter)" style={dark} />
      </label>
      <label style={darkLabel}>
        Keterangan
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={500} placeholder="Ceritakan isi video…" style={{ ...dark, resize: "vertical" }} />
      </label>
      <label style={darkLabel}>
        <span>
          Market Terkait <span style={{ fontWeight: 400, color: "#8A94A6" }}>(opsional)</span>
        </span>
        <input list="ob-short-symbols" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="mis. BTCUSD" autoCapitalize="characters" style={dark} />
        <datalist id="ob-short-symbols">
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.name}
            </option>
          ))}
        </datalist>
      </label>
      <label style={darkLabel}>
        Kategori
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={dark}>
          <option value="">Tanpa kategori</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {progress !== null ? (
        <div aria-label="Progres unggah" style={{ height: 6, borderRadius: 999, background: "#22252E", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "#FE2C55", transition: "width .2s" }} />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={busy || !file} onClick={() => void submit("draft")} style={{ ...btn("#1A1D24", "#FFFFFF", "#2C303A"), opacity: file ? 1 : 0.5 }}>
          Simpan draf
        </button>
        <button type="button" disabled={busy || !file} onClick={() => void submit(canRelease ? "published" : "draft")} style={{ ...btn("#FE2C55"), opacity: file ? 1 : 0.5 }}>
          {busy ? (progress !== null ? `Mengunggah ${Math.round(progress)}%` : "Menyiapkan…") : canRelease ? "Posting" : "Kirim ke editor"}
        </button>
      </div>
    </Shell>
  );
}

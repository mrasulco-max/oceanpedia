"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Asisten AI Ocean Pedia (khusus Plus): percakapan bebas tentang semua berita & pergerakan pasar,
 * plus analisis gambar chart (support, resistance, pola, skenario). Semua lewat BFF /api/ai/*.
 */

type Level = { harga: string; kekuatan: string; catatan: string };
type Chart = {
  valid: boolean;
  instrumen?: string;
  timeframe?: string;
  harga_terakhir?: string;
  tren: string;
  ringkasan: string;
  support: Level[];
  resistance: Level[];
  pola: string[];
  indikator: string[];
  skenario_bullish: string;
  skenario_bearish: string;
  invalidasi: string;
  risiko: string;
  keyakinan: string;
};
type Msg = { role: "user" | "assistant"; content: string; image?: string; chart?: Chart; error?: boolean };

const SUGGEST = [
  "Bagaimana kondisi pasar hari ini?",
  "Berita apa yang paling menggerakkan IHSG?",
  "Analisis pergerakan Bitcoin minggu ini",
  "Apa dampak kebijakan The Fed ke rupiah dan saham bank?",
  "Aset mana yang paling naik dan turun hari ini?",
];
const BLUE = "linear-gradient(110deg,#2563EB 0%,#4285F4 35%,#63A4FA 55%,#4285F4 75%,#2563EB 100%)";

/** Teks AI → paragraf & daftar (tanpa HTML mentah). */
function Rich({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : <span key={`${k}-${i}`}>{p}</span>));
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={bi} style={{ margin: "6px 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
            {inline(b.replace(/^#+\s*/gm, ""), String(bi))}
          </p>
        );
      })}
    </>
  );
}

const TONE: Record<string, [string, string]> = { kuat: ["#166534", "#DCF5E4"], sedang: ["#854D0E", "#FEF3C7"], lemah: ["#374151", "#EFF0F2"] };

function ChartCard({ c }: { c: Chart }) {
  if (!c.valid) return <p style={{ margin: 0 }}>{c.ringkasan || "Gambar ini tidak terbaca sebagai chart harga. Coba unggah tangkapan layar chart yang lebih jelas."}</p>;
  const trend = c.tren === "naik" ? ["▲ Tren naik", "#166534", "#DCF5E4"] : c.tren === "turun" ? ["▼ Tren turun", "#991B1B", "#FDE2E2"] : ["◆ Sideways", "#374151", "#EFF0F2"];
  const table = (title: string, rows: Level[], color: string) => (
    <div style={{ flex: "1 1 220px", border: "1px solid #E3EAF4", borderRadius: 16, padding: 12, background: "#fff" }}>
      <strong style={{ fontSize: 13, color }}>{title}</strong>
      {rows.length ? (
        rows.map((l, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderTop: i ? "1px solid #EEF2F7" : 0 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 500, fontSize: 15 }}>{l.harga}</span>
              <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 999, color: (TONE[l.kekuatan] ?? TONE.lemah)![0], background: (TONE[l.kekuatan] ?? TONE.lemah)![1] }}>{l.kekuatan}</span>
            </span>
            <span style={{ fontSize: 12, color: "#5F6B7D" }}>{l.catatan}</span>
          </div>
        ))
      ) : (
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#5F6B7D" }}>Tidak terbaca jelas.</p>
      )}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 999, color: trend[1], background: trend[2] }}>{trend[0]}</span>
        {c.instrumen ? <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#EEF5FF", color: "#1E40AF" }}>{c.instrumen}</span> : null}
        {c.timeframe ? <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#EEF5FF", color: "#1E40AF" }}>{c.timeframe}</span> : null}
        {c.harga_terakhir ? <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#F6F8FC" }}>Harga {c.harga_terakhir}</span> : null}
        <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#F6F8FC", color: "#5F6B7D" }}>Keyakinan {c.keyakinan}</span>
      </div>
      <p style={{ margin: 0 }}>{c.ringkasan}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {table("Resistance", c.resistance, "#B42318")}
        {table("Support", c.support, "#15803D")}
      </div>
      {c.pola.length ? <p style={{ margin: 0 }}><strong>Pola:</strong> {c.pola.join(" · ")}</p> : null}
      {c.indikator.length ? <p style={{ margin: 0 }}><strong>Indikator:</strong> {c.indikator.join(" · ")}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "1 1 220px", borderRadius: 14, padding: 12, background: "#F0FBF4" }}><strong style={{ color: "#166534" }}>Skenario bullish</strong><p style={{ margin: "4px 0 0" }}>{c.skenario_bullish}</p></div>
        <div style={{ flex: "1 1 220px", borderRadius: 14, padding: 12, background: "#FEF4F4" }}><strong style={{ color: "#991B1B" }}>Skenario bearish</strong><p style={{ margin: "4px 0 0" }}>{c.skenario_bearish}</p></div>
      </div>
      <p style={{ margin: 0 }}><strong>Invalidasi:</strong> {c.invalidasi}</p>
      <p style={{ margin: 0, fontSize: 13, color: "#5F6B7D" }}><strong>Risiko:</strong> {c.risiko}</p>
    </div>
  );
}

/** Ringkasan teks hasil chart → dipakai sebagai riwayat agar bisa ditanya lanjut. */
function chartText(c: Chart): string {
  if (!c.valid) return c.ringkasan;
  const lv = (l: Level[]) => l.map((x) => `${x.harga} (${x.kekuatan})`).join(", ") || "-";
  return `[Analisis chart${c.instrumen ? ` ${c.instrumen}` : ""}${c.timeframe ? ` ${c.timeframe}` : ""}] Tren ${c.tren}. ${c.ringkasan} Resistance: ${lv(c.resistance)}. Support: ${lv(c.support)}. Pola: ${c.pola.join(", ") || "-"}. Bullish: ${c.skenario_bullish} Bearish: ${c.skenario_bearish} Invalidasi: ${c.invalidasi}`;
}

async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  if (file.size < 2.5 * 1024 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/jpeg", 0.88));
}

export default function AIChat({ firstName, userId, initialQuestion }: { firstName: string; userId: string; initialQuestion: string }) {
  const KEY = `ob_ai_chat_${userId}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Msg[];
      if (Array.isArray(saved)) setMsgs(saved.slice(-40));
    } catch {
      /* penyimpanan tidak tersedia */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content, chart: m.chart })).slice(-40)));
    } catch {
      /* abaikan */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, KEY]);
  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const fail = async (r: Response) => {
    const d = (await r.json().catch(() => ({}))) as { detail?: string; title?: string };
    if (r.status === 401) return "Sesi berakhir. Silakan masuk lagi.";
    return d.detail || d.title || "AI sedang sibuk. Coba lagi sebentar lagi.";
  };

  async function send(q?: string) {
    const content = (q ?? text).trim();
    if (busy || (!content && !file)) return;
    setBusy(true);
    setText("");
    if (file) {
      const img = preview ?? undefined;
      const f = file;
      setFile(null);
      setPreview(null);
      const userMsg: Msg = { role: "user", content: content || "Analisis chart ini", image: img };
      setMsgs((m) => [...m, userMsg]);
      try {
        const fd = new FormData();
        fd.append("file", await shrinkImage(f), "chart.jpg");
        fd.append("note", content);
        const r = await fetch("/api/ai/chart", { method: "POST", body: fd });
        if (!r.ok) {
          const e = await fail(r);
          setMsgs((m) => [...m, { role: "assistant", content: e, error: true }]);
        } else {
          const c = (await r.json()) as Chart;
          setMsgs((m) => [...m, { role: "assistant", content: chartText(c), chart: c }]);
        }
      } catch {
        setMsgs((m) => [...m, { role: "assistant", content: "Koneksi bermasalah. Coba lagi.", error: true }]);
      } finally {
        setBusy(false);
      }
      return;
    }
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    try {
      const history = next.filter((m) => !m.error).slice(-16).map((m) => ({ role: m.role, content: m.content }));
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
      if (!r.ok) {
        const e = await fail(r);
        setMsgs((m) => [...m, { role: "assistant", content: e, error: true }]);
      } else {
        const d = (await r.json()) as { answer: string };
        setMsgs((m) => [...m, { role: "assistant", content: d.answer }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Koneksi bermasalah. Coba lagi.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setMsgs((m) => [...m, { role: "assistant", content: "Format gambar harus PNG, JPG, atau WebP.", error: true }]);
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setMsgs((m) => [...m, { role: "assistant", content: "Ukuran gambar maksimal 15 MB.", error: true }]);
      return;
    }
    setFile(f);
    const rd = new FileReader();
    rd.onload = () => setPreview(String(rd.result));
    rd.readAsDataURL(f);
  };

  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#F6F8FC", fontFamily: "Roboto, Arial, sans-serif", color: "#0B0B0F" }}>
      <header style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "max(10px, env(safe-area-inset-top)) 16px 10px", background: "#FFFFFF", borderBottom: "1px solid #E3EAF4" }}>
        <a href="/" aria-label="Kembali" style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid #E3EAF4", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B0B0F", textDecoration: "none", fontSize: 18 }}>‹</a>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 18 }}>Asisten AI</strong>
          <span style={{ fontSize: 12, color: "#5F6B7D" }}>Berita, pasar & analisis chart · Ocean Pedia Plus</span>
        </span>
        {msgs.length ? (
          <button type="button" onClick={() => setMsgs([])} style={{ border: "1px solid #E3EAF4", background: "#fff", borderRadius: 999, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>
            Percakapan baru
          </button>
        ) : null}
      </header>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!msgs.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "12px 0" }}>
              <span style={{ width: 52, height: 52, borderRadius: 18, background: BLUE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✦</span>
              <h1 style={{ margin: 0, fontSize: 26 }}>Halo, {firstName}. Mau bahas apa hari ini?</h1>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#5F6B7D" }}>
                Tanyakan apa saja tentang berita dan pergerakan saham, crypto, forex, atau komoditas. Unggah gambar chart dari perangkatmu untuk dianalisis support, resistance, pola, dan skenarionya.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUGGEST.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} style={{ border: "1px solid #E3EAF4", background: "#fff", borderRadius: 999, padding: "10px 14px", fontSize: 14, textAlign: "left", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} style={{ border: "1px solid #BFD6FB", background: "#EEF5FF", color: "#2F74EB", borderRadius: 999, padding: "10px 14px", fontSize: 14, cursor: "pointer" }}>
                  📈 Analisis gambar chart
                </button>
              </div>
            </div>
          ) : null}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                {m.image ? <img src={m.image} alt="Chart yang diunggah" style={{ maxWidth: 260, maxHeight: 220, borderRadius: 14, border: "1px solid #E3EAF4", objectFit: "contain", background: "#fff" }} /> : null}
                <div style={{ background: "#2F74EB", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ) : (
              <div key={i} style={{ alignSelf: "flex-start", maxWidth: "100%", width: m.chart ? "100%" : undefined, background: m.error ? "#FEF4F4" : "#FFFFFF", border: `1px solid ${m.error ? "#F5C2C2" : "#E3EAF4"}`, borderRadius: "18px 18px 18px 4px", padding: "12px 14px", fontSize: 15, lineHeight: 1.6 }}>
                {m.chart ? <ChartCard c={m.chart} /> : <Rich text={m.content} />}
              </div>
            ),
          )}
          {busy ? <div style={{ alignSelf: "flex-start", background: "#fff", border: "1px solid #E3EAF4", borderRadius: 18, padding: "10px 14px", fontSize: 14, color: "#5F6B7D" }}>{file === null && preview === null ? "AI sedang menganalisis…" : "Mengunggah…"}</div> : null}
          <div ref={endRef} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9AA6B8", textAlign: "center" }}>
            Dihasilkan AI dari berita OceanBird & data pasar (dapat tertunda). Bukan saran investasi.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{ flex: "none", background: "#FFFFFF", borderTop: "1px solid #E3EAF4", padding: "10px 12px max(10px, env(safe-area-inset-bottom))" }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {preview ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={preview} alt="Pratinjau chart" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid #E3EAF4" }} />
              <span style={{ flex: 1, fontSize: 13, color: "#5F6B7D" }}>Chart siap dianalisis. Tambahkan catatan (mis. &quot;BBCA 1H&quot;) bila perlu.</span>
              <button type="button" onClick={() => { setFile(null); setPreview(null); }} aria-label="Batalkan gambar" style={{ border: 0, background: "#F6F8FC", width: 32, height: 32, borderRadius: 999, cursor: "pointer" }}>×</button>
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Unggah gambar chart" title="Unggah gambar chart" style={{ flex: "none", width: 44, height: 44, borderRadius: 999, border: "1px solid #E3EAF4", background: "#fff", fontSize: 18, cursor: "pointer" }}>
              📎
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={file ? "Catatan untuk chart (opsional)…" : "Tanya tentang berita atau pasar…"}
              style={{ flex: 1, minHeight: 44, maxHeight: 140, resize: "none", borderRadius: 22, border: "1px solid #E3EAF4", padding: "11px 16px", fontSize: 15, fontFamily: "inherit", outline: "none" }}
            />
            <button type="submit" disabled={busy || (!text.trim() && !file)} aria-label="Kirim" style={{ flex: "none", width: 44, height: 44, borderRadius: 999, border: 0, background: busy || (!text.trim() && !file) ? "#C9D3E1" : BLUE, color: "#fff", fontSize: 18, cursor: "pointer" }}>
              ➤
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

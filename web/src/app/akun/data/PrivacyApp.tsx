"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

const card: CSSProperties = { background: "#FFFFFF", border: "1px solid #E3EAF4", borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const input: CSSProperties = { minHeight: 48, borderRadius: 14, border: "1px solid #E3EAF4", background: "#F6F8FC", padding: "0 14px", fontSize: 15, fontFamily: "inherit", color: "#0B0B0F" };
const btn = (bg: string, fg = "#FFFFFF"): CSSProperties => ({ minHeight: 50, border: 0, borderRadius: 14, background: bg, color: fg, fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" });

export default function PrivacyApp({ email, staff }: { email: string; staff: boolean }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");

  const download = async () => {
    setBusy("export");
    setMsg(null);
    try {
      const r = await fetch("/api/me/export", { cache: "no-store" });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { detail?: string };
        return setMsg({ t: d.detail ?? "Data belum bisa diunduh. Coba lagi.", ok: false });
      }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "data-oceanbird.json";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ t: "Data kamu sudah diunduh (format JSON).", ok: true });
    } catch {
      setMsg({ t: "Koneksi bermasalah. Coba lagi.", ok: false });
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (confirm.trim().toUpperCase() !== "HAPUS") return setMsg({ t: "Ketik HAPUS untuk mengonfirmasi.", ok: false });
    setBusy("delete");
    setMsg(null);
    try {
      const r = await fetch("/api/me/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm, password }) });
      const d = (await r.json().catch(() => ({}))) as { detail?: string; errors?: Record<string, string> };
      if (!r.ok) return setMsg({ t: (d.errors && Object.values(d.errors)[0]) || d.detail || "Akun belum bisa dihapus.", ok: false });
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      try {
        localStorage.clear();
      } catch {
        /* abaikan */
      }
      location.assign("/?akun=dihapus");
    } finally {
      setBusy("");
    }
  };

  return (
    <main style={{ minHeight: "100dvh", background: "#F6F8FC", fontFamily: "Roboto, Arial, sans-serif", color: "#0B0B0F" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 12, padding: "max(10px, env(safe-area-inset-top)) 16px 10px", background: "#FFFFFF", borderBottom: "1px solid #E3EAF4" }}>
        <Link href="/pengaturan" aria-label="Kembali ke pengaturan" style={{ width: 40, height: 40, flex: "none", borderRadius: 999, border: "1px solid #E3EAF4", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B0B0F", textDecoration: "none", fontSize: 18 }}>
          ‹
        </Link>
        <span style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ fontSize: 18 }}>Privasi &amp; data</strong>
          <span style={{ fontSize: 12, color: "#5F6B7D" }}>{email}</span>
        </span>
      </header>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 80px", display: "flex", flexDirection: "column", gap: 16 }}>
        {msg ? (
          <div role="status" style={{ padding: "12px 14px", borderRadius: 14, background: msg.ok ? "#E7F6EC" : "#FEF4F4", color: msg.ok ? "#166534" : "#991B1B", fontSize: 14 }}>
            {msg.t}
          </div>
        ) : null}
        <section style={card}>
          <strong style={{ fontSize: 17 }}>Unduh data saya</strong>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#5F6B7D" }}>
            Salinan lengkap data akunmu: profil &amp; preferensi, watchlist, price alert, artikel tersimpan, topik yang diikuti, komentar, jurnal trading, langganan &amp; tagihan, notifikasi, dan riwayat masuk. Langsung diunduh sebagai berkas JSON.
          </p>
          <button type="button" onClick={() => void download()} disabled={!!busy} style={btn("#2F74EB")}>
            {busy === "export" ? "Menyiapkan…" : "Unduh data (JSON)"}
          </button>
        </section>
        <section style={{ ...card, borderColor: "#F5C2C2" }}>
          <strong style={{ fontSize: 17, color: "#991B1B" }}>Hapus akun</strong>
          {staff ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#5F6B7D" }}>Akun staf redaksi dihapus oleh admin agar artikel dan jejak redaksi tetap terjaga. Hubungi admin OceanBird.</p>
          ) : (
            <>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6, color: "#374151" }}>
                <li>Profil, foto, watchlist, price alert, tersimpan, jurnal trading, notifikasi, dan langganan newsletter dihapus permanen.</li>
                <li>Langganan Plus dihentikan dan kamu keluar dari semua perangkat.</li>
                <li>Komentarmu tetap tampil sebagai &quot;Pengguna terhapus&quot;; tagihan disimpan sesuai kewajiban pajak.</li>
                <li>Tindakan ini tidak bisa dibatalkan. Unduh datamu dulu bila perlu.</li>
              </ul>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                Ketik HAPUS untuk mengonfirmasi
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" style={input} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 500 }}>
                Kata sandi (bila akunmu memakai kata sandi)
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={input} />
              </label>
              <button type="button" onClick={() => void remove()} disabled={!!busy || confirm.trim().toUpperCase() !== "HAPUS"} style={{ ...btn("#DC2626"), opacity: confirm.trim().toUpperCase() === "HAPUS" ? 1 : 0.5 }}>
                {busy === "delete" ? "Menghapus…" : "Hapus akun permanen"}
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

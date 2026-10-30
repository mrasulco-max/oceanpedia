import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
      <span className="mono" style={{ fontSize: 64, color: "var(--sky)" }}>404</span>
      <h1 style={{ fontSize: 24 }}>Halaman tidak ditemukan</h1>
      <p style={{ color: "var(--sub)" }}>Tautan mungkin salah atau berita sudah dipindahkan.</p>
      <Link href="/" className="btn grad">Ke beranda</Link>
    </main>
  );
}

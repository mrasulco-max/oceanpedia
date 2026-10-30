"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 24 }}>Terjadi gangguan</h1>
      <p style={{ color: "var(--sub)" }}>Kami tidak bisa memuat halaman ini. Coba lagi sebentar lagi.</p>
      <button className="btn grad" onClick={() => reset()}>Coba lagi</button>
    </main>
  );
}

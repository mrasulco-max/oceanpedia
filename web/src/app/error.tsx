"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="dc-fallback">
      <img src="/logo.png" alt="OceanBird" height={24} />
      <h1>Terjadi gangguan</h1>
      <p>Kami tidak bisa memuat halaman ini. Coba lagi sebentar lagi.</p>
      <button onClick={() => reset()}>Coba lagi</button>
    </main>
  );
}

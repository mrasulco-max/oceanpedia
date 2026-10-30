import Link from "next/link";
import { notFound } from "next/navigation";
import { getLayout } from "@/lib/layout";
import { WebShell } from "@/components/web/WebShell";
import { AppShell } from "@/components/app/AppShell";

// Halaman yang sudah ada di desain namun belum diimplementasi pada tahap ini.
const PLANNED: Record<string, { title: string; nav?: string }> = {
  short: { title: "Ocean Short", nav: "short" },
  cari: { title: "Cari", nav: "cari" },
  watchlist: { title: "Watchlist", nav: "watchlist" },
  akun: { title: "Akun", nav: "akun" },
  notifikasi: { title: "Notifikasi" },
  daftar: { title: "Daftar" },
  tentang: { title: "Tentang Kami" },
  "pasang-iklan": { title: "Pasang Iklan" },
};

export default async function Planned({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const p = PLANNED[section];
  if (!p) notFound();
  const layout = await getLayout();
  const body = (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "64px 20px", textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <h1 style={{ fontSize: 28 }}>{p.title}</h1>
      <p style={{ color: "var(--sub)" }}>Halaman ini sedang dibangun pada tahap berikutnya.</p>
      <Link href="/" className="btn grad">Kembali ke beranda</Link>
    </div>
  );
  return layout === "app" ? <AppShell active={p.nav} title={p.title}>{body}</AppShell> : <WebShell active={p.nav}>{body}</WebShell>;
}

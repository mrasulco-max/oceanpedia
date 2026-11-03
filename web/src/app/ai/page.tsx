import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser, hasPlus } from "@/lib/session";
import AIChat from "./AIChat";

export const metadata: Metadata = { title: "Asisten AI", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 300) : "";
  const user = await currentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent(`/ai${q ? `?q=${encodeURIComponent(q)}` : ""}`)}`);
  const first = (user.full_name || "").split(/\s+/)[0] || "kamu";
  if (!hasPlus(user)) {
    return (
      <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#F6F8FC", fontFamily: "Roboto, Arial, sans-serif", color: "#0B0B0F" }}>
        <div style={{ maxWidth: 440, width: "100%", background: "#FFFFFF", border: "1px solid #E3EAF4", borderRadius: 28, padding: 28, display: "flex", flexDirection: "column", gap: 14, textAlign: "center" }}>
          <span style={{ alignSelf: "center", width: 56, height: 56, borderRadius: 18, background: "linear-gradient(110deg,#2563EB,#4285F4,#63A4FA)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>✦</span>
          <h1 style={{ margin: 0, fontSize: 24 }}>Asisten AI khusus Plus</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#5F6B7D" }}>
            Ngobrol tentang semua berita & pergerakan pasar, dan unggah gambar chart untuk dianalisis support, resistance, pola, serta skenarionya.
          </p>
          <a href="/plus" style={{ minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: "linear-gradient(110deg,#2563EB 0%,#4285F4 35%,#63A4FA 55%,#4285F4 75%,#2563EB 100%)", color: "#fff", fontWeight: 500, textDecoration: "none" }}>
            Lihat paket Ocean Pedia Plus
          </a>
          <a href="/" style={{ fontSize: 14, color: "#2F74EB", textDecoration: "none" }}>Kembali ke beranda</a>
        </div>
      </main>
    );
  }
  return <AIChat firstName={first} userId={user.id} initialQuestion={q} />;
}

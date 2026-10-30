import type { Metadata } from "next";
import Link from "next/link";
import { getLayout } from "@/lib/layout";
import { WebShell } from "@/components/web/WebShell";
import { AppShell } from "@/components/app/AppShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Masuk", robots: { index: false } };

export default async function LoginPage() {
  const layout = await getLayout();
  const content = (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div><h1 style={{ fontSize: 28 }}>Masuk</h1><p style={{ color: "var(--sub)", marginTop: 6 }}>Pantau berita dan harga pasar dengan akun OceanBird kamu.</p></div>
      <LoginForm />
      <p style={{ fontSize: 14, color: "var(--sub)", textAlign: "center" }}>Belum punya akun? <Link href="/daftar" style={{ color: "var(--sky)", fontWeight: 500 }}>Daftar</Link></p>
    </div>
  );
  return layout === "app" ? <AppShell back="/" hideNav>{content}</AppShell> : <WebShell>{content}</WebShell>;
}

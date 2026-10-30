import type { Metadata, Viewport } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";

const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto", display: "swap" });
const mono = Roboto_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono", display: "swap" });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "OceanBird — Berita & Data Pasar", template: "%s · OceanBird" },
  description: "Berita dan data pasar saham IDX, komoditas, crypto, dan forex secara real-time.",
  openGraph: { type: "website", locale: "id_ID", siteName: "OceanBird" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${roboto.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

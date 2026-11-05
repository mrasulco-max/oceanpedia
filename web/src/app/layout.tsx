import type { Metadata, Viewport } from "next";
import "./globals.css";

import { cookies } from "next/headers";
import { currentOrigin } from "@/lib/origin";
import { FONT_KEYS, parseDisplay } from "@/lib/display-prefs";
import ViewportLayoutSync from "./ViewportLayoutSync";

// metadataBase mengikuti domain yang sedang dipakai (tautan & gambar Open Graph saat dibagikan).
export async function generateMetadata(): Promise<Metadata> {
  return { ...base, metadataBase: new URL(await currentOrigin()) };
}

const base: Metadata = {
  title: { default: "OceanBird — Berita & Data Pasar", template: "%s · OceanBird" },
  description: "Berita dan data pasar saham AS, forex, komoditas, dan crypto secara real-time.",
  openGraph: { type: "website", locale: "id_ID", siteName: "OceanBird" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

// Artboard desain memakai nama keluarga font "Roboto" & "Roboto Mono" secara langsung.
const FONTS = "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Roboto+Mono:wght@500&display=swap";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema & animasi dari preferensi akun (disalin ke cookie ob_prefs) — dirender server, tanpa kedip.
  const d = parseDisplay((await cookies()).get("ob_prefs")?.value);
  return (
    <html lang={d.lang} data-theme={d.theme} data-motion={d.reduceMotion ? "reduce" : undefined} data-font={FONT_KEYS[d.font]}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <ViewportLayoutSync />
        {children}
      </body>
    </html>
  );
}

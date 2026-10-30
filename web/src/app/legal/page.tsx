import type { Metadata } from "next";
import { api, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { WebShell } from "@/components/web/WebShell";
import { Rails } from "@/components/web/Rails";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = { title: "Syarat, Privasi & Disclaimer" };

const SECTIONS = [
  { id: "syarat", title: "Syarat & Ketentuan", body: ["Dengan mengakses OceanBird (situs dan aplikasi), kamu menyetujui Syarat & Ketentuan ini. Layanan dioperasikan oleh PT Nusantara Entertainment Asia.", "OceanBird menyediakan berita, data harga pasar, kalender ekonomi, dan analisis. Kami tidak menyediakan layanan perdagangan, perantara, maupun penasihat investasi.", "Paket Ocean Pedia Plus (Student, Essential, Corporate) ditagih sesuai periode dan diperpanjang otomatis sampai dibatalkan. Harga belum termasuk pajak (PPN) yang dihitung saat pembayaran."] },
  { id: "privasi", title: "Kebijakan Privasi", body: ["Kami memproses data pribadi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.", "Data yang dikumpulkan: identitas akun, preferensi, watchlist, dan data teknis perangkat. Kamu dapat meminta akses, koreksi, atau penghapusan data melalui help@jalaexplorer.com."] },
  { id: "disclaimer", title: "Disclaimer", body: ["Data harga bersumber dari pihak ketiga (Twelve Data) dan dapat tertunda. Konten bersifat informasi, bukan ajakan membeli atau menjual efek maupun aset kripto."] },
];

export default async function LegalPage() {
  const layout = await getLayout();
  const slots = await safe(api.ads(layout, "legal"), { data: [] });
  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: layout === "app" ? "8px 20px 40px" : "8px 0" }}>
      <h1 style={{ fontSize: layout === "app" ? 24 : 32 }}>Legal</h1>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`}>
          <h2 id={`${s.id}-t`} style={{ fontSize: 22, marginBottom: 10 }}>{s.title}</h2>
          {s.body.map((p, i) => <p key={i} style={{ fontSize: 15, lineHeight: 1.75, color: "#22262f", marginBottom: 10 }}>{p}</p>)}
        </section>
      ))}
      <p style={{ fontSize: 13, color: "var(--sub)" }}>PT Nusantara Entertainment Asia · Menara Cakrawala Lt. 12 Unit A05, Jakarta Pusat · corpcom@jalaexplorer.com · +62 882 0223 95690</p>
    </div>
  );
  if (layout === "app") return <AppShell back="/akun" title="Legal" hideNav>{content}</AppShell>;
  // Halaman legal: hanya iklan kiri & kanan.
  return <WebShell><Rails slots={slots.data}>{content}</Rails></WebShell>;
}

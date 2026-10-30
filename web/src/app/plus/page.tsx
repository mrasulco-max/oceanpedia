import type { Metadata } from "next";
import Link from "next/link";
import { safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { formatIDR } from "@/lib/format";
import { WebShell } from "@/components/web/WebShell";
import { AppShell } from "@/components/app/AppShell";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Ocean Pedia Plus" };

interface PlanList { data: { code: string; name: string; price_amount: number; billing_period: string; min_seats: number; features: string[] }[]; tax_rate?: number }

export default async function PlusPage() {
  const layout = await getLayout();
  const plans = await safe(fetch(`${process.env.API_INTERNAL_URL ?? "http://localhost:8080"}/v1/plans`, { next: { revalidate: 600 } }).then((r) => r.json() as Promise<PlanList>), { data: [] } as PlanList);
  const list = plans.data.filter((p) => p.billing_period === "month");
  const content = (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ fontSize: layout === "app" ? 28 : 40, textAlign: "center", lineHeight: 1.2 }}>Buka Akses Penuh<br /><span className="grad-text">Ocean Pedia Plus</span></h1>
      <div style={{ display: "grid", gridTemplateColumns: layout === "app" ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
        {list.map((p) => (
          <div key={p.code} style={{ borderRadius: 22, border: p.code === "essential" ? "2px solid var(--sky)" : "1px solid var(--line)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <strong style={{ fontSize: 20 }}>{p.name}</strong>
            <span><span className="mono" style={{ fontSize: 28 }}>{formatIDR(p.price_amount)}</span><span style={{ color: "var(--sub)", fontSize: 13 }}>{p.min_seats > 1 ? " /akun/bulan" : " /bulan"} + pajak</span></span>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {p.features.map((f) => <li key={f} style={{ display: "flex", gap: 8, fontSize: 14 }}><span style={{ color: "var(--up)" }}><Icon name="right" size={16} /></span>{f}</li>)}
            </ul>
            <Link href={`/masuk?next=/checkout/${p.code}`} className={p.code === "essential" ? "btn grad" : "btn btn-ghost"}>Pilih {p.name}</Link>
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", fontSize: 12, color: "var(--sub)" }}>Harga belum termasuk PPN{plans.tax_rate ? ` ${Math.round(plans.tax_rate * 100)}%` : ""}. Diperpanjang otomatis, batalkan kapan saja. Layanan oleh PT Nusantara Entertainment Asia.</p>
    </div>
  );
  return layout === "app" ? <AppShell back="/" hideNav>{content}</AppShell> : <WebShell>{content}</WebShell>;
}

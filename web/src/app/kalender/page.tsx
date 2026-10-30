import type { Metadata } from "next";
import { api, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { formatTime } from "@/lib/format";
import { WebShell } from "@/components/web/WebShell";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = { title: "Kalender Ekonomi" };
const IMPACT = { high: "Tinggi", medium: "Sedang", low: "Rendah" } as const;

export default async function CalendarPage() {
  const layout = await getLayout();
  const ev = await safe(api.events(), { data: [] });
  const rows = ev.data.map((e) => (
    <div key={e.id} className="list-row" style={{ alignItems: "center" }}>
      <span className="mono" style={{ width: 56 }}>{formatTime(e.scheduled_at)}</span>
      <span style={{ width: 36, fontSize: 12, fontWeight: 700, color: "var(--sub)" }}>{e.country}</span>
      <span style={{ flex: 1, fontSize: 15 }}>{e.title}</span>
      {layout === "web" && <span className="mono" style={{ width: 220, fontSize: 13, color: "var(--sub)" }}>Akt {e.actual ?? "—"} · Perk {e.forecast ?? "—"} · Seb {e.previous ?? "—"}</span>}
      <span className={`badge ${e.impact === "high" ? "down" : ""}`} style={e.impact === "high" ? undefined : { background: "var(--field)", color: "var(--sub)" }}>{IMPACT[e.impact]}</span>
    </div>
  ));
  const content = (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: layout === "app" ? "0 20px 32px" : "32px 0" }}>
      {layout === "web" && <h1 style={{ fontSize: 32, marginBottom: 6 }}>Kalender Ekonomi</h1>}
      <p style={{ color: "var(--sub)", marginBottom: 16 }}>Jadwal rilis data ekonomi yang menggerakkan pasar · waktu dalam WIB</p>
      {rows.length ? rows : <p>Tidak ada agenda.</p>}
    </div>
  );
  return layout === "app" ? <AppShell back="/" title="Kalender Ekonomi">{content}</AppShell> : <WebShell active="kalender"><div className="w-wrap">{content}</div></WebShell>;
}

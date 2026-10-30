import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Change } from "@/components/ui/Change";
import { AdSlot, pickSlot } from "@/components/ui/AdSlot";
import { formatPrice, formatTime, relativeTime } from "@/lib/format";
import type { AdSlot as Slot, Category, EconomicEvent, HomeData, QuoteItem } from "@/lib/types";

export function HomeApp({ home, quotes, events, slots, categories }: { home: HomeData; quotes: QuoteItem[]; events: EconomicEvent[]; slots: Slot[]; categories: Category[] }) {
  const top = home.top_story;
  const updates = home.latest.slice(0, 5);
  return (
    <AppShell active="home">
      <div className="a-ticker" aria-label="Harga pasar">
        <span style={{ color: "#B91C1C", fontWeight: 700 }}><span className="live-dot" />LIVE</span>
        {quotes.filter((q) => q.quote).map((q) => (
          <Link key={q.instrument.symbol} href={`/market/${q.instrument.symbol}`}><span>{q.instrument.symbol} <b className="mono">{formatPrice(q.quote!.price, q.instrument.currency)}</b> <Change pct={q.quote!.change_percent} /></span></Link>
        ))}
      </div>
      <nav className="a-pills" aria-label="Kategori">
        <Link href="/" aria-current="page">Untuk kamu</Link>
        {categories.map((c) => <Link key={c.id} href={`/kategori/${c.slug}`}>{c.name}</Link>)}
      </nav>

      {top && (
        <Link href={`/berita/${top.slug}`} className="a-hero">
          <Cover src={top.cover_url} alt={top.cover_alt} width="100%" height={380} radius={0} priority sizes="100vw" />
          <span className="txt">
            <span className="chip" style={{ alignSelf: "flex-start", background: "#fff" }}>{top.category.name}</span>
            <strong>{top.title}</strong>
            <span style={{ fontSize: 12, opacity: 0.85 }}>{top.author_name} · {relativeTime(top.published_at)} · {top.reading_minutes} mnt baca</span>
          </span>
        </Link>
      )}

      <div className="a-sec"><h2 style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="clock" />Update terbaru <span className="live-dot" /></h2></div>
      <div className="a-slider">
        {updates.map((a) => (
          <Link key={a.id} href={`/berita/${a.slug}`} className="a-upd">
            <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span className="mono" style={{ color: "var(--sky)" }}>{formatTime(a.published_at)}</span><span style={{ color: "var(--mute)" }}>{relativeTime(a.published_at)}</span></span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: "var(--sub)" }}>{a.category.name.toUpperCase()}</span>
            <strong className="clamp2" style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</strong>
          </Link>
        ))}
      </div>

      <div className="a-sec"><h2>Untuk kamu</h2><Link href="/kategori/saham" className="more">Semua</Link></div>
      <div className="a-slider">
        {home.latest.slice(1, 7).map((a) => (
          <Link key={a.id} href={`/berita/${a.slug}`} className="a-card">
            <Cover src={a.cover_url} alt="" width={240} height={140} radius={20} />
            <strong className="clamp2">{a.title}</strong>
            <span className="kicker"><b>{a.category.name}</b>· {relativeTime(a.published_at)}</span>
          </Link>
        ))}
      </div>

      {pickSlot(slots, "app_native_card") && (
        <div className="a-pad" style={{ marginTop: 22 }}>
          <Link href="#" style={{ display: "flex", gap: 12, padding: 12, borderRadius: 20, border: "1px solid var(--line)" }} aria-label="Iklan native">
            <span className="ad-box" style={{ width: 96, height: 72, flex: "none", fontSize: 11 }}>native</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700, color: "#92400E" }}>BERSPONSOR</span><strong style={{ fontSize: 14 }}>Iklan native tampil seperti artikel</strong></span>
          </Link>
        </div>
      )}

      <div className="a-sec"><h2>Agenda ekonomi</h2><Link href="/kalender" className="more">Kalender</Link></div>
      <div className="a-slider">
        {events.slice(0, 4).map((e) => (
          <div key={e.id} style={{ width: 220, padding: 14, borderRadius: 20, border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}><span className="mono">{formatTime(e.scheduled_at)}</span><span className={`badge ${e.impact === "high" ? "down" : ""}`}>{{ high: "Tinggi", medium: "Sedang", low: "Rendah" }[e.impact]}</span></span>
            <span style={{ fontSize: 14 }}>{e.title}</span>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{e.country} · Perk. {e.forecast ?? "—"}</span>
          </div>
        ))}
      </div>

      {pickSlot(slots, "app_mrec") && <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}><AdSlot slot={pickSlot(slots, "app_mrec")} /></div>}

      <div className="a-sec"><h2>Paling banyak dibaca</h2></div>
      <div className="a-slider" style={{ paddingBottom: 24 }}>
        {home.most_read.map((a) => (
          <Link key={a.id} href={`/berita/${a.slug}`} className="a-card" style={{ width: 280 }}>
            <Cover src={a.cover_url} alt="" width={280} height={170} radius={20} />
            <strong className="clamp2">{a.title}</strong>
            <span className="kicker"><Icon name="eye" size={13} />{new Intl.NumberFormat("id-ID", { notation: "compact" }).format(a.view_count)} pembaca</span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

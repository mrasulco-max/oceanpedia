import Link from "next/link";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { Change } from "@/components/ui/Change";
import { AdSlot, pickSlot } from "@/components/ui/AdSlot";
import { Rails, TopLeaderboard } from "@/components/web/Rails";
import { formatPrice, formatTime, relativeTime } from "@/lib/format";
import type { AdSlot as Slot, EconomicEvent, HomeData, QuoteItem } from "@/lib/types";

export function HomeWeb({ home, quotes, events, slots }: { home: HomeData; quotes: QuoteItem[]; events: EconomicEvent[]; slots: Slot[] }) {
  const top = home.top_story;
  const side = home.latest.filter((a) => a.id !== top?.id).slice(0, 4);
  const trending = home.latest.slice(4, 7);
  const native = pickSlot(slots, "web_native_feed");
  return (
    <>
      <TopLeaderboard slots={slots} />
      <Rails slots={slots}>
        {top && (
          <section className="w-hero" aria-label="Berita utama">
            <Link href={`/berita/${top.slug}`} className="lead">
              <Cover src={top.cover_url} alt={top.cover_alt} width="100%" height={420} radius={0} priority sizes="560px" />
              <span className="txt">
                <span style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
                  <span className="chip" style={{ background: "#fff" }}>{top.category.name}</span>
                  <span style={{ display: "flex", gap: 5, alignItems: "center" }}><Icon name="clock" size={14} />{top.reading_minutes} mnt baca</span>
                </span>
                <strong>{top.title}</strong>
                <span style={{ fontSize: 13, opacity: 0.85 }}>{top.author_name} · {relativeTime(top.published_at)}</span>
              </span>
            </Link>
            <div>
              <h2 style={{ fontSize: 15, padding: "12px 0", borderBottom: "2px solid var(--sky)", color: "var(--sky)", textAlign: "center" }}>Terkini</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 }}>
                {side.map((a) => (
                  <Link key={a.id} href={`/berita/${a.slug}`} className="side-item">
                    <Cover src={a.cover_url} alt="" width={76} height={76} radius={12} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <span className="kicker"><b>{a.category.name}</b>· {relativeTime(a.published_at)}</span>
                      <strong className="clamp3">{a.title}</strong>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="w-split" style={{ marginTop: 44 }}>
          <section aria-labelledby="trend">
            <div className="sec-title" style={{ marginTop: 0 }}><h2 id="trend"><Icon name="trend" size={22} />Berita trending</h2></div>
            <div className="w-grid3">
              {trending.map((a) => (
                <Link key={a.id} href={`/berita/${a.slug}`} className="card-v">
                  <Cover src={a.cover_url} alt="" width="100%" height={120} />
                  <span className="kicker"><b>{a.category.name}</b>· {relativeTime(a.published_at)}</span>
                  <strong className="clamp3">{a.title}</strong>
                </Link>
              ))}
            </div>
          </section>
          <section aria-labelledby="live">
            <div className="sec-title" style={{ marginTop: 0 }}><h2 id="live"><span className="live-dot" />Live Market</h2></div>
            <div className="panel">
              {quotes.filter((q) => q.quote).slice(0, 6).map((q) => (
                <Link key={q.instrument.symbol} href={`/market/${q.instrument.symbol}`} className="mk-row">
                  <span className="sym">{q.instrument.symbol.slice(0, 4)}</span>
                  <span className="name">{q.instrument.symbol}</span>
                  <span className="mono" style={{ fontSize: 13 }}>{formatPrice(q.quote!.price, q.instrument.currency)}</span>
                  <Change pct={q.quote!.change_percent} />
                </Link>
              ))}
            </div>
            <Link href="/market/IHSG" className="btn grad" style={{ width: "100%", marginTop: 14 }}>Lihat semua market</Link>
          </section>
        </div>

        {pickSlot(slots, "web_leaderboard_mid") && <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}><AdSlot slot={pickSlot(slots, "web_leaderboard_mid")} /></div>}

        <div className="w-split" style={{ marginTop: 8 }}>
          <section aria-labelledby="latest">
            <div className="sec-title"><h2 id="latest"><Icon name="star" size={22} />Berita terbaru</h2><Link href="/kategori/saham" className="more">Semua berita<Icon name="right" size={16} /></Link></div>
            {home.latest.slice(0, 6).map((a, i) => (
              <div key={a.id}>
                {i === 2 && native && (
                  <Link href="#" className="list-row" aria-label="Iklan native">
                    <span className="ad-box" style={{ width: 160, height: 100, flex: "none", fontSize: 11 }}>native</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>BERSPONSOR · Nama Brand</span><strong>Iklan native tampil seperti artikel di daftar berita</strong></span>
                  </Link>
                )}
                <Link href={`/berita/${a.slug}`} className="list-row">
                  <Cover src={a.cover_url} alt="" width={160} height={100} radius={14} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span className="kicker"><b>{a.category.name}</b>· {relativeTime(a.published_at)} · {a.reading_minutes} mnt{a.is_premium ? " · PLUS" : ""}</span>
                    <strong>{a.title}</strong>
                    <span className="clamp2" style={{ fontSize: 14, color: "var(--sub)" }}>{a.excerpt}</span>
                  </span>
                </Link>
              </div>
            ))}
          </section>
          <aside>
            <div className="sec-title"><h2><Icon name="eye" size={22} />Paling dibaca</h2></div>
            {home.most_read.map((a) => (
              <Link key={a.id} href={`/berita/${a.slug}`} className="list-row">
                <Cover src={a.cover_url} alt="" width={72} height={60} radius={12} />
                <strong className="clamp3" style={{ fontSize: 14 }}>{a.title}</strong>
              </Link>
            ))}
            <div className="sec-title"><h2><Icon name="calendar" size={22} />Agenda ekonomi</h2><Link href="/kalender" className="more">Kalender</Link></div>
            {events.slice(0, 5).map((e) => (
              <div key={e.id} className="list-row" style={{ alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 13 }}>{formatTime(e.scheduled_at)}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{e.title}</span>
                <span className={`badge ${e.impact === "high" ? "down" : ""}`} style={e.impact === "high" ? undefined : { background: "var(--field)", color: "var(--sub)" }}>{{ high: "Tinggi", medium: "Sedang", low: "Rendah" }[e.impact]}</span>
              </div>
            ))}
          </aside>
        </div>

        {home.sections.slice(0, 3).length > 0 && (
          <section aria-labelledby="per-kategori">
            <div className="sec-title"><h2 id="per-kategori"><Icon name="tag" size={22} />Per kategori</h2></div>
            <div className="w-grid3" style={{ gap: 28 }}>
              {home.sections.slice(0, 3).map((s) => (
                <div key={s.category.id}>
                  <h3 style={{ fontSize: 18, marginBottom: 12 }}><Link href={`/kategori/${s.category.slug}`}>{s.category.name}</Link></h3>
                  {s.articles.slice(0, 3).map((a) => (
                    <Link key={a.id} href={`/berita/${a.slug}`} className="list-row" style={{ flexDirection: "column", gap: 6 }}>
                      <strong style={{ fontSize: 14 }}>{a.title}</strong>
                      <span className="kicker">{relativeTime(a.published_at)}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </Rails>
    </>
  );
}

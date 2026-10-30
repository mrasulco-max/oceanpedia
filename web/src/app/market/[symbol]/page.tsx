import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, ApiError, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { formatCompact, formatPct, formatPrice, relativeTime } from "@/lib/format";
import { WebShell } from "@/components/web/WebShell";
import { AppShell } from "@/components/app/AppShell";
import { CandleChart } from "@/components/ui/CandleChart";
import { Change } from "@/components/ui/Change";
import { Icon } from "@/components/ui/Icon";

type Props = { params: Promise<{ symbol: string }>; searchParams: Promise<{ interval?: string }> };

const TF: [string, string][] = [["15min", "15m"], ["1h", "1J"], ["4h", "4J"], ["1day", "1D"], ["1week", "1W"], ["1month", "1M"]];
const WATCH = ["IHSG", "BBCA", "BBRI", "TLKM", "BTCUSD", "ETHUSD", "XAUUSD", "USDIDR"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} — harga, grafik & berita`, alternates: { canonical: `/market/${symbol.toUpperCase()}` } };
}

export default async function MarketPage({ params, searchParams }: Props) {
  const [{ symbol: raw }, sp] = await Promise.all([params, searchParams]);
  const symbol = raw.toUpperCase();
  const interval = TF.some(([k]) => k === sp.interval) ? sp.interval! : "1day";
  const layout = await getLayout();
  let detail;
  try {
    detail = await api.instrument(symbol);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const [candles, watch] = await Promise.all([safe(api.candles(symbol, interval, 120), { symbol, interval, data: [] }), safe(api.quotes(WATCH), { data: [] })]);
  const { instrument: ins, quote: q, news } = detail;
  const cur = ins.currency;
  const tf = (
    <nav className="tf" aria-label="Timeframe">
      {TF.map(([k, l]) => <Link key={k} href={`/market/${symbol}?interval=${k}`} aria-current={k === interval ? "true" : undefined} scroll={false}>{l}</Link>)}
    </nav>
  );
  const stats = q && (
    <div>
      {[["Pembukaan", formatPrice(q.open, cur)], ["Tertinggi", formatPrice(q.high, cur)], ["Terendah", formatPrice(q.low, cur)], ["Penutupan sebelumnya", formatPrice(q.previous_close, cur)], ["Volume", formatCompact(q.volume)], ["Rentang 52 minggu", `${formatPrice(q.week52_low, cur)} – ${formatPrice(q.week52_high, cur)}`]].map(([k, v]) => (
        <div key={k} className="stat"><span>{k}</span><span className="mono">{v}</span></div>
      ))}
      <p style={{ fontSize: 11, color: "var(--mute)", marginTop: 8 }}>Sumber: {q.source === "twelvedata" ? "Twelve Data" : "data contoh"} · dapat tertunda</p>
    </div>
  );
  const head = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ display: "flex", gap: 10, alignItems: "center" }}><strong style={{ fontSize: 22 }}>{ins.symbol}</strong><span className="chip">{ins.exchange}</span></span>
      <span style={{ color: "var(--sub)", fontSize: 14 }}>{ins.name}</span>
      {q ? (
        <span style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 40 }}>{formatPrice(q.price, cur)}</span>
          <span className={q.change >= 0 ? "badge up" : "badge down"} style={{ fontSize: 14 }}>{q.change >= 0 ? "+" : "−"}{formatPrice(Math.abs(q.change), cur)} · {formatPct(q.change_percent)}</span>
        </span>
      ) : <span style={{ color: "var(--sub)" }}>{detail.error ?? "Harga belum tersedia."}</span>}
    </div>
  );
  const newsList = news.length === 0 ? <p style={{ color: "var(--sub)", fontSize: 14 }}>Belum ada berita terkait.</p> : news.map((n) => (
    <Link key={n.id} href={`/berita/${n.slug}`} className="list-row" style={{ alignItems: "center" }}>
      <span className="mono" style={{ width: 90, fontSize: 12, color: "var(--sub)" }}>{relativeTime(n.published_at)}</span>
      <strong className="clamp2" style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{n.title}</strong>
      <span className="chip">{n.category.name}</span>
    </Link>
  ));
  const chart = <CandleChart data={candles.data} height={layout === "web" ? 460 : 300} label={`Grafik candlestick ${ins.symbol} interval ${interval}`} />;

  if (layout === "app") {
    return (
      <AppShell active="market" back="/" right={<Link href="/masuk" className="ring" aria-label="Tambah ke watchlist"><Icon name="star" /></Link>}>
        <div className="a-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {head}
          <div style={{ borderRadius: 20, border: "1px solid var(--line)", padding: 10 }}>{tf}{chart}</div>
          <div style={{ borderRadius: 20, background: "var(--field)", padding: 14 }}>{stats}</div>
          <Link href="/masuk" className="btn grad"><Icon name="bell" size={18} />Buat price alert</Link>
          <h2 style={{ fontSize: 17 }}>Berita terkait</h2>
          <div>{newsList}</div>
        </div>
      </AppShell>
    );
  }
  return (
    <WebShell active="market">
      <section aria-label={`Grafik ${ins.symbol}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ minWidth: 0, borderRight: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
            <strong>{ins.symbol}</strong>{tf}<span style={{ flex: 1 }} />
            <Link href="/masuk" className="btn btn-ghost" style={{ height: 34, fontSize: 13 }}><Icon name="bell" size={16} />Alert</Link>
          </div>
          <div style={{ padding: "16px 16px 0" }}>{head}</div>
          <div style={{ padding: 16 }}>{chart}</div>
          <div style={{ padding: "0 16px 24px" }}>
            <h2 style={{ fontSize: 16, padding: "10px 0", borderBottom: "2px solid var(--sky)", display: "inline-block" }}>Berita terkait</h2>
            {newsList}
          </div>
        </div>
        <aside aria-label="Watchlist & detail" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}><strong>Watchlist</strong></div>
          {watch.data.filter((w) => w.quote).map((w) => (
            <Link key={w.instrument.symbol} href={`/market/${w.instrument.symbol}`} style={{ display: "grid", gridTemplateColumns: "1fr auto 70px", gap: 8, padding: "9px 16px", fontSize: 13, background: w.instrument.symbol === symbol ? "var(--sky-l)" : undefined }}>
              <strong style={{ fontWeight: 500 }}>{w.instrument.symbol}</strong>
              <span className="mono">{formatPrice(w.quote!.price, w.instrument.currency)}</span>
              <span style={{ textAlign: "right" }}><Change pct={w.quote!.change_percent} /></span>
            </Link>
          ))}
          <div style={{ padding: 16, borderTop: "1px solid var(--line)" }}>{stats}</div>
        </aside>
      </section>
    </WebShell>
  );
}

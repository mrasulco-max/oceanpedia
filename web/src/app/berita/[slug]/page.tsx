import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { api, ApiError, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { formatDateTime, relativeTime } from "@/lib/format";
import { WebShell } from "@/components/web/WebShell";
import { Rails, TopLeaderboard } from "@/components/web/Rails";
import { AppShell } from "@/components/app/AppShell";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { AdSlot, pickSlot } from "@/components/ui/AdSlot";
import type { Article, ArticleCard } from "@/lib/types";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<Article> {
  const token = (await cookies()).get("ob_at")?.value;
  try {
    return await api.article(slug, token ? { token } : undefined);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await safe(api.article(slug), null);
  if (!a) return { title: "Berita tidak ditemukan" };
  return {
    title: a.title,
    description: a.excerpt,
    alternates: { canonical: `/berita/${a.slug}` },
    openGraph: { type: "article", title: a.title, description: a.excerpt, publishedTime: a.published_at, images: a.cover_url ? [a.cover_url] : [] },
  };
}

function Body({ a }: { a: Article }) {
  const paras = a.body.split(/\n{2,}/).filter(Boolean);
  return <div className="body">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>;
}

function AISummary({ a }: { a: Article }) {
  return (
    <section className="ai-card" aria-label="Analisis AI">
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="grad" style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="spark" size={18} /></span><strong>Analisis AI</strong><span className="badge grad">PLUS</span></span>
      {a.ai_summary ? <p style={{ fontSize: 15, lineHeight: 1.6 }}>{a.ai_summary}</p> : (
        <>
          <p style={{ fontSize: 14, color: "var(--sub)" }}>Ringkasan & dampak berita ini ke pasar tersedia untuk pelanggan Ocean Pedia Plus.</p>
          <Link href="/plus" className="btn grad" style={{ alignSelf: "flex-start" }}><Icon name="lock" size={16} />Buka dengan Plus</Link>
        </>
      )}
    </section>
  );
}

function Locked() {
  return (
    <div className="lock">
      <Icon name="lock" size={28} />
      <strong style={{ fontSize: 18 }}>Lanjutkan membaca dengan Ocean Pedia Plus</strong>
      <span style={{ color: "var(--sub)", fontSize: 14 }}>Mulai Rp19.000/bulan (belum termasuk pajak). Batalkan kapan saja.</span>
      <Link href="/plus" className="btn grad">Lihat paket</Link>
    </div>
  );
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const layout = await getLayout();
  const [a, related, slots] = await Promise.all([load(slug), safe(api.related(slug), { data: [] as ArticleCard[] }), safe(api.ads(layout, "article"), { data: [] })]);
  const ld = { "@context": "https://schema.org", "@type": "NewsArticle", headline: a.title, datePublished: a.published_at, author: { "@type": "Person", name: a.author.name }, publisher: { "@type": "Organization", name: "OceanBird" }, image: a.cover_url ? [a.cover_url] : undefined, isAccessibleForFree: !a.is_premium };
  const jsonLd = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />;

  if (layout === "app") {
    return (
      <AppShell back="/" hideNav right={<Link href={`/berita/${a.slug}#bagikan`} className="ring" aria-label="Bagikan"><Icon name="share" /></Link>}>
        {jsonLd}
        <article className="a-article">
          <Cover src={a.cover_url} alt={a.cover_alt} width="100%" height={260} radius={0} priority sizes="100vw" />
          <div className="a-pad" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 18 }}>
            <span className="kicker"><b>{a.category.name}</b>· {formatDateTime(a.published_at)}</span>
            <h1>{a.title}</h1>
            <span style={{ fontSize: 13, color: "var(--sub)" }}>{a.author.name} · {a.reading_minutes} mnt baca</span>
            <AISummary a={a} />
            <Body a={a} />
            {a.locked && <Locked />}
            {pickSlot(slots.data, "app_mrec") && <div style={{ display: "flex", justifyContent: "center" }}><AdSlot slot={pickSlot(slots.data, "app_mrec")} /></div>}
            <h2 style={{ fontSize: 20, marginTop: 12 }}>Baca juga</h2>
            {related.data.slice(0, 4).map((r) => (
              <Link key={r.id} href={`/berita/${r.slug}`} className="list-row">
                <Cover src={r.cover_url} alt="" width={96} height={80} radius={16} />
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><strong className="clamp3">{r.title}</strong><span className="kicker">{relativeTime(r.published_at)}</span></span>
              </Link>
            ))}
          </div>
        </article>
        <div className="a-bar">
          <Link href="/masuk" aria-label="Beri reaksi"><Icon name="trend" size={18} />Suka</Link>
          <Link href="/masuk" aria-label="Komentar"><Icon name="chat" size={18} />Komentar</Link>
          <span style={{ flex: 1 }} />
          <Link href="/masuk" aria-label="Simpan"><Icon name="bookmark" size={18} /></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <WebShell active="kategori">
      {jsonLd}
      <TopLeaderboard slots={slots.data} />
      <Rails slots={slots.data}>
        <article className="w-article">
          <nav className="crumb" aria-label="Breadcrumb"><Link href="/">Beranda</Link>›<Link href={`/kategori/${a.category.slug}`}>{a.category.name}</Link></nav>
          <h1>{a.title}</h1>
          <p style={{ fontSize: 18, color: "var(--sub)", lineHeight: 1.6 }}>{a.excerpt}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0", fontSize: 14, color: "var(--sub)" }}>
            <strong style={{ color: "var(--ink)" }}>{a.author.name}</strong>· {formatDateTime(a.published_at)} · {a.reading_minutes} mnt baca
          </div>
          <Cover src={a.cover_url} alt={a.cover_alt} width="100%" height={460} radius={24} priority sizes="896px" />
          <AISummary a={a} />
          <Body a={a} />
          {pickSlot(slots.data, "web_leaderboard_mid") && <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 24px" }}><AdSlot slot={pickSlot(slots.data, "web_leaderboard_mid")} /></div>}
          {a.locked && <Locked />}
          {a.tags.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{a.tags.map((t) => <span key={t.slug} className="chip">#{t.name}</span>)}</div>}
        </article>
        <div className="sec-title"><h2><Icon name="chat" size={22} />Baca juga</h2></div>
        <div className="w-grid3">
          {related.data.slice(0, 3).map((r) => (
            <Link key={r.id} href={`/berita/${r.slug}`} className="card-v">
              <Cover src={r.cover_url} alt="" width="100%" height={140} />
              <span className="kicker"><b>{r.category.name}</b>· {relativeTime(r.published_at)}</span>
              <strong className="clamp3">{r.title}</strong>
            </Link>
          ))}
        </div>
      </Rails>
    </WebShell>
  );
}

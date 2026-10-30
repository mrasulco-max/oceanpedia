import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api, safe } from "@/lib/api";
import { getLayout } from "@/lib/layout";
import { relativeTime } from "@/lib/format";
import { WebShell } from "@/components/web/WebShell";
import { Rails, TopLeaderboard } from "@/components/web/Rails";
import { AppShell } from "@/components/app/AppShell";
import { Cover } from "@/components/ui/Cover";
import { Icon } from "@/components/ui/Icon";
import { pickSlot } from "@/components/ui/AdSlot";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ cursor?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cats = await safe(api.categories(), { data: [] });
  const c = cats.data.find((x) => x.slug === slug);
  return c ? { title: `Berita ${c.name}`, description: c.description, alternates: { canonical: `/kategori/${slug}` } } : { title: "Kategori" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { cursor }] = await Promise.all([params, searchParams]);
  const layout = await getLayout();
  const [cats, list, slots] = await Promise.all([
    safe(api.categories(), { data: [] }),
    safe(api.articles({ category: slug, cursor, limit: 12 }), { data: [], next_cursor: null }),
    safe(api.ads(layout, "category"), { data: [] }),
  ]);
  const cat = cats.data.find((c) => c.slug === slug);
  if (!cat) notFound();
  const nativeOn = Boolean(pickSlot(slots.data, layout === "web" ? "web_native_feed" : "app_native_card"));
  const more = list.next_cursor ? `/kategori/${slug}?cursor=${encodeURIComponent(list.next_cursor)}` : null;

  const rows = list.data.map((a, i) => (
    <div key={a.id}>
      {i === 3 && nativeOn && (
        <Link href="#" className="list-row" aria-label="Iklan native">
          <span className="ad-box" style={{ width: layout === "web" ? 200 : 96, height: layout === "web" ? 124 : 76, flex: "none", fontSize: 11 }}>native</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>BERSPONSOR · Nama Brand</span><strong>Iklan native tampil seperti artikel</strong></span>
        </Link>
      )}
      <Link href={`/berita/${a.slug}`} className="list-row">
        <Cover src={a.cover_url} alt="" width={layout === "web" ? 200 : 96} height={layout === "web" ? 124 : 76} radius={14} />
        <span style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span className="kicker"><b>{a.category.name}</b>· {relativeTime(a.published_at)}{a.is_premium ? " · PLUS" : ""}</span>
          <strong className="clamp3">{a.title}</strong>
          {layout === "web" && <span className="clamp2" style={{ fontSize: 14, color: "var(--sub)" }}>{a.excerpt}</span>}
        </span>
      </Link>
    </div>
  ));
  const pager = more ? <Link href={more} className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }}>Muat lebih banyak<Icon name="down" size={16} /></Link> : null;

  if (layout === "app") {
    return (
      <AppShell active="home" back="/" title={cat.name}>
        <nav className="a-pills" aria-label="Kategori">
          {cats.data.map((c) => <Link key={c.id} href={`/kategori/${c.slug}`} aria-current={c.slug === slug ? "page" : undefined}>{c.name}</Link>)}
        </nav>
        <div className="a-pad">{rows}{pager}</div>
      </AppShell>
    );
  }
  return (
    <WebShell active="kategori">
      <TopLeaderboard slots={slots.data} />
      <Rails slots={slots.data}>
        <div className="page-head">
          <span className="ic grad"><Icon name="tag" size={26} /></span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}><h1>{cat.name}</h1><span style={{ color: "var(--sub)" }}>{cat.description} · {cat.article_count} artikel</span></span>
        </div>
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 8px" }} aria-label="Kategori">
          {cats.data.map((c) => <Link key={c.id} href={`/kategori/${c.slug}`} className="btn" style={{ height: 38, background: c.slug === slug ? "var(--sky)" : "#fff", color: c.slug === slug ? "#fff" : "var(--ink)", border: c.slug === slug ? 0 : "1px solid var(--line)", fontSize: 14 }}>{c.name}</Link>)}
        </nav>
        {rows}
        {pager}
      </Rails>
    </WebShell>
  );
}

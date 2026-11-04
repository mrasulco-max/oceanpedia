import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLayout } from "@/lib/layout";
import { matchRoute, pickBoard, prepare, safeNext } from "@/dc/pages";
import { loadBoard } from "@/boards/gen/registry";
import { api } from "@/lib/api";
import { currentUser, type SessionUser } from "@/lib/session";

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Izin minimum per halaman admin (RBAC dari database); selain ini cukup akses panel. */
const PAGE_PERM: Record<string, string | string[]> = {
  "/admin/role": "rbac.manage",
  "/admin/komentar": "comments.moderate",
  "/admin/aktivitas": "audit.read",
  "/admin/pengguna": "users.read",
  "/admin/iklan": ["ads.manage", "revenue.read"],
  "/admin/pasar": ["market.read", "market.manage"],
  "/admin/simbol": ["market.read", "market.manage"],
  "/admin/laporan": "revenue.read",
  "/admin/newsletter": "content.publish",
  "/admin/live": ["content.breaking", "content.write"],
  "/admin/versi": "content.write",
};

function flat(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") out[k] = v;
  return out;
}

async function resolve(props: Props) {
  const { path = [] } = await props.params;
  const m = matchRoute(path);
  if (!m) notFound();
  const search = flat(await props.searchParams);

  // Panel admin: wajib masuk dengan peran redaksi/admin.
  let me: SessionUser | null = null;
  if (m.route.admin && !m.route.public) {
    me = await currentUser();
    if (!me || !me.is_staff) {
      const qs = new URLSearchParams(search).toString();
      redirect(`/admin/masuk?next=${encodeURIComponent("/" + path.join("/") + (qs ? `?${qs}` : ""))}`);
    }
    const perm = PAGE_PERM[m.route.path];
    const granted = me.permissions ?? [];
    if (perm && !(Array.isArray(perm) ? perm : [perm]).some((p) => granted.includes(p))) redirect("/admin?akses=ditolak");
  }
  // Situs: sesi pembaca (bila ada) untuk ikon akun, halaman akun, dan alur masuk/daftar.
  if (!m.route.admin) {
    me = await currentUser();
    const p = m.route.path;
    if (me && (p === "/masuk" || p === "/daftar")) redirect(safeNext(search.next) === "/" ? "/akun" : safeNext(search.next));
    if (!me && (p === "/akun" || p === "/pengaturan")) redirect(`/masuk?next=${encodeURIComponent(p)}`);
  }
  const layout = await getLayout();
  return { prepared: await prepare(m, layout, search, me), path };
}

/** Gambar pratinjau: foto sampul bila ada, selain itu kartu buatan /api/og (judul + kategori). */
const og = (t: string, k: string, s?: string) => `/api/og?${new URLSearchParams({ t, k, ...(s ? { s } : {}) })}`;
function share(title: string, description: string | undefined, url: string, image: string, type: "article" | "website" = "website", extra: Partial<Metadata> = {}): Metadata {
  // Ukuran hanya dinyatakan untuk kartu buatan /api/og (foto sampul ukurannya beragam).
  const images = [image.startsWith("/api/og") ? { url: image, width: 1200, height: 630, alt: title } : { url: image, alt: title }];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type, url, title, description, siteName: "OceanBird", locale: "id_ID", images },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    ...extra,
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { path = [] } = await props.params;
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const m = matchRoute(path);
  if (!m) return {};
  const robots = m.route.admin ? { index: false, follow: false } : undefined;
  if (path.length === 0) {
    const md = share("OceanBird — Berita & Data Pasar", "Berita dan data pasar saham IDX, komoditas, crypto, dan forex secara real-time.", "/", og("Berita & data pasar real-time untuk investor Indonesia", "OceanBird"));
    return { ...md, title: { absolute: "OceanBird — Berita & Data Pasar" } };
  }
  try {
    switch (m.route.path) {
      case "/berita/[slug]": {
        const a = await api.article(m.params.slug!);
        const img = a.cover_url || og(a.title, a.category?.name ?? "Berita", a.author_name);
        return share(a.title, a.excerpt, `/berita/${a.slug}`, img, "article", { authors: a.author_name ? [{ name: a.author_name }] : undefined });
      }
      case "/kategori/[slug]": {
        const c = (await api.categories()).data.find((x) => x.slug === m.params.slug);
        if (!c) return { robots };
        return share(c.name, c.description, `/kategori/${c.slug}`, og(`Berita ${c.name} terbaru`, "Kategori"));
      }
      case "/penulis/[slug]": {
        const r = await api.author(m.params.slug!);
        return share(r.author.name, r.author.bio || r.author.title, `/penulis/${r.author.slug}`, og(r.author.name, "Penulis", r.author.title));
      }
      case "/topik/[slug]": {
        const r = await api.topic(m.params.slug!);
        return share(`#${r.topic.name}`, `Berita dan analisis terbaru seputar ${r.topic.name}.`, `/topik/${r.topic.slug}`, og(`#${r.topic.name}`, "Topik"));
      }
      case "/market/[symbol]": {
        const sym = m.params.symbol!.toUpperCase();
        const info = await api.instrument(sym);
        const q = info.quote;
        const px = q ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: q.price < 10 ? 4 : 2 }).format(q.price)} (${q.change_percent >= 0 ? "+" : ""}${q.change_percent.toFixed(2).replace(".", ",")}%)` : "";
        return share(`${sym} · ${info.instrument.name}`, `Harga, grafik, dan berita ${info.instrument.name}${px ? ` — ${px}` : ""}.`, `/market/${sym}`, og(`${info.instrument.name}${px ? ` · ${px}` : ""}`, sym, "Harga live, grafik & berita"));
      }
      case "/short": {
        const list = await api.shorts();
        const s = list.data.find((x) => x.id === one(sp.v)) ?? list.data[0];
        if (!s) break;
        return share(s.title, s.caption || "Ocean Short — video singkat seputar pasar.", `/short?v=${s.id}`, s.cover_url || og(s.title, "Ocean Short"), "website", s.video_url ? { openGraph: { type: "video.other", url: `/short?v=${s.id}`, title: s.title, description: s.caption, siteName: "OceanBird", images: [{ url: s.cover_url || og(s.title, "Ocean Short"), width: 1200, height: 630 }], videos: [{ url: s.video_url }] } } : {});
      }
      case "/live": {
        const l = await api.live().catch(() => null);
        if (l) return share(`LIVE: ${l.title}`, "Liputan langsung OceanBird.", "/live", og(l.title, "● LIVE"));
        break;
      }
    }
    const board = await loadBoard(pickBoard(m.route, await getLayout()));
    const pub = !m.route.admin && !m.route.path.startsWith("/plus/") && !["/akun", "/pengaturan", "/masuk", "/daftar", "/verifikasi"].includes(m.route.path);
    return pub ? { ...share(board.title, undefined, m.route.path, og(board.title, "OceanBird")), robots } : { title: board.title, robots };
  } catch {
    return { robots };
  }
}

export default async function Page(props: Props) {
  const { prepared: p, path } = await resolve(props);
  const Board = p.board.Component;
  return (
    <Board
      key={`${p.boardId}:${path.join("/")}`}
      tpl={p.html}
      css={p.board.css}
      kind={p.board.kind}
      enhance={p.enhance}
      ctx={p.ctx}
    />
  );
}

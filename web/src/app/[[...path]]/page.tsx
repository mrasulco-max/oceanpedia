import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLayout } from "@/lib/layout";
import { matchRoute, pickBoard, prepare } from "@/dc/pages";
import { loadBoard } from "@/boards/gen/registry";
import { api } from "@/lib/api";
import { currentUser } from "@/lib/session";

type Props = { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const STAFF = new Set(["admin", "editor", "author"]);

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
  if (m.route.admin && !m.route.public) {
    const me = await currentUser();
    if (!me || !STAFF.has(me.role)) {
      redirect(`/admin/masuk?next=${encodeURIComponent("/" + path.join("/"))}`);
    }
  }
  const layout = await getLayout();
  return { prepared: await prepare(m, layout, search), path };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { path = [] } = await props.params;
  const m = matchRoute(path);
  if (!m) return {};
  const robots = m.route.admin ? { index: false, follow: false } : undefined;
  if (path.length === 0) return { title: { absolute: "OceanBird — Berita & Data Pasar" } };
  try {
    if (m.route.path === "/berita/[slug]") {
      const a = await api.article(m.params.slug!);
      return { title: a.title, description: a.excerpt, openGraph: { type: "article", title: a.title, description: a.excerpt, images: a.cover_url ? [a.cover_url] : undefined } };
    }
    if (m.route.path === "/kategori/[slug]") {
      const c = (await api.categories()).data.find((x) => x.slug === m.params.slug);
      return { title: c?.name, description: c?.description };
    }
    const board = await loadBoard(pickBoard(m.route, await getLayout()));
    return { title: board.title, robots };
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

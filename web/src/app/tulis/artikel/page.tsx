import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, safe } from "@/lib/api";
import { currentUser } from "@/lib/session";
import ArticleForm from "./ArticleForm";

export const metadata: Metadata = { title: "Tulis berita", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Tulis berita langsung dari aplikasi untuk penulis & editor (izin content.write). */
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent("/tulis/artikel")}`);
  const perms = new Set(user.permissions ?? []);
  if (!perms.has("content.write")) redirect("/akun");
  const [cats, ins] = await Promise.all([safe(api.categories(), { data: [] }), safe(api.instruments(), { data: [] })]);
  return (
    <ArticleForm
      categories={cats.data.map((c) => ({ slug: c.slug, name: c.name }))}
      instruments={ins.data.map((i) => ({ symbol: i.symbol, name: i.name }))}
      canRelease={perms.has("content.publish_own") || perms.has("content.publish")}
      canBreaking={perms.has("content.breaking")}
    />
  );
}

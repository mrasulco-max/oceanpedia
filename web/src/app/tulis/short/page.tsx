import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, safe } from "@/lib/api";
import { currentUser } from "@/lib/session";
import ShortForm from "./ShortForm";

export const metadata: Metadata = { title: "Unggah Ocean Short", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Unggah Ocean Short langsung dari aplikasi untuk penulis & editor (izin content.write). */
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect(`/masuk?next=${encodeURIComponent("/tulis/short")}`);
  const perms = new Set(user.permissions ?? []);
  if (!perms.has("content.write")) redirect("/akun");
  const [cats, ins] = await Promise.all([safe(api.categories(), { data: [] }), safe(api.instruments(), { data: [] })]);
  return (
    <ShortForm
      categories={cats.data.map((c) => ({ slug: c.slug, name: c.name }))}
      instruments={ins.data.map((i) => ({ symbol: i.symbol, name: i.name }))}
      canRelease={perms.has("content.publish_own") || perms.has("content.publish")}
    />
  );
}

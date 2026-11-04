import type { MetadataRoute } from "next";
import { api, safe } from "@/lib/api";
import { currentOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await currentOrigin();
  const [arts, cats] = await Promise.all([safe(api.articles({ limit: 50 }), { data: [] }), safe(api.categories(), { data: [] })]);
  return [
    { url: site, changeFrequency: "hourly", priority: 1 },
    ...cats.data.map((c) => ({ url: `${site}/kategori/${c.slug}`, changeFrequency: "hourly" as const, priority: 0.7 })),
    ...arts.data.map((a) => ({ url: `${site}/berita/${a.slug}`, lastModified: a.published_at, priority: 0.8 })),
  ];
}

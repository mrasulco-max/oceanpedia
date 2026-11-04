import type { MetadataRoute } from "next";
import { currentOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await currentOrigin();
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/masuk", "/akun", "/admin"] }], sitemap: `${site}/sitemap.xml` };
}

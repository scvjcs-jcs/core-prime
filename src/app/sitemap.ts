import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const SITE_URL = "https://core-prime-jade.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select("slug, updated_at")
    .eq("is_published", true);

  const buildingUrls: MetadataRoute.Sitemap = (buildings ?? []).map((b) => ({
    url: `${SITE_URL}/buildings/${b.slug}`,
    lastModified: b.updated_at ?? undefined,
  }));

  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/buildings` },
    { url: `${SITE_URL}/advisory` },
    ...buildingUrls,
  ];
}
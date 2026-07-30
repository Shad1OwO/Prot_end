import type { MetadataRoute } from "next";
import { apiOrigin } from "@/lib/api";
import type { DestinationListResponse } from "@tourism/contracts";

const site = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";
const routes = ["", "/explore", "/categories", "/login"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = routes.flatMap((path) => (["en", "th"].map((locale) => ({ url: `${site}/${locale}${path}`, lastModified: new Date(), changeFrequency: path ? "weekly" as const : "daily" as const, priority: path ? 0.8 : 1 }))));
  try {
    const responses = await Promise.all(["thailand", "worldwide"].map((scope) => fetch(`${apiOrigin}/api/v1/destinations?locale=en&scope=${scope}&limit=50`, { next: { revalidate: 3600 } })));
    for (const response of responses) if (response.ok) {
      const data = await response.json() as DestinationListResponse;
      for (const destination of data.items) for (const locale of ["en", "th"]) entries.push({ url: `${site}/${locale}/destinations/${destination.slug}`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 });
    }
  } catch {}
  return entries;
}

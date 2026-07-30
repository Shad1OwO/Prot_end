import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/en/profile", "/th/profile", "/en/settings", "/th/settings", "/en/trips", "/th/trips", "/en/saved", "/th/saved", "/en/ai-search", "/th/ai-search"] }, sitemap: `${site}/sitemap.xml` };
}

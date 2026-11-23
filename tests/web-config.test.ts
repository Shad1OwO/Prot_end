import { describe, expect, test } from "bun:test";
import nextConfig from "../apps/web/next.config";
import { allowedImageHosts, catalogImportSchema, tripUpdateSchema } from "../packages/contracts/src";
import { commonsImageHosts } from "../packages/db/src/catalog-import/commons";

const destination = (imageUrls: string[]) => ({ destinations: [{ slug: "new-place", scope: "thailand", translations: { en: { name: "New place", shortDescription: "Short", description: "Long" }, th: { name: "ที่ใหม่", shortDescription: "สั้น", description: "ยาว" } }, coordinates: { latitude: 13.7, longitude: 100.5 }, categorySlugs: ["nature"], imageUrls }] });

describe("catalog images", () => {
  test("import accepts an image the website is able to render", () => {
    expect(catalogImportSchema.safeParse(destination(["https://images.unsplash.com/photo-1"])).success).toBe(true);
  });
  test("import rejects an image host the website would crash on", () => {
    expect(catalogImportSchema.safeParse(destination(["https://evil.example/photo.jpg"])).success).toBe(false);
  });
  test("import rejects a non-HTTPS image even on an allowed host", () => {
    expect(catalogImportSchema.safeParse(destination(["http://images.unsplash.com/photo-1"])).success).toBe(false);
  });
  test("import accepts a Wikimedia Commons thumbnail", () => {
    expect(catalogImportSchema.safeParse(destination(["https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel.jpg/1600px-Tour_Eiffel.jpg"])).success).toBe(true);
  });
  test("every host the Wikidata import stores photos from is allowed", () => {
    for (const host of commonsImageHosts) expect(allowedImageHosts as readonly string[]).toContain(host);
  });
  test("the photo credit wraps instead of cutting off the licence", async () => {
    const css = await Bun.file(new URL("../apps/web/app/globals.css", import.meta.url)).text();
    const rule = css.match(/\.photo-credit \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toBe("");
    expect(rule).not.toContain("nowrap");
    expect(rule).not.toContain("text-overflow");
  });
  test("the web image lets its app user write Next.js's caches (optimized images, fetch cache)", async () => {
    const dockerfile = await Bun.file(new URL("../apps/web/Dockerfile", import.meta.url)).text();
    const runtime = dockerfile.split(/^FROM /m).at(-1) ?? "";
    expect(runtime).toContain("USER bun");
    expect(runtime).toMatch(/^COPY --from=build --chown=bun:bun \/workspace\/apps\/web apps\/web$/m);
  });
  test("the optimized image cache has a size cap instead of half the server's free disk", () => {
    const cap = nextConfig.images?.maximumDiskCacheSize ?? 0;
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(2_000_000_000);
  });
  test("every host the import accepts is configured for next/image", () => {
    const rendered = (nextConfig.images?.remotePatterns ?? []).map((pattern) => (pattern as { hostname: string }).hostname).sort();
    expect(rendered).toEqual([...allowedImageHosts].sort());
  });
});

describe("trip update contract", () => {
  test("does not invent values for fields the caller left out", () => {
    expect(tripUpdateSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });
});

describe("website response headers", () => {
  test("forbid framing and restrict where content may load from", async () => {
    const rules = await nextConfig.headers?.() ?? [];
    const headers = Object.fromEntries(rules.flatMap((rule) => rule.headers).map((header) => [header.key.toLowerCase(), header.value]));
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
  });
  test("CSP allows Commons thumbnails", async () => {
    const rules = await nextConfig.headers?.() ?? [];
    const csp = rules.flatMap((rule) => rule.headers).find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("https://upload.wikimedia.org");
  });
});

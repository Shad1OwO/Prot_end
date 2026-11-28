import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApplication, type TourismApplication } from "../apps/api/src/app";

let tourism: TourismApplication;
let cookieHeader = "";
let csrf = "";
const request = (path: string, init: RequestInit = {}) => tourism.app.handle(new Request(`http://localhost:4000${path}`, init));
beforeAll(async () => { tourism = createApplication(); const response = await request("/api/v1/auth/development-session", { method: "POST", headers: { origin: "http://localhost:3000" } }); const body = await response.json() as { csrfToken: string }; csrf = body.csrfToken; cookieHeader = response.headers.getSetCookie().map((line) => line.split(";", 1)[0]).join("; "); });
afterAll(async () => tourism.close());

describe("API contracts", () => {
  test("serves localized catalog", async () => { const response = await request("/api/v1/destinations?locale=th&scope=thailand&limit=2"); const body = await response.json() as { items: Array<{ name: string }> }; expect(response.status).toBe(200); expect(body.items).toHaveLength(2); expect(body.items[0]?.name).toMatch(/[ก-๙]/); });
  test("shows places sent to the catalog import endpoint", async () => {
    const place = { slug: "test-eiffel-tower", scope: "worldwide", translations: { en: { name: "Eiffel Tower", shortDescription: "Iron lattice tower in Paris.", description: "Iron lattice tower on the Champ de Mars in Paris." }, th: { name: "หอไอเฟล", shortDescription: "หอคอยเหล็กในปารีส", description: "หอคอยเหล็กบนช็องเดอมาร์สในปารีส" } }, coordinates: { latitude: 48.8584, longitude: 2.2945 }, categorySlugs: ["city"], imageUrls: ["https://upload.wikimedia.org/wikipedia/commons/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg"] };
    const categoriesBefore = await (await request("/api/v1/categories?locale=en")).json() as Array<{ slug: string; destinationCount: number }>;
    const imported = await request("/api/v1/internal/catalog/imports", { method: "POST", headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY ?? "development-internal-key", "content-type": "application/json" }, body: JSON.stringify({ destinations: [place] }) });
    expect(imported.status).toBe(201);
    const list = await (await request("/api/v1/destinations?locale=th&scope=worldwide&query=" + encodeURIComponent("ไอเฟล") + "&limit=50")).json() as { items: Array<{ slug: string; name: string; primaryImage: { url: string } }> };
    expect(list.items.map((item) => item.slug)).toContain(place.slug);
    expect(list.items.find((item) => item.slug === place.slug)?.primaryImage.url).toBe(place.imageUrls[0]);
    const detail = await request(`/api/v1/destinations/${place.slug}?locale=en`);
    expect(detail.status).toBe(200);
    expect((await detail.json() as { name: string }).name).toBe("Eiffel Tower");
    const categoriesAfter = await (await request("/api/v1/categories?locale=en")).json() as Array<{ slug: string; destinationCount: number }>;
    const count = (rows: typeof categoriesBefore) => rows.find((row) => row.slug === "city")?.destinationCount ?? 0;
    expect(count(categoriesAfter)).toBe(count(categoriesBefore) + 1);
    // Sending the same slug again updates the place instead of adding a second one.
    await request("/api/v1/internal/catalog/imports", { method: "POST", headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY ?? "development-internal-key", "content-type": "application/json" }, body: JSON.stringify({ destinations: [{ ...place, translations: { ...place.translations, en: { ...place.translations.en, name: "Tour Eiffel" } } }] }) });
    const again = await (await request("/api/v1/destinations?locale=en&scope=worldwide&query=Tour%20Eiffel&limit=50")).json() as { items: Array<{ slug: string }> };
    expect(again.items.filter((item) => item.slug === place.slug)).toHaveLength(1);
  });
  test("rejects protected reads for guests", async () => { expect((await request("/api/v1/favorites")).status).toBe(401); });
  test("requires CSRF on authenticated writes", async () => { const id = "20000000-0000-4000-8000-000000000001"; expect((await request(`/api/v1/destinations/${id}/favorite`, { method: "PUT", headers: { origin: "http://localhost:3000", cookie: cookieHeader } })).status).toBe(403); expect((await request(`/api/v1/destinations/${id}/favorite`, { method: "PUT", headers: { origin: "http://localhost:3000", cookie: cookieHeader, "x-csrf-token": csrf } })).status).toBe(204); });
  test("completes catalog-bound recommendation", async () => { const created = await request("/api/v1/recommendations", { method: "POST", headers: { origin: "http://localhost:3000", cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" }, body: JSON.stringify({ prompt: "Quiet nature trip with mountain views", locale: "en", scope: "thailand", filters: { categorySlugs: ["nature"], travelerTypes: [] } }) }); const body = await created.json() as { job: { id: string } }; let result: { job: { status: string }; items: unknown[] } | undefined; for (let turn = 0; turn < 20; turn += 1) { await Promise.resolve(); const response = await request(`/api/v1/recommendations/${body.job.id}?locale=en`, { headers: { cookie: cookieHeader } }); result = await response.json() as typeof result; if (result?.job.status === "completed") break; } expect(created.status).toBe(202); expect(result?.job.status).toBe("completed"); expect(result?.items.length).toBeGreaterThan(0); });
});

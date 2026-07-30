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
  test("rejects protected reads for guests", async () => { expect((await request("/api/v1/favorites")).status).toBe(401); });
  test("requires CSRF on authenticated writes", async () => { const id = "20000000-0000-4000-8000-000000000001"; expect((await request(`/api/v1/destinations/${id}/favorite`, { method: "PUT", headers: { origin: "http://localhost:3000", cookie: cookieHeader } })).status).toBe(403); expect((await request(`/api/v1/destinations/${id}/favorite`, { method: "PUT", headers: { origin: "http://localhost:3000", cookie: cookieHeader, "x-csrf-token": csrf } })).status).toBe(204); });
  test("completes catalog-bound recommendation", async () => { const created = await request("/api/v1/recommendations", { method: "POST", headers: { origin: "http://localhost:3000", cookie: cookieHeader, "x-csrf-token": csrf, "content-type": "application/json" }, body: JSON.stringify({ prompt: "Quiet nature trip with mountain views", locale: "en", scope: "thailand", filters: { categorySlugs: ["nature"], travelerTypes: [] } }) }); const body = await created.json() as { job: { id: string } }; let result: { job: { status: string }; items: unknown[] } | undefined; for (let turn = 0; turn < 20; turn += 1) { await Promise.resolve(); const response = await request(`/api/v1/recommendations/${body.job.id}?locale=en`, { headers: { cookie: cookieHeader } }); result = await response.json() as typeof result; if (result?.job.status === "completed") break; } expect(created.status).toBe(202); expect(result?.job.status).toBe("completed"); expect(result?.items.length).toBeGreaterThan(0); });
});

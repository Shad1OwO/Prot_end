import { defineConfig, devices } from "@playwright/test";

export default defineConfig({ testDir: "./tests/e2e", timeout: 30_000, use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" }, webServer: [{ command: "bun run dev:api", url: "http://localhost:4000/health/live", reuseExistingServer: true }, { command: "bun run dev:web", url: "http://localhost:3000/en", reuseExistingServer: true }], projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }] });

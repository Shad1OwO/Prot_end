import { expect, test } from "@playwright/test";

test("browses localized public catalog", async ({ page }) => { await page.goto("/th"); await expect(page.locator("html")).toHaveAttribute("lang", "th"); await expect(page.getByRole("heading", { level: 1 })).toContainText("สวัสดี"); await page.waitForFunction(async () => { await document.fonts.ready; return [...document.images].every((image) => image.complete); }); await expect(page.locator(".hero-band")).toHaveScreenshot("thai-home-hero.png", { animations: "disabled", maxDiffPixelRatio: .03 }); await page.goto("/en/explore"); await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore destinations"); await expect(page.locator("article").first()).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); });
test("guest protected action opens sign in", async ({ page }) => { await page.goto("/en"); await page.locator("article").first().getByRole("button", { name: "Save" }).click(); await expect(page.getByRole("dialog")).toContainText("Sign in to continue"); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toBeHidden(); await page.reload(); await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused(); });
test("demo traveler creates a trip", async ({ page }) => { await page.goto("/en/login"); await page.getByRole("button", { name: "Continue with demo account" }).click(); await page.goto("/en/trips"); await page.getByRole("button", { name: "New trip" }).first().click(); await page.getByLabel("Trip name").fill("Playwright trip"); await page.getByRole("button", { name: "Create trip" }).click(); await expect(page.locator('input[value="Playwright trip"]')).toBeVisible(); });
test("hydrates system theme without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/th");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("สวัสดี");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(errors).toEqual([]);
});

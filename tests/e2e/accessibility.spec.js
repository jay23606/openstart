import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicViews = ["discover", "demo", "help", "architecture"];

for (const view of publicViews) {
  test(`${view} has no automatically detectable accessibility violations`, async ({ page }) => {
    await page.goto(`/?view=${view}`);
    await expect(page.locator("main h1")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("keyboard users can skip navigation and regain focus after a dialog", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#page-content")).toBeFocused();

  const organizer = page.getByRole("button", { name: "Organizer" });
  await organizer.focus();
  await organizer.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(organizer).toBeFocused();
});

test("mobile reflow, large text, reduced motion, and forced colors remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/?view=help");
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  await expect(page.getByRole("heading", { name: "How can we help?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).getPropertyValue("--motion-disabled"))).toBe("1");
});

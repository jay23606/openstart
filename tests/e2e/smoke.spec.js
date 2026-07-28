import { expect, test } from "@playwright/test";

test("public discovery and event details load without browser errors", async ({ page }) => {
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Great race days start in the open."})).toBeVisible();
  const eventButton=page.getByRole("button",{name:/View event/}).first();
  await expect(eventButton).toBeVisible();
  await eventButton.click();
  await expect(page.getByRole("button",{name:"Register now"})).toBeVisible();
  expect(errors).toEqual([]);
});

test("protected organizer navigation opens an accessible sign-in dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Organizer"}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading",{name:"Sign in to OpenStart"})).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("mobile navigation and content fit the viewport", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await expect(page.getByRole("navigation",{name:"Primary navigation"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("help guides can be searched and filtered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Help"}).click();
  await expect(page.getByRole("heading",{name:"How can we help?"})).toBeVisible();
  await page.getByLabel("Search help").fill("Stripe");
  await expect(page.locator("summary",{hasText:"Stripe payments and payouts"})).toBeVisible();
  await expect(page.locator("summary",{hasText:"QR passes and official results"})).not.toBeVisible();
  await page.getByRole("button",{name:"Runners",exact:true}).click();
  await expect(page.locator("[data-help-article]:not(.hidden)")).toHaveCount(4);
});

test("the public demo explains every feature without requiring setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Demo"}).click();
  await expect(page.getByRole("heading",{name:"See the whole platform without building a race first."})).toBeVisible();
  await expect(page.locator(".demo-grid article")).toHaveCount(12);
  await expect(page.getByText("No real payments",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Sign in to create showcase"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

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
  await expect(page.getByRole("button",{name:"Organizer"})).toBeFocused();
});

test("mobile navigation and content fit the viewport", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await expect(page.getByRole("navigation",{name:"Primary navigation"})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("theme toggle switches modes accessibly and remembers the choice", async ({ page }) => {
  await page.goto("/");
  const toggle=page.getByRole("button",{name:"Switch to dark mode"});
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(page.getByRole("button",{name:"Switch to light mode"})).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
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

test("the architecture paper is discoverable, deep-linkable, and responsive", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/?view=architecture");
  await expect(page.getByRole("heading",{name:"A simple platform for a complicated race day."})).toBeVisible();
  await expect(page.getByRole("figure",{name:/The client never receives provider secrets/})).toBeVisible();
  await expect(page.getByText("PAYMENT FLOW",{exact:true})).toBeVisible();
  await expect(page.locator(".domain-grid article")).toHaveCount(6);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.getByRole("button",{name:"Back to Help"}).click();
  await expect(page.getByRole("heading",{name:"How can we help?"})).toBeVisible();
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

test("dark mode keeps inverted information panels readable", async ({ page }) => {
  await page.goto("/");
  const darkToggle=page.getByRole("button",{name:"Switch to dark mode"});
  if(await darkToggle.isVisible()) await darkToggle.click();
  await page.getByRole("button",{name:"Demo"}).click();
  const panel=page.locator(".demo-hero aside");
  await expect(panel).toBeVisible();
  const colors=await panel.evaluate((element)=>{
    const style=getComputedStyle(element);
    return {background:style.backgroundColor,color:style.color};
  });
  expect(colors.background).not.toBe(colors.color);
  expect(colors.background).toBe("rgb(10, 73, 55)");
  expect(colors.color).toBe("rgb(255, 255, 255)");
});

test("the selected navigation tab survives a page reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button",{name:"Demo",exact:true}).click();
  await expect(page).toHaveURL(/\?view=demo$/);
  await expect(page.getByRole("heading",{name:"See the whole platform without building a race first.",exact:true})).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\?view=demo$/);
  await expect(page.getByRole("heading",{name:"See the whole platform without building a race first.",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Demo",exact:true})).toHaveClass(/nav-active/);
});

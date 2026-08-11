import { expect, test } from "@playwright/test";
import { FIXTURES } from "./supabase-test-env.mjs";

async function signIn(page, view, email) {
  await page.goto(`/?view=${view}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Sign in to OpenStart" })).toBeVisible();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(process.env.E2E_TEST_PASSWORD);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("organizer can see a seeded event and its confirmed runner", async ({ page }) => {
  await signIn(page, "dashboard", FIXTURES.organizerEmail);
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(FIXTURES.publishedEventName) }).click();
  await expect(page.getByRole("heading", { name: `${FIXTURES.publishedEventName} registrations` })).toBeVisible();
  await expect(page.getByText("E2E Runner", { exact: true })).toBeVisible();
  await expect(page.getByText(FIXTURES.runnerEmail, { exact: true })).toBeVisible();
});

test("runner can see and manage a seeded registration", async ({ page }) => {
  await signIn(page, "runner", FIXTURES.runnerEmail);
  await expect(page.getByRole("heading", { name: "My races" })).toBeVisible();
  await expect(page.getByText(FIXTURES.publishedEventName, { exact: true })).toBeVisible();
  await expect(page.getByText("confirmed", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("a stale organizer edit opens the conflict resolver", async ({ browser }) => {
  const first = await browser.newPage();
  const second = await browser.newPage();
  await signIn(first, "dashboard", FIXTURES.organizerEmail);
  await signIn(second, "dashboard", FIXTURES.organizerEmail);

  await first.getByRole("button", { name: new RegExp(FIXTURES.draftEventName) }).click();
  await second.getByRole("button", { name: new RegExp(FIXTURES.draftEventName) }).click();
  const firstName = first.getByLabel("Event name");
  const secondName = second.getByLabel("Event name");
  await firstName.fill(`${FIXTURES.draftEventName} A`);
  await secondName.fill(`${FIXTURES.draftEventName} B`);
  await first.getByRole("button", { name: "Save and continue" }).click();
  await expect(first.getByText("Event details saved.", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Save and continue" }).click();
  await expect(second.getByRole("heading", { name: "This event changed elsewhere" })).toBeVisible();
  await expect(second.getByRole("button", { name: "Reload latest saved" })).toBeVisible();

  await first.close();
  await second.close();
});

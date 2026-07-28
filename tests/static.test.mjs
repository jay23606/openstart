import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the static shell connects the app, stylesheet, manifest, and service worker", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.match(html, /<script type="module" src="app\.js\?v=4"><\/script>/);
  assert.match(html, /href="styles\.css\?v=4"/);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
});

test("all persisted features use the repository and server-side payment boundaries", async () => {
  const [app, data, checkout, webhook] = await Promise.all([
    read("app.js"),
    read("data.js"),
    read("supabase/functions/os-create-checkout/index.ts"),
    read("supabase/functions/os-stripe-webhook/index.ts"),
  ]);
  assert.match(app, /createEvent\(/);
  assert.match(app, /beginRegistration\(/);
  assert.match(data, /\.from\("os_events"\)/);
  assert.match(data, /\.from\("os_registrations"\)/);
  assert.match(checkout, /os_reserve_registration/);
  assert.match(checkout, /application_fee_amount/);
  assert.match(checkout, /idempotencyKey/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /payment_status: "paid"/);
});

test("no framework runtime is referenced by the application", async () => {
  const files = await Promise.all(["index.html", "app.js", "core.js", "data.js"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /(?:from\s+["'](?:next|react|vinext|vite)|@vite|__next)/i);
  assert.doesNotMatch(source, /\.tsx\b/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the static shell connects the app, stylesheet, manifest, and service worker", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.match(html, /<script type="module" src="app\.js\?v=1"><\/script>/);
  assert.match(html, /href="styles\.css\?v=1"/);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
});

test("all persisted features use the repository and payment boundaries", async () => {
  const [app, data, payments] = await Promise.all([
    read("app.js"), read("data.js"), read("payments.js"),
  ]);
  assert.match(app, /createEvent\(/);
  assert.match(app, /createRegistration\(/);
  assert.match(app, /paymentProvider\.createCheckout/);
  assert.match(data, /\.from\("os_events"\)/);
  assert.match(data, /\.from\("os_registrations"\)/);
  assert.match(payments, /status: Number\(amountCents\) === 0 \? "not_required" : "pending"/);
});

test("no framework runtime is referenced by the application", async () => {
  const files = await Promise.all(["index.html", "app.js", "core.js", "data.js"].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /(?:from\s+["'](?:next|react|vinext|vite)|@vite|__next)/i);
  assert.doesNotMatch(source, /\.tsx\b/i);
});

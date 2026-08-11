import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-auth",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e-auth/global-setup.mjs",
  globalTeardown: "./tests/e2e-auth/global-teardown.mjs",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    env: { ...process.env, PORT: "4174" },
  },
});

import test from "node:test";
import assert from "node:assert/strict";
import { testEnvironment } from "./e2e-auth/supabase-test-env.mjs";

test("authenticated test environment reports every missing secret", async () => {
  await assert.rejects(testEnvironment({}), /E2E_SUPABASE_URL.*E2E_SUPABASE_ANON_KEY.*E2E_SUPABASE_SERVICE_ROLE_KEY.*E2E_CONFIRM_PROJECT_REF.*E2E_TEST_PASSWORD/);
});

test("authenticated test environment requires explicit reset acknowledgement", async () => {
  await assert.rejects(testEnvironment({
    E2E_SUPABASE_URL: "https://isolated-tests.supabase.co",
    E2E_SUPABASE_ANON_KEY: "public",
    E2E_SUPABASE_SERVICE_ROLE_KEY: "private",
    E2E_CONFIRM_PROJECT_REF: "isolated-tests",
    E2E_TEST_PASSWORD: "test-password",
  }), /E2E_ALLOW_RESET=true/);
});

test("authenticated test environment checks the confirmed project ref", async () => {
  await assert.rejects(testEnvironment({
    E2E_SUPABASE_URL: "https://isolated-tests.supabase.co",
    E2E_SUPABASE_ANON_KEY: "public",
    E2E_SUPABASE_SERVICE_ROLE_KEY: "private",
    E2E_CONFIRM_PROJECT_REF: "wrong-project",
    E2E_TEST_PASSWORD: "test-password",
    E2E_ALLOW_RESET: "true",
  }), /does not match isolated-tests/);
});

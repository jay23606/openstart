import { access, rm } from "node:fs/promises";
import { cleanup, STATE_PATH, testEnvironment } from "./supabase-test-env.mjs";

export default async function globalTeardown() {
  try {
    await access(STATE_PATH);
  } catch {
    return;
  }
  const environment = await testEnvironment();
  try {
    await cleanup(environment);
  } finally {
    await rm(STATE_PATH, { force: true });
  }
}

import { seed, testEnvironment } from "./supabase-test-env.mjs";

export default async function globalSetup() {
  const environment = await testEnvironment();
  await seed(environment);
}

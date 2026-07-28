import Stripe from "npm:stripe@18.5.0";
import { adminClient, corsHeaders, json, requiredUser } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeKey
  ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() })
  : null;

const allowedReturnUrl = (value: unknown) => {
  const url = new URL(String(value));
  if (!["https://jay23606.github.io", "http://localhost:4173", "http://127.0.0.1:4173"].includes(url.origin)) {
    throw new Error("Return URL is not allowed");
  }
  return url.toString();
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!stripe) return json(request, { error: "Stripe sandbox has not been configured" }, 503);

  try {
    const user = await requiredUser(request);
    if (!user) return json(request, { error: "Sign in is required" }, 401);
    const body = await request.json();
    const returnUrl = allowedReturnUrl(body.returnUrl);
    const admin = adminClient();

    const { data: profile, error: profileError } = await admin
      .from("os_profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    let accountId = profile?.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        business_profile: { product_description: "Race registrations managed with OpenStart" },
        metadata: { openstart_user_id: user.id },
      }, { idempotencyKey: `openstart-account-${user.id}` });
      accountId = account.id;
      const { error } = await admin.from("os_profiles").upsert({
        id: user.id,
        display_name: user.user_metadata?.display_name || "",
        stripe_account_id: accountId,
      });
      if (error) throw error;
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: returnUrl,
      return_url: returnUrl,
      collection_options: { fields: "eventually_due", future_requirements: "include" },
    });
    return json(request, { url: link.url });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Stripe onboarding failed" }, 400);
  }
});


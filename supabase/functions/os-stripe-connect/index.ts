import { adminClient, assertAllowedUrl, corsHeaders, json, requiredUser, recordFunctionError } from "../_shared/common.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripeApiVersion = "2026-06-24.dahlia";
const recipientConfiguration = {
  capabilities: {
    stripe_balance: {
      stripe_transfers: { requested: true },
    },
  },
};

const stripeV2 = async (
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) => {
  if (!stripeKey) throw new Error("Stripe sandbox has not been configured");
  const response = await fetch(`https://api.stripe.com/v2/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/json",
      "Stripe-Version": stripeApiVersion,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `Stripe returned ${response.status}`;
    throw new Error(String(message));
  }
  return data;
};

const allowedReturnUrl = assertAllowedUrl;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!stripeKey) return json(request, { error: "Stripe sandbox has not been configured" }, 503);

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
      const account = await stripeV2("core/accounts", {
        contact_email: user.email,
        display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "OpenStart organizer",
        identity: {
          country: "US",
        },
        dashboard: "express",
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          recipient: recipientConfiguration,
        },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        metadata: { openstart_user_id: user.id },
      }, `openstart-account-v2-${user.id}`);
      accountId = account.id;
      const { error } = await admin.from("os_profiles").upsert({
        id: user.id,
        display_name: user.user_metadata?.display_name || "",
        stripe_account_id: accountId,
      });
      if (error) throw error;
    } else {
      await stripeV2(`core/accounts/${accountId}`, {
        configuration: {
          recipient: recipientConfiguration,
        },
      }, `openstart-recipient-v2-${user.id}`);
    }

    const link = await stripeV2("core/account_links", {
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          refresh_url: returnUrl,
          return_url: returnUrl,
          collection_options: {
            fields: "eventually_due",
            future_requirements: "include",
          },
        },
      },
    });
    return json(request, { url: link.url });
  } catch (error) {
    await recordFunctionError("os-stripe-connect",error);
    console.error("Stripe onboarding failed", error);
    return json(request, { error: error instanceof Error ? error.message : "Stripe onboarding failed" }, 400);
  }
});

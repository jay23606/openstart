import { createClient } from "npm:@supabase/supabase-js@2";

// Origins are configurable so a fork can run without editing source. Set the
// ALLOWED_ORIGINS secret to a comma-separated list; the first entry is the
// fallback CORS origin. The defaults keep the canonical deployment working.
const defaultOrigins = [
  "https://jay23606.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
export const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins);
export const primaryOrigin = [...allowedOrigins][0];

// Validate a caller-supplied return/redirect URL against the allowlist. Used by
// the checkout and Stripe Connect functions so the rule lives in one place.
export function assertAllowedUrl(value: unknown) {
  const url = new URL(String(value));
  if (!allowedOrigins.has(url.origin)) throw new Error("Return URL is not allowed");
  return url.toString();
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : primaryOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function optionalUserId(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const { data } = await client.auth.getUser();
  return data.user?.id || null;
}

export async function requiredUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds: number) {
  // Use the rightmost x-forwarded-for hop: that entry is appended by the trusted
  // edge proxy, whereas the leftmost is caller-controlled and can be spoofed to
  // land in a fresh bucket (or to poison another client's bucket) on every call.
  const forwardedChain=request.headers.get("x-forwarded-for")?.split(",").map((value)=>value.trim()).filter(Boolean);
  const forwarded=forwardedChain?.length ? forwardedChain[forwardedChain.length-1] : "unknown";
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(forwarded)));
  const fingerprint=Array.from(bytes.slice(0,12)).map((byte)=>byte.toString(16).padStart(2,"0")).join("");
  const {data,error}=await adminClient().rpc("os_check_rate_limit",{
    p_scope_key:`${scope}:${fingerprint}`,p_limit:limit,p_window_seconds:windowSeconds,
  });
  if(error) throw error;
  return data===true;
}

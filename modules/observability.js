const endpoint = "os-observability";
let client = null;
let sending = false;
const release = new URL(document.querySelector('script[src*="app.js"]')?.src || location.href).searchParams.get("v") || "unknown";
const environment = location.hostname === "jay23606.github.io" ? "production" : "development";

function normalize(reason) {
  if (reason instanceof Error) return { message: reason.message, errorName: reason.name };
  return { message: String(reason?.message || reason || "Unexpected browser error"), errorName: "Error" };
}

export async function captureException(reason, details = {}) {
  if (!client || sending || environment !== "production") return;
  sending = true;
  const normalized = normalize(reason);
  try {
    await client.functions.invoke(endpoint, { body: {
      source: "browser", severity: details.severity || "error",
      message: normalized.message, route: location.pathname,
      release, environment, occurredAt: new Date().toISOString(),
      metadata: { errorName: normalized.errorName, online: navigator.onLine,
        viewport: `${innerWidth}x${innerHeight}` },
    }});
  } catch { /* telemetry must never break the application */ }
  finally { sending = false; }
}

export function initObservability(supabaseClient) {
  client = supabaseClient;
  addEventListener("error", (event) => captureException(event.error || event.message, { severity: "fatal" }));
}

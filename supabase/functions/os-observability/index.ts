import { adminClient, corsHeaders, enforceRateLimit, json, optionalUserId } from "../_shared/common.ts";

const clean=(value:unknown,limit=500)=>String(value || "")
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[email]")
  .replace(/\b(?:sk|pk|re|whsec|sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g,"[credential]")
  .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,"[id]")
  .slice(0,limit);

async function fingerprint(value:string){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(bytes.slice(0,12)).map((byte)=>byte.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  try{
    if(!await enforceRateLimit(request,"observability",30,300)) return json(request,{accepted:false},202);
    const body=await request.json();
    const message=clean(body.message);
    if(!message) return json(request,{error:"A message is required"},400);
    const source=body.source==="edge" ? "edge" : body.source==="health" ? "health" : "browser";
    const severity=["info","warning","error","fatal"].includes(body.severity) ? body.severity : "error";
    const route=clean(String(body.route || "/").split(/[?#]/)[0],200);
    const release=clean(body.release || "unknown",100);
    const environment=clean(body.environment || "production",50);
    const metadata=body.metadata && typeof body.metadata==="object" ? {
      errorName:clean(body.metadata.errorName,100),
      online:Boolean(body.metadata.online),
      viewport:clean(body.metadata.viewport,30),
    } : {};
    const row={source,severity,message,route,release,environment,metadata,
      fingerprint:await fingerprint(`${source}:${message}:${route}`),
      user_id:await optionalUserId(request),
      occurred_at:new Date(body.occurredAt || Date.now()).toISOString()};
    const {error}=await adminClient().from("os_observability_events").insert(row);
    if(error) throw error;
    return json(request,{accepted:true},202);
  }catch(error){
    console.error("Observability ingestion failed",error);
    return json(request,{accepted:false},202);
  }
});

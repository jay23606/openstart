import { adminClient, corsHeaders, enforceRateLimit, json, optionalUserId } from "../_shared/common.ts";

const clean=(value:unknown,limit:number)=>String(value || "")
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[email removed]")
  .replace(/\b(?:sk|pk|re|whsec|sb_secret|sb_publishable)_[A-Za-z0-9_-]+\b/g,"[credential removed]")
  .replace(/\b(?:\d[ -]*?){13,19}\b/g,"[number removed]").trim().slice(0,limit);

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  try{
    if(!await enforceRateLimit(request,"feedback",5,300)) return json(request,{error:"Please wait before sending more feedback."},429);
    const body=await request.json();
    const category=["bug","confusing","idea","accessibility","other"].includes(body.category) ? body.category : "other";
    const message=clean(body.message,2000);
    if(message.length<20) return json(request,{error:"Please provide at least 20 characters."},400);
    const route=clean(String(body.route || "/").split(/[?#]/)[0],200);
    const {error}=await adminClient().from("os_feedback").insert({category,message,route,user_id:await optionalUserId(request)});
    if(error) throw error;
    return json(request,{submitted:true},201);
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Feedback could not be submitted"},400);
  }
});

import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const resendKey=Deno.env.get("RESEND_API_KEY");
const fromEmail=Deno.env.get("RESEND_FROM_EMAIL");
const siteUrl="https://jay23606.github.io/openstart/";
const escapeHtml=(value: unknown)=>String(value ?? "").replace(/[&<>"']/g,(character)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
})[character] || character);

async function ownedEvent(admin: ReturnType<typeof adminClient>, eventId: string, userId: string) {
  const { data, error }=await admin.from("os_events").select("id,name,organizer_id,results_published_at")
    .eq("id",eventId).single();
  if(error) throw error;
  if(data.organizer_id!==userId) throw new Error("You cannot manage results for this event");
  return data;
}

async function notifyResults(admin: ReturnType<typeof adminClient>, eventId: string, eventName: string) {
  if(!resendKey || !fromEmail) return {sent:0,failed:0,warning:"Email is not configured"};
  const {data,error}=await admin.from("os_results")
    .select("id,status,chip_time_ms,registration_id,os_registrations!inner(email,first_name,bib_number)")
    .eq("event_id",eventId).eq("published",true).is("notified_at",null).limit(50);
  if(error) throw error;
  let sent=0,failed=0;
  for(const result of data || []){
    const registration=result.os_registrations as unknown as Record<string,unknown>;
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{
      Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json",
      "Idempotency-Key":`openstart-result-${result.id}`,
    },body:JSON.stringify({
      from:fromEmail,to:[registration.email],subject:`Your result: ${eventName}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17211d">
        <h1 style="color:#0f6b4f">Your result is ready.</h1>
        <p>Hi ${escapeHtml(registration.first_name)}, results for <strong>${escapeHtml(eventName)}</strong> are published.</p>
        <p><strong>Bib:</strong> ${escapeHtml(registration.bib_number || "—")}<br><strong>Status:</strong> ${escapeHtml(result.status)}</p>
        <p><a href="${siteUrl}?results=${eventId}">View the official results</a></p>
      </div>`,
    })});
    if(response.ok){
      sent++;
      await admin.from("os_results").update({notified_at:new Date().toISOString()}).eq("id",result.id);
    }else failed++;
  }
  return {sent,failed,remaining:(data || []).length===50};
}

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  if(!await enforceRateLimit(request,"results",120,300)) return json(request,{error:"Too many result requests. Try again shortly."},429);
  try{
    const user=await requiredUser(request);
    if(!user) return json(request,{error:"Sign in is required"},401);
    const body=await request.json();
    const admin=adminClient();
    const event=await ownedEvent(admin,body.eventId,user.id);

    if(body.action==="save_many"){
      const rows=Array.isArray(body.results) ? body.results : [];
      if(!rows.length || rows.length>500) return json(request,{error:"Submit between 1 and 500 results"},400);
      const registrationIds=rows.map((row)=>row.registrationId);
      const {data:registrations,error}=await admin.from("os_registrations")
        .select("id,event_id,tier_id,wave_id,bib_number,first_name,last_name").in("id",registrationIds);
      if(error) throw error;
      const lookup=new Map((registrations || []).map((item)=>[item.id,item]));
      const upserts=rows.map((row)=>{
        const registration=lookup.get(row.registrationId);
        if(!registration || registration.event_id!==body.eventId) throw new Error("A result does not belong to this event");
        if(!["finisher","dnf","dns","dq"].includes(row.status)) throw new Error("Invalid result status");
        return {
          event_id:body.eventId,tier_id:registration.tier_id,registration_id:registration.id,
          wave_id:registration.wave_id,
          bib_number:registration.bib_number,first_name:registration.first_name,last_name:registration.last_name,
          division:row.division || null,status:row.status,
          gun_time_ms:row.gunTimeMs ?? null,chip_time_ms:row.chipTimeMs ?? null,
          splits:Array.isArray(row.splits) ? row.splits : [],note:row.note || "",
          published:Boolean(event.results_published_at),
          updated_at:new Date().toISOString(),
        };
      });
      const {data,error:upsertError}=await admin.from("os_results").upsert(upserts,{onConflict:"registration_id"}).select();
      if(upsertError) throw upsertError;
      return json(request,{saved:data?.length || 0});
    }

    if(body.action==="publish"){
      await admin.from("os_results").update({published:true,updated_at:new Date().toISOString()}).eq("event_id",body.eventId);
      await admin.from("os_events").update({results_published_at:new Date().toISOString()}).eq("id",body.eventId);
      const email=body.sendEmail ? await notifyResults(admin,body.eventId,event.name) : null;
      return json(request,{published:true,email});
    }

    if(body.action==="notify"){
      return json(request,{email:await notifyResults(admin,body.eventId,event.name)});
    }

    if(body.action==="unpublish"){
      await admin.from("os_results").update({published:false}).eq("event_id",body.eventId);
      await admin.from("os_events").update({results_published_at:null}).eq("id",body.eventId);
      return json(request,{published:false});
    }
    return json(request,{error:"Unknown action"},400);
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Results request failed"},400);
  }
});

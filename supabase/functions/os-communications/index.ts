import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const resendKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
const cronSecret = Deno.env.get("CAMPAIGN_CRON_SECRET");
const siteUrl = "https://jay23606.github.io/openstart/";
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const signEmail = async (email: string) => {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(cronSecret!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(email.toLowerCase()))));
};
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g,(character)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
})[character] || character);

type Recipient = { registrationId?: string; email: string; firstName: string };

const audienceRecipients = async (
  admin: ReturnType<typeof adminClient>, eventId: string, audience: Record<string, unknown>,
) => {
  const type = String(audience.type || "confirmed");
  if (type === "waitlist") {
    const { data, error } = await admin.from("os_waitlist").select("id,email,first_name")
      .eq("event_id",eventId).in("status",["waiting","invited"]);
    if (error) throw error;
    return (data || []).map((item)=>({email:item.email,firstName:item.first_name}));
  }
  let query = admin.from("os_registrations")
    .select("id,email,first_name,status,bib_number,checked_in_at,team_role,tier_id,team_id,wave_id")
    .eq("event_id",eventId);
  if (type === "confirmed" || type === "missing_bib" || type === "checked_in" || type === "not_checked_in" || type === "captains") query=query.eq("status","confirmed");
  if (type === "tier") query=query.eq("tier_id",audience.tierId);
  if (type === "team") query=query.eq("team_id",audience.teamId);
  if (type === "wave") query=query.eq("wave_id",audience.waveId).eq("status","confirmed");
  if (type === "captains") query=query.eq("team_role","captain");
  if (type === "missing_bib") query=query.is("bib_number",null);
  if (type === "checked_in") query=query.not("checked_in_at","is",null);
  if (type === "not_checked_in") query=query.is("checked_in_at",null);
  const { data, error } = await query;
  if (error) throw error;
  const unique = new Map<string,Recipient>();
  for (const item of data || []) unique.set(item.email.toLowerCase(),{registrationId:item.id,email:item.email,firstName:item.first_name});
  return [...unique.values()];
};

const sendCampaign = async (admin: ReturnType<typeof adminClient>, campaignId: string) => {
  if (!resendKey || !fromEmail) throw new Error("Resend is not configured");
  const { data: campaign, error } = await admin.from("os_campaigns")
    .select("*,os_events(name)").eq("id",campaignId).single();
  if (error) throw error;
  if (!["draft","scheduled","sending"].includes(campaign.status)) return;
  let { data: deliveries } = await admin.from("os_campaign_deliveries").select("*").eq("campaign_id",campaign.id);
  if (!deliveries?.length) {
    const recipients = await audienceRecipients(admin,campaign.event_id,campaign.audience);
    const { data: suppressions } = await admin.from("os_email_suppressions").select("email");
    const suppressed = new Set((suppressions || []).map((item)=>item.email.toLowerCase()));
    const rows = recipients.map((recipient)=>({
      campaign_id:campaign.id,registration_id:recipient.registrationId || null,email:recipient.email,
      status:campaign.message_type==="marketing" && suppressed.has(recipient.email.toLowerCase()) ? "suppressed" : "queued",
    }));
    if (rows.length) {
      const result = await admin.from("os_campaign_deliveries").insert(rows).select("*");
      if (result.error) throw result.error;
      deliveries=result.data;
    } else deliveries=[];
    await admin.from("os_campaigns").update({recipient_count:recipients.length,status:"sending"}).eq("id",campaign.id);
  } else await admin.from("os_campaigns").update({status:"sending"}).eq("id",campaign.id);

  const queued=(deliveries || []).filter((delivery)=>delivery.status==="queued").slice(0,50);
  for (const delivery of queued) {
    const registration = delivery.registration_id
      ? await admin.from("os_registrations").select("first_name").eq("id",delivery.registration_id).maybeSingle()
      : {data:null};
    const firstName=registration.data?.first_name || "runner";
    let html=String(campaign.html_body).replaceAll("{{first_name}}",escapeHtml(firstName))
      .replaceAll("{{event_name}}",escapeHtml(campaign.os_events?.name || ""));
    if (campaign.message_type==="marketing") {
      const token=await signEmail(delivery.email);
      html+=`<p style="margin-top:32px;font-size:11px;color:#66716b"><a href="${siteUrl}?unsubscribe=${encode(new TextEncoder().encode(delivery.email))}&token=${token}">Unsubscribe</a></p>`;
    }
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{
      Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json",
      "Idempotency-Key":`openstart-campaign-${campaign.id}-${delivery.id}`,
    },body:JSON.stringify({from:fromEmail,to:[delivery.email],subject:campaign.subject,html})});
    const result=await response.json().catch(()=>({}));
    await admin.from("os_campaign_deliveries").update(response.ok ? {
      status:"sent",provider_message_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    } : {status:"failed",error_message:result.message || "Send failed",updated_at:new Date().toISOString()}).eq("id",delivery.id);
  }
  const { data: counts }=await admin.from("os_campaign_deliveries").select("status").eq("campaign_id",campaign.id);
  const sent=(counts || []).filter((item)=>["sent","delivered"].includes(item.status)).length;
  const failed=(counts || []).filter((item)=>["failed","bounced","complained"].includes(item.status)).length;
  const remaining=(counts || []).filter((item)=>item.status==="queued").length;
  await admin.from("os_campaigns").update({
    sent_count:sent,failed_count:failed,status:remaining ? "sending" : "completed",
    completed_at:remaining ? null : new Date().toISOString(),
  }).eq("id",campaign.id);
};

Deno.serve(async (request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  if(!await enforceRateLimit(request,"communications",120,300)) return json(request,{error:"Too many communication requests. Try again shortly."},429);
  try{
    const body=await request.json();
    const admin=adminClient();
    if(body.action==="unsubscribe"){
      const email=new TextDecoder().decode(Uint8Array.from(atob(String(body.email).replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(String(body.email).length/4)*4,"=")),c=>c.charCodeAt(0)));
      if(!cronSecret || await signEmail(email)!==body.token) throw new Error("Unsubscribe link is invalid");
      await admin.from("os_email_suppressions").upsert({email:email.toLowerCase(),reason:"unsubscribe"});
      return json(request,{ok:true});
    }
    if(body.action==="process_due"){
      if(!cronSecret || request.headers.get("x-cron-secret")!==cronSecret) return json(request,{error:"Invalid scheduler credentials"},401);
      const {data:campaigns}=await admin.from("os_campaigns").select("id").in("status",["scheduled","sending"]).lte("scheduled_at",new Date().toISOString()).limit(10);
      for(const campaign of campaigns || []) await sendCampaign(admin,campaign.id);
      return json(request,{processed:campaigns?.length || 0});
    }
    const user=await requiredUser(request);
    if(!user) return json(request,{error:"Sign in is required"},401);
    const {data:event}=await admin.from("os_events").select("id,organizer_id,name").eq("id",body.eventId).single();
    if(event.organizer_id!==user.id) return json(request,{error:"Only the organizer can send campaigns"},403);
    if(body.action==="preview"){
      const recipients=await audienceRecipients(admin,event.id,body.audience || {});
      return json(request,{count:recipients.length,sample:recipients.slice(0,5).map((item)=>item.email)});
    }
    if(body.action==="test"){
      if(!resendKey || !fromEmail) throw new Error("Resend is not configured");
      const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json"},body:JSON.stringify({
        from:fromEmail,to:[user.email],subject:`[Test] ${body.subject}`,html:String(body.htmlBody).replaceAll("{{first_name}}",escapeHtml(user.user_metadata?.display_name || "runner")).replaceAll("{{event_name}}",escapeHtml(event.name)),
      })});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.message || "Test email failed");
      return json(request,{sent:true});
    }
    if(body.action==="create"){
      const status=body.sendNow ? "scheduled" : body.scheduledAt ? "scheduled" : "draft";
      const scheduledAt=body.sendNow ? new Date().toISOString() : body.scheduledAt || null;
      const {data:campaign,error}=await admin.from("os_campaigns").insert({
        event_id:event.id,organizer_id:user.id,name:body.name,subject:body.subject,html_body:body.htmlBody,
        audience:body.audience || {type:"confirmed"},message_type:body.messageType || "transactional",status,scheduled_at:scheduledAt,
      }).select().single();
      if(error) throw error;
      if(body.sendNow) await sendCampaign(admin,campaign.id);
      return json(request,{campaignId:campaign.id,status});
    }
    return json(request,{error:"Unknown communications action"},400);
  }catch(error){return json(request,{error:error instanceof Error?error.message:"Communications failed"},400);}
});

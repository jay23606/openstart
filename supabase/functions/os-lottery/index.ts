import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const stripeKey=Deno.env.get("STRIPE_SECRET_KEY");
const resendKey=Deno.env.get("RESEND_API_KEY");
const emailFrom=Deno.env.get("RESEND_FROM_EMAIL");
const cronSecret=Deno.env.get("CAMPAIGN_CRON_SECRET");
const stripe=stripeKey ? new Stripe(stripeKey,{httpClient:Stripe.createFetchHttpClient()}) : null;
const siteUrl="https://jay23606.github.io/openstart/";
const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,(character)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;",
}[character] || character));

const userClient=(request:Request)=>createClient(
  Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,
  {global:{headers:{Authorization:request.headers.get("Authorization") || ""}},auth:{persistSession:false}},
);

async function sendInvitation(application:Record<string,unknown>,eventName:string) {
  if(!resendKey || !emailFrom) return {skipped:true};
  const expires=new Date(String(application.invitation_expires_at));
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json",
      "Idempotency-Key":`openstart-lottery-${application.id}-${expires.getTime()}`},
    body:JSON.stringify({
      from:emailFrom,to:[application.email],
      subject:`You were selected: ${eventName}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17211d">
        <h1 style="color:#0f6b4f">Your name was drawn.</h1>
        <p>Hi ${escapeHtml(application.first_name)}, you were selected for <strong>${escapeHtml(eventName)}</strong>.</p>
        <p>Sign in to OpenStart and complete registration before <strong>${escapeHtml(expires.toLocaleString("en-US",{dateStyle:"long",timeStyle:"short"}))}</strong>.</p>
        <p><a href="${siteUrl}" style="background:#0f6b4f;color:white;padding:14px 20px;text-decoration:none;border-radius:6px;display:inline-block">Complete registration</a></p>
        <p>If the deadline passes, the place is automatically offered to the next runner.</p>
      </div>`,
    }),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result?.message || "Lottery invitation email failed");
  return result;
}

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  const admin=adminClient();
  try{
    const body=await request.json();
    const action=String(body.action || "");

    if(action==="process_due"){
      if(!cronSecret || request.headers.get("x-cron-secret")!==cronSecret) return json(request,{error:"Unauthorized"},401);
      const {data,error}=await admin.rpc("os_process_lottery_expirations");
      if(error) throw error;
      let sent=0;
      let failed=0;
      for(const promoted of data || []){
        try{
          await sendInvitation(promoted,promoted.event_name);
          sent+=1;
        }catch(error){
          failed+=1;
          console.error("Promoted lottery invitation email failed",error);
        }
      }
      return json(request,{expiredProcessed:true,promoted:(data || []).length,emailsSent:sent,emailsFailed:failed});
    }

    const user=await requiredUser(request);
    if(!user) return json(request,{error:"Sign in is required"},401);
    if(!await enforceRateLimit(request,`lottery-${action}`,20,300)) return json(request,{error:"Too many lottery requests"},429);

    if(action==="draw"){
      const client=userClient(request);
      const {data:drawId,error}=await client.rpc("os_run_lottery_draw",{p_event_id:body.eventId});
      if(error) throw error;
      const {data:event,error:eventError}=await admin.from("os_events").select("name,organizer_id")
        .eq("id",body.eventId).eq("organizer_id",user.id).single();
      if(eventError) throw eventError;
      const {data:selected,error:selectedError}=await admin.from("os_lottery_applications")
        .select("id,email,first_name,invitation_expires_at").eq("event_id",body.eventId)
        .eq("status","selected").eq("invitation_status","offered");
      if(selectedError) throw selectedError;
      let sent=0;
      let failed=0;
      for(const application of selected || []){
        try{
          await sendInvitation(application,event.name);
          sent+=1;
        }catch(error){
          failed+=1;
          console.error("Lottery invitation email failed",error);
        }
      }
      return json(request,{drawId,selected:(selected || []).length,emailsSent:sent,emailsFailed:failed});
    }

    if(action==="checkout"){
      if(!stripe) throw new Error("Stripe sandbox has not been configured");
      const idempotencyKey=String(body.idempotencyKey || "");
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)){
        throw new Error("A valid idempotency key is required");
      }
      const client=userClient(request);
      const {data:rows,error}=await client.rpc("os_reserve_lottery_registration",{
        p_application_id:body.applicationId,p_emergency_contact:body.emergencyContact,
        p_idempotency_key:idempotencyKey,
      });
      if(error) throw error;
      const reservation=rows?.[0];
      if(!reservation) throw new Error("Lottery registration could not be reserved");
      const {error:answersError}=await admin.rpc("os_save_registration_answers",{
        p_registration_id:reservation.registration_id,
        p_answers:Array.isArray(body.answers) ? body.answers : [],
        p_waiver_accepted:body.waiverAccepted===true,
        p_waiver_version:body.waiverVersion || null,
      });
      if(answersError) throw answersError;
      if(reservation.amount_cents===0){
        await admin.rpc("os_confirm_lottery_registration",{p_registration_id:reservation.registration_id});
        return json(request,{status:"confirmed",registrationId:reservation.registration_id});
      }
      if(!reservation.stripe_account_id) throw new Error("The organizer has not connected Stripe");
      const successUrl=new URL(siteUrl);successUrl.searchParams.set("payment","success");
      const cancelUrl=new URL(siteUrl);cancelUrl.searchParams.set("payment","cancelled");
      const fee=Math.round(reservation.amount_cents*reservation.platform_fee_bps/10000);
      const session=await stripe.checkout.sessions.create({
        mode:"payment",customer_email:user.email,client_reference_id:reservation.registration_id,
        success_url:successUrl.toString(),cancel_url:cancelUrl.toString(),
        expires_at:Math.min(
          Math.floor(new Date(reservation.invitation_expires_at).getTime()/1000),
          Math.floor(Date.now()/1000)+24*60*60,
        ),
        line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:reservation.amount_cents,
          product_data:{name:`${reservation.event_name} — ${reservation.tier_name}`}}}],
        payment_intent_data:{application_fee_amount:fee,transfer_data:{destination:reservation.stripe_account_id},
          metadata:{openstart_registration_id:reservation.registration_id,openstart_lottery_application_id:String(body.applicationId)}},
        metadata:{openstart_registration_id:reservation.registration_id,openstart_lottery_application_id:String(body.applicationId)},
      },{idempotencyKey});
      await admin.from("os_registrations").update({stripe_checkout_session_id:session.id})
        .eq("id",reservation.registration_id);
      return json(request,{status:"checkout",registrationId:reservation.registration_id,checkoutUrl:session.url});
    }

    return json(request,{error:"Unknown lottery action"},400);
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Lottery action failed"},400);
  }
});

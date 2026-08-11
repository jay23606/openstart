import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

const compactError=(value:unknown)=>String(value || "").slice(0,500);

async function platformAdmin(admin:ReturnType<typeof adminClient>,userId:string) {
  const {data,error}=await admin.from("os_platform_admins").select("user_id,role,active")
    .eq("user_id",userId).eq("active",true).maybeSingle();
  if(error) throw error;
  return data;
}

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  const user=await requiredUser(request);
  if(!user) return json(request,{error:"Sign in is required"},401);
  if(!await enforceRateLimit(request,"platform-admin",120,300)) return json(request,{error:"Too many operator requests"},429);
  const admin=adminClient();
  try{
    const access=await platformAdmin(admin,user.id);
    const body=await request.json();
    if(!access) return body.action==="access"
      ? json(request,{allowed:false})
      : json(request,{error:"Platform operator access is required"},403);
    if(body.action==="access") return json(request,{allowed:true,role:access.role});

    if(body.action==="overview"){
      const query=String(body.query || "").trim().toLowerCase().slice(0,100);
      const [
        {data:events,error:eventError},{data:registrations,error:registrationError},
        {data:profiles,error:profileError},{data:failedDeliveries,error:deliveryError},
        {data:providerEvents,error:providerError},{data:notes,error:noteError},
        {data:settings,error:settingsError},{data:counterDrift,error:counterError},
        {data:scaleMetrics,error:scaleMetricsError},{data:observability,error:observabilityError},
      ]=await Promise.all([
        admin.from("os_events").select("id,name,status,starts_at,organizer_id,platform_fee_bps,platform_suspended_at,platform_suspension_reason,created_at")
          .order("created_at",{ascending:false}).limit(200),
        admin.from("os_registrations").select("id,event_id,status,payment_status,amount_cents,stripe_checkout_session_id,stripe_payment_intent_id,created_at")
          .order("created_at",{ascending:false}).limit(1000),
        admin.from("os_profiles").select("id,display_name,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,created_at")
          .order("created_at",{ascending:false}).limit(300),
        admin.from("os_campaign_deliveries").select("id,email,status,error_message,updated_at,campaign_id")
          .in("status",["failed","bounced","complained"]).order("updated_at",{ascending:false}).limit(50),
        admin.from("os_provider_events").select("*").order("received_at",{ascending:false}).limit(100),
        admin.from("os_platform_support_notes").select("*").order("created_at",{ascending:false}).limit(100),
        admin.from("os_platform_settings").select("*").eq("singleton",true).single(),
        admin.rpc("os_reconcile_capacity_counters",{p_repair:false}),
        admin.rpc("os_platform_scale_metrics"),
        admin.from("os_observability_events").select("id,source,severity,fingerprint,message,route,release,environment,received_at")
          .order("received_at",{ascending:false}).limit(100),
      ]);
      for(const error of [eventError,registrationError,profileError,deliveryError,providerError,noteError,settingsError,counterError,scaleMetricsError,observabilityError]) if(error) throw error;
      const users=[]; let page=1;
      while(page<=3){
        const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
        if(error) throw error;
        users.push(...data.users.map((item)=>({id:item.id,email:item.email || "",created_at:item.created_at,last_sign_in_at:item.last_sign_in_at})));
        if(data.users.length<200) break;
        page+=1;
      }
      const eventMap=new Map((events || []).map((item)=>[item.id,item]));
      const organizerRows=users.map((item)=>{
        const profile=(profiles || []).find((entry)=>entry.id===item.id);
        const owned=(events || []).filter((event)=>event.organizer_id===item.id);
        return {...item,...profile,event_count:owned.length,suspended_event_count:owned.filter((event)=>event.platform_suspended_at).length};
      }).filter((item)=>!query || `${item.email} ${item.display_name}`.toLowerCase().includes(query));
      const suspicious=(registrations || []).filter((item)=>
        (item.amount_cents>0 && item.payment_status==="paid" && !item.stripe_payment_intent_id)
        || (item.amount_cents>0 && item.status==="confirmed" && item.payment_status!=="paid")
        || (item.payment_status==="pending" && Date.now()-new Date(item.created_at).getTime()>60*60*1000)
      ).slice(0,100).map((item)=>({...item,event_name:eventMap.get(item.event_id)?.name || "Unknown event"}));
      return json(request,{
        role:access.role,settings,
        metrics:{...(scaleMetrics || {}),counterDrift:(counterDrift || []).length,
          recentErrors:(observability || []).filter((item)=>item.severity==="error" || item.severity==="fatal").length},
        organizers:organizerRows.filter((item)=>item.event_count>0).slice(0,100),
        events:(events || []).filter((item)=>!query || item.name.toLowerCase().includes(query)
          || organizerRows.some((owner)=>owner.id===item.organizer_id && `${owner.email} ${owner.display_name}`.toLowerCase().includes(query))),
        reconciliation:suspicious,counterDrift,failedDeliveries,providerEvents,observability,notes,
      });
    }

    if(body.action==="suspend_event" || body.action==="restore_event"){
      if(access.role!=="owner") return json(request,{error:"Owner access is required"},403);
      const suspended=body.action==="suspend_event";
      const reason=compactError(body.reason).trim();
      if(suspended && reason.length<4) throw new Error("A suspension reason is required");
      const {data,error}=await admin.from("os_events").update({
        platform_suspended_at:suspended ? new Date().toISOString() : null,
        platform_suspension_reason:suspended ? reason : null,
      }).eq("id",body.eventId).select("id,name,platform_suspended_at").single();
      if(error) throw error;
      await admin.from("os_audit_log").insert({event_id:data.id,actor_id:user.id,
        action:suspended ? "platform_suspend" : "platform_restore",table_name:"os_events",
        record_id:data.id,new_data:{reason:suspended ? reason : null}});
      return json(request,{event:data});
    }

    if(body.action==="update_fees"){
      if(access.role!=="owner" && access.role!=="finance") return json(request,{error:"Finance access is required"},403);
      const fee=Number(body.feeBps);
      if(!Number.isInteger(fee) || fee<0 || fee>2500) throw new Error("Fee must be between 0% and 25%");
      if(body.eventId){
        const {error}=await admin.from("os_events").update({platform_fee_bps:fee}).eq("id",body.eventId);
        if(error) throw error;
        await admin.from("os_audit_log").insert({event_id:body.eventId,actor_id:user.id,action:"platform_fee_update",
          table_name:"os_events",record_id:body.eventId,new_data:{platform_fee_bps:fee}});
      }else{
        const {error}=await admin.from("os_platform_settings").update({
          default_platform_fee_bps:fee,updated_by:user.id,updated_at:new Date().toISOString(),
        }).eq("singleton",true);
        if(error) throw error;
      }
      return json(request,{saved:true});
    }

    if(body.action==="add_note"){
      const note={author_id:user.id,event_id:body.eventId || null,organizer_id:body.organizerId || null,
        body:compactError(body.note).trim()};
      const {data,error}=await admin.from("os_platform_support_notes").insert(note).select().single();
      if(error) throw error;
      return json(request,{note:data});
    }
    return json(request,{error:"Unknown platform action"},400);
  }catch(error){
    // Supabase/PostgREST rejects with plain objects, not Error instances, so the
    // real cause (e.g. an undefined column) was collapsing into the generic text.
    // Surface the underlying message when there is one.
    const message=error instanceof Error ? error.message
      : (error && typeof error==="object" && "message" in error && (error as {message?:unknown}).message)
        ? String((error as {message:unknown}).message)
        : "Platform operation failed";
    return json(request,{error:message},400);
  }
});


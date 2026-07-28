import { adminClient, corsHeaders, json, requiredUser } from "../_shared/common.ts";

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  try{
    const user=await requiredUser(request);
    if(!user) return json(request,{error:"Sign in is required"},401);
    const body=await request.json();
    const admin=adminClient();
    const {data:event,error:eventError}=await admin.from("os_events").select("id,organizer_id").eq("id",body.eventId).single();
    if(eventError) throw eventError;
    const organizer=event.organizer_id===user.id;

    if(body.action==="assign_self"){
      const {data:registration,error}=await admin.from("os_registrations")
        .select("id,event_id,participant_user_id,email,tier_id").eq("id",body.registrationId).single();
      if(error) throw error;
      if(registration.event_id!==body.eventId || (registration.participant_user_id!==user.id && registration.email.toLowerCase()!==user.email?.toLowerCase())) throw new Error("You cannot change this registration");
      const {data:wave,error:waveError}=await admin.from("os_waves").select("*").eq("id",body.waveId).single();
      if(waveError) throw waveError;
      if(!wave.self_select || (wave.selection_closes_at && new Date(wave.selection_closes_at)<=new Date())) throw new Error("Wave selection is closed");
      const {error:assignError}=await admin.rpc("os_assign_registration_wave",{p_registration_id:registration.id,p_wave_id:wave.id,p_estimated_pace_seconds:body.estimatedPaceSeconds || null});
      if(assignError) throw assignError;
      return json(request,{assigned:true});
    }

    if(!organizer) return json(request,{error:"Organizer access is required"},403);
    if(body.action==="assign"){
      const ids=Array.isArray(body.registrationIds) ? body.registrationIds : [];
      for(const id of ids){
        const {error}=await admin.rpc("os_assign_registration_wave",{p_registration_id:id,p_wave_id:body.waveId,p_estimated_pace_seconds:null});
        if(error) throw error;
      }
      return json(request,{assigned:ids.length});
    }
    if(body.action==="assign_bibs"){
      const {data:wave,error}=await admin.from("os_waves").select("*").eq("id",body.waveId).eq("event_id",body.eventId).single();
      if(error) throw error;
      if(!wave.bib_start || !wave.bib_end) throw new Error("Configure a bib range for this wave");
      const {data:registrations,error:registrationError}=await admin.from("os_registrations").select("id")
        .eq("wave_id",wave.id).eq("status","confirmed").order("created_at");
      if(registrationError) throw registrationError;
      if((registrations || []).length>wave.bib_end-wave.bib_start+1) throw new Error("The bib range is too small");
      let bib=wave.bib_start;
      for(const registration of registrations || []) await admin.from("os_registrations").update({bib_number:String(bib++)}).eq("id",registration.id);
      return json(request,{assigned:registrations?.length || 0});
    }
    if(body.action==="start"){
      const startedAt=body.startedAt || new Date().toISOString();
      const {error}=await admin.from("os_waves").update({gun_started_at:startedAt}).eq("id",body.waveId).eq("event_id",body.eventId);
      if(error) throw error;
      return json(request,{startedAt});
    }
    return json(request,{error:"Unknown action"},400);
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Wave request failed"},400);
  }
});

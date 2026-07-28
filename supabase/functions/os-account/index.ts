import { adminClient, corsHeaders, enforceRateLimit, json, requiredUser } from "../_shared/common.ts";

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  if(!await enforceRateLimit(request,"account",30,300)) return json(request,{error:"Too many account requests. Try again shortly."},429);
  try{
    const body=await request.json();
    const admin=adminClient();
    if(body.action==="health"){
      const started=Date.now();
      const {error}=await admin.from("os_events").select("id",{head:true,count:"exact"}).limit(1);
      return json(request,{
        status:error ? "degraded" : "operational",database:!error,
        stripeConfigured:Boolean(Deno.env.get("STRIPE_SECRET_KEY")),
        emailConfigured:Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")),
        responseMs:Date.now()-started,checkedAt:new Date().toISOString(),
      },error ? 503 : 200);
    }
    const user=await requiredUser(request);
    if(!user) return json(request,{error:"Sign in is required"},401);
    if(body.action==="export"){
      const email=user.email || "";
      const [profile,registrations,volunteers,teams,campaigns]=await Promise.all([
        admin.from("os_profiles").select("*").eq("id",user.id).maybeSingle(),
        admin.from("os_registrations").select("*,os_events(name),os_event_tiers(name),os_results(*)").or(`participant_user_id.eq.${user.id},email.ilike.${email}`),
        admin.from("os_volunteer_signups").select("*,os_volunteer_shifts(*,os_volunteer_roles(name,os_events(name)))").or(`volunteer_user_id.eq.${user.id},email.ilike.${email}`),
        admin.from("os_teams").select("*,os_events(name)").eq("captain_user_id",user.id),
        admin.from("os_campaigns").select("*").eq("organizer_id",user.id),
      ]);
      for(const result of [profile,registrations,volunteers,teams,campaigns]) if(result.error) throw result.error;
      return json(request,{exportedAt:new Date().toISOString(),account:{id:user.id,email:user.email,createdAt:user.created_at},profile:profile.data,registrations:registrations.data,volunteerSignups:volunteers.data,captainTeams:teams.data,campaigns:campaigns.data});
    }
    if(body.action==="delete"){
      const {count,error:eventError}=await admin.from("os_events").select("id",{head:true,count:"exact"}).eq("organizer_id",user.id);
      if(eventError) throw eventError;
      if((count || 0)>0) return json(request,{error:"Organizer accounts with events cannot be deleted. Export your data and contact support to transfer or remove those events."},409);
      const suffix=user.id.slice(0,8);
      await admin.from("os_registrations").update({
        participant_user_id:null,first_name:"Deleted",last_name:"Runner",
        email:`deleted+${suffix}@invalid.openstart`,emergency_contact:"Removed by account deletion",
      }).or(`participant_user_id.eq.${user.id},email.ilike.${user.email || ""}`);
      await admin.from("os_volunteer_signups").update({
        volunteer_user_id:null,first_name:"Deleted",last_name:"Volunteer",
        email:`deleted-volunteer+${suffix}@invalid.openstart`,phone:"",emergency_contact:"",notes:"",
      }).or(`volunteer_user_id.eq.${user.id},email.ilike.${user.email || ""}`);
      const {error}=await admin.auth.admin.deleteUser(user.id);
      if(error) throw error;
      return json(request,{deleted:true});
    }
    return json(request,{error:"Unknown action"},400);
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Account request failed"},400);
  }
});

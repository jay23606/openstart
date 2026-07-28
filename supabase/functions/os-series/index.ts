import { adminClient, corsHeaders, enforceRateLimit, json, optionalUserId } from "../_shared/common.ts";

type Standing={
  key:string;firstName:string;lastName:string;events:Set<string>;points:number;
  wins:number;bestFinish:number;teamNames:Set<string>;
};

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST") return json(request,{error:"Method not allowed"},405);
  if(!await enforceRateLimit(request,"series",120,300)) return json(request,{error:"Too many standings requests. Try again shortly."},429);
  try{
    const body=await request.json();
    if(body.action!=="standings") return json(request,{error:"Unknown action"},400);
    const admin=adminClient();
    const userId=await optionalUserId(request);
    const {data:series,error:seriesError}=await admin.from("os_series").select("*").eq("id",body.seriesId).single();
    if(seriesError) throw seriesError;
    if(series.status!=="published" && series.organizer_id!==userId) return json(request,{error:"Series was not found"},404);
    const {data:links,error:linkError}=await admin.from("os_series_events").select("event_id,points_multiplier,sort_order,os_events(name,starts_at,status)").eq("series_id",series.id).order("sort_order");
    if(linkError) throw linkError;
    const eventIds=(links || []).map((link)=>link.event_id);
    if(!eventIds.length) return json(request,{individual:[],teams:[],events:[]});
    const [{data:results,error:resultError},{data:registrations,error:registrationError}]=await Promise.all([
      admin.from("os_results").select("id,event_id,tier_id,registration_id,status,chip_time_ms,gun_time_ms").in("event_id",eventIds).eq("published",true),
      admin.from("os_registrations").select("id,event_id,email,first_name,last_name,team_id,os_teams(name)").in("event_id",eventIds),
    ]);
    if(resultError) throw resultError;
    if(registrationError) throw registrationError;
    const registrationsById=new Map((registrations || []).map((item)=>[item.id,item]));
    const multiplierByEvent=new Map((links || []).map((link)=>[link.event_id,Number(link.points_multiplier)]));
    const schedules=Array.isArray(series.points_schedule) ? series.points_schedule.map(Number) : [];
    const grouped=new Map<string,Array<Record<string,any>>>();
    for(const result of results || []){
      if(result.status!=="finisher") continue;
      const key=`${result.event_id}:${result.tier_id}`;
      if(!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key)!.push(result);
    }
    const standings=new Map<string,Standing>();
    for(const group of grouped.values()){
      group.sort((a,b)=>(a.chip_time_ms ?? a.gun_time_ms ?? Infinity)-(b.chip_time_ms ?? b.gun_time_ms ?? Infinity));
      group.forEach((result,index)=>{
        const registration=registrationsById.get(result.registration_id);
        if(!registration) return;
        const key=String(registration.email).trim().toLowerCase();
        if(!standings.has(key)) standings.set(key,{key,firstName:registration.first_name,lastName:registration.last_name,events:new Set(),points:0,wins:0,bestFinish:Infinity,teamNames:new Set()});
        const standing=standings.get(key)!;
        const place=index+1;
        const base=schedules[index] ?? series.participation_points;
        standing.points+=Math.round(base*(multiplierByEvent.get(result.event_id) || 1));
        standing.events.add(result.event_id);
        if(place===1) standing.wins++;
        standing.bestFinish=Math.min(standing.bestFinish,place);
        const team=registration.os_teams as unknown as {name?:string}|null;
        if(team?.name) standing.teamNames.add(team.name);
      });
    }
    const tie=series.tie_breaker;
    const individual=[...standings.values()].sort((a,b)=>b.points-a.points ||
      (tie==="most_events" ? b.events.size-a.events.size : tie==="best_finish" ? a.bestFinish-b.bestFinish : b.wins-a.wins) ||
      a.lastName.localeCompare(b.lastName)).map((standing,index)=>({
        rank:index+1,firstName:standing.firstName,lastName:standing.lastName,points:standing.points,
        eventsCompleted:standing.events.size,eligible:standing.events.size>=series.minimum_events,
        wins:standing.wins,bestFinish:Number.isFinite(standing.bestFinish) ? standing.bestFinish : null,
        teams:[...standing.teamNames],
      }));
    const teamMap=new Map<string,{points:number,members:Set<string>,events:Set<string>}>();
    for(const standing of standings.values()) for(const name of standing.teamNames){
      if(!teamMap.has(name)) teamMap.set(name,{points:0,members:new Set(),events:new Set()});
      const team=teamMap.get(name)!;team.points+=standing.points;team.members.add(standing.key);
      standing.events.forEach((eventId)=>team.events.add(eventId));
    }
    const teams=[...teamMap.entries()].sort((a,b)=>b[1].points-a[1].points).map(([name,team],index)=>({
      rank:index+1,name,points:team.points,members:team.members.size,eventsCompleted:team.events.size,
    }));
    return json(request,{individual,teams,events:links,minimumEvents:series.minimum_events,tieBreaker:tie});
  }catch(error){
    return json(request,{error:error instanceof Error ? error.message : "Series standings failed"},400);
  }
});

import { configured, supabase } from "./core.js?v=30";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js?v=30";

export const DEMO_ORGANIZER_ID = "00000000-0000-0000-0000-000000000001";

const seedEvents = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    organizer_id: DEMO_ORGANIZER_ID,
    slug: "harbor-half",
    name: "Harbor Half & 5K",
    description: "A fast waterfront course, neighborhood cheer zones, and a finish-line festival for every pace.",
    starts_at: "2026-10-18T12:00:00.000Z",
    location_name: "Baltimore, Maryland",
    status: "published",
    os_event_tiers: [
      { id: "21111111-1111-4111-8111-111111111111", name: "Half Marathon", distance_label: "13.1 miles", price_cents: 6500, capacity: 800 },
      { id: "21111111-1111-4111-8111-111111111112", name: "Community 5K", distance_label: "3.1 miles", price_cents: 3000, capacity: 500 },
    ],
  },
  {
    id: "11111111-1111-4111-8111-111111111112",
    organizer_id: DEMO_ORGANIZER_ID,
    slug: "blue-ridge-trail-day",
    name: "Blue Ridge Trail Day",
    description: "A welcoming trail gathering with two distances, generous cutoffs, and a leave-no-trace promise.",
    starts_at: "2026-11-07T13:00:00.000Z",
    location_name: "Shenandoah, Virginia",
    status: "published",
    os_event_tiers: [
      { id: "21111111-1111-4111-8111-111111111113", name: "Ridge 25K", distance_label: "25 kilometers", price_cents: 7200, capacity: 240 },
      { id: "21111111-1111-4111-8111-111111111114", name: "Valley 10K", distance_label: "10 kilometers", price_cents: 4200, capacity: 320 },
    ],
  },
  {
    id: "11111111-1111-4111-8111-111111111113",
    organizer_id: DEMO_ORGANIZER_ID,
    slug: "winter-loop-challenge",
    name: "Winter Loop Challenge",
    description: "A timed urban loop challenge for solo runners and relay teams.",
    starts_at: "2027-01-16T13:00:00.000Z",
    location_name: "Pittsburgh, Pennsylvania",
    status: "draft",
    os_event_tiers: [
      { id: "21111111-1111-4111-8111-111111111115", name: "Six Hour", distance_label: "Timed loop", price_cents: 5500, capacity: 180 },
    ],
  },
];

const seedRegistrations = [
  {
    id: "31111111-1111-4111-8111-111111111111",
    event_id: seedEvents[0].id,
    tier_id: seedEvents[0].os_event_tiers[0].id,
    first_name: "Maya", last_name: "Brooks", email: "maya@example.com",
    emergency_contact: "Jordan Brooks · 410-555-0138",
    status: "confirmed", payment_status: "pending", amount_cents: 6500,
    created_at: "2026-07-24T14:20:00.000Z",
  },
  {
    id: "31111111-1111-4111-8111-111111111112",
    event_id: seedEvents[0].id,
    tier_id: seedEvents[0].os_event_tiers[1].id,
    first_name: "Theo", last_name: "Park", email: "theo@example.com",
    emergency_contact: "Lena Park · 443-555-0191",
    status: "confirmed", payment_status: "pending", amount_cents: 3000,
    created_at: "2026-07-25T09:15:00.000Z",
  },
];

const DEMO_KEY = "openstart-demo-v2";

function demoState() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY)) || resetDemo();
  } catch {
    return resetDemo();
  }
}

export function resetDemo() {
  const state = structuredClone({ events: seedEvents, registrations: seedRegistrations });
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
  return state;
}

function saveDemo(state) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
}

async function functionResult(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `The ${name} service returned ${response.status}`);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listPublishedEvents() {
  if (!configured) return demoState().events.filter((event) => event.status === "published");
  const { data, error } = await supabase
    .from("os_events")
    .select("*, os_event_tiers(*, os_tier_prices(*)), os_event_questions(*), os_teams(id,name,category,max_members), os_products(*, os_product_variants(*)), os_results(*), os_volunteer_roles(*,os_volunteer_shifts(*)), os_event_sections(*), os_event_sponsors(*), os_waves(*)")
    .eq("status", "published")
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function listPublishedSeries() {
  if(!configured) return [];
  const {data,error}=await supabase.from("os_series")
    .select("*,os_series_events(*,os_events(id,name,slug,starts_at,location_name,status))")
    .eq("status","published").order("created_at",{ascending:false});
  if(error) throw error;
  return data;
}

export async function listOrganizerSeries(userId) {
  if(!configured) return [];
  const {data,error}=await supabase.from("os_series")
    .select("*,os_series_events(*,os_events(id,name,slug,starts_at,location_name,status))")
    .eq("organizer_id",userId).order("created_at",{ascending:false});
  if(error) throw error;
  return data;
}

export async function createSeries(series) {
  const {data,error}=await supabase.from("os_series").insert(series).select().single();
  if(error) throw error;
  return data;
}

export async function updateSeries(id,changes) {
  const {data,error}=await supabase.from("os_series").update(changes).eq("id",id).select().single();
  if(error) throw error;
  return data;
}

export async function addSeriesEvent(link) {
  const {data,error}=await supabase.from("os_series_events").insert(link).select().single();
  if(error) throw error;
  return data;
}

export async function removeSeriesEvent(id) {
  const {error}=await supabase.from("os_series_events").delete().eq("id",id);
  if(error) throw error;
}

export async function seriesAction(action,payload) {
  return functionResult("os-series",{action,...payload});
}

export async function listOrganizerEvents(userId) {
  if (!configured) return demoState().events;
  const { data, error } = await supabase
    .from("os_events")
    .select("*, os_event_tiers(*, os_tier_prices(*)), os_event_questions(*), os_promo_codes(*), os_waitlist(*), os_teams(id,name,category,max_members,captain_user_id), os_event_staff(*), os_products(*, os_product_variants(*)), os_results(*), os_volunteer_roles(*,os_volunteer_shifts(*,os_volunteer_signups(*))), os_event_sections(*), os_event_sponsors(*), os_waves(*), os_event_checklist_items(*), os_lottery_applications(*), os_lottery_draws(*,os_lottery_draw_entries(*))")
    .eq("organizer_id", userId)
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function createShowcaseEvent() {
  if (!configured) throw new Error("The organizer showcase requires Supabase");
  const { data, error } = await supabase.rpc("os_create_showcase_event");
  if (error) throw error;
  return data;
}

export async function deleteShowcaseEvent(eventId) {
  if (!configured) throw new Error("The organizer showcase requires Supabase");
  const { error } = await supabase.rpc("os_delete_showcase_event", { p_event_id: eventId });
  if (error) throw error;
}

export async function listRegistrations(eventIds) {
  if (!eventIds.length) return [];
  if (!configured) return demoState().registrations.filter((registration) => eventIds.includes(registration.event_id));
  const { data, error } = await supabase
    .from("os_registrations")
    .select("*, os_registration_answers(*, os_event_questions(label)), os_registration_activity(*), os_teams(name,category), os_waves(name,starts_at)")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listOrganizerOrderItems(eventIds) {
  if (!configured || !eventIds.length) return [];
  const { data, error } = await supabase.from("os_order_items")
    .select("*, os_orders!inner(event_id,status)").in("os_orders.event_id", eventIds);
  if (error) throw error;
  return data;
}

export async function updateRegistration(id, changes) {
  if (!configured) {
    const state = demoState();
    const item = state.registrations.find((registration) => registration.id === id);
    if (!item) throw new Error("Registration was not found");
    Object.assign(item, changes);
    saveDemo(state);
    return item;
  }
  const allowed = {
    first_name: changes.first_name,
    last_name: changes.last_name,
    email: changes.email,
    emergency_contact: changes.emergency_contact,
    bib_number: changes.bib_number || null,
    organizer_notes: changes.organizer_notes || "",
    status: changes.status,
  };
  const { data, error } = await supabase.from("os_registrations")
    .update(allowed).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function createManualRegistration(payload) {
  if (!configured) {
    return createDemoRegistration({
      ...payload,
      idempotency_key: crypto.randomUUID(),
      status: "confirmed",
      payment_status: "not_required",
      registration_source: "manual",
      amount_cents: 0,
    });
  }
  const { data, error } = await supabase.from("os_registrations").insert({
    ...payload,
    participant_user_id: null,
    idempotency_key: crypto.randomUUID(),
    status: "confirmed",
    payment_status: "not_required",
    registration_source: "manual",
    amount_cents: 0,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function createEventQuestion(question) {
  if (!configured) throw new Error("Questions require Supabase");
  const { data, error } = await supabase.from("os_event_questions")
    .insert(question).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEventQuestion(id) {
  if (!configured) throw new Error("Questions require Supabase");
  const { error } = await supabase.from("os_event_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function updateEventSettings(eventId, changes) {
  if (!configured) throw new Error("Event settings require Supabase");
  const { error } = await supabase.from("os_events").update(changes).eq("id", eventId);
  if (error) throw error;
}

export async function createEventTier(tier) {
  const { data, error } = await supabase.from("os_event_tiers").insert(tier).select().single();
  if (error) throw error;
  return data;
}

export async function eventReadiness(eventId) {
  const { data, error } = await supabase.rpc("os_event_readiness", { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export async function publishEvent(eventId) {
  const { data, error } = await supabase.rpc("os_publish_event", { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export async function unpublishEvent(eventId) {
  const { error } = await supabase.rpc("os_unpublish_event", { p_event_id: eventId });
  if (error) throw error;
}

export async function createScheduledPrice(price) {
  const { data, error } = await supabase.from("os_tier_prices").insert(price).select().single();
  if (error) throw error;
  return data;
}

export async function deleteScheduledPrice(id) {
  const { error } = await supabase.from("os_tier_prices").delete().eq("id", id);
  if (error) throw error;
}

export async function createPromoCode(promo) {
  const { data, error } = await supabase.from("os_promo_codes").insert(promo).select().single();
  if (error) throw error;
  return data;
}

export async function updateWaitlist(id, changes) {
  const { error } = await supabase.from("os_waitlist").update(changes).eq("id", id);
  if (error) throw error;
}

export async function createProduct(product, variant) {
  const { data, error } = await supabase.from("os_products").insert(product).select().single();
  if (error) throw error;
  const { error: variantError } = await supabase.from("os_product_variants")
    .insert({ ...variant, product_id: data.id });
  if (variantError) throw variantError;
  return data;
}

export async function updateOrderItem(id, changes) {
  return raceDayAction("fulfill_item", { itemId: id, ...changes });
}

export async function resendConfirmation(registrationId) {
  if (!configured) throw new Error("Email requires Supabase");
  return functionResult("os-registration-email", { registrationId });
}

export async function registrationAction(action, payload) {
  if (!configured) throw new Error("Registration actions require Supabase");
  return functionResult("os-registration-action", { action, ...payload });
}

export async function raceDayAction(action, payload) {
  if (!configured) throw new Error("Race-day tools require Supabase");
  return functionResult("os-race-day", { action, ...payload });
}

export async function communicationsAction(action, payload) {
  return functionResult("os-communications", { action, ...payload });
}

export async function resultsAction(action, payload) {
  return functionResult("os-results", { action, ...payload });
}

export async function wavesAction(action,payload) {
  return functionResult("os-waves",{action,...payload});
}

export async function accountAction(action,payload={}) {
  return functionResult("os-account",{action,...payload});
}

export async function listAuditLog(eventIds) {
  if(!configured || !eventIds.length) return [];
  const {data,error}=await supabase.from("os_audit_log").select("*").in("event_id",eventIds)
    .order("created_at",{ascending:false}).limit(100);
  if(error) throw error;
  return data;
}

export async function createWave(wave) {
  const {data,error}=await supabase.from("os_waves").insert(wave).select().single();
  if(error) throw error;
  return data;
}

export async function deleteWave(id) {
  const {error}=await supabase.from("os_waves").delete().eq("id",id);
  if(error) throw error;
}

export async function listOrganizerCampaigns(eventIds) {
  if (!configured || !eventIds.length) return [];
  const { data, error } = await supabase.from("os_campaigns")
    .select("*,os_campaign_deliveries(status)").in("event_id",eventIds).order("created_at",{ascending:false});
  if (error) throw error;
  return data;
}

export async function listEmailTemplates(userId) {
  if (!configured) return [];
  const { data, error } = await supabase.from("os_email_templates").select("*")
    .eq("organizer_id",userId).order("name");
  if (error) throw error;
  return data;
}

export async function createEmailTemplate(template) {
  const { data, error } = await supabase.from("os_email_templates").insert(template).select().single();
  if (error) throw error;
  return data;
}

export async function createVolunteerRole(role, shift) {
  const { data, error }=await supabase.from("os_volunteer_roles").insert(role).select().single();
  if(error) throw error;
  const { error: shiftError }=await supabase.from("os_volunteer_shifts")
    .insert({...shift,role_id:data.id});
  if(shiftError) throw shiftError;
  return data;
}

export async function joinVolunteerShift(payload) {
  const { data, error }=await supabase.rpc("os_join_volunteer_shift",{
    p_shift_id:payload.shiftId,p_first_name:payload.firstName,p_last_name:payload.lastName,
    p_email:payload.email,p_phone:payload.phone || "",p_emergency_contact:payload.emergencyContact || "",
    p_notes:payload.notes || "",p_waiver_accepted:Boolean(payload.waiverAccepted),
  });
  if(error) throw error;
  return data?.[0];
}

export async function updateVolunteerSignup(id, changes) {
  const { data, error }=await supabase.from("os_volunteer_signups").update(changes).eq("id",id).select().single();
  if(error) throw error;
  return data;
}

export async function createEventSection(section) {
  const { data, error }=await supabase.from("os_event_sections").insert(section).select().single();
  if(error) throw error;
  return data;
}

export async function updateEventSections(sections) {
  const { error }=await supabase.from("os_event_sections").upsert(sections);
  if(error) throw error;
}

export async function deleteEventSection(id) {
  const { error }=await supabase.from("os_event_sections").delete().eq("id",id);
  if(error) throw error;
}

export async function createEventSponsor(sponsor) {
  const { data, error }=await supabase.from("os_event_sponsors").insert(sponsor).select().single();
  if(error) throw error;
  return data;
}

export async function deleteEventSponsor(id) {
  const { error }=await supabase.from("os_event_sponsors").delete().eq("id",id);
  if(error) throw error;
}

export async function uploadEventAsset(userId,eventId,file) {
  const extension=file.name.split(".").pop()?.toLowerCase() || "bin";
  const path=`${userId}/${eventId}/${crypto.randomUUID()}.${extension}`;
  const { error }=await supabase.storage.from("os-event-assets").upload(path,file,{contentType:file.type,upsert:false});
  if(error) throw error;
  return supabase.storage.from("os-event-assets").getPublicUrl(path).data.publicUrl;
}

export async function listMyVolunteerSignups() {
  if(!configured) return [];
  const { data, error }=await supabase.from("os_volunteer_signups")
    .select("*,os_volunteer_shifts(*,os_volunteer_roles(name,os_events(name,location_name)))")
    .order("created_at",{ascending:false});
  if(error) throw error;
  return data;
}

export async function listRunnerRegistrations() {
  if (!configured) return [];
  const { error: claimError } = await supabase.rpc("os_claim_my_registrations");
  if (claimError) throw claimError;
  const { data, error } = await supabase
    .from("os_registrations")
    .select("*, os_events(name, starts_at, location_name, participant_edits_close_at, transfers_close_at, refunds_close_at, allow_transfers, allow_refund_requests,os_waves(*)), os_event_tiers(name, distance_label), os_registration_answers(*, os_event_questions(label)), os_registration_activity(*), os_teams(name,category), os_results(*), os_waves(name,starts_at,self_select,selection_closes_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMyLotteryApplications() {
  if (!configured) return [];
  const { data, error } = await supabase.from("os_lottery_applications")
    .select("*,os_events(name,starts_at,location_name,lottery_closes_at,lottery_spots,waiver_text,updated_at,os_event_questions(*)),os_event_tiers(name,distance_label,price_cents)")
    .eq("applicant_user_id", (await supabase.auth.getUser()).data.user?.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function submitLotteryApplication(application) {
  if (!configured) throw new Error("Lottery applications require Supabase");
  const { data, error } = await supabase.rpc("os_submit_lottery_application", application);
  if (error) throw error;
  return data;
}

export async function withdrawLotteryApplication(applicationId) {
  const { error } = await supabase.rpc("os_withdraw_lottery_application", { p_application_id: applicationId });
  if (error) throw error;
}

export async function reviewLotteryApplication(id, changes) {
  const { data, error } = await supabase.rpc("os_review_lottery_application", {
    p_application_id:id,p_status:changes.status,p_bonus_tickets:changes.bonus_tickets,
    p_review_notes:changes.review_notes,
  });
  if (error) throw error;
  return data;
}

export async function lotteryAction(action,payload={}) {
  return functionResult("os-lottery",{action,...payload});
}

export async function listCaptainTeams(userId) {
  if (!configured) return [];
  const { data, error } = await supabase.from("os_teams")
    .select("id,name,category,max_members,os_events(name),os_registrations(id,first_name,last_name,email,status,relay_leg,team_role)")
    .eq("captain_user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOrganizerProfile(userId) {
  if (!configured) {
    return {
      id: DEMO_ORGANIZER_ID,
      stripe_account_id: null,
      stripe_details_submitted: false,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
    };
  }
  const { data, error } = await supabase
    .from("os_profiles")
    .select("id, display_name, stripe_account_id, stripe_details_submitted, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEvent(event, tier) {
  if (!configured) {
    const state = demoState();
    const created = {
      ...event,
      id: crypto.randomUUID(),
      organizer_id: DEMO_ORGANIZER_ID,
      os_event_tiers: [{ ...tier, id: crypto.randomUUID() }],
    };
    state.events.push(created);
    saveDemo(state);
    return created;
  }

  const { data: created, error } = await supabase
    .from("os_events")
    .insert(event)
    .select()
    .single();
  if (error) throw error;

  const { data: createdTier, error: tierError } = await supabase
    .from("os_event_tiers")
    .insert({ ...tier, event_id: created.id })
    .select()
    .single();
  if (tierError) {
    await supabase.from("os_events").delete().eq("id", created.id);
    throw tierError;
  }
  return { ...created, os_event_tiers: [createdTier] };
}

export async function duplicateEvent(sourceEventId, name, startsAt) {
  if (!configured) {
    const state = demoState();
    const source = state.events.find((event) => event.id === sourceEventId);
    if (!source) throw new Error("Source event was not found");
    const created = structuredClone(source);
    created.id = crypto.randomUUID();
    created.name = name;
    created.slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString().slice(-6)}`;
    created.starts_at = startsAt;
    created.status = "draft";
    created.website_published = false;
    created.os_event_tiers = (created.os_event_tiers || []).map((tier) => ({ ...tier, id: crypto.randomUUID(), event_id: created.id }));
    created.os_event_checklist_items = defaultChecklist(created.id, startsAt);
    state.events.push(created);
    saveDemo(state);
    return created.id;
  }
  const { data, error } = await supabase.rpc("os_duplicate_event", {
    p_source_event_id: sourceEventId,
    p_name: name,
    p_starts_at: startsAt,
  });
  if (error) throw error;
  return data;
}

function defaultChecklist(eventId, startsAt) {
  const day = 86400000;
  return [
    ["Confirm permits and insurance","planning",-120],
    ["Publish registration and event website","registration",-100],
    ["Confirm course and aid-station plan","course",-60],
    ["Open volunteer shifts","volunteers",-45],
    ["Send participant race guide","communications",-7],
    ["Assign bibs and prepare check-in","race_day",-3],
    ["Confirm timing and emergency contacts","race_day",-1],
    ["Publish official results","post_event",1],
    ["Close financials and send follow-up","post_event",7],
  ].map(([title,category,offset],sortOrder) => ({
    id: crypto.randomUUID(), event_id: eventId, title, category,
    due_at: new Date(new Date(startsAt).getTime() + offset * day).toISOString(),
    completed_at: null, notes: "", sort_order: (sortOrder + 1) * 10,
  }));
}

export async function createChecklistItem(item) {
  if (!configured) {
    const state = demoState();
    const event = state.events.find((candidate) => candidate.id === item.event_id);
    const created = { ...item, id: crypto.randomUUID(), completed_at: null };
    event.os_event_checklist_items ||= [];
    event.os_event_checklist_items.push(created);
    saveDemo(state);
    return created;
  }
  const { data, error } = await supabase.from("os_event_checklist_items").insert(item).select().single();
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(id, changes) {
  if (!configured) {
    const state = demoState();
    const item = state.events.flatMap((event) => event.os_event_checklist_items || []).find((candidate) => candidate.id === id);
    if (!item) throw new Error("Checklist item was not found");
    Object.assign(item, changes);
    saveDemo(state);
    return item;
  }
  const { data, error } = await supabase.from("os_event_checklist_items").update(changes).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteChecklistItem(id) {
  if (!configured) {
    const state = demoState();
    state.events.forEach((event) => {
      event.os_event_checklist_items = (event.os_event_checklist_items || []).filter((item) => item.id !== id);
    });
    saveDemo(state);
    return;
  }
  const { error } = await supabase.from("os_event_checklist_items").delete().eq("id", id);
  if (error) throw error;
}

async function createDemoRegistration(registration) {
  const state = demoState();
  const created = { ...registration, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  state.registrations.push(created);
  saveDemo(state);
  return created;
}

export async function beginRegistration(payload) {
  if (!configured) {
    const event = demoState().events.find((item) => item.id === payload.eventId);
    const tier = event?.os_event_tiers.find((item) => item.id === payload.tierId);
    if (!event || !tier) throw new Error("Registration option was not found");
    const registration = await createDemoRegistration({
      event_id: event.id,
      tier_id: tier.id,
      participant_user_id: null,
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email,
      emergency_contact: payload.emergencyContact,
      status: tier.price_cents === 0 ? "confirmed" : "pending",
      payment_status: tier.price_cents === 0 ? "not_required" : "pending",
      amount_cents: tier.price_cents,
    });
    return { status: registration.status, registrationId: registration.id };
  }
  return functionResult("os-create-checkout", payload);
}

export async function beginStripeOnboarding(returnUrl) {
  if (!configured) throw new Error("Supabase must be configured first");
  const data = await functionResult("os-stripe-connect", { returnUrl });
  return data.url;
}

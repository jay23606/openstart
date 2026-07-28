import { configured, supabase } from "./core.js";

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

export async function listPublishedEvents() {
  if (!configured) return demoState().events.filter((event) => event.status === "published");
  const { data, error } = await supabase
    .from("os_events")
    .select("*, os_event_tiers(*)")
    .eq("status", "published")
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function listOrganizerEvents(userId) {
  if (!configured) return demoState().events;
  const { data, error } = await supabase
    .from("os_events")
    .select("*, os_event_tiers(*)")
    .eq("organizer_id", userId)
    .order("starts_at");
  if (error) throw error;
  return data;
}

export async function listRegistrations(eventIds) {
  if (!eventIds.length) return [];
  if (!configured) return demoState().registrations.filter((registration) => eventIds.includes(registration.event_id));
  const { data, error } = await supabase
    .from("os_registrations")
    .select("*")
    .in("event_id", eventIds)
    .order("created_at", { ascending: false });
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

export async function createRegistration(registration) {
  if (!configured) {
    const state = demoState();
    const created = { ...registration, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    state.registrations.push(created);
    saveDemo(state);
    return created;
  }
  const { error } = await supabase
    .from("os_registrations")
    .insert(registration);
  if (error) throw error;
  return registration;
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Tier = { id: string; name: string; distance: string; price: number; capacity: number };
type Race = {
  id: string;
  name: string;
  date: string;
  location: string;
  description: string;
  status: "published" | "draft";
  tiers: Tier[];
};
type Registration = {
  id: string;
  raceId: string;
  tierId: string;
  firstName: string;
  lastName: string;
  email: string;
  emergencyContact: string;
  registeredAt: string;
};

const seedRaces: Race[] = [
  {
    id: "harbor-half",
    name: "Harbor Half & 5K",
    date: "2026-10-18",
    location: "Baltimore, Maryland",
    description: "A fast waterfront course, neighborhood cheer zones, and a finish-line festival for every pace.",
    status: "published",
    tiers: [
      { id: "half", name: "Half Marathon", distance: "13.1 miles", price: 65, capacity: 800 },
      { id: "5k", name: "Community 5K", distance: "3.1 miles", price: 30, capacity: 500 },
    ],
  },
  {
    id: "ridge-trail",
    name: "Blue Ridge Trail Day",
    date: "2026-11-07",
    location: "Shenandoah, Virginia",
    description: "A welcoming trail gathering with two distances, generous cutoffs, and a leave-no-trace promise.",
    status: "published",
    tiers: [
      { id: "25k", name: "Ridge 25K", distance: "25 kilometers", price: 72, capacity: 240 },
      { id: "10k", name: "Valley 10K", distance: "10 kilometers", price: 42, capacity: 320 },
    ],
  },
  {
    id: "winter-loop",
    name: "Winter Loop Challenge",
    date: "2027-01-16",
    location: "Pittsburgh, Pennsylvania",
    description: "A timed urban loop challenge for solo runners and relay teams.",
    status: "draft",
    tiers: [{ id: "six-hour", name: "Six Hour", distance: "Timed loop", price: 55, capacity: 180 }],
  },
];

const seedRegistrations: Registration[] = [
  {
    id: "reg-1",
    raceId: "harbor-half",
    tierId: "half",
    firstName: "Maya",
    lastName: "Brooks",
    email: "maya@example.com",
    emergencyContact: "Jordan Brooks · 410-555-0138",
    registeredAt: "2026-07-24T14:20:00.000Z",
  },
  {
    id: "reg-2",
    raceId: "harbor-half",
    tierId: "5k",
    firstName: "Theo",
    lastName: "Park",
    email: "theo@example.com",
    emergencyContact: "Lena Park · 443-555-0191",
    registeredAt: "2026-07-25T09:15:00.000Z",
  },
];

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

export default function Home() {
  const [view, setView] = useState<"discover" | "dashboard">("discover");
  const [races, setRaces] = useState<Race[]>(seedRaces);
  const [registrations, setRegistrations] = useState<Registration[]>(seedRegistrations);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("openstart-demo");
    if (!saved) return;
    try {
      const data = JSON.parse(saved) as { races: Race[]; registrations: Registration[] };
      setRaces(data.races);
      setRegistrations(data.registrations);
    } catch {
      window.localStorage.removeItem("openstart-demo");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("openstart-demo", JSON.stringify({ races, registrations }));
  }, [races, registrations]);

  const selectedRace = races.find((race) => race.id === selectedRaceId) ?? null;
  const published = races.filter((race) => race.status === "published");

  const registrationCount = (raceId: string) =>
    registrations.filter((registration) => registration.raceId === raceId).length;

  const grossRevenue = useMemo(
    () =>
      registrations.reduce((total, registration) => {
        const race = races.find((item) => item.id === registration.raceId);
        return total + (race?.tiers.find((tier) => tier.id === registration.tierId)?.price ?? 0);
      }, 0),
    [races, registrations],
  );

  function resetDemo() {
    setRaces(seedRaces);
    setRegistrations(seedRegistrations);
    setNotice("Demo data restored.");
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRace) return;
    const data = new FormData(event.currentTarget);
    const registration: Registration = {
      id: crypto.randomUUID(),
      raceId: selectedRace.id,
      tierId: String(data.get("tier")),
      firstName: String(data.get("firstName")),
      lastName: String(data.get("lastName")),
      email: String(data.get("email")),
      emergencyContact: String(data.get("emergencyContact")),
      registeredAt: new Date().toISOString(),
    };
    setRegistrations((current) => [...current, registration]);
    setRegistering(false);
    setNotice(`You’re registered for ${selectedRace.name}. No payment was charged in this preview.`);
  }

  function submitRace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name"));
    const distance = String(data.get("distance"));
    const race: Race = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now()}`,
      name,
      date: String(data.get("date")),
      location: String(data.get("location")),
      description: String(data.get("description")),
      status: data.get("publish") === "on" ? "published" : "draft",
      tiers: [
        {
          id: crypto.randomUUID(),
          name: String(data.get("tierName")),
          distance,
          price: Number(data.get("price")),
          capacity: Number(data.get("capacity")),
        },
      ],
    };
    setRaces((current) => [...current, race]);
    setCreating(false);
    setView("dashboard");
    setNotice(`${race.name} was created as ${race.status}.`);
  }

  return (
    <main>
      <header className="site-header">
        <button className="brand" onClick={() => { setView("discover"); setSelectedRaceId(null); }}>
          <span className="brand-mark">OS</span>
          <span>OpenStart</span>
        </button>
        <nav aria-label="Primary navigation">
          <button className={view === "discover" ? "nav-active" : ""} onClick={() => { setView("discover"); setSelectedRaceId(null); }}>
            Find events
          </button>
          <button className={view === "dashboard" ? "nav-active" : ""} onClick={() => { setView("dashboard"); setSelectedRaceId(null); }}>
            Organizer
          </button>
        </nav>
        <a className="github-link" href="https://github.com/" target="_blank" rel="noreferrer">Open source ↗</a>
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {view === "discover" && !selectedRace && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">Registration without the runaround</p>
              <h1>Great race days start in the open.</h1>
              <p className="hero-lede">
                Discover local events and register in minutes. OpenStart gives organizers a transparent,
                community-owned alternative for managing every starting line.
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#events">Explore events</a>
                <button className="text-button" onClick={() => setView("dashboard")}>I organize races →</button>
              </div>
            </div>
            <div className="hero-card">
              <div className="route-line"><span>START</span><i /><span>FINISH</span></div>
              <p>Up next</p>
              <strong>Harbor Half & 5K</strong>
              <div className="hero-meta">
                <span><b>82</b> days</span>
                <span><b>2</b> distances</span>
                <span><b>$30</b> from</span>
              </div>
            </div>
          </section>

          <section className="events-section" id="events">
            <div className="section-heading">
              <div>
                <p className="eyebrow">On the calendar</p>
                <h2>Find your next starting line</h2>
              </div>
              <span>{published.length} open events</span>
            </div>
            <div className="event-grid">
              {published.map((race, index) => (
                <article className={`event-card event-tone-${index % 3}`} key={race.id}>
                  <div className="event-date">
                    <span>{new Date(`${race.date}T12:00:00`).toLocaleString("en-US", { month: "short" }).toUpperCase()}</span>
                    <strong>{new Date(`${race.date}T12:00:00`).getDate()}</strong>
                  </div>
                  <div className="event-card-content">
                    <p>{race.location}</p>
                    <h3>{race.name}</h3>
                    <div className="tier-pills">
                      {race.tiers.map((tier) => <span key={tier.id}>{tier.distance}</span>)}
                    </div>
                    <button onClick={() => setSelectedRaceId(race.id)}>View event <span>→</span></button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="open-promise">
            <div>
              <p className="eyebrow">Built differently</p>
              <h2>Your event platform should work for your community.</h2>
            </div>
            <div className="promise-grid">
              <div><b>01</b><h3>Transparent by default</h3><p>Open code, understandable costs, and participant data that stays yours.</p></div>
              <div><b>02</b><h3>Ready for race day</h3><p>Registration, rosters, capacity, and exports in one focused workspace.</p></div>
              <div><b>03</b><h3>Made to extend</h3><p>Build the workflow your event needs without waiting on a closed platform.</p></div>
            </div>
          </section>
        </>
      )}

      {view === "discover" && selectedRace && (
        <section className="event-detail">
          <button className="back-button" onClick={() => { setSelectedRaceId(null); setRegistering(false); }}>← All events</button>
          <div className="detail-hero">
            <div>
              <p className="eyebrow">{formatDate(selectedRace.date)} · {selectedRace.location}</p>
              <h1>{selectedRace.name}</h1>
              <p>{selectedRace.description}</p>
            </div>
            <div className="start-badge"><span>OPEN</span><strong>START</strong></div>
          </div>
          <div className="detail-layout">
            <div>
              <h2>Choose your event</h2>
              <div className="tier-list">
                {selectedRace.tiers.map((tier) => {
                  const used = registrations.filter((item) => item.raceId === selectedRace.id && item.tierId === tier.id).length;
                  return (
                    <div className="tier-row" key={tier.id}>
                      <div><h3>{tier.name}</h3><p>{tier.distance} · {tier.capacity - used} spots available</p></div>
                      <strong>{money(tier.price)}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="detail-note">
                <b>Simple for now, extensible later.</b>
                <p>This preview captures registrations without charging a card. A payment adapter will be connected in the next phase.</p>
              </div>
            </div>
            <aside className="registration-panel">
              {!registering ? (
                <>
                  <p>Registration is open</p>
                  <h2>Claim your spot</h2>
                  <span>Confirmation is immediate. Payment is disabled in this preview.</span>
                  <button className="primary-button" onClick={() => setRegistering(true)}>Register now</button>
                </>
              ) : (
                <form onSubmit={submitRegistration}>
                  <div className="form-heading"><div><p>Registration</p><h2>Your details</h2></div><button type="button" onClick={() => setRegistering(false)}>×</button></div>
                  <label>Event<select name="tier" required>{selectedRace.tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.name} · {money(tier.price)}</option>)}</select></label>
                  <div className="split-fields">
                    <label>First name<input name="firstName" required /></label>
                    <label>Last name<input name="lastName" required /></label>
                  </div>
                  <label>Email<input name="email" type="email" required /></label>
                  <label>Emergency contact<input name="emergencyContact" placeholder="Name · phone" required /></label>
                  <button className="primary-button" type="submit">Complete free registration</button>
                </form>
              )}
            </aside>
          </div>
        </section>
      )}

      {view === "dashboard" && (
        <section className="dashboard">
          <div className="dashboard-header">
            <div><p className="eyebrow">Organizer workspace</p><h1>Good morning, race director.</h1><p>Here’s what’s happening across your starting lines.</p></div>
            <button className="primary-button" onClick={() => setCreating(true)}>+ Create event</button>
          </div>
          <div className="metric-grid">
            <div><p>Total registrations</p><strong>{registrations.length}</strong><span>Across all events</span></div>
            <div><p>Published events</p><strong>{published.length}</strong><span>{races.length - published.length} draft</span></div>
            <div><p>Gross registration value</p><strong>{money(grossRevenue)}</strong><span>Payments not yet collected</span></div>
          </div>
          <div className="dashboard-card">
            <div className="card-heading"><div><h2>Your events</h2><p>Manage details and monitor signups.</p></div><button className="subtle-button" onClick={resetDemo}>Reset demo</button></div>
            <div className="event-table">
              <div className="table-header"><span>Event</span><span>Status</span><span>Registrations</span><span>Date</span></div>
              {races.map((race) => (
                <button className="table-row" key={race.id} onClick={() => setSelectedRaceId(selectedRaceId === race.id ? null : race.id)}>
                  <span><b>{race.name}</b><small>{race.location}</small></span>
                  <span><i className={`status-dot ${race.status}`} />{race.status}</span>
                  <span>{registrationCount(race.id)}</span>
                  <span>{formatDate(race.date)} <b>›</b></span>
                </button>
              ))}
            </div>
          </div>

          {selectedRace && (
            <div className="dashboard-card roster-card">
              <div className="card-heading"><div><h2>{selectedRace.name} roster</h2><p>Participant contact and entry details.</p></div><button className="subtle-button" onClick={() => setSelectedRaceId(null)}>Close</button></div>
              {registrations.filter((item) => item.raceId === selectedRace.id).length === 0 ? (
                <div className="empty-state">No registrations yet. Share the published event to get the first runner on the list.</div>
              ) : (
                <div className="roster">
                  {registrations.filter((item) => item.raceId === selectedRace.id).map((item) => (
                    <div key={item.id}><span className="avatar">{item.firstName[0]}{item.lastName[0]}</span><span><b>{item.firstName} {item.lastName}</b><small>{item.email}</small></span><span>{selectedRace.tiers.find((tier) => tier.id === item.tierId)?.name}</span><span>Confirmed</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {creating && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="form-heading"><div><p>New event</p><h2 id="create-title">Create a starting line</h2></div><button onClick={() => setCreating(false)} aria-label="Close">×</button></div>
            <form onSubmit={submitRace}>
              <label>Event name<input name="name" placeholder="River City 10K" required /></label>
              <div className="split-fields">
                <label>Date<input name="date" type="date" required /></label>
                <label>Location<input name="location" placeholder="Richmond, Virginia" required /></label>
              </div>
              <label>Description<textarea name="description" rows={3} placeholder="What makes this race special?" required /></label>
              <h3>First registration option</h3>
              <div className="split-fields">
                <label>Name<input name="tierName" placeholder="10K" required /></label>
                <label>Distance<input name="distance" placeholder="6.2 miles" required /></label>
              </div>
              <div className="split-fields">
                <label>Price<input name="price" type="number" min="0" required /></label>
                <label>Capacity<input name="capacity" type="number" min="1" required /></label>
              </div>
              <label className="check-label"><input name="publish" type="checkbox" /> Publish immediately</label>
              <button className="primary-button" type="submit">Create event</button>
            </form>
          </section>
        </div>
      )}

      <footer><span><b>OpenStart</b> · Open-source race registration</span><span>Built for organizers, runners, and the communities between them.</span></footer>
    </main>
  );
}

-- Seed data the SQL tests expect to already exist.
--
-- registration_integrity.sql needs a published event with a tier,
-- lottery_lifecycle.sql needs an organizer it can act as,
-- platform_operations.sql needs an active platform owner, and
-- scalability_foundations.sql needs a user in auth.users.
--
-- Each test wraps itself in begin/rollback, so this fixture is the only state
-- that persists between them.

insert into auth.users(id, email)
values ('00000000-0000-4000-8000-000000000001', 'organizer@example.test')
on conflict (id) do nothing;

insert into public.os_events(
  id, organizer_id, slug, name, description, starts_at, location_name, status
) values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'fixture-published-race',
  'Fixture Published Race',
  'Seed event backing the transactional SQL tests.',
  now() + interval '90 days',
  'Richmond, Virginia',
  'published'
) on conflict (id) do nothing;

insert into public.os_event_tiers(
  id, event_id, name, distance_label, price_cents, capacity
) values (
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000010',
  'Fixture 10K', '10 kilometers', 0, 250
) on conflict (id) do nothing;

insert into public.os_platform_admins(user_id, role)
values ('00000000-0000-4000-8000-000000000001', 'owner')
on conflict (user_id) do update set role = 'owner', active = true;

insert into public.os_platform_settings(singleton) values (true)
on conflict (singleton) do nothing;

-- Break the os_events -> os_event_staff -> os_events RLS policy cycle.
-- SECURITY DEFINER makes the narrowly-scoped membership lookup run without
-- invoking os_event_staff policies again.
create or replace function public.os_is_event_staff(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.os_event_staff staff
    where staff.event_id = p_event_id
      and lower(staff.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.os_is_event_staff(uuid) from public;
grant execute on function public.os_is_event_staff(uuid) to authenticated;

drop policy if exists "staff read assigned events" on public.os_events;
create policy "staff read assigned events"
on public.os_events for select to authenticated
using (public.os_is_event_staff(id));

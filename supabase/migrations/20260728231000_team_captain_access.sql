-- Team captains can see the registrations assigned to teams they captain.
create policy "captains read team registrations"
on public.os_registrations for select to authenticated
using (exists (
  select 1 from public.os_teams team
  where team.id = team_id and team.captain_user_id = auth.uid()
));

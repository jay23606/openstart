-- Runner accounts can claim registrations made with their verified auth email.

alter table public.os_registrations
  add column if not exists confirmation_email_sent_at timestamptz;

create or replace function public.os_claim_my_registrations()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Confirm your email before claiming registrations';
  end if;

  update public.os_registrations
  set participant_user_id = auth.uid()
  where participant_user_id is null
    and lower(email) = v_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.os_claim_my_registrations() from public;
grant execute on function public.os_claim_my_registrations() to authenticated;

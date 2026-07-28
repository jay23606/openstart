-- Registration Management v1: questions, waiver evidence, bibs, and organizer operations.

create table if not exists public.os_event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 160),
  field_type text not null default 'text'
    check (field_type in ('text', 'select', 'checkbox')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.os_registration_answers (
  registration_id uuid not null references public.os_registrations(id) on delete cascade,
  question_id uuid not null references public.os_event_questions(id) on delete cascade,
  answer text not null default '',
  primary key (registration_id, question_id)
);

alter table public.os_events
  add column if not exists waiver_text text not null default '';

alter table public.os_registrations
  add column if not exists bib_number text,
  add column if not exists organizer_notes text not null default '',
  add column if not exists waiver_accepted_at timestamptz,
  add column if not exists waiver_version text,
  add column if not exists registration_source text not null default 'online'
    check (registration_source in ('online', 'manual', 'import'));

create index if not exists os_event_questions_event_idx
  on public.os_event_questions(event_id, sort_order);
create index if not exists os_registration_answers_registration_idx
  on public.os_registration_answers(registration_id);
create unique index if not exists os_registration_bib_event_unique
  on public.os_registrations(event_id, bib_number)
  where bib_number is not null and bib_number <> '';

alter table public.os_event_questions enable row level security;
alter table public.os_registration_answers enable row level security;

create policy "questions follow event visibility"
  on public.os_event_questions for select
  using (exists (
    select 1 from public.os_events event
    where event.id = event_id
      and (event.status = 'published' or event.organizer_id = auth.uid())
  ));

create policy "organizers manage questions"
  on public.os_event_questions for all to authenticated
  using (exists (
    select 1 from public.os_events event
    where event.id = event_id and event.organizer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.os_events event
    where event.id = event_id and event.organizer_id = auth.uid()
  ));

create policy "answers follow registration access"
  on public.os_registration_answers for select to authenticated
  using (exists (
    select 1 from public.os_registrations registration
    join public.os_events event on event.id = registration.event_id
    where registration.id = registration_id
      and (registration.participant_user_id = auth.uid() or event.organizer_id = auth.uid())
  ));

create policy "organizers create manual registrations"
  on public.os_registrations for insert to authenticated
  with check (
    registration_source = 'manual'
    and status = 'confirmed'
    and payment_status = 'not_required'
    and exists (
      select 1 from public.os_events event
      where event.id = event_id and event.organizer_id = auth.uid()
    )
  );

create policy "organizers delete registration answers"
  on public.os_registration_answers for delete to authenticated
  using (exists (
    select 1 from public.os_registrations registration
    join public.os_events event on event.id = registration.event_id
    where registration.id = registration_id and event.organizer_id = auth.uid()
  ));

create or replace function public.os_save_registration_answers(
  p_registration_id uuid,
  p_answers jsonb,
  p_waiver_accepted boolean,
  p_waiver_version text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.os_registrations%rowtype;
  v_item jsonb;
  v_question public.os_event_questions%rowtype;
begin
  select * into v_registration
  from public.os_registrations
  where id = p_registration_id;
  if not found then raise exception 'Registration was not found'; end if;

  if p_waiver_version is not null and not p_waiver_accepted then
    raise exception 'The event waiver must be accepted';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    select * into v_question
    from public.os_event_questions
    where id = (v_item ->> 'questionId')::uuid
      and event_id = v_registration.event_id;
    if not found then raise exception 'A registration question is invalid'; end if;
    if v_question.required and nullif(trim(v_item ->> 'answer'), '') is null then
      raise exception 'A required registration answer is missing';
    end if;
    insert into public.os_registration_answers (registration_id, question_id, answer)
    values (v_registration.id, v_question.id, left(coalesce(v_item ->> 'answer', ''), 1000))
    on conflict (registration_id, question_id) do update set answer = excluded.answer;
  end loop;

  update public.os_registrations
  set waiver_accepted_at = case when p_waiver_accepted then now() else null end,
      waiver_version = case when p_waiver_accepted then left(p_waiver_version, 64) else null end
  where id = v_registration.id;
end;
$$;

revoke all on function public.os_save_registration_answers(uuid, jsonb, boolean, text) from public;
grant execute on function public.os_save_registration_answers(uuid, jsonb, boolean, text) to service_role;

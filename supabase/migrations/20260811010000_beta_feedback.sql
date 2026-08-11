create table if not exists public.os_feedback (
  id bigint generated always as identity primary key,
  category text not null check (category in ('bug','confusing','idea','accessibility','other')),
  message text not null check (char_length(message) between 20 and 2000),
  route text not null default '/',
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new','reviewing','resolved','closed')),
  created_at timestamptz not null default now()
);
create index if not exists os_feedback_status_created_idx on public.os_feedback(status,created_at desc);
alter table public.os_feedback enable row level security;
revoke all on public.os_feedback from anon,authenticated;

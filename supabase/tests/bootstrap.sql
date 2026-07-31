-- Minimal stand-ins for the pieces Supabase provides but a bare Postgres does
-- not, so the migrations can be applied and exercised in CI.
--
-- This is deliberately thin: it recreates only the surface the migrations
-- actually reference (auth.uid/jwt/role/users, the three API roles, pgcrypto in
-- the extensions schema, and the storage tables used by the asset policies).
-- It is never applied to a real project, where Supabase owns all of this.

create extension if not exists pgcrypto;

-- Roles targeted by grants and "to authenticated" policies.
do $$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

-- gen_random_bytes / digest are referenced as extensions.*
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- The request.jwt.* settings are what PostgREST sets per request, and what the
-- SQL tests set with set_config to act as a given user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
      'email', nullif(current_setting('request.jwt.claim.email', true), ''),
      'role', nullif(current_setting('request.jwt.claim.role', true), '')
    ))
  );
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

-- Supabase returns the path segments excluding the file name.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select case
    when array_length(string_to_array(name, '/'), 1) <= 1 then array[]::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end;
$$;

grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

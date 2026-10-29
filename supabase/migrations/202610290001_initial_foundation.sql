-- SQUAD COMMAND: initial Supabase foundation.
-- This migration is intentionally limited to profiles and teams.
-- Later migrations must implement reviews, elections and moderated actions.
begin;
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null check (char_length(trim(callsign)) between 2 and 40),
  created_at timestamptz not null default now()
);
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.profiles, public.teams, public.team_members from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.teams, public.team_members to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy teams_read_own on public.teams for select to authenticated using (owner_id = (select auth.uid()));
create policy members_read_self on public.team_members for select to authenticated using (user_id = (select auth.uid()));

-- Atomic bootstrap: the authenticated account creates one team and its owner membership.
-- The function checks the caller itself; arbitrary owner ids cannot be supplied.
create function public.create_team(team_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_team_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if team_name is null or char_length(trim(team_name)) not between 2 and 80 then
    raise exception 'Team name must be 2 to 80 characters' using errcode = '22023';
  end if;
  insert into public.teams (name, owner_id) values (trim(team_name), caller) returning id into new_team_id;
  insert into public.team_members (team_id, user_id, role) values (new_team_id, caller, 'owner');
  return new_team_id;
end;
$$;
revoke all on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;
commit;

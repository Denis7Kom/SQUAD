-- Online teams v1. Apply after 202610290001_initial_foundation.sql.
-- All writes affecting another user go through authenticated, transactional RPCs.
begin;

create function public.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid())
$$;
revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;

drop policy teams_read_own on public.teams;
create policy teams_read_member on public.teams for select to authenticated
using (public.is_team_member(id));
drop policy members_read_self on public.team_members;
create policy members_read_team on public.team_members for select to authenticated
using (public.is_team_member(team_id));

-- Invite codes are private, high-entropy bearer invitations. Never part of public team reads.
create table public.team_invites (
  team_id uuid primary key references public.teams(id) on delete cascade,
  code uuid not null unique default gen_random_uuid()
);
alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;
grant select on public.team_invites to authenticated;
create policy invites_owner_only on public.team_invites for select to authenticated
using (exists(select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
insert into public.team_invites(team_id) select id from public.teams;

-- Primary key prevents duplicate reviews, including concurrent requests.
create table public.member_reviews (
  team_id uuid not null,
  author_id uuid not null,
  subject_id uuid not null,
  kind text not null check (kind in ('commander','soldier','technical')),
  scores smallint[] not null check (
    array_ndims(scores) = 1 and array_lower(scores,1) = 1
    and array_length(scores,1) = 5 and array_position(scores,null) is null
    and 0 <= all(scores) and 5 >= all(scores)),
  updated_at timestamptz not null default now(),
  primary key (team_id,author_id,subject_id,kind),
  foreign key (team_id,author_id) references public.team_members(team_id,user_id) on delete cascade,
  foreign key (team_id,subject_id) references public.team_members(team_id,user_id) on delete cascade,
  check (author_id <> subject_id)
);
alter table public.member_reviews enable row level security;
revoke all on public.member_reviews from anon, authenticated;
grant select on public.member_reviews to authenticated;
create policy reviews_read_own on public.member_reviews for select to authenticated
using (author_id = auth.uid() and public.is_team_member(team_id));

-- Serialize each account's join/create requests, and each team's membership changes.
create or replace function public.create_team(team_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_team_id uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from auth.users where id=caller for update;
  if not exists(select 1 from public.profiles where id=caller) then
    raise exception 'Save your profile first' using errcode='22023';
  end if;
  if team_name is null or char_length(trim(team_name)) not between 2 and 80 then
    raise exception 'Team name must be 2 to 80 characters' using errcode='22023';
  end if;
  if (select count(*) from public.team_members where user_id=caller) >= 5 then
    raise exception 'Maximum five teams per account' using errcode='22023';
  end if;
  insert into public.teams(name,owner_id) values(trim(team_name),caller) returning id into new_team_id;
  insert into public.team_members(team_id,user_id,role) values(new_team_id,caller,'owner');
  insert into public.team_invites(team_id) values(new_team_id);
  return new_team_id;
end $$;

create function public.join_team(invite_code uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); target uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from auth.users where id=caller for update;
  if not exists(select 1 from public.profiles where id=caller) then
    raise exception 'Save your profile first' using errcode='22023';
  end if;
  select t.id into target from public.teams t join public.team_invites i on i.team_id=t.id
    where i.code=invite_code for update of t;
  if target is null then raise exception 'Invitation is invalid' using errcode='22023'; end if;
  if exists(select 1 from public.team_members where team_id=target and user_id=caller) then return target; end if;
  if (select count(*) from public.team_members where user_id=caller) >= 5 then
    raise exception 'Maximum five teams per account' using errcode='22023';
  end if;
  if (select count(*) from public.team_members where team_id=target) >= 50 then
    raise exception 'Team is full (50 members)' using errcode='22023';
  end if;
  insert into public.team_members(team_id,user_id) values(target,caller);
  return target;
end $$;

create function public.rotate_team_invite(p_team uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare next_code uuid;
begin
  perform 1 from public.teams where id=p_team and owner_id=auth.uid() for update;
  if not found then raise exception 'Owner access required' using errcode='42501'; end if;
  update public.team_invites set code=gen_random_uuid() where team_id=p_team returning code into next_code;
  return next_code;
end $$;

create function public.remove_team_member(p_team uuid,p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select owner_id into owner from public.teams where id=p_team for update;
  if owner is null or auth.uid() is null or
    (auth.uid() <> owner and auth.uid() <> p_user) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_user=owner then raise exception 'The owner cannot leave the team' using errcode='22023'; end if;
  delete from public.team_members where team_id=p_team and user_id=p_user;
end $$;

create function public.save_member_review(p_team uuid,p_subject uuid,p_kind text,p_scores smallint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Membership changes and review submissions share the same team lock.
  perform 1 from public.teams where id=p_team for update;
  if not public.is_team_member(p_team) then raise exception 'Team access required' using errcode='42501'; end if;
  if p_subject=auth.uid() then raise exception 'Self reviews are not allowed' using errcode='22023'; end if;
  if not exists(select 1 from public.team_members where team_id=p_team and user_id=p_subject) then
    raise exception 'Player is not in this team' using errcode='22023';
  end if;
  insert into public.member_reviews(team_id,author_id,subject_id,kind,scores)
    values(p_team,auth.uid(),p_subject,p_kind,p_scores)
  on conflict(team_id,author_id,subject_id,kind)
    do update set scores=excluded.scores,updated_at=now();
end $$;

-- Return only callsigns and aggregates to teammates. Email/Steam data is never exposed.
create function public.team_roster(p_team uuid)
returns table(user_id uuid,callsign text,role text,ratings jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_team_member(p_team) then raise exception 'Team access required' using errcode='42501'; end if;
  return query
    select m.user_id,p.callsign,m.role,
      coalesce((
        select jsonb_object_agg(a.kind,jsonb_build_object('count',a.n,'score',a.avg_score))
        from (
          select r.kind,count(*) n,round(avg(
            r.scores[1]*1.5 + r.scores[2]*(case when r.kind='soldier' then 1 else 1.5 end)
            + r.scores[3] + r.scores[4]*(case when r.kind='soldier' then 1 else 0.5 end)
            + r.scores[5]*0.5),2) avg_score
          from public.member_reviews r
          where r.team_id=p_team and r.subject_id=m.user_id group by r.kind
        ) a
      ),'{}'::jsonb)
    from public.team_members m join public.profiles p on p.id=m.user_id
    where m.team_id=p_team order by m.joined_at,m.user_id;
end $$;

revoke all on function public.join_team(uuid),public.rotate_team_invite(uuid),
  public.remove_team_member(uuid,uuid),public.save_member_review(uuid,uuid,text,smallint[]),
  public.team_roster(uuid) from public,anon;
grant execute on function public.join_team(uuid),public.rotate_team_invite(uuid),
  public.remove_team_member(uuid,uuid),public.save_member_review(uuid,uuid,text,smallint[]),
  public.team_roster(uuid) to authenticated;
commit;

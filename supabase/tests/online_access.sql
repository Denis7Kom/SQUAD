\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003');
set local role anon;
do $$ begin
 begin perform public.create_team('Denied'); raise exception 'Anonymous create succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.profiles(id,callsign) values(auth.uid(),'Owner');
select set_config('squad.test.team',public.create_team('Test team')::text,true);
select set_config('squad.test.invite',(select code::text from public.team_invites),true);
do $$ begin
 if (select count(*) from public.team_members) <> 1 then raise exception 'Owner membership missing'; end if;
 begin insert into public.team_members(team_id,user_id)
 values(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000002');
 raise exception 'Direct member insert succeeded'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
insert into public.profiles(id,callsign) values(auth.uid(),'Member');
do $$ begin
 if (select count(*) from public.profiles) <> 1 then raise exception 'Other profile exposed'; end if;
 if exists(select 1 from public.teams) then raise exception 'Private team exposed'; end if;
 if exists(select 1 from public.team_invites) then raise exception 'Invite exposed'; end if;
 begin perform public.team_roster(current_setting('squad.test.team')::uuid);
 raise exception 'Outsider roster succeeded'; exception when insufficient_privilege then null; end;
end $$;
select public.join_team(current_setting('squad.test.invite')::uuid);
select public.join_team(current_setting('squad.test.invite')::uuid);
do $$ begin
 if (select count(*) from public.team_members) <> 2 then raise exception 'Join not idempotent'; end if;
 if exists(select 1 from public.team_invites) then raise exception 'Member can see invite'; end if;
 begin perform public.rotate_team_invite(current_setting('squad.test.team')::uuid);
 raise exception 'Non-owner rotated invite'; exception when insufficient_privilege then null; end;
 begin perform public.save_member_review(current_setting('squad.test.team')::uuid,auth.uid(),'commander',array[5,5,5,5,5]::smallint[]);
 raise exception 'Self review succeeded'; exception when invalid_parameter_value then null; end;
 begin perform public.save_member_review(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000001','commander',array[5,5,5,5]::smallint[]);
 raise exception 'Invalid array accepted'; exception when check_violation then null; end;
end $$;
select public.save_member_review(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000001','commander',array[5,5,5,5,5]::smallint[]);
do $$ declare r jsonb; begin
 select ratings into r from public.team_roster(current_setting('squad.test.team')::uuid)
 where user_id='00000000-0000-4000-8000-000000000001';
 if (r->'commander'->>'score')::numeric <> 25 or (r->'commander'->>'count')::int <> 1 then
 raise exception 'Rating formula mismatch'; end if;
end $$;
select public.save_member_review(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000001','commander',array[0,0,0,0,0]::smallint[]);
do $$ declare r jsonb; begin
 select ratings into r from public.team_roster(current_setting('squad.test.team')::uuid)
 where user_id='00000000-0000-4000-8000-000000000001';
 if (r->'commander'->>'score')::numeric <> 0 or (r->'commander'->>'count')::int <> 1 then
 raise exception 'Review upsert mismatch'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
insert into public.profiles(id,callsign) values(auth.uid(),'Outsider');
do $$ begin
 if exists(select 1 from public.member_reviews) then raise exception 'Reviews exposed'; end if;
 begin perform public.save_member_review(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000001','commander',array[5,5,5,5,5]::smallint[]);
 raise exception 'Outsider review succeeded'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.remove_team_member(current_setting('squad.test.team')::uuid,auth.uid());
 raise exception 'Owner removed'; exception when invalid_parameter_value then null; end;
end $$;
select public.remove_team_member(current_setting('squad.test.team')::uuid,'00000000-0000-4000-8000-000000000002');
select public.rotate_team_invite(current_setting('squad.test.team')::uuid);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.member_reviews) then raise exception 'Removed member reviews remain'; end if;
 if exists(select 1 from public.teams) then raise exception 'Removed member still sees team'; end if;
 begin perform public.join_team(current_setting('squad.test.invite')::uuid);
 raise exception 'Old invitation accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.create_team('Extra '||n) from generate_series(1,4) n;
do $$ begin
 begin perform public.create_team('Sixth');
 raise exception 'Account team limit bypassed'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Table without RLS'; end if;
end $$;
rollback;
\echo 'PASS: PostgreSQL privileges, RLS, invitations, membership, review constraints and aggregates.'

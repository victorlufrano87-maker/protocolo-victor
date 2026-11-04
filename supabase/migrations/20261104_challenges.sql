-- Tropa do Batata: all sensitive state is accessible only through authenticated server routes.
-- No existing personal/training rows are changed. Safe to rerun.
begin;
create table if not exists public.gym_challenges (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references auth.users(id),
 invite_code text not null unique,
 member_ids uuid[] not null,
 version bigint not null default 1,
 state jsonb not null,
 created_at timestamptz not null default now(),
 check(jsonb_typeof(state)='object')
);
create index if not exists gym_challenges_members on public.gym_challenges using gin(member_ids);
create table if not exists public.gym_challenge_live (
 user_id uuid primary key references auth.users(id),
 challenge_id uuid not null references public.gym_challenges(id),
 activity_id uuid not null,
 opened_at timestamptz not null default now()
);
alter table public.gym_challenges enable row level security;
alter table public.gym_challenge_live enable row level security;
revoke all on public.gym_challenges,public.gym_challenge_live from public,anon,authenticated;
grant select,insert,update on public.gym_challenges to service_role;
grant select,insert,delete on public.gym_challenge_live to service_role;

create or replace function public.gym_challenge_commit(p_id uuid,p_version bigint,p_state jsonb,p_actor uuid,p_live text default null,p_activity uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare old_row public.gym_challenges; old_audit jsonb; audit_prefix jsonb;
begin
 select * into old_row from public.gym_challenges where id=p_id for update;
 if not found or old_row.version<>p_version then return false; end if;
 if p_state->'rules' is distinct from old_row.state->'rules'
  or p_state->>'createdBy' is distinct from old_row.state->>'createdBy'
  or p_state->>'starts' is distinct from old_row.state->>'starts'
  or p_state->>'ends' is distinct from old_row.state->>'ends'
  or p_state->>'name' is distinct from old_row.state->>'name'
  or p_state->>'id' is distinct from old_row.state->>'id'
  or p_state->>'inviteCode' is distinct from old_row.state->>'inviteCode' then
  raise exception 'Challenge rules and identity are immutable; create a new challenge for new rules';
 end if;
 old_audit=coalesce(old_row.state->'audit','[]'::jsonb);
 select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into audit_prefix
 from jsonb_array_elements(p_state->'audit') with ordinality where ordinality<=jsonb_array_length(old_audit);
 if audit_prefix is distinct from old_audit then raise exception 'Audit history cannot be edited or removed'; end if;
 if p_live='start' then
  insert into public.gym_challenge_live(user_id,challenge_id,activity_id) values(p_actor,p_id,p_activity);
 elsif p_live='end' then
  delete from public.gym_challenge_live where user_id=p_actor and challenge_id=p_id and activity_id=p_activity;
 elsif p_live is not null then raise exception 'Invalid live operation'; end if;
 update public.gym_challenges set state=p_state,version=version+1,
 member_ids=array(select (value->>'id')::uuid from jsonb_array_elements(p_state->'members')) where id=p_id;
 return true;
end $$;
revoke all on function public.gym_challenge_commit(uuid,bigint,jsonb,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.gym_challenge_commit(uuid,bigint,jsonb,uuid,text,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('challenge-proofs','challenge-proofs',false,3145728,array['image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png'];
-- No authenticated storage policies: uploads and short-lived signed reads are server-mediated.
commit;

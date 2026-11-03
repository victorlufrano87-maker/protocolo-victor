-- Run once in the Supabase SQL Editor BEFORE deploying this version.
-- Existing day logs, weights and photos are preserved.
begin;

alter table public.sent_log enable row level security;
revoke all on public.sent_log from anon, authenticated;
grant all on public.sent_log to service_role;

create table if not exists public.sync_operations (
  user_id uuid not null references auth.users on delete cascade,
  id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.sync_operations enable row level security;
revoke all on public.sync_operations from anon, authenticated;
grant select, insert on public.sync_operations to authenticated;
drop policy if exists "own sync" on public.sync_operations;
create policy "own sync" on public.sync_operations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.json_merge_patch(target jsonb, patch jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare result jsonb; k text; v jsonb;
begin
  if jsonb_typeof(patch) <> 'object' then return patch; end if;
  result := case when jsonb_typeof(target) = 'object' then target else '{}'::jsonb end;
  for k, v in select * from jsonb_each(patch) loop
    if k in ('__proto__', 'constructor', 'prototype') then continue; end if;
    if v = 'null'::jsonb then result := result - k;
    else result := jsonb_set(result, array[k], public.json_merge_patch(result -> k, v), true);
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.json_merge_patch(jsonb,jsonb) from public, anon;
grant execute on function public.json_merge_patch(jsonb,jsonb) to authenticated;

create or replace function public.apply_sync_operation(p_id uuid, p_kind text, p_day date, p_patch jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); changed int;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_id is null or p_kind not in ('day','settings','weight') or p_kind is null
     or jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text) > 1000000 then
    raise exception 'invalid operation';
  end if;
  if p_kind <> 'settings' and p_day is null then raise exception 'day required'; end if;
  -- All changes for this user serialize, including two phones reconnecting.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  insert into public.sync_operations(user_id,id) values(uid,p_id) on conflict do nothing;
  get diagnostics changed = row_count;
  if changed = 0 then return; end if;
  if p_kind = 'day' then
    insert into public.day_logs(user_id,day) values(uid,p_day) on conflict do nothing;
    update public.day_logs set
      checks = public.json_merge_patch(checks, coalesce(p_patch->'checks','{}'::jsonb)),
      swaps = public.json_merge_patch(swaps, coalesce(p_patch->'swaps','{}'::jsonb)),
      water_ml = greatest(0, case when p_patch ? 'water_delta' then water_ml + (p_patch->>'water_delta')::int
        when p_patch ? 'water_ml' then (p_patch->>'water_ml')::int else water_ml end),
      free_meal = case when p_patch ? 'free_meal' then (p_patch->>'free_meal')::boolean else free_meal end,
      workout_at = case when p_patch ? 'workout_at' then (p_patch->>'workout_at')::timestamptz else workout_at end,
      updated_at = now()
    where user_id = uid and day = p_day;
  elsif p_kind = 'settings' then
    insert into public.settings(user_id) values(uid) on conflict do nothing;
    update public.settings set
      times = public.json_merge_patch(times, coalesce(p_patch->'times','{}'::jsonb)),
      supplies = public.json_merge_patch(supplies, coalesce(p_patch->'supplies','{}'::jsonb)),
      update_date = case when p_patch ? 'update_date' then (p_patch->>'update_date')::date else update_date end
    where user_id = uid;
  else
    if (p_patch->>'kg')::numeric is null or (p_patch->>'kg')::numeric not between 20 and 500 then raise exception 'invalid weight'; end if;
    -- Do not delete existing measurements. The lock prevents duplicate inserts.
    update public.weights set kg = (p_patch->>'kg')::numeric
      where id = (select id from public.weights where user_id = uid and day = p_day order by id desc limit 1);
    if not found then insert into public.weights(user_id,day,kg) values(uid,p_day,(p_patch->>'kg')::numeric); end if;
  end if;
end $$;
revoke all on function public.apply_sync_operation(uuid,text,date,jsonb) from public, anon;
grant execute on function public.apply_sync_operation(uuid,text,date,jsonb) to authenticated;

create or replace function public.replace_daily_photo(p_day date, p_type text, p_path text)
returns text[] language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); old_paths text[];
begin
  if uid is null or p_day is null or p_type not in ('rosto','corpo') or p_type is null or p_path is null
    or p_path not like uid::text || '/daily/' || p_day::text || '-' || p_type || '-%.jpg' then raise exception 'invalid photo'; end if;
  if not exists(select 1 from storage.objects where bucket_id = 'fotos' and name = p_path) then raise exception 'photo not uploaded'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || p_day::text || p_type, 0));
  select coalesce(array_agg(path),'{}'::text[]) into old_paths from public.photos
    where user_id = uid and day = p_day and path like uid::text || '/daily/' || p_day::text || '-' || p_type || '-%.jpg' and path <> p_path;
  if not exists(select 1 from public.photos where user_id = uid and path = p_path) then
    insert into public.photos(user_id,day,path) values(uid,p_day,p_path);
  end if;
  delete from public.photos where user_id = uid and path = any(old_paths);
  return old_paths;
end $$;
revoke all on function public.replace_daily_photo(date,text,text) from public, anon;
grant execute on function public.replace_daily_photo(date,text,text) to authenticated;

-- Quotas are shared by all Vercel instances, not stored in process memory.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  requests int not null default 0,
  minute timestamptz not null,
  minute_requests int not null default 0,
  primary key(user_id,day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;
create or replace function public.consume_ai_quota(p_uid uuid, p_daily_limit int default 40)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int; d date := (now() at time zone 'America/Sao_Paulo')::date; m timestamptz := date_trunc('minute',now());
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 then raise exception 'invalid quota'; end if;
  insert into public.ai_usage(user_id,day,minute) values(p_uid,d,m) on conflict do nothing;
  update public.ai_usage set requests = requests + 1, minute = m,
    minute_requests = case when minute = m then minute_requests + 1 else 1 end
    where user_id = p_uid and day = d and requests < p_daily_limit and (minute <> m or minute_requests < 6);
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.consume_ai_quota(uuid,int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid,int) to service_role;

-- A lease prevents concurrent cron runs from sending the same delivery.
alter table public.sent_log add column if not exists lease_until timestamptz;
alter table public.sent_log add column if not exists delivered_at timestamptz;
create or replace function public.claim_push_delivery(p_uid uuid, p_key text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  insert into public.sent_log(user_id,key,lease_until) values(p_uid,p_key,now() + interval '2 minutes')
    on conflict(user_id,key) do update set lease_until = excluded.lease_until
    where public.sent_log.delivered_at is null and public.sent_log.lease_until < now();
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.claim_push_delivery(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_push_delivery(uuid,text) to service_role;

commit;

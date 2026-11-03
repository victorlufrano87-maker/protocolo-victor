-- Apply AFTER 20261103_reliability.sql. No existing personal data is changed.
begin;
create table if not exists public.training_members (
 user_id uuid primary key references auth.users on delete cascade,
 email text not null,
 invited_by uuid not null references auth.users,
 status text not null default 'active' check(status in ('active','paused')),
 created_at timestamptz not null default now()
);
create table if not exists public.training_profiles (
 user_id uuid primary key references auth.users on delete cascade,
 answers jsonb not null,
 photo_consent boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists public.training_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 profile_version timestamptz not null,
 profile_snapshot jsonb not null,
 plan jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.training_sessions (
 id uuid primary key,
 user_id uuid not null references auth.users on delete cascade,
 plan_id uuid not null references public.training_plans on delete cascade,
 workout_id text not null,
 sets jsonb not null default '[]',
 feedback jsonb not null,
 completed_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.training_photos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 path text not null unique,
 created_at timestamptz not null default now()
);
create index if not exists training_plans_user_date on public.training_plans(user_id,created_at desc);
create index if not exists training_sessions_user_date on public.training_sessions(user_id,created_at desc);

alter table public.training_members enable row level security;
alter table public.training_profiles enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_photos enable row level security;
revoke all on public.training_members,public.training_profiles,public.training_plans,public.training_sessions,public.training_photos from anon,authenticated;
grant select on public.training_members,public.training_profiles,public.training_plans,public.training_sessions,public.training_photos to authenticated;
grant all on public.training_members,public.training_profiles,public.training_plans,public.training_sessions,public.training_photos to service_role;
drop policy if exists "training member own" on public.training_members;
create policy "training member own" on public.training_members for select to authenticated using(user_id=auth.uid());
drop policy if exists "training profile own" on public.training_profiles;
create policy "training profile own" on public.training_profiles for select to authenticated using(user_id=auth.uid());
drop policy if exists "training plan own" on public.training_plans;
create policy "training plan own" on public.training_plans for select to authenticated using(user_id=auth.uid());
drop policy if exists "training session own" on public.training_sessions;
create policy "training session own" on public.training_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists "training photo own" on public.training_photos;
create policy "training photo own" on public.training_photos for select to authenticated using(user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('training-photos','training-photos',false,5242880,array['image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png'];
drop policy if exists "training photos read own" on storage.objects;
create policy "training photos read own" on storage.objects for select to authenticated
 using(bucket_id='training-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "training photos insert own" on storage.objects;
create policy "training photos insert own" on storage.objects for insert to authenticated
 with check(bucket_id='training-photos' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.training_profiles p where p.user_id=auth.uid() and p.photo_consent=true)
  and not exists(select 1 from public.training_members m where m.user_id=auth.uid() and m.status='paused'));
drop policy if exists "training photos delete own" on storage.objects;
create policy "training photos delete own" on storage.objects for delete to authenticated
 using(bucket_id='training-photos' and (storage.foldername(name))[1]=auth.uid()::text);
commit;

-- Rode no Supabase: SQL Editor > New query > cole tudo > Run

create table if not exists day_logs (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  checks jsonb not null default '{}',     -- { "m1-0": true, ... }
  swaps jsonb not null default '{}',      -- { "m1-1": "2 unid. Ovo cozido (90 g)" }
  water_ml int not null default 0,
  free_meal boolean not null default false,
  workout_at timestamptz,
  updated_at timestamptz default now(),
  primary key (user_id, day)
);

create table if not exists weights (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  kg numeric(5,1) not null
);

create table if not exists photos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  path text not null
);

create table if not exists settings (
  user_id uuid primary key references auth.users on delete cascade,
  times jsonb not null default '{}',
  update_date date,
  supplies jsonb not null default '{}'    -- { "caps1": "2026-10-01" } data de início do pote
);

create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  sub jsonb not null
);

create table if not exists sent_log (
  user_id uuid not null,
  key text not null,
  primary key (user_id, key)
);

alter table day_logs enable row level security;
alter table weights enable row level security;
alter table photos enable row level security;
alter table settings enable row level security;
alter table push_subs enable row level security;

create policy "own" on day_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on weights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own" on push_subs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fotos de evolução (privadas)
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict do nothing;
create policy "fotos own" on storage.objects for all
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

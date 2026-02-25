create table if not exists public.tt_sound_stats_history (
  id bigint generated always as identity primary key,
  sound_id text not null,
  total_posts_global integer not null default 0,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists tt_sound_stats_history_sound_id_idx
  on public.tt_sound_stats_history (sound_id);

create index if not exists tt_sound_stats_history_captured_at_idx
  on public.tt_sound_stats_history (captured_at desc);

alter table public.tt_sound_stats_history enable row level security;

drop policy if exists "Public can read tt_sound_stats_history" on public.tt_sound_stats_history;
create policy "Public can read tt_sound_stats_history"
  on public.tt_sound_stats_history
  for select
  using (true);

drop policy if exists "Authenticated can write tt_sound_stats_history" on public.tt_sound_stats_history;
create policy "Authenticated can write tt_sound_stats_history"
  on public.tt_sound_stats_history
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');


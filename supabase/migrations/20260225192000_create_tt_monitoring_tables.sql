create extension if not exists pgcrypto;

create table if not exists public.tt_videos_current (
  video_id text primary key,
  video_url text,
  title text,
  thumbnail_url text,
  sound_id text not null,
  creator_username text,
  creator_followers bigint not null default 0,
  creator_size text not null default 'small',
  posted_at timestamptz,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  favorites bigint not null default 0,
  engagement_total bigint not null default 0,
  engagement_rate numeric not null default 0,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tt_videos_current_sound_id_idx
  on public.tt_videos_current (sound_id);

create index if not exists tt_videos_current_creator_size_idx
  on public.tt_videos_current (creator_size);

create index if not exists tt_videos_current_views_idx
  on public.tt_videos_current (views desc);

create table if not exists public.tt_video_snapshots (
  id bigint generated always as identity primary key,
  video_id text not null references public.tt_videos_current(video_id) on delete cascade,
  sound_id text not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  favorites bigint not null default 0,
  engagement_total bigint not null default 0,
  engagement_rate numeric not null default 0,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists tt_video_snapshots_video_id_idx
  on public.tt_video_snapshots (video_id);

create index if not exists tt_video_snapshots_sound_id_idx
  on public.tt_video_snapshots (sound_id);

create index if not exists tt_video_snapshots_captured_at_idx
  on public.tt_video_snapshots (captured_at desc);

create table if not exists public.tt_sound_stats_current (
  sound_id text primary key,
  total_posts integer not null default 0,
  big_creators_count integer not null default 0,
  small_high_engagement_count integer not null default 0,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tt_videos_current enable row level security;
alter table public.tt_video_snapshots enable row level security;
alter table public.tt_sound_stats_current enable row level security;

drop policy if exists "Public can read tt_videos_current" on public.tt_videos_current;
create policy "Public can read tt_videos_current"
  on public.tt_videos_current
  for select
  using (true);

drop policy if exists "Public can read tt_video_snapshots" on public.tt_video_snapshots;
create policy "Public can read tt_video_snapshots"
  on public.tt_video_snapshots
  for select
  using (true);

drop policy if exists "Public can read tt_sound_stats_current" on public.tt_sound_stats_current;
create policy "Public can read tt_sound_stats_current"
  on public.tt_sound_stats_current
  for select
  using (true);

drop policy if exists "Authenticated can write tt_videos_current" on public.tt_videos_current;
create policy "Authenticated can write tt_videos_current"
  on public.tt_videos_current
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can write tt_video_snapshots" on public.tt_video_snapshots;
create policy "Authenticated can write tt_video_snapshots"
  on public.tt_video_snapshots
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated can write tt_sound_stats_current" on public.tt_sound_stats_current;
create policy "Authenticated can write tt_sound_stats_current"
  on public.tt_sound_stats_current
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

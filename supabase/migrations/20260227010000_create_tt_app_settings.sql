create table if not exists public.tt_app_settings (
  id integer primary key default 1 check (id = 1),
  app_name text not null default 'VISA SOUND MONITOR',
  app_subtitle text not null default 'TikTok Tracking Dashboard',
  logo_text text not null default 'V',
  footer_title text not null default 'VISA SOUND MONITOR',
  footer_subtitle text not null default 'Live TikTok sound monitoring dashboard',
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.tt_app_settings (
  id,
  app_name,
  app_subtitle,
  logo_text,
  footer_title,
  footer_subtitle
)
values (
  1,
  'VISA SOUND MONITOR',
  'TikTok Tracking Dashboard',
  'V',
  'VISA SOUND MONITOR',
  'Live TikTok sound monitoring dashboard'
)
on conflict (id) do nothing;

alter table public.tt_app_settings enable row level security;

drop policy if exists "Public can read tt_app_settings" on public.tt_app_settings;
create policy "Public can read tt_app_settings"
  on public.tt_app_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated can write tt_app_settings" on public.tt_app_settings;
create policy "Authenticated can write tt_app_settings"
  on public.tt_app_settings
  for all
  to authenticated
  using (true)
  with check (true);


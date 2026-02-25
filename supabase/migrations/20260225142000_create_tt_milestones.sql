create table if not exists public.tt_milestones (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target_posts integer not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tt_milestones_sort_order_idx
  on public.tt_milestones (sort_order asc);

create index if not exists tt_milestones_is_active_idx
  on public.tt_milestones (is_active);

alter table public.tt_milestones enable row level security;

drop policy if exists "Public can read tt_milestones" on public.tt_milestones;
create policy "Public can read tt_milestones"
  on public.tt_milestones
  for select
  using (true);

drop policy if exists "Authenticated can write tt_milestones" on public.tt_milestones;
create policy "Authenticated can write tt_milestones"
  on public.tt_milestones
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');


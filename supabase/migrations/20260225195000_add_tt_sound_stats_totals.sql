alter table public.tt_sound_stats_current
  add column if not exists batch_posts integer not null default 0;

alter table public.tt_sound_stats_current
  add column if not exists total_posts_global integer not null default 0;

update public.tt_sound_stats_current
set
  batch_posts = coalesce(batch_posts, total_posts, 0),
  total_posts_global = coalesce(total_posts_global, total_posts, 0);


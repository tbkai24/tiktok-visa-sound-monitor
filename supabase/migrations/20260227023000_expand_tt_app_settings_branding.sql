alter table public.tt_app_settings
  add column if not exists logo_url text not null default '',
  add column if not exists copyright_text text not null default 'TikTok Visa Monitor',
  add column if not exists social_youtube text not null default '',
  add column if not exists social_tiktok text not null default '',
  add column if not exists social_facebook text not null default '',
  add column if not exists social_instagram text not null default '';

update public.tt_app_settings
set
  logo_url = coalesce(logo_url, ''),
  copyright_text = coalesce(copyright_text, 'TikTok Visa Monitor'),
  social_youtube = coalesce(social_youtube, ''),
  social_tiktok = coalesce(social_tiktok, ''),
  social_facebook = coalesce(social_facebook, ''),
  social_instagram = coalesce(social_instagram, '')
where id = 1;

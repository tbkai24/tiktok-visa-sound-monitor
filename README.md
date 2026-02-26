# TikTok Visa Sound Monitor

## TS Fetcher (no GitHub runner required)

This project now includes a TypeScript fetcher that collects TikTok sound videos and posts them to the Supabase Edge Function `tt-auto-fetch`.

Script:
- `scripts/tt_try_fetch.ts`

NPM command:
- `npm run fetch:tt:ts`

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy env template:
```bash
cp .env.example .env
```

3. Fill required `.env` values:
- `TTVM_SUPABASE_URL`
- `TTVM_SUPABASE_ANON_KEY`
- `TTVM_TIKTOK_SOUND_IDS`

Recommended:
- `TTVM_TIKTOK_MS_TOKEN`

Optional:
- `TTVM_TIKTOK_PROXY`

## Run once

```bash
npm run fetch:tt:ts
```

## Run every 30 minutes (Windows Task Scheduler)

Action command:
- `powershell`

Arguments:
```powershell
-NoProfile -Command "cd 'C:\path\to\tiktok-visa-sound-monitor'; npm run fetch:tt:ts"
```

Trigger:
- Repeat task every `30 minutes`

## Notes

- Without proxy, TikTok may intermittently block/rate-limit requests.
- Edge Function remains the ingestion layer; the fetcher runs outside Supabase Edge runtime.

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib import request as urlrequest

from TikTokApi import TikTokApi


def parse_sound_ids(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def to_int(value: Any) -> int:
    try:
        if isinstance(value, str):
            return int(value.replace(",", "").strip())
        return int(value)
    except Exception:
        return 0


def to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
    return default


def to_iso(value: Any) -> str:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(int(value), tz=timezone.utc).isoformat()
    if isinstance(value, str):
        return value
    return datetime.now(tz=timezone.utc).isoformat()


def post_to_function(function_url: str, bearer_token: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }
    req = urlrequest.Request(function_url, data=body, headers=headers, method="POST")
    with urlrequest.urlopen(req, timeout=120) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw)


def extract_global_total_posts(sound_info: dict[str, Any]) -> int:
    candidates = [
        (((sound_info.get("musicInfo") or {}).get("stats") or {}).get("videoCount")),
        (((sound_info.get("musicInfo") or {}).get("music") or {}).get("videoCount")),
        (((sound_info.get("musicInfo") or {}).get("music") or {}).get("stats") or {}).get("videoCount"),
        ((sound_info.get("stats") or {}).get("videoCount")),
        ((sound_info.get("stats") or {}).get("video_count")),
    ]
    for value in candidates:
        total = to_int(value)
        if total > 0:
            return total
    return 0


def extract_creator_followers(video_data: dict[str, Any], author: dict[str, Any]) -> int:
    author_stats = video_data.get("authorStats", {})
    if not isinstance(author_stats, dict):
        author_stats = {}

    user_info = video_data.get("authorInfo", {})
    if not isinstance(user_info, dict):
        user_info = {}

    nested_stats = (user_info.get("stats") or {}) if isinstance(user_info, dict) else {}
    if not isinstance(nested_stats, dict):
        nested_stats = {}

    candidates = [
        author.get("followerCount"),
        author.get("follower_count"),
        author_stats.get("followerCount"),
        author_stats.get("follower_count"),
        nested_stats.get("followerCount"),
        nested_stats.get("follower_count"),
    ]
    for value in candidates:
        count = to_int(value)
        if count > 0:
            return count
    return 0


async def collect_videos(
    sound_ids: list[str],
    max_videos_per_sound: int,
    ms_token: str | None,
    browser: str,
    headless: bool,
    session_sleep_after_seconds: int,
    proxies: list[str] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    output: list[dict[str, Any]] = []
    sound_stats: list[dict[str, Any]] = []

    async with TikTokApi() as api:
        session_kwargs: dict[str, Any] = {
            "num_sessions": 1,
            "sleep_after": max(1, session_sleep_after_seconds),
            "browser": browser,
            "headless": headless,
        }
        if ms_token:
            session_kwargs["ms_tokens"] = [ms_token]
        if proxies:
            session_kwargs["proxies"] = proxies

        try:
            await api.create_sessions(**session_kwargs)
        except TypeError:
            # Compatibility fallback for older TikTokApi signatures.
            fallback_kwargs: dict[str, Any] = {
                "num_sessions": 1,
                "sleep_after": max(1, session_sleep_after_seconds),
            }
            if ms_token:
                fallback_kwargs["ms_tokens"] = [ms_token]
            await api.create_sessions(**fallback_kwargs)

        for sound_id in sound_ids:
            sound = api.sound(id=sound_id)
            try:
                info = await sound.info()
                total_posts_global = extract_global_total_posts(info if isinstance(info, dict) else {})
            except Exception:
                total_posts_global = 0
            sound_stats.append({"sound_id": sound_id, "total_posts_global": total_posts_global})
            found = 0

            async for video in sound.videos(count=max_videos_per_sound):
                data = getattr(video, "as_dict", {}) or {}
                author = data.get("author", {}) if isinstance(data.get("author"), dict) else {}
                stats = data.get("stats", {}) if isinstance(data.get("stats"), dict) else {}

                video_id = str(data.get("id") or "")
                if not video_id:
                    continue

                output.append(
                    {
                        "video_id": video_id,
                        "sound_id": sound_id,
                        "video_url": f"https://www.tiktok.com/@{author.get('uniqueId', 'user')}/video/{video_id}",
                        "title": data.get("desc", ""),
                        "thumbnail_url": (data.get("video", {}) or {}).get("cover", ""),
                        "creator_username": author.get("uniqueId", ""),
                        "creator_followers": extract_creator_followers(data, author),
                        "posted_at": to_iso(data.get("createTime")),
                        "views": to_int(stats.get("playCount", 0)),
                        "likes": to_int(stats.get("diggCount", 0)),
                        "comments": to_int(stats.get("commentCount", 0)),
                        "shares": to_int(stats.get("shareCount", 0)),
                        "favorites": to_int(stats.get("collectCount", 0)),
                    }
                )

                found += 1
                if found >= max_videos_per_sound:
                    break

    return output, sound_stats


async def collect_videos_with_retries(
    sound_ids: list[str],
    max_videos_per_sound: int,
    ms_token: str | None,
    browser: str,
    headless: bool,
    session_sleep_after_seconds: int,
    proxies: list[str] | None,
    retries: int,
    retry_delay_seconds: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    last_error: Exception | None = None
    attempts = max(1, retries)
    strategy_profiles: list[tuple[str, bool]] = []
    for profile in [
        (browser, headless),
        ("webkit", True),
        ("chromium", True),
    ]:
        if profile not in strategy_profiles:
            strategy_profiles.append(profile)
    for attempt in range(1, attempts + 1):
        selected_browser, selected_headless = strategy_profiles[(attempt - 1) % len(strategy_profiles)]
        try:
            print(
                f"Fetch attempt {attempt}/{attempts} using browser={selected_browser}, headless={selected_headless}",
                file=sys.stderr,
            )
            return await collect_videos(
                sound_ids=sound_ids,
                max_videos_per_sound=max_videos_per_sound,
                ms_token=ms_token,
                browser=selected_browser,
                headless=selected_headless,
                session_sleep_after_seconds=session_sleep_after_seconds,
                proxies=proxies,
            )
        except Exception as error:  # pragma: no cover - runtime resilience path
            last_error = error if isinstance(error, Exception) else Exception(str(error))
            if attempt >= attempts:
                break
            delay = max(1, retry_delay_seconds) * attempt
            print(
                f"Fetch attempt {attempt}/{attempts} failed: {last_error}. Retrying in {delay}s...",
                file=sys.stderr,
            )
            await asyncio.sleep(delay)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Fetch failed without explicit error")


async def main() -> int:
    supabase_url = (os.getenv("TTVM_SUPABASE_URL", "") or "").strip()
    anon_key = (os.getenv("TTVM_SUPABASE_ANON_KEY", "") or "").strip()
    sound_ids = parse_sound_ids((os.getenv("TTVM_TIKTOK_SOUND_IDS", "") or "").strip())
    function_name = (os.getenv("TTVM_FUNCTION_NAME", "tt-auto-fetch") or "").strip()
    ms_token = (os.getenv("TTVM_TIKTOK_MS_TOKEN", "") or "").strip() or None
    browser = (os.getenv("TTVM_TIKTOK_BROWSER", "webkit") or "").strip() or "webkit"
    headless = to_bool(os.getenv("TTVM_TIKTOK_HEADLESS", "false"), default=False)
    session_sleep_after_seconds = to_int(os.getenv("TTVM_SESSION_SLEEP_AFTER_SECONDS", "5"))
    proxy = (os.getenv("TTVM_TIKTOK_PROXY", "") or "").strip() or None
    proxies = [proxy] if proxy else None
    max_videos = to_int(os.getenv("TTVM_MAX_VIDEOS_PER_SOUND", "20"))
    fetch_retries = to_int(os.getenv("TTVM_FETCH_RETRIES", "3"))
    retry_delay_seconds = to_int(os.getenv("TTVM_RETRY_DELAY_SECONDS", "3"))

    if not supabase_url or not anon_key or not sound_ids:
        print(
            "Missing env. Required: TTVM_SUPABASE_URL, TTVM_SUPABASE_ANON_KEY, TTVM_TIKTOK_SOUND_IDS",
            file=sys.stderr,
        )
        return 1
    if not proxies:
        print(
            "Warning: TTVM_TIKTOK_PROXY is not set. GitHub-hosted runners are often rate-limited or blocked by TikTok.",
            file=sys.stderr,
        )

    function_url = f"{supabase_url}/functions/v1/{function_name}"
    print(f"Fetching TikTok videos for sounds: {', '.join(sound_ids)}")
    videos, sound_stats = await collect_videos_with_retries(
        sound_ids=sound_ids,
        max_videos_per_sound=max_videos,
        ms_token=ms_token,
        browser=browser,
        headless=headless,
        session_sleep_after_seconds=session_sleep_after_seconds,
        proxies=proxies,
        retries=fetch_retries,
        retry_delay_seconds=retry_delay_seconds,
    )

    if not videos:
        print("No videos collected. Try adding TTVM_TIKTOK_MS_TOKEN.", file=sys.stderr)
        return 2

    payload = {"sound_ids": sound_ids, "videos": videos, "sound_stats": sound_stats}
    print(f"Posting {len(videos)} videos to {function_url}")
    response = post_to_function(function_url, anon_key, payload)
    print(json.dumps(response, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

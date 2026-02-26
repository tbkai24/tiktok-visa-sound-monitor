import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";

type Json = Record<string, unknown>;

type VideoPayload = {
  video_id: string;
  sound_id: string;
  video_url: string;
  title: string;
  thumbnail_url: string;
  creator_username: string;
  creator_followers: number;
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
};

type SoundStatPayload = {
  sound_id: string;
  total_posts_global: number;
};

const parseSoundIds = (raw: string) =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const toInt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
};

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const toIso = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return new Date(asNumber * 1000).toISOString();
  }
  return new Date().toISOString();
};

const firstNonEmptyString = (values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const postToFunction = async (functionUrl: string, bearerToken: string, payload: Json) => {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Function request failed (${response.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as Json) : {};
};

const readJsonScript = async (page: Page, scriptId: string): Promise<Json | null> => {
  const raw = await page
    .$eval(`#${scriptId}`, (node) => node.textContent ?? "")
    .catch(() => "");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return null;
  }
};

const findObjectWithKey = (input: unknown, key: string): Json | null => {
  if (!input || typeof input !== "object") return null;
  const value = input as Json;
  if (key in value && value[key] && typeof value[key] === "object") {
    return value[key] as Json;
  }
  for (const child of Object.values(value)) {
    const found = findObjectWithKey(child, key);
    if (found) return found;
  }
  return null;
};

const extractFromSigiState = (
  sigi: Json,
  soundId: string,
  maxVideosPerSound: number,
): { videos: VideoPayload[]; totalPostsGlobal: number } => {
  const musicModule = (sigi.MusicModule as Json | undefined) ?? {};
  const itemModule = (sigi.ItemModule as Json | undefined) ?? {};

  const musicFromMap = (musicModule[soundId] as Json | undefined) ?? null;
  const musicFromAny =
    Object.values(musicModule).find((value) => {
      if (!value || typeof value !== "object") return false;
      const row = value as Json;
      return String(row.id ?? row.musicId ?? "") === soundId;
    }) ?? null;
  const music = ((musicFromMap ?? musicFromAny) as Json | null) ?? {};

  const totalPostsGlobal =
    toInt((music.stats as Json | undefined)?.videoCount) ||
    toInt((music.stats as Json | undefined)?.video_count) ||
    toInt((music.videoCount as unknown) ?? 0);

  const videos: VideoPayload[] = [];
  for (const row of Object.values(itemModule)) {
    if (!row || typeof row !== "object") continue;
    const item = row as Json;
    const musicRef = (item.music as Json | undefined) ?? {};
    const itemSoundId = firstNonEmptyString([
      musicRef.id,
      musicRef.mid,
      musicRef.musicId,
      item.musicId,
      item.sound_id,
    ]);
    if (itemSoundId !== soundId) continue;

    const id = firstNonEmptyString([item.id, item.aweme_id]);
    if (!id) continue;

    const author = (item.author as Json | undefined) ?? {};
    const stats = (item.stats as Json | undefined) ?? {};
    const video = (item.video as Json | undefined) ?? {};
    const authorStats = (item.authorStats as Json | undefined) ?? {};

    const username = firstNonEmptyString([author.uniqueId, author.unique_id, author.nickname, "user"]);
    videos.push({
      video_id: id,
      sound_id: soundId,
      video_url: `https://www.tiktok.com/@${username}/video/${id}`,
      title: firstNonEmptyString([item.desc, item.title]),
      thumbnail_url: firstNonEmptyString([video.cover, video.originCover, video.dynamicCover]),
      creator_username: username === "user" ? "" : username,
      creator_followers: toInt(author.followerCount) || toInt(authorStats.followerCount),
      posted_at: toIso(item.createTime),
      views: toInt(stats.playCount),
      likes: toInt(stats.diggCount),
      comments: toInt(stats.commentCount),
      shares: toInt(stats.shareCount),
      favorites: toInt(stats.collectCount),
    });

    if (videos.length >= maxVideosPerSound) break;
  }

  return { videos, totalPostsGlobal };
};

const extractFromUniversalData = (
  universal: Json,
  soundId: string,
  maxVideosPerSound: number,
): { videos: VideoPayload[]; totalPostsGlobal: number } => {
  const itemModule = findObjectWithKey(universal, "ItemModule") ?? {};
  const musicModule = findObjectWithKey(universal, "MusicModule") ?? {};

  const pseudoSigi: Json = {
    ItemModule: itemModule,
    MusicModule: musicModule,
  };
  return extractFromSigiState(pseudoSigi, soundId, maxVideosPerSound);
};

const collectForSound = async (
  page: Page,
  soundId: string,
  maxVideosPerSound: number,
): Promise<{ videos: VideoPayload[]; totalPostsGlobal: number }> => {
  const urlCandidates = [
    `https://www.tiktok.com/music/-${soundId}`,
    `https://www.tiktok.com/music/original-sound-${soundId}`,
  ];

  for (const url of urlCandidates) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
    await page.waitForTimeout(2_000);

    const sigi = await readJsonScript(page, "SIGI_STATE");
    if (sigi) {
      const extracted = extractFromSigiState(sigi, soundId, maxVideosPerSound);
      if (extracted.videos.length > 0 || extracted.totalPostsGlobal > 0) return extracted;
    }

    const universal = await readJsonScript(page, "__UNIVERSAL_DATA_FOR_REHYDRATION__");
    if (universal) {
      const extracted = extractFromUniversalData(universal, soundId, maxVideosPerSound);
      if (extracted.videos.length > 0 || extracted.totalPostsGlobal > 0) return extracted;
    }
  }

  return { videos: [], totalPostsGlobal: 0 };
};

const withBrowser = async <T>(
  browserName: "chromium" | "webkit",
  headless: boolean,
  proxy: string | null,
  msToken: string | null,
  run: (page: Page) => Promise<T>,
) => {
  const browserLauncher = browserName === "webkit" ? webkit : chromium;
  const browser = await browserLauncher.launch({ headless });
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext(
      proxy
        ? {
            proxy: { server: proxy },
          }
        : undefined,
    );
    if (msToken) {
      await context.addCookies([
        {
          name: "msToken",
          value: msToken,
          domain: ".tiktok.com",
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "None",
        },
      ]);
    }
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    return await run(page);
  } finally {
    if (context) await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};

const collectWithRetries = async (
  soundIds: string[],
  maxVideosPerSound: number,
  msToken: string | null,
  browser: "chromium" | "webkit",
  headless: boolean,
  proxy: string | null,
  retries: number,
  retryDelaySeconds: number,
) => {
  let lastError: unknown;
  const attempts = Math.max(1, retries);
  const strategy: Array<{ browser: "chromium" | "webkit"; headless: boolean }> = [];
  for (const profile of [
    { browser, headless },
    { browser: "webkit" as const, headless: true },
    { browser: "chromium" as const, headless: true },
  ]) {
    if (!strategy.some((row) => row.browser === profile.browser && row.headless === profile.headless)) {
      strategy.push(profile);
    }
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const selected = strategy[(attempt - 1) % strategy.length];
    try {
      console.error(
        `Fetch attempt ${attempt}/${attempts} using browser=${selected.browser}, headless=${selected.headless}`,
      );

      const result = await withBrowser(
        selected.browser,
        selected.headless,
        proxy,
        msToken,
        async (page): Promise<{ videos: VideoPayload[]; soundStats: SoundStatPayload[] }> => {
          const allVideos: VideoPayload[] = [];
          const soundStats: SoundStatPayload[] = [];

          for (const soundId of soundIds) {
            const { videos, totalPostsGlobal } = await collectForSound(page, soundId, maxVideosPerSound);
            soundStats.push({ sound_id: soundId, total_posts_global: totalPostsGlobal });
            allVideos.push(...videos.slice(0, maxVideosPerSound));
          }

          return { videos: allVideos, soundStats };
        },
      );

      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const delay = Math.max(1, retryDelaySeconds) * attempt * 1000;
      console.error(`Fetch attempt ${attempt}/${attempts} failed: ${String(error)}. Retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const main = async () => {
  const supabaseUrl = (process.env.TTVM_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.TTVM_SUPABASE_ANON_KEY ?? "").trim();
  const soundIds = parseSoundIds((process.env.TTVM_TIKTOK_SOUND_IDS ?? "").trim());
  const functionName = (process.env.TTVM_FUNCTION_NAME ?? "tt-auto-fetch").trim();
  const msToken = (process.env.TTVM_TIKTOK_MS_TOKEN ?? "").trim() || null;
  const proxy = (process.env.TTVM_TIKTOK_PROXY ?? "").trim() || null;
  const browserEnv = (process.env.TTVM_TIKTOK_BROWSER ?? "webkit").trim().toLowerCase();
  const browser: "chromium" | "webkit" = browserEnv === "chromium" ? "chromium" : "webkit";
  const headless = toBool(process.env.TTVM_TIKTOK_HEADLESS, true);
  const maxVideosPerSound = toInt(process.env.TTVM_MAX_VIDEOS_PER_SOUND ?? "20");
  const retries = toInt(process.env.TTVM_FETCH_RETRIES ?? "3");
  const retryDelaySeconds = toInt(process.env.TTVM_RETRY_DELAY_SECONDS ?? "3");

  if (!supabaseUrl || !anonKey || soundIds.length === 0) {
    console.error(
      "Missing env. Required: TTVM_SUPABASE_URL, TTVM_SUPABASE_ANON_KEY, TTVM_TIKTOK_SOUND_IDS",
    );
    process.exit(1);
  }
  if (!proxy) {
    console.error(
      "Warning: TTVM_TIKTOK_PROXY is not set. Some hosts may be rate-limited or blocked by TikTok.",
    );
  }

  const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  console.log(`Fetching TikTok videos for sounds: ${soundIds.join(", ")}`);

  const { videos, soundStats } = await collectWithRetries(
    soundIds,
    Math.max(1, maxVideosPerSound),
    msToken,
    browser,
    headless,
    proxy,
    Math.max(1, retries),
    Math.max(1, retryDelaySeconds),
  );

  if (videos.length === 0) {
    console.error("No videos collected. Try rotating msToken or adding TTVM_TIKTOK_PROXY.");
    process.exit(2);
  }

  const payload: Json = {
    sound_ids: soundIds,
    videos,
    sound_stats: soundStats,
  };
  console.log(`Posting ${videos.length} videos to ${functionUrl}`);
  const response = await postToFunction(functionUrl, anonKey, payload);
  console.log(JSON.stringify(response, null, 2));
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

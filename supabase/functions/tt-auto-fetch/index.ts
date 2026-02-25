import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type RawVideo = Record<string, unknown>

type IncomingSoundStat = {
  sound_id: string
  total_posts_global?: number
}

type IncomingPayload = {
  sound_ids?: string[]
  videos?: RawVideo[]
  sound_stats?: IncomingSoundStat[]
}

const jsonHeaders = { 'Content-Type': 'application/json' }

const parseSoundIds = (raw: string) =>
  raw
    .split(',')
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const toStringSafe = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const toIso = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string') {
    const direct = new Date(value)
    if (!Number.isNaN(direct.getTime())) return direct.toISOString()
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      const ms = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000
      return new Date(ms).toISOString()
    }
  }
  return null
}

const firstString = (video: RawVideo, keys: string[]) => {
  for (const key of keys) {
    const value = toStringSafe(video[key])
    if (value) return value
  }
  return ''
}

const firstNumber = (video: RawVideo, keys: string[]) => {
  for (const key of keys) {
    const value = toNumber(video[key])
    if (value > 0) return value
  }
  return 0
}

const deriveCreatorSize = (followers: number) => {
  if (followers >= 50_000) return 'big'
  if (followers >= 10_000) return 'mid'
  return 'small'
}

const parseRequestPayload = async (request: Request): Promise<IncomingPayload> => {
  const text = await request.text()
  if (!text.trim()) return {}

  try {
    return JSON.parse(text) as IncomingPayload
  } catch {
    throw new Error('Invalid JSON request body')
  }
}

const normalizeSoundStats = (stats: IncomingSoundStat[] | undefined) => {
  const map = new Map<string, number>()
  for (const row of stats ?? []) {
    const soundId = toStringSafe(row?.sound_id)
    if (!soundId) continue
    const total = toNumber(row?.total_posts_global)
    if (total > 0) map.set(soundId, total)
  }
  return map
}

const fetchProviderPayload = async () => {
  const url = (Deno.env.get('TIKTOK_FETCH_URL') ?? '').trim()
  if (!url) return null

  const apiKey = (Deno.env.get('TIKTOK_FETCH_API_KEY') ?? '').trim()
  const authScheme = (Deno.env.get('TIKTOK_FETCH_AUTH_SCHEME') ?? 'Bearer').trim()
  const authHeaderName = (Deno.env.get('TIKTOK_FETCH_HEADER') ?? 'Authorization').trim()

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) {
    headers[authHeaderName] = authScheme ? `${authScheme} ${apiKey}`.trim() : apiKey
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Provider fetch failed (${response.status})`)
  }

  return (await response.json()) as IncomingPayload
}

const normalizeVideos = (videos: RawVideo[], allowedSoundIds: string[], capturedAt: string) => {
  const allowed = new Set(allowedSoundIds)
  const normalized: Array<Record<string, unknown>> = []

  for (const video of videos) {
    const videoId = firstString(video, ['video_id', 'id', 'aweme_id'])
    if (!videoId) continue

    const soundId = firstString(video, ['sound_id', 'music_id'])
    if (!soundId || (allowed.size > 0 && !allowed.has(soundId))) continue

    const views = firstNumber(video, ['views', 'play_count', 'view_count'])
    const likes = firstNumber(video, ['likes', 'digg_count', 'like_count'])
    const comments = firstNumber(video, ['comments', 'comment_count'])
    const shares = firstNumber(video, ['shares', 'share_count'])
    const favorites = firstNumber(video, ['favorites', 'collect_count', 'favorite_count'])
    const engagementTotal = likes + comments + shares + favorites
    const engagementRate = views > 0 ? engagementTotal / views : 0

    const creatorFollowers = firstNumber(video, [
      'creator_followers',
      'author_followers',
      'author_follower_count',
      'follower_count',
    ])

    const postedAt =
      toIso(video.posted_at) ??
      toIso(video.create_time) ??
      toIso(video.created_at) ??
      capturedAt

    normalized.push({
      video_id: videoId,
      video_url: firstString(video, ['video_url', 'url', 'share_url']),
      title: firstString(video, ['title', 'desc', 'description']),
      thumbnail_url: firstString(video, ['thumbnail_url', 'cover_url', 'cover']),
      sound_id: soundId,
      creator_username: firstString(video, ['creator_username', 'author_username', 'author']),
      creator_followers: creatorFollowers,
      creator_size: deriveCreatorSize(creatorFollowers),
      posted_at: postedAt,
      views,
      likes,
      comments,
      shares,
      favorites,
      engagement_total: engagementTotal,
      engagement_rate: engagementRate,
      captured_at: capturedAt,
    })
  }

  return normalized
}

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey =
    Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const envSoundIds = parseSoundIds(
    Deno.env.get('TIKTOK_SOUND_IDS') ?? Deno.env.get('TTVM_TIKTOK_SOUND_IDS') ?? '',
  )

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'Missing required secrets: PROJECT_URL/SUPABASE_URL, SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY',
      }),
      { status: 500, headers: jsonHeaders },
    )
  }

  if (envSoundIds.length === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing required secret: TIKTOK_SOUND_IDS (comma-separated sound IDs)',
      }),
      { status: 500, headers: jsonHeaders },
    )
  }

  try {
    const warnings: string[] = []
    const requestPayload = await parseRequestPayload(request)
    const hasRequestVideos = (requestPayload.videos?.length ?? 0) > 0
    const hasRequestSoundStats = (requestPayload.sound_stats?.length ?? 0) > 0
    const hasRequestSoundIds = (requestPayload.sound_ids?.length ?? 0) > 0
    const hasAnyRequestPayload = hasRequestVideos || hasRequestSoundStats || hasRequestSoundIds

    const providerPayload = hasAnyRequestPayload ? null : await fetchProviderPayload()
    const payload = hasAnyRequestPayload ? requestPayload : providerPayload ?? {}
    const payloadSoundIds = payload.sound_ids?.filter((value) => !!value?.trim()) ?? []
    const soundIds = payloadSoundIds.length ? payloadSoundIds : envSoundIds
    const providedGlobalTotals = normalizeSoundStats(payload.sound_stats)

    const rawVideos = payload.videos ?? []
    const hasStatsOnlyPayload = providedGlobalTotals.size > 0 && rawVideos.length === 0

    const capturedAt = new Date().toISOString()
    const normalizedVideos = hasStatsOnlyPayload
      ? []
      : normalizeVideos(rawVideos, soundIds, capturedAt)
    if (!normalizedVideos.length && !hasStatsOnlyPayload) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'No videos found/matched. Provide { "videos": [...] }, configure TIKTOK_FETCH_URL, or send sound_stats for stats-only updates.',
          sound_ids: soundIds,
        }),
        { status: 404, headers: jsonHeaders },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    if (normalizedVideos.length > 0) {
      const { error: currentUpsertError } = await supabase
        .from('tt_videos_current')
        .upsert(normalizedVideos, { onConflict: 'video_id' })

      if (currentUpsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `tt_videos_current upsert failed: ${currentUpsertError.message}`,
          }),
          { status: 500, headers: jsonHeaders },
        )
      }
    }

    const snapshotPayload = normalizedVideos.map((row) => ({
      video_id: row.video_id,
      sound_id: row.sound_id,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      favorites: row.favorites,
      engagement_total: row.engagement_total,
      engagement_rate: row.engagement_rate,
      captured_at: capturedAt,
    }))

    if (snapshotPayload.length > 0) {
      const { error: snapshotInsertError } = await supabase
        .from('tt_video_snapshots')
        .insert(snapshotPayload)

      if (snapshotInsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `tt_video_snapshots insert failed: ${snapshotInsertError.message}`,
          }),
          { status: 500, headers: jsonHeaders },
        )
      }
    }

    const grouped = new Map<string, Array<Record<string, unknown>>>()
    for (const row of normalizedVideos) {
      const soundId = String(row.sound_id)
      const list = grouped.get(soundId) ?? []
      list.push(row)
      grouped.set(soundId, list)
    }
    for (const soundId of soundIds) {
      if (!grouped.has(soundId)) grouped.set(soundId, [])
    }

    const statsPayload = Array.from(grouped.entries()).map(([soundId, rows]) => {
      const batchPosts = rows.length
      const globalPosts = providedGlobalTotals.get(soundId) ?? batchPosts
      const bigCreators = rows.filter((row) => row.creator_size === 'big').length
      const smallHighEngagement = rows.filter(
        (row) => row.creator_size === 'small' && Number(row.engagement_rate ?? 0) >= 0.1,
      ).length

      return {
        sound_id: soundId,
        total_posts: globalPosts,
        batch_posts: batchPosts,
        total_posts_global: globalPosts,
        big_creators_count: bigCreators,
        small_high_engagement_count: smallHighEngagement,
        captured_at: capturedAt,
      }
    })

    const { error: statsUpsertError } = await supabase
      .from('tt_sound_stats_current')
      .upsert(statsPayload, { onConflict: 'sound_id' })

    if (statsUpsertError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `tt_sound_stats_current upsert failed: ${statsUpsertError.message}`,
        }),
        { status: 500, headers: jsonHeaders },
      )
    }

    const historyPayload = statsPayload.map((row) => ({
      sound_id: row.sound_id,
      total_posts_global: row.total_posts_global,
      captured_at: capturedAt,
    }))
    const { error: historyInsertError } = await supabase
      .from('tt_sound_stats_history')
      .insert(historyPayload)
    if (historyInsertError) {
      warnings.push(`tt_sound_stats_history insert skipped: ${historyInsertError.message}`)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        function: 'tt-auto-fetch',
        captured_at: capturedAt,
        sound_ids: soundIds,
        processed_count: normalizedVideos.length,
        stats_only: hasStatsOnlyPayload,
        warnings,
      }),
      { status: 200, headers: jsonHeaders },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown function error'
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: jsonHeaders,
    })
  }
})

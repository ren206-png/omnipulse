/**
 * Video publishers for YouTube (Data API v3 resumable upload) and TikTok (Content Posting API,
 * direct post via FILE_UPLOAD). Both platforms only accept video, so a post with no video attached
 * fails with a clear, non-retryable error.
 *
 * Token handling: the stored access token is tried first; on an auth failure the refresh token is
 * used once to get a new access token (persisted through `persist`) and the publish is retried.
 */
import { logger } from './logger.js'

/** An error retrying cannot fix (no video attached, revoked authorization, missing scope...). */
export class PermanentPublishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentPublishError'
  }
}

/** Internal: the platform said the access token is invalid/expired. */
class AuthExpiredError extends Error {}

export interface PublishTokens {
  accessToken: string
  refreshToken?: string | null
}
export type PersistTokens = (tokens: { accessToken: string; refreshToken?: string }) => Promise<void>

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i
const YOUTUBE_REQUEST_TIMEOUT_MS = 30_000
const YOUTUBE_UPLOAD_TIMEOUT_MS = 15 * 60_000
const TIKTOK_REQUEST_TIMEOUT_MS = 30_000
const TIKTOK_MAX_BYTES = 128 * 1024 * 1024 // whole file is buffered for chunked upload
const TIKTOK_CHUNK_BYTES = 64 * 1024 * 1024 // TikTok: chunks of 5–64MB (last may be up to 128MB)
const TIKTOK_POLL_TRIES = 20
const TIKTOK_POLL_INTERVAL_MS = 3_000

// ── Shared helpers ───────────────────────────────────────────────────────────

function pickVideoUrl(mediaUrls: string[], platform: string): string {
  const url = mediaUrls.find((u) => VIDEO_EXT.test(u)) ?? mediaUrls[0]
  if (!url) {
    throw new PermanentPublishError(`${platform} only accepts video — attach an MP4 or MOV file to this post.`)
  }
  return url
}

async function openVideo(url: string, platform: string): Promise<{ res: Response; size: number; type: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Could not download the video for ${platform} (HTTP ${res.status})`)
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const looksLikeVideo = ct.startsWith('video/') || (ct === 'application/octet-stream' && VIDEO_EXT.test(url))
  if (!looksLikeVideo) {
    await res.body?.cancel().catch(() => {})
    throw new PermanentPublishError(`${platform} only accepts video — attach an MP4 or MOV file to this post.`)
  }
  return { res, size: Number(res.headers.get('content-length') ?? 0), type: ct.startsWith('video/') ? ct : 'video/mp4' }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── YouTube ──────────────────────────────────────────────────────────────────

async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(YOUTUBE_REQUEST_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (res.status >= 500) throw new Error(`Google token refresh failed (HTTP ${res.status})`)
  if (!res.ok || !data.access_token) {
    throw new PermanentPublishError('YouTube authorization expired or was revoked — reconnect YouTube on the Accounts page.')
  }
  return data.access_token
}

async function uploadToYouTube(content: string, videoUrl: string, accessToken: string): Promise<string> {
  const { res: src, size, type } = await openVideo(videoUrl, 'YouTube')

  // YouTube rejects < and > in titles
  const title = (content.split('\n')[0] ?? '').replace(/[<>]/g, '').trim().slice(0, 100) || 'Untitled'
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      ...(size ? { 'X-Upload-Content-Length': String(size) } : {}),
    },
    body: JSON.stringify({
      snippet: { title, description: content.replace(/[<>]/g, '').slice(0, 5000), categoryId: '22' },
      // Videos from API projects that have not passed YouTube's audit are forced to private by YouTube.
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(YOUTUBE_REQUEST_TIMEOUT_MS),
  })
  if (!init.ok) {
    await src.body?.cancel().catch(() => {})
    const detail = (await init.text().catch(() => '')).slice(0, 300)
    if (init.status === 401) throw new AuthExpiredError()
    if (init.status === 403 && /quota/i.test(detail)) {
      throw new PermanentPublishError('YouTube API daily quota exceeded — try again tomorrow.')
    }
    if (init.status >= 400 && init.status < 500) {
      throw new PermanentPublishError(`YouTube rejected the upload (HTTP ${init.status}): ${detail}`)
    }
    throw new Error(`YouTube upload could not start (HTTP ${init.status})`)
  }
  const uploadUrl = init.headers.get('location')
  if (!uploadUrl) {
    await src.body?.cancel().catch(() => {})
    throw new Error('YouTube did not return an upload URL')
  }

  // Stream the file straight through when its size is known; otherwise buffer it.
  const buffered = size ? null : Buffer.from(await src.arrayBuffer())
  const putInit = {
    method: 'PUT',
    headers: { 'Content-Type': type, 'Content-Length': String(size || buffered!.length) },
    body: size ? src.body : buffered,
    duplex: 'half', // Node's fetch requires this when the body is a stream
    signal: AbortSignal.timeout(YOUTUBE_UPLOAD_TIMEOUT_MS),
  } as unknown as Parameters<typeof fetch>[1]
  const put = await fetch(uploadUrl, putInit)
  if (!put.ok) {
    const detail = (await put.text().catch(() => '')).slice(0, 300)
    if (put.status === 401) throw new AuthExpiredError()
    throw new Error(`YouTube upload failed (HTTP ${put.status}): ${detail}`)
  }
  const video = (await put.json().catch(() => ({}))) as { id?: string }
  if (!video.id) throw new Error('YouTube accepted the upload but returned no video id')
  return video.id
}

export async function publishYouTubeVideo(
  post: { content: string; mediaUrls: string[] },
  tokens: PublishTokens,
  persist?: PersistTokens,
): Promise<string> {
  const videoUrl = pickVideoUrl(post.mediaUrls, 'YouTube')
  try {
    return await uploadToYouTube(post.content, videoUrl, tokens.accessToken)
  } catch (err) {
    if (!(err instanceof AuthExpiredError)) throw err
    if (!tokens.refreshToken) {
      throw new PermanentPublishError('YouTube authorization expired — reconnect YouTube on the Accounts page.')
    }
    logger.info('YouTube access token expired — refreshing and retrying once')
    const fresh = await refreshGoogleAccessToken(tokens.refreshToken)
    await persist?.({ accessToken: fresh })
    try {
      return await uploadToYouTube(post.content, videoUrl, fresh)
    } catch (err2) {
      if (err2 instanceof AuthExpiredError) {
        throw new PermanentPublishError('YouTube rejected the refreshed token — reconnect YouTube on the Accounts page.')
      }
      throw err2
    }
  }
}

// ── TikTok ───────────────────────────────────────────────────────────────────

interface TikTokEnvelope<T> {
  data?: T
  error?: { code?: string; message?: string; log_id?: string }
}

/** Error codes that mean the user must fix something (reconnect, scope, app review...). */
const TIKTOK_PERMANENT_CODES: Record<string, string> = {
  scope_not_authorized: 'TikTok has not granted video publishing — reconnect TikTok on the Accounts page and approve posting.',
  scope_permission_missed: 'TikTok has not granted video publishing — reconnect TikTok on the Accounts page and approve posting.',
  unaudited_client_can_only_post_to_private_accounts:
    'This TikTok app has not passed TikTok’s audit, so it can only post to private accounts.',
  spam_risk_too_many_posts: 'TikTok limited posting for this account (too many posts) — try again later.',
  reached_active_user_cap: 'TikTok’s daily posting cap for this app has been reached — try again tomorrow.',
  invalid_file_upload: 'TikTok rejected the video file (format, size or duration not allowed).',
}

async function tiktokCall<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`https://open.tiktokapis.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
  })
  const json = (await res.json().catch(() => ({}))) as TikTokEnvelope<T>
  const code = json.error?.code
  // Known user-fixable errors first: TikTok reports e.g. scope_not_authorized with HTTP 401, which
  // must not be mistaken for an expired token (refreshing would not help).
  if (code && TIKTOK_PERMANENT_CODES[code]) throw new PermanentPublishError(TIKTOK_PERMANENT_CODES[code])
  if (res.status === 401 || code === 'access_token_invalid') throw new AuthExpiredError()
  if (code && code !== 'ok') {
    if (res.status >= 400 && res.status < 500) {
      throw new PermanentPublishError(`TikTok rejected the request (${code}): ${json.error?.message ?? ''}`.trim())
    }
    throw new Error(`TikTok error (${code}): ${json.error?.message ?? ''}`.trim())
  }
  if (!res.ok) throw new Error(`TikTok request failed (HTTP ${res.status})`)
  return json.data as T
}

async function refreshTikTokTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string }
  if (res.status >= 500) throw new Error(`TikTok token refresh failed (HTTP ${res.status})`)
  if (!res.ok || !data.access_token) {
    throw new PermanentPublishError('TikTok authorization expired or was revoked — reconnect TikTok on the Accounts page.')
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

async function postToTikTok(content: string, videoUrl: string, accessToken: string): Promise<string> {
  // 1. Which privacy levels may this account/app use? Unaudited apps are limited to SELF_ONLY.
  const creator = await tiktokCall<{ privacy_level_options?: string[] }>(
    '/v2/post/publish/creator_info/query/',
    accessToken,
    {},
  )
  const options = creator?.privacy_level_options ?? []
  const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : (options[0] ?? 'SELF_ONLY')

  // 2. Download the video (buffered: TikTok needs byte ranges)
  const { res: src, type } = await openVideo(videoUrl, 'TikTok')
  const video = Buffer.from(await src.arrayBuffer())
  const size = video.length
  if (size === 0) throw new PermanentPublishError('The video file is empty.')
  if (size > TIKTOK_MAX_BYTES) {
    throw new PermanentPublishError(`The video is too large for TikTok publishing (max ${TIKTOK_MAX_BYTES / 1024 / 1024}MB).`)
  }

  // 3. Initialise the direct post
  const chunkSize = size <= TIKTOK_CHUNK_BYTES ? size : TIKTOK_CHUNK_BYTES
  const totalChunks = Math.floor(size / chunkSize) // the last chunk absorbs the remainder
  const init = await tiktokCall<{ publish_id?: string; upload_url?: string }>('/v2/post/publish/video/init/', accessToken, {
    post_info: {
      title: content.slice(0, 2200),
      privacy_level: privacy,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks },
  })
  if (!init?.publish_id || !init.upload_url) throw new Error('TikTok did not return an upload URL')

  // 4. Upload the chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    const end = i === totalChunks - 1 ? size - 1 : start + chunkSize - 1
    const part = video.subarray(start, end + 1)
    const put = await fetch(init.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': type,
        'Content-Length': String(part.length),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      },
      body: part,
      signal: AbortSignal.timeout(YOUTUBE_UPLOAD_TIMEOUT_MS),
    })
    if (put.status !== 201 && put.status !== 206 && put.status !== 200) {
      const detail = (await put.text().catch(() => '')).slice(0, 200)
      throw new Error(`TikTok chunk ${i + 1}/${totalChunks} upload failed (HTTP ${put.status}): ${detail}`)
    }
  }

  // 5. TikTok processes the video asynchronously — wait for the outcome for a little while
  for (let attempt = 0; attempt < TIKTOK_POLL_TRIES; attempt++) {
    await sleep(TIKTOK_POLL_INTERVAL_MS)
    const status = await tiktokCall<{ status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>(
      '/v2/post/publish/status/fetch/',
      accessToken,
      { publish_id: init.publish_id },
    )
    if (status?.status === 'PUBLISH_COMPLETE') {
      return String(status.publicaly_available_post_id?.[0] ?? init.publish_id)
    }
    if (status?.status === 'FAILED') {
      throw new PermanentPublishError(`TikTok could not publish the video: ${status.fail_reason ?? 'unknown reason'}`)
    }
    if (status?.status === 'SEND_TO_USER_INBOX') return init.publish_id
  }
  // Upload was accepted; TikTok is still processing. Treat as success rather than re-posting.
  logger.warn({ publishId: init.publish_id }, 'TikTok video accepted but still processing after polling window')
  return init.publish_id
}

export async function publishTikTokVideo(
  post: { content: string; mediaUrls: string[] },
  tokens: PublishTokens,
  persist?: PersistTokens,
): Promise<string> {
  const videoUrl = pickVideoUrl(post.mediaUrls, 'TikTok')
  try {
    return await postToTikTok(post.content, videoUrl, tokens.accessToken)
  } catch (err) {
    if (!(err instanceof AuthExpiredError)) throw err
    if (!tokens.refreshToken) {
      throw new PermanentPublishError('TikTok authorization expired — reconnect TikTok on the Accounts page.')
    }
    logger.info('TikTok access token expired — refreshing and retrying once')
    const fresh = await refreshTikTokTokens(tokens.refreshToken)
    await persist?.(fresh)
    try {
      return await postToTikTok(post.content, videoUrl, fresh.accessToken)
    } catch (err2) {
      if (err2 instanceof AuthExpiredError) {
        throw new PermanentPublishError('TikTok rejected the refreshed token — reconnect TikTok on the Accounts page.')
      }
      throw err2
    }
  }
}

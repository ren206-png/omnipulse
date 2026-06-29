/**
 * LinkedIn post publisher using the Posts API (/rest/posts).
 * Supports text, single image, and single video.
 *
 * Rules:
 * - Required headers: Authorization, LinkedIn-Version, X-Restli-Protocol-Version: 2.0.0
 * - Post URN is in response header x-restli-id, NOT response body
 * - Never use /v2/ugcPosts or /v2/shares
 * - Poll for media AVAILABLE status before creating a post referencing it
 */
import { logger } from './logger.js'

const LI_VERSION = process.env.LINKEDIN_API_VERSION ?? '202506'
const POSTS_URL = 'https://api.linkedin.com/rest/posts'
const IMAGES_URL = 'https://api.linkedin.com/rest/images'
const VIDEOS_URL = 'https://api.linkedin.com/rest/videos'

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB

type AuthorType = 'person' | 'organization'

function liHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': LI_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

function buildAuthorUrn(authorType: AuthorType, personUrn: string, orgUrn?: string): string {
  return authorType === 'organization' && orgUrn ? orgUrn : personUrn
}

// ── Sleep helper ────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Result types ─────────────────────────────────────────────────────────────
export type PublishResult =
  | { success: true; postUrn: string }
  | { success: false; error: string; retryAfter?: number; details?: unknown }

// ── Text post ────────────────────────────────────────────────────────────────
export async function publishLinkedInText(
  accessToken: string,
  personUrn: string,
  content: string,
  authorType: AuthorType = 'person',
  orgUrn?: string,
): Promise<PublishResult> {
  const author = buildAuthorUrn(authorType, personUrn, orgUrn)
  const payload = {
    author,
    commentary: content,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }

  try {
    const res = await fetch(POSTS_URL, {
      method: 'POST',
      headers: liHeaders(accessToken),
      body: JSON.stringify(payload),
    })

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10)
      logger.warn({ retryAfter }, 'LinkedIn 429 rate limit hit')
      return { success: false, error: 'rate_limit', retryAfter }
    }

    if (res.status !== 201) {
      const body = await res.json().catch(() => null)
      logger.error({ status: res.status, body }, 'LinkedIn post creation failed')
      return { success: false, error: 'api_error', details: body }
    }

    const postUrn = res.headers.get('x-restli-id') ?? ''
    return { success: true, postUrn }
  } catch (err) {
    logger.error({ err }, 'LinkedIn text post network error')
    return { success: false, error: 'network_error', details: String(err) }
  }
}

// ── Image post ───────────────────────────────────────────────────────────────
export async function publishLinkedInImage(
  accessToken: string,
  personUrn: string,
  content: string,
  imageUrl: string,
  altText: string,
  authorType: AuthorType = 'person',
  orgUrn?: string,
): Promise<PublishResult> {
  const author = buildAuthorUrn(authorType, personUrn, orgUrn)
  const headers = liHeaders(accessToken)

  try {
    // Step 1: Initialize upload
    const initRes = await fetch(`${IMAGES_URL}?action=initializeUpload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    })
    if (!initRes.ok) {
      const body = await initRes.json().catch(() => null)
      logger.error({ status: initRes.status, body }, 'LinkedIn image upload init failed')
      return { success: false, error: 'image_upload_failed', details: body }
    }
    const initData = await initRes.json() as { value: { uploadUrl: string; image: string } }
    const { uploadUrl, image: imageUrn } = initData.value

    // Step 2: Fetch image and upload binary (no Authorization header on this call)
    const imgFetch = await fetch(imageUrl)
    if (!imgFetch.ok) {
      return { success: false, error: 'image_fetch_failed' }
    }
    const imgBuffer = await imgFetch.arrayBuffer()
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: imgBuffer,
      // Intentionally NO Authorization header per LinkedIn docs
    })
    if (!uploadRes.ok) {
      logger.error({ status: uploadRes.status }, 'LinkedIn image binary upload failed')
      return { success: false, error: 'image_upload_failed' }
    }

    // Step 3: Poll until image is AVAILABLE
    const available = await pollUntilAvailable(
      () => fetch(`${IMAGES_URL}/${encodeURIComponent(imageUrn)}`, { headers }),
      5,
      3000,
    )
    if (!available) return { success: false, error: 'image_processing_timeout' }

    // Step 4: Create post with image reference
    const payload = {
      author,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: imageUrn, altText } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    const postRes = await fetch(POSTS_URL, { method: 'POST', headers, body: JSON.stringify(payload) })

    if (postRes.status === 429) {
      const retryAfter = parseInt(postRes.headers.get('Retry-After') ?? '60', 10)
      return { success: false, error: 'rate_limit', retryAfter }
    }
    if (postRes.status !== 201) {
      const body = await postRes.json().catch(() => null)
      logger.error({ status: postRes.status, body }, 'LinkedIn image post creation failed')
      return { success: false, error: 'api_error', details: body }
    }

    return { success: true, postUrn: postRes.headers.get('x-restli-id') ?? '' }
  } catch (err) {
    logger.error({ err }, 'LinkedIn image post error')
    return { success: false, error: 'network_error', details: String(err) }
  }
}

// ── Video post ───────────────────────────────────────────────────────────────
export async function publishLinkedInVideo(
  accessToken: string,
  personUrn: string,
  content: string,
  videoUrl: string,
  authorType: AuthorType = 'person',
  orgUrn?: string,
): Promise<PublishResult> {
  const author = buildAuthorUrn(authorType, personUrn, orgUrn)
  const headers = liHeaders(accessToken)

  try {
    // Fetch video binary
    const vidFetch = await fetch(videoUrl)
    if (!vidFetch.ok) return { success: false, error: 'video_fetch_failed' }
    const videoBuffer = Buffer.from(await vidFetch.arrayBuffer())
    const fileSizeBytes = videoBuffer.length

    // Step 1: Initialize chunked upload
    const initRes = await fetch(`${VIDEOS_URL}?action=initializeUpload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes, uploadCaptions: false, uploadThumbnail: false } }),
    })
    if (!initRes.ok) {
      const body = await initRes.json().catch(() => null)
      logger.error({ status: initRes.status, body }, 'LinkedIn video upload init failed')
      return { success: false, error: 'video_upload_failed', details: body }
    }
    const initData = await initRes.json() as {
      value: {
        video: string
        uploadToken: string
        uploadInstructions: Array<{ uploadUrl: string; lastByte: number; firstByte: number }>
      }
    }
    const { video: videoUrn, uploadToken, uploadInstructions } = initData.value

    // Step 2: Upload chunks, collect ETags
    const etags: string[] = []
    for (const instruction of uploadInstructions) {
      const chunk = videoBuffer.slice(instruction.firstByte, instruction.lastByte + 1)
      const chunkRes = await fetch(instruction.uploadUrl, {
        method: 'PUT',
        body: chunk,
        // No Authorization header on chunk uploads
      })
      if (!chunkRes.ok) {
        logger.error({ status: chunkRes.status, firstByte: instruction.firstByte }, 'LinkedIn video chunk upload failed')
        return { success: false, error: 'video_upload_failed' }
      }
      const etag = chunkRes.headers.get('ETag') ?? chunkRes.headers.get('etag') ?? ''
      etags.push(etag.replace(/"/g, '')) // strip quotes from ETag value
    }

    // Step 3: Finalize upload
    const finalRes = await fetch(`${VIDEOS_URL}?action=finalizeUpload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds: etags },
      }),
    })
    if (!finalRes.ok) {
      const body = await finalRes.json().catch(() => null)
      logger.error({ status: finalRes.status, body }, 'LinkedIn video finalize failed')
      return { success: false, error: 'video_upload_failed', details: body }
    }

    // Step 4: Poll until AVAILABLE (max 10 attempts, 5s base, exponential backoff)
    const available = await pollUntilAvailable(
      () => fetch(`${VIDEOS_URL}/${encodeURIComponent(videoUrn)}`, { headers }),
      10,
      5000,
    )
    if (!available) return { success: false, error: 'video_processing_timeout' }

    // Step 5: Create post with video reference
    const payload = {
      author,
      commentary: content,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: videoUrn } },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    const postRes = await fetch(POSTS_URL, { method: 'POST', headers, body: JSON.stringify(payload) })

    if (postRes.status === 429) {
      const retryAfter = parseInt(postRes.headers.get('Retry-After') ?? '60', 10)
      return { success: false, error: 'rate_limit', retryAfter }
    }
    if (postRes.status !== 201) {
      const body = await postRes.json().catch(() => null)
      logger.error({ status: postRes.status, body }, 'LinkedIn video post creation failed')
      return { success: false, error: 'api_error', details: body }
    }

    return { success: true, postUrn: postRes.headers.get('x-restli-id') ?? '' }
  } catch (err) {
    logger.error({ err }, 'LinkedIn video post error')
    return { success: false, error: 'network_error', details: String(err) }
  }
}

// ── Poll helper ──────────────────────────────────────────────────────────────
async function pollUntilAvailable(
  fetcher: () => Promise<Response>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * Math.pow(2, attempt - 1))
    try {
      const res = await fetcher()
      if (res.ok) {
        const data = await res.json() as { status?: string }
        if (data.status === 'AVAILABLE') return true
      }
    } catch (err) {
      logger.warn({ err, attempt }, 'LinkedIn media poll error')
    }
  }
  return false
}

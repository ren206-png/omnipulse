# OmniPulse AI Features

All AI features are powered by **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) via the Anthropic API.  
All model calls are **server-side only** — the API key is never exposed to the browser.

---

## Prerequisites

Set `ANTHROPIC_API_KEY` in your `.env` (see `.env.example`).  
If the key is absent, features degrade gracefully rather than crashing:

| Feature | Degraded behaviour |
|---|---|
| Content Multiplier | Returns 402 with "AI not configured" |
| SafeGuard | Returns `warning` fail-safe for every platform |
| Caption Suggestion | Returns 402 with "AI not configured" |
| Hashtags / Generate / Score / Translate | Returns 402 |

---

## A-2 · Content Multiplier

**Endpoint:** `POST /api/v1/ai/multiply`

Takes a master post and produces tailored variants for **Facebook, Instagram, TikTok, and X**.  
Each variant respects platform-specific norms (length, tone, hashtag count).

### Request
```json
{
  "workspaceId": "ws_...",
  "content": "Master post text here"
}
```

### Response
```json
{
  "variants": {
    "FACEBOOK":  { "content": "...", "hashtags": ["marketing"], "mediaUrls": [] },
    "INSTAGRAM": { "content": "...", "hashtags": ["brand", "lifestyle", ...], "mediaUrls": [] },
    "TIKTOK":    { "content": "...", "hashtags": ["viral", "fyp"], "mediaUrls": [] },
    "X":         { "content": "...", "hashtags": ["news"], "mediaUrls": [] }
  },
  "remaining": 49
}
```

### Rate limit
50 calls/user/day (configurable via `AI_MULTIPLIER_DAILY_LIMIT`). Resets at midnight UTC.  
Pro/Agency plan required (Free plan returns 403).

### UI
"✨ Multiply for all platforms" button appears in the **Customise per-platform content** section of the compose form. Results populate each platform variant tab.

---

## A-3 · SafeGuard

**Endpoint:** `POST /api/v1/ai/safety-scan`

Scans post content per platform for policy conflicts, spam signals, unverified claims, and brand safety concerns. Advisory only — never hard-blocks publishing.

### Request
```json
{
  "workspaceId": "ws_...",
  "variants": {
    "FACEBOOK": "Post text for Facebook",
    "INSTAGRAM": "Post text for Instagram"
  }
}
```

### Response
```json
{
  "report": {
    "FACEBOOK":  { "status": "clear",   "flags": [] },
    "INSTAGRAM": { "status": "warning", "flags": ["possible unverified health claim"] }
  }
}
```

Status levels:
- `clear` — no issues detected
- `warning` — review recommended before publishing  
- `risk` — likely policy violation; secondary confirmation required to publish

### Fail-safe
On any error (API down, parse failure) the status degrades to `warning`, never `clear`.  
Results are cached in-memory for 10 minutes (SHA-256 keyed on content).

### Risk override
**Endpoint:** `POST /api/v1/ai/safety-scan/override`

When a user proceeds despite `risk` status, this endpoint logs the override to the activity log for audit purposes.

### UI
🛡️ **Safety scan** button appears above the Schedule/Queue buttons. After scanning:
- ✅ **Clear** — green pill
- ⚠️ **Warning** — amber pill, click to expand flagged issues
- 🚨 **Risk** — red pill; clicking Schedule/Queue shows an inline confirmation requiring explicit acknowledgement

---

## A-4 · Visual Copywriting (Caption Suggestion)

**Endpoint:** `POST /api/v1/ai/caption-suggestion`

Uses Claude's vision capability to analyse a product image and generate a compelling social media caption (max 300 chars, no hashtags).

### Request
```json
{
  "workspaceId": "ws_...",
  "imageUrl": "https://example.com/product.jpg"
}
```

The image must be publicly accessible. Supported formats: JPEG, PNG, WebP, GIF.

### Response
```json
{
  "caption": "Sun-kissed and ready for summer. ☀️",
  "remaining": 49
}
```

### Rate limit
50 calls/user/day (configurable via `AI_VISION_DAILY_LIMIT`). Resets at midnight UTC.  
Pro/Agency plan required (Free plan returns 403).

### UI
When a valid image URL (ending in `.jpg/.jpeg/.png/.webp/.gif`) is entered in the Media field, a dismissible **✨ AI caption suggestion** banner appears automatically. Clicking **Insert caption** populates the master content field (with overwrite confirmation if content already exists).

---

## Configuration Reference

| Env var | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required to enable AI features |
| `AI_MULTIPLIER_DAILY_LIMIT` | `50` | Content Multiplier calls per user per day |
| `AI_VISION_DAILY_LIMIT` | `50` | Caption Suggestion calls per user per day |

---

## Model

All features use `claude-haiku-4-5-20251001`:
- Fast and cost-effective for high-volume social media tasks
- Supports image/vision inputs (A-4)
- JSON mode via instruction prompting (A-2, A-3)

To upgrade to a more capable model, change the `model` parameter in each lib file:
- `apps/api/src/lib/contentMultiplier.ts`
- `apps/api/src/lib/safeguard.ts`
- `apps/api/src/lib/visualCopywriter.ts`

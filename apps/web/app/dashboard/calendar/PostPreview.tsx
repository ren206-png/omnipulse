'use client'

import { useState } from 'react'

interface PostPreviewProps {
  content: string
  mediaUrls: string[]
  platforms: string[]
  scheduledFor: string
}

type Platform = 'INSTAGRAM' | 'X' | 'FACEBOOK' | 'TIKTOK' | 'GOOGLE'

const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  X: 'X (Twitter)',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  GOOGLE: 'Google',
}

const PLATFORM_ICONS: Record<Platform, string> = {
  INSTAGRAM: '📸',
  X: '𝕏',
  FACEBOOK: '👥',
  TIKTOK: '🎵',
  GOOGLE: '🔍',
}

function InstagramPreview({ content, mediaUrls }: { content: string; mediaUrls: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] w-full font-sans overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
          YB
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-900 dark:text-white">your_brand</span>
        </div>
        <span className="text-gray-400 text-lg">•••</span>
      </div>

      {/* Image area */}
      <div className="w-full aspect-square bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 flex items-center justify-center overflow-hidden">
        {mediaUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl opacity-20">🖼</span>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 pt-2.5 flex gap-3 text-gray-900 dark:text-white text-lg">
        <span>❤️</span>
        <span>💬</span>
        <span>✈️</span>
        <span className="ml-auto">🔖</span>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3 pt-1.5">
        <p className="text-sm text-gray-900 dark:text-white leading-relaxed">
          <span className="font-semibold">your_brand</span>{' '}
          {content ? (
            <span className="line-clamp-3">{content}</span>
          ) : (
            <span className="text-gray-400 italic">Start typing your caption…</span>
          )}
        </p>
      </div>
    </div>
  )
}

function XPreview({ content, mediaUrls }: { content: string; mediaUrls: string[] }) {
  const truncated = content.length > 280 ? content.slice(0, 280) : content
  const charsLeft = 280 - content.length

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#15202b] p-4 w-full font-sans shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-900 dark:bg-gray-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
          YB
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-sm text-gray-900 dark:text-white">Your Brand</span>
            <span className="text-gray-500 dark:text-gray-400 text-sm">@yourbrand</span>
          </div>
          <p className="text-sm text-gray-900 dark:text-white mt-1 whitespace-pre-wrap break-words leading-relaxed">
            {truncated || <span className="text-gray-400 italic">Start typing your post…</span>}
          </p>
          {content.length > 280 && (
            <p className="text-xs text-red-500 mt-1">Truncated to 280 characters</p>
          )}
          {mediaUrls.length > 0 && (
            <div className={`mt-2 grid gap-1 rounded-xl overflow-hidden ${mediaUrls.length > 1 ? 'grid-cols-2' : ''}`}>
              {mediaUrls.slice(0, 4).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" className="w-full object-cover aspect-video" />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-4 text-gray-500 dark:text-gray-400">
              <span className="text-xs flex items-center gap-1">💬 <span>0</span></span>
              <span className="text-xs flex items-center gap-1">🔁 <span>0</span></span>
              <span className="text-xs flex items-center gap-1">❤️ <span>0</span></span>
              <span className="text-xs flex items-center gap-1">🔖</span>
            </div>
            <span className={`text-xs tabular-nums ${charsLeft < 0 ? 'text-red-500 font-bold' : charsLeft < 20 ? 'text-amber-500' : 'text-gray-400'}`}>
              {charsLeft}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FacebookPreview({ content, mediaUrls }: { content: string; mediaUrls: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#242526] w-full font-sans overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          YB
        </div>
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">Your Brand</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Just now · 🌐</p>
        </div>
        <span className="ml-auto text-gray-400 text-lg">•••</span>
      </div>
      <div className="px-3 pb-2">
        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed line-clamp-5">
          {content || <span className="text-gray-400 italic">Start typing your post…</span>}
        </p>
      </div>
      {mediaUrls[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrls[0]} alt="" className="w-full object-cover aspect-video" />
      )}
      <div className="flex divide-x divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
        {['👍 Like', '💬 Comment', '↗ Share'].map((action) => (
          <button key={action} className="flex-1 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            {action}
          </button>
        ))}
      </div>
    </div>
  )
}

function TikTokPreview({ content, mediaUrls }: { content: string; mediaUrls: string[] }) {
  return (
    <div
      className="rounded-xl border border-gray-200 bg-black w-full font-sans overflow-hidden relative shadow-sm"
      style={{ aspectRatio: '9/16', maxHeight: 360 }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {mediaUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <div className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center text-3xl">▶</div>
            <span className="text-xs">Video preview</span>
          </div>
        )}
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
      {/* Right side actions */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-4 text-white">
        <div className="text-center">
          <div className="text-2xl">❤️</div>
          <p className="text-[10px] mt-0.5">0</p>
        </div>
        <div className="text-center">
          <div className="text-2xl">💬</div>
          <p className="text-[10px] mt-0.5">0</p>
        </div>
        <div className="text-center">
          <div className="text-2xl">↗</div>
          <p className="text-[10px] mt-0.5">0</p>
        </div>
      </div>
      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-12 p-3">
        <p className="text-white text-xs font-bold mb-1">@your_brand</p>
        {content && (
          <p className="text-white/90 text-xs line-clamp-2 leading-relaxed">{content}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-4 h-4 rounded-full bg-white/20 text-[8px] flex items-center justify-center">🎵</div>
          <p className="text-white/70 text-[10px] truncate">Original Audio · your_brand</p>
        </div>
      </div>
    </div>
  )
}

function GooglePreview({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-full font-sans p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">YB</div>
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">Your Business</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Google Business Post</p>
        </div>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">
        {content || <span className="text-gray-400 italic">Start typing your post…</span>}
      </p>
    </div>
  )
}

export default function PostPreview({ content, mediaUrls, platforms, scheduledFor }: PostPreviewProps) {
  const validPlatforms = platforms.filter((p): p is Platform =>
    ['INSTAGRAM', 'X', 'FACEBOOK', 'TIKTOK', 'GOOGLE'].includes(p)
  )

  const [activeTab, setActiveTab] = useState<Platform>(validPlatforms[0] ?? 'INSTAGRAM')

  const currentPlatform = validPlatforms.includes(activeTab) ? activeTab : (validPlatforms[0] ?? 'INSTAGRAM')

  function renderPreview(platform: Platform) {
    switch (platform) {
      case 'INSTAGRAM': return <InstagramPreview content={content} mediaUrls={mediaUrls} />
      case 'X':         return <XPreview         content={content} mediaUrls={mediaUrls} />
      case 'FACEBOOK':  return <FacebookPreview  content={content} mediaUrls={mediaUrls} />
      case 'TIKTOK':    return <TikTokPreview    content={content} mediaUrls={mediaUrls} />
      case 'GOOGLE':    return <GooglePreview    content={content} />
    }
  }

  return (
    <div className="rounded-xl border bg-muted/20 dark:bg-gray-900/40 p-4 space-y-4 h-fit sticky top-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Preview</p>
        {scheduledFor && (
          <p className="text-xs text-muted-foreground">
            {(() => {
              try {
                return new Date(scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              } catch {
                return ''
              }
            })()}
          </p>
        )}
      </div>

      {/* Platform tabs */}
      {validPlatforms.length > 0 ? (
        <>
          {validPlatforms.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {validPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActiveTab(p)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    currentPlatform === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          )}
          {validPlatforms.length === 1 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{PLATFORM_ICONS[validPlatforms[0]]}</span>
              <span>{PLATFORM_LABELS[validPlatforms[0]]}</span>
            </div>
          )}

          {/* Preview */}
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              {renderPreview(currentPlatform)}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-4xl mb-3 opacity-30">📱</div>
          <p className="text-sm text-muted-foreground">Select a platform above to see a live preview</p>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { format } from 'date-fns'

type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'X' | 'GOOGLE' | 'LINKEDIN'

interface Props {
  content: string
  platforms: Platform[]
  mediaUrls?: string[]
  scheduledFor?: string
}

const PLATFORM_META: Record<Platform, { label: string; color: string; avatar: string }> = {
  X:         { label: 'X / Twitter', color: '#000000', avatar: '𝕏' },
  INSTAGRAM: { label: 'Instagram',   color: '#E1306C', avatar: '📸' },
  FACEBOOK:  { label: 'Facebook',    color: '#1877F2', avatar: '👤' },
  TIKTOK:    { label: 'TikTok',      color: '#000000', avatar: '🎵' },
  GOOGLE:    { label: 'Google',      color: '#4285F4', avatar: '🔍' },
  LINKEDIN:  { label: 'LinkedIn',    color: '#0A66C2', avatar: '💼' },
}

function XPreview({ content, mediaUrls }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#15202b] p-4 font-sans w-full max-w-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white text-base font-bold shrink-0">𝕏</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm text-gray-900 dark:text-white">Your Name</span>
            <span className="text-gray-500 text-sm">@yourhandle</span>
          </div>
          <p className="text-sm text-gray-900 dark:text-white mt-1 whitespace-pre-wrap break-words">{content || <span className="text-gray-400 italic">Start typing your post…</span>}</p>
          {mediaUrls && mediaUrls.length > 0 && (
            <div className={`mt-2 grid gap-1 rounded-xl overflow-hidden ${mediaUrls.length > 1 ? 'grid-cols-2' : ''}`}>
              {mediaUrls.slice(0, 4).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" className="w-full object-cover aspect-video" />
              ))}
            </div>
          )}
          <div className="flex gap-6 mt-3 text-gray-500">
            <span className="text-xs">💬 0</span>
            <span className="text-xs">🔁 0</span>
            <span className="text-xs">❤️ 0</span>
            <span className="text-xs">📊 0</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function InstagramPreview({ content, mediaUrls }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121212] w-full max-w-sm font-sans overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-base">📸</div>
        <span className="font-semibold text-sm text-gray-900 dark:text-white">yourhandle</span>
        <span className="ml-auto text-gray-500 text-lg">•••</span>
      </div>
      <div className="w-full aspect-square bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 flex items-center justify-center">
        {mediaUrls && mediaUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl opacity-30">🖼</span>
        )}
      </div>
      <div className="px-3 pt-2 flex gap-3 text-gray-900 dark:text-white text-lg">
        <span>❤️</span><span>💬</span><span>✈️</span>
        <span className="ml-auto">🔖</span>
      </div>
      <div className="px-3 pb-3 pt-1">
        <p className="text-sm text-gray-900 dark:text-white">
          <span className="font-semibold">yourhandle</span>{' '}
          <span className="line-clamp-3">{content || <span className="text-gray-400 italic">Start typing your caption…</span>}</span>
        </p>
      </div>
    </div>
  )
}

function FacebookPreview({ content, mediaUrls }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#242526] w-full max-w-sm font-sans overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-base shrink-0">👤</div>
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">Your Page</p>
          <p className="text-xs text-gray-500">Just now · 🌐</p>
        </div>
      </div>
      <p className="px-3 pb-2 text-sm text-gray-900 dark:text-white whitespace-pre-wrap line-clamp-4">
        {content || <span className="text-gray-400 italic">Start typing your post…</span>}
      </p>
      {mediaUrls && mediaUrls[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrls[0]} alt="" className="w-full object-cover aspect-video" />
      )}
      <div className="flex gap-2 px-3 py-2 border-t text-gray-500 text-xs">
        <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
      </div>
    </div>
  )
}

function TikTokPreview({ content, mediaUrls }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-black w-full max-w-sm font-sans overflow-hidden relative" style={{ aspectRatio: '9/16', maxHeight: 300 }}>
      <div className="absolute inset-0 flex items-center justify-center">
        {mediaUrls && mediaUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl opacity-30">🎵</span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-12 p-3 bg-gradient-to-t from-black/80">
        <p className="text-white text-xs font-semibold">@yourhandle</p>
        <p className="text-white text-xs line-clamp-2 mt-0.5">{content}</p>
      </div>
      <div className="absolute right-2 bottom-4 flex flex-col items-center gap-3 text-white">
        <div className="text-center"><span className="text-xl">❤️</span><p className="text-xs">0</p></div>
        <div className="text-center"><span className="text-xl">💬</span><p className="text-xs">0</p></div>
        <div className="text-center"><span className="text-xl">↗</span><p className="text-xs">0</p></div>
      </div>
    </div>
  )
}

function LinkedInPreview({ content, mediaUrls }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1b1f23] w-full max-w-sm font-sans overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div className="w-10 h-10 rounded-full bg-[#0A66C2] flex items-center justify-center text-white text-sm font-bold shrink-0">YB</div>
        <div>
          <p className="font-semibold text-sm text-gray-900 dark:text-white">Your Brand</p>
          <p className="text-xs text-gray-500">Just now · 🌐</p>
        </div>
        <span className="ml-auto text-gray-400">•••</span>
      </div>
      <p className="px-3 pb-2 text-sm text-gray-900 dark:text-white whitespace-pre-wrap line-clamp-5">
        {content || <span className="text-gray-400 italic">Start typing your post…</span>}
      </p>
      {mediaUrls && mediaUrls[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrls[0]} alt="" className="w-full object-cover aspect-video" />
      )}
      <div className="flex gap-2 px-3 py-2 border-t text-gray-500 text-xs">
        <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
      </div>
    </div>
  )
}

function GooglePreview({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-full max-w-sm font-sans p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm shrink-0">🔍</div>
        <div>
          <p className="font-semibold text-xs text-gray-900 dark:text-white">Your Business</p>
          <p className="text-xs text-gray-500">Google Business Post</p>
        </div>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4">
        {content || <span className="text-gray-400 italic">Start typing your post…</span>}
      </p>
    </div>
  )
}

export function PostPreviewCard({ content, platforms, mediaUrls, scheduledFor }: Props) {
  const validPlatforms = platforms.filter((p) => p in PLATFORM_META) as Platform[]
  const [activeTab, setActiveTab] = useState<Platform>(validPlatforms[0] ?? 'X')

  if (!content && (!mediaUrls || mediaUrls.filter(Boolean).length === 0)) return null
  if (validPlatforms.length === 0) return null

  function renderPreview(platform: Platform) {
    switch (platform) {
      case 'X':         return <XPreview         content={content} mediaUrls={mediaUrls} />
      case 'INSTAGRAM': return <InstagramPreview  content={content} mediaUrls={mediaUrls} />
      case 'FACEBOOK':  return <FacebookPreview   content={content} mediaUrls={mediaUrls} />
      case 'TIKTOK':    return <TikTokPreview     content={content} mediaUrls={mediaUrls} />
      case 'GOOGLE':    return <GooglePreview     content={content} />
      case 'LINKEDIN':  return <LinkedInPreview   content={content} mediaUrls={mediaUrls} />
    }
  }

  const current = validPlatforms.includes(activeTab) ? activeTab : validPlatforms[0]

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</p>
        {scheduledFor && (
          <p className="text-xs text-muted-foreground">
            {format(new Date(scheduledFor), 'MMM d, h:mm a')}
          </p>
        )}
      </div>

      {/* Platform tabs */}
      {validPlatforms.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {validPlatforms.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActiveTab(p)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                current === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {PLATFORM_META[p].avatar} {PLATFORM_META[p].label}
            </button>
          ))}
        </div>
      )}

      {/* Mockup */}
      <div className="flex justify-center">{renderPreview(current)}</div>
    </div>
  )
}

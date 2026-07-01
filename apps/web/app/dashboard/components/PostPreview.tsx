'use client'

import { useState } from 'react'

interface Props {
  content: string
  platforms: string[]
  mediaUrls?: string[]
  onClose: () => void
}

function LinkedInPreview({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const shouldTruncate = content.length > 210
  const displayContent = expanded || !shouldTruncate ? content : content.slice(0, 210) + '...'

  return (
    <div className="bg-white rounded-lg border shadow-sm font-sans max-w-lg mx-auto">
      {/* Header */}
      <div className="p-4 pb-2 flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">U</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">Your Name</p>
          <p className="text-xs text-gray-500">Your Title • Your Company</p>
          <p className="text-xs text-gray-400">1st • Just now • 🌐</p>
        </div>
        <button className="text-gray-400 text-lg">···</button>
      </div>
      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{displayContent}</p>
        {shouldTruncate && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-600 font-semibold mt-1">
            {expanded ? 'see less' : '…see more'}
          </button>
        )}
      </div>
      {/* Actions */}
      <div className="border-t mx-4" />
      <div className="px-2 py-1 flex justify-around">
        {[['👍', 'Like'], ['💬', 'Comment'], ['🔁', 'Repost'], ['✈️', 'Send']].map(([icon, label]) => (
          <button key={label} className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-gray-500 font-semibold hover:bg-gray-100 transition-colors">
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function XPreview({ content }: { content: string }) {
  const truncated = content.length > 280 ? content.slice(0, 277) + '...' : content
  const charCount = content.length

  return (
    <div className="bg-white rounded-2xl border shadow-sm font-sans max-w-lg mx-auto p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white font-bold shrink-0">U</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm text-gray-900">Your Name</span>
            <span className="text-gray-500 text-sm">@yourhandle</span>
          </div>
          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap leading-relaxed">{truncated}</p>
          {charCount > 280 && (
            <p className="text-xs text-red-500 mt-1 font-medium">⚠️ {charCount}/280 — will be truncated</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="mt-3 pt-3 border-t flex gap-6 text-gray-400">
            {[['💬', '0'], ['🔁', '0'], ['❤️', '0'], ['📊', '0'], ['↗️', '']].map(([icon, count]) => (
              <button key={icon} className="flex items-center gap-1 text-xs hover:text-sky-500 transition-colors">
                <span>{icon}</span>{count && <span>{count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InstagramPreview({ content, mediaUrls }: { content: string; mediaUrls: string[] }) {
  const [expanded, setExpanded] = useState(false)
  // Extract hashtags
  const hashtags = content.match(/#\w+/g) ?? []
  const textWithoutHashtags = content.replace(/#\w+/g, '').trim()
  const shouldTruncate = textWithoutHashtags.length > 125
  const displayText = expanded || !shouldTruncate ? textWithoutHashtags : textWithoutHashtags.slice(0, 125)

  return (
    <div className="bg-white rounded-sm border shadow-sm font-sans max-w-sm mx-auto">
      {/* Header */}
      <div className="p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-0.5">
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">U</div>
          </div>
        </div>
        <span className="font-semibold text-sm text-gray-900 flex-1">yourhandle</span>
        <button className="text-gray-800 font-bold">···</button>
      </div>
      {/* Image area */}
      {mediaUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrls[0]} alt="Post media" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex flex-col items-center justify-center gap-2">
          <span className="text-4xl">🖼️</span>
          <p className="text-xs text-gray-400">No image attached</p>
          <p className="text-[10px] text-gray-400">Instagram requires an image or video</p>
        </div>
      )}
      {/* Actions */}
      <div className="px-3 pt-3 pb-1 flex justify-between items-center">
        <div className="flex gap-4">
          <button className="text-xl">🤍</button>
          <button className="text-xl">💬</button>
          <button className="text-xl">✈️</button>
        </div>
        <button className="text-xl">🔖</button>
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-xs font-semibold text-gray-900">0 likes</p>
        <p className="text-xs text-gray-800 mt-1">
          <span className="font-semibold">yourhandle</span>{' '}
          {displayText}
          {shouldTruncate && !expanded && (
            <button onClick={() => setExpanded(true)} className="text-gray-400 ml-1">more</button>
          )}
        </p>
        {hashtags.length > 0 && (
          <p className="text-xs text-blue-500 mt-1">{hashtags.join(' ')}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">Just now</p>
      </div>
    </div>
  )
}

function FacebookPreview({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const shouldTruncate = content.length > 250
  const displayContent = expanded || !shouldTruncate ? content : content.slice(0, 250) + '...'

  return (
    <div className="bg-white rounded-lg border shadow-sm font-sans max-w-lg mx-auto">
      <div className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shrink-0">U</div>
        <div>
          <p className="font-semibold text-sm text-gray-900">Your Name</p>
          <p className="text-xs text-gray-500">Just now · 🌐</p>
        </div>
        <button className="ml-auto text-gray-400">···</button>
      </div>
      <div className="px-3 pb-3">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{displayContent}</p>
        {shouldTruncate && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-600 font-semibold mt-1">
            {expanded ? 'See less' : 'See more'}
          </button>
        )}
      </div>
      <div className="border-t mx-3" />
      <div className="flex justify-around py-1">
        {[['👍', 'Like'], ['💬', 'Comment'], ['↪️', 'Share']].map(([icon, label]) => (
          <button key={label} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 font-semibold hover:bg-gray-50 rounded transition-colors">
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PostPreview({ content, platforms, mediaUrls = [], onClose }: Props) {
  const [activeTab, setActiveTab] = useState<string>(platforms[0] ?? 'LINKEDIN')

  const PLATFORM_LABELS: Record<string, string> = {
    LINKEDIN: '💼 LinkedIn',
    X: '𝕏 Twitter/X',
    INSTAGRAM: '📸 Instagram',
    FACEBOOK: '👥 Facebook',
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="font-semibold text-sm">Post Preview</h2>
            <p className="text-xs text-muted-foreground">This is an approximation of how your post will appear</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* Platform tabs */}
        {platforms.length > 1 && (
          <div className="flex gap-1 px-4 pt-3 overflow-x-auto">
            {platforms.filter(p => ['LINKEDIN', 'X', 'INSTAGRAM', 'FACEBOOK'].includes(p)).map((p) => (
              <button key={p} onClick={() => setActiveTab(p)}
                className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap font-medium transition-colors ${activeTab === p ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                {PLATFORM_LABELS[p] ?? p}
              </button>
            ))}
          </div>
        )}

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto p-5 bg-muted/30">
          {activeTab === 'LINKEDIN' && <LinkedInPreview content={content} />}
          {activeTab === 'X' && <XPreview content={content} />}
          {activeTab === 'INSTAGRAM' && <InstagramPreview content={content} mediaUrls={mediaUrls} />}
          {activeTab === 'FACEBOOK' && <FacebookPreview content={content} />}
          {!['LINKEDIN', 'X', 'INSTAGRAM', 'FACEBOOK'].includes(activeTab) && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-3xl mb-2">🚧</p>
              <p className="text-sm">Preview not available for {activeTab}</p>
            </div>
          )}
        </div>

        {/* Char count warning */}
        {activeTab === 'X' && content.length > 280 && (
          <div className="px-5 py-2 bg-destructive/10 border-t border-destructive/20">
            <p className="text-xs text-destructive font-medium">⚠️ Content exceeds 280 characters for X/Twitter — it will be truncated</p>
          </div>
        )}
        {activeTab === 'INSTAGRAM' && mediaUrls.length === 0 && (
          <div className="px-5 py-2 bg-yellow-50 dark:bg-yellow-950/20 border-t border-yellow-200 dark:border-yellow-800">
            <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">⚠️ Instagram requires at least one image or video to publish</p>
          </div>
        )}
      </div>
    </div>
  )
}

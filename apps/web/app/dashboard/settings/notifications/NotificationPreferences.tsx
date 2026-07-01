'use client'

import { useEffect, useState, useCallback } from 'react'

const INAPP_KEY = 'omnipulse_notif_prefs'
const EMAIL_KEY = 'omnipulse_email_prefs'

const IN_APP_ITEMS = [
  { key: 'postPublished', label: 'Post published successfully', description: 'Get notified when your scheduled post goes live', emoji: '✅' },
  { key: 'postFailed', label: 'Post failed to publish', description: 'Alert when a post fails due to an error', emoji: '❌' },
  { key: 'postPendingReview', label: 'Post needs review', description: 'Notify when a post is awaiting your approval', emoji: '👀' },
  { key: 'approvalDecision', label: 'Approval decision made', description: 'Notify when someone approves or rejects your post', emoji: '✅/❌' },
  { key: 'engagementAlert', label: 'High engagement alert', description: 'Alert when a post is performing exceptionally well', emoji: '🔥' },
  { key: 'followerMilestone', label: 'Follower milestone reached', description: 'Celebrate when you hit a follower count milestone', emoji: '🎉' },
  { key: 'teamMemberJoined', label: 'Team member joined', description: 'Notify when a new member joins your workspace', emoji: '👋' },
  { key: 'mentionInComment', label: 'Mentioned in comment', description: 'Alert when someone mentions you in a comment', emoji: '💬' },
]

const EMAIL_ITEMS = [
  { key: 'weeklyDigest', label: 'Weekly performance digest', description: 'A summary of your top posts and analytics each week', emoji: '📊' },
  { key: 'postFailedEmail', label: 'Post failed alerts', description: 'Email when a post fails to publish', emoji: '❌' },
  { key: 'approvalRequests', label: 'Approval requests', description: 'Email when content needs your review', emoji: '📋' },
  { key: 'teamInvitations', label: 'Team invitations', description: 'Email when you are invited to a workspace', emoji: '✉️' },
]

const DEFAULT_INAPP: Record<string, boolean> = {
  postPublished: true,
  postFailed: true,
  postPendingReview: true,
  approvalDecision: true,
  engagementAlert: true,
  followerMilestone: true,
  teamMemberJoined: true,
  mentionInComment: true,
}

const DEFAULT_EMAIL: Record<string, boolean> = {
  weeklyDigest: true,
  postFailedEmail: true,
  approvalRequests: true,
  teamInvitations: true,
}

function loadPrefs(key: string, defaults: Record<string, boolean>): Record<string, boolean> {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

function savePrefs(key: string, prefs: Record<string, boolean>) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

interface ToggleRowProps {
  emoji: string
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
}

function ToggleRow({ emoji, label, description, enabled, onToggle }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">{emoji}</span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${enabled ? 'bg-primary' : 'bg-muted'}`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

interface SectionCardProps {
  title: string
  children: React.ReactNode
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <div>{children}</div>
    </div>
  )
}

export function NotificationPreferences({ token: _token }: { token: string }) {
  const [inApp, setInApp] = useState<Record<string, boolean>>(DEFAULT_INAPP)
  const [email, setEmail] = useState<Record<string, boolean>>(DEFAULT_EMAIL)
  const [toast, setToast] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setInApp(loadPrefs(INAPP_KEY, DEFAULT_INAPP))
    setEmail(loadPrefs(EMAIL_KEY, DEFAULT_EMAIL))
    setMounted(true)
  }, [])

  const showToast = useCallback(() => {
    setToast(true)
    setTimeout(() => setToast(false), 2000)
  }, [])

  const toggleInApp = useCallback((key: string) => {
    setInApp((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      savePrefs(INAPP_KEY, next)
      return next
    })
    showToast()
  }, [showToast])

  const toggleEmail = useCallback((key: string) => {
    setEmail((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      savePrefs(EMAIL_KEY, next)
      return next
    })
    showToast()
  }, [showToast])

  const resetDefaults = useCallback(() => {
    setInApp(DEFAULT_INAPP)
    setEmail(DEFAULT_EMAIL)
    savePrefs(INAPP_KEY, DEFAULT_INAPP)
    savePrefs(EMAIL_KEY, DEFAULT_EMAIL)
    showToast()
  }, [showToast])

  if (!mounted) return null

  return (
    <div className="max-w-2xl space-y-6">
      {/* Toast */}
      <div
        aria-live="polite"
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 shadow-lg text-sm font-medium transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        ✅ Preferences saved
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">🔔 Notification Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">Control what alerts you receive and how you are notified.</p>
      </div>

      {/* In-App Notifications */}
      <SectionCard title="In-App Notifications">
        {IN_APP_ITEMS.map((item) => (
          <ToggleRow
            key={item.key}
            emoji={item.emoji}
            label={item.label}
            description={item.description}
            enabled={!!inApp[item.key]}
            onToggle={() => toggleInApp(item.key)}
          />
        ))}
      </SectionCard>

      {/* Email Notifications */}
      <SectionCard title="Email Notifications">
        {EMAIL_ITEMS.map((item) => (
          <ToggleRow
            key={item.key}
            emoji={item.emoji}
            label={item.label}
            description={item.description}
            enabled={!!email[item.key]}
            onToggle={() => toggleEmail(item.key)}
          />
        ))}
      </SectionCard>

      {/* Reset button */}
      <div className="flex justify-end">
        <button
          onClick={resetDefaults}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

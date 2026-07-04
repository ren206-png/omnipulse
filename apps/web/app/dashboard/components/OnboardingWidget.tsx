'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

interface OnboardingStep {
  id: string
  title: string
  description: string
  href: string
  icon: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'connect_account',
    title: 'Connect a social account',
    description: 'Link your Twitter/X, Instagram, LinkedIn, Facebook or TikTok account to start publishing.',
    href: '/dashboard/accounts',
    icon: '🔗',
  },
  {
    id: 'schedule_post',
    title: 'Schedule your first post',
    description: 'Pick a date on the calendar and write your first post. Use AI to generate captions.',
    href: '/dashboard/calendar',
    icon: '📅',
  },
  {
    id: 'upload_media',
    title: 'Upload a media file',
    description: 'Add images or videos to your media library to attach to posts.',
    href: '/dashboard/media',
    icon: '🖼️',
  },
  {
    id: 'invite_member',
    title: 'Invite a team member',
    description: 'Collaborate with your team — invite members and assign roles.',
    href: '/dashboard/settings/team',
    icon: '👥',
  },
  {
    id: 'try_ai',
    title: 'Try AI caption suggestions',
    description: 'Open the post editor and click the AI panel to generate captions, hashtags, and hooks.',
    href: '/dashboard/calendar',
    icon: '✨',
  },
  {
    id: 'generate_seo',
    title: 'Generate SEO metadata',
    description: 'In the post editor, open the SEO Checklist panel and click "Generate SEO Metadata".',
    href: '/dashboard/calendar',
    icon: '🔍',
  },
  {
    id: 'setup_digest',
    title: 'Set up your content digest',
    description: 'Get a daily email summary of your scheduled content and performance.',
    href: '/dashboard/settings/digest',
    icon: '📧',
  },
]

const TOTAL = ONBOARDING_STEPS.length

interface OnboardingWidgetProps {
  workspaceId: string
}

export function OnboardingWidget({ workspaceId }: OnboardingWidgetProps) {
  const [completed, setCompleted] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`omnipulse_onboarding_${workspaceId}`)
      if (saved) setCompleted(JSON.parse(saved) as string[])
      const wasDismissed = localStorage.getItem(`omnipulse_onboarding_dismissed_${workspaceId}`)
      if (wasDismissed === 'true') setDismissed(true)
    } catch {
      // silently ignore localStorage errors
    }
  }, [workspaceId])

  if (dismissed) return null

  const toggleStep = (id: string) => {
    try {
      const updated = completed.includes(id)
        ? completed.filter((s) => s !== id)
        : [...completed, id]
      setCompleted(updated)
      localStorage.setItem(`omnipulse_onboarding_${workspaceId}`, JSON.stringify(updated))
    } catch {
      // silently ignore
    }
  }

  const dismissForever = () => {
    try {
      localStorage.setItem(`omnipulse_onboarding_dismissed_${workspaceId}`, 'true')
    } catch {
      // silently ignore
    }
    setDismissed(true)
    setOpen(false)
  }

  const allComplete = completed.length >= TOTAL

  return (
    <>
      {/* Floating trigger button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full shadow-lg px-4 h-10"
          variant={allComplete ? 'outline' : 'default'}
        >
          {allComplete ? (
            <span className="text-green-600 font-semibold text-sm">✅ Setup complete!</span>
          ) : (
            <>
              <span>🚀</span>
              <span className="text-sm font-medium">Get Started</span>
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary-foreground text-primary text-xs font-bold w-5 h-5">
                {completed.length}/{TOTAL}
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Slide-out panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80">
          <Card className="shadow-xl">
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">Getting Started</span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Progress bar */}
              <div className="mb-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${(completed.length / TOTAL) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {completed.length} of {TOTAL} complete
              </p>

              {/* Steps list */}
              <ul className="space-y-2">
                {ONBOARDING_STEPS.map((step) => {
                  const isDone = completed.includes(step.id)
                  const isHovered = hoveredId === step.id
                  return (
                    <li
                      key={step.id}
                      className="flex items-start gap-2 group"
                      onMouseEnter={() => setHoveredId(step.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <Checkbox
                        id={`step-${step.id}`}
                        checked={isDone}
                        onCheckedChange={() => toggleStep(step.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <label
                            htmlFor={`step-${step.id}`}
                            className={`text-sm cursor-pointer leading-snug ${
                              isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            <span className="mr-1">{step.icon}</span>
                            {step.title}
                          </label>
                          <Link
                            href={step.href}
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors text-sm"
                            aria-label={`Go to ${step.title}`}
                            onClick={() => setOpen(false)}
                          >
                            →
                          </Link>
                        </div>
                        {isHovered && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Footer */}
              <div className="mt-4 border-t pt-3">
                {allComplete ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full text-sm"
                    onClick={dismissForever}
                  >
                    🎉 You&apos;re all set! Dismiss
                  </Button>
                ) : (
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dismiss for now
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

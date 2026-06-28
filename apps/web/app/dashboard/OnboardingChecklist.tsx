'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWorkspace } from './context/WorkspaceContext'

interface OnboardingStep {
  id: string
  label: string
  description: string
  href: string
  done: boolean
}

interface OnboardingData {
  dismissed: boolean
  steps: OnboardingStep[]
  completedCount: number
  totalCount: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function OnboardingChecklist({ token }: { token: string }) {
  const { activeWorkspace } = useWorkspace()
  const [data, setData] = useState<OnboardingData | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const fetchChecklist = useCallback(async (workspaceId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/onboarding?workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json() as OnboardingData
      setData(json)
      // Show if not dismissed and not all complete
      setVisible(!json.dismissed && json.completedCount < json.totalCount)
    } catch {
      // silently ignore
    }
  }, [token])

  useEffect(() => {
    if (activeWorkspace?.id) fetchChecklist(activeWorkspace.id)
  }, [activeWorkspace?.id, fetchChecklist])

  async function handleDismiss() {
    if (!activeWorkspace?.id) return
    setDismissing(true)
    try {
      await fetch(`${API_URL}/api/v1/onboarding/dismiss?workspaceId=${activeWorkspace.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setVisible(false)
    } finally {
      setDismissing(false)
    }
  }

  if (!visible || !data) return null

  const pct = Math.round((data.completedCount / data.totalCount) * 100)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Get started with OmniPulse</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.completedCount} of {data.totalCount} steps complete
          </p>
        </div>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="divide-y">
        {data.steps.map((step) => (
          <div key={step.id} className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${step.done ? 'opacity-60' : 'hover:bg-muted/30'}`}>
            {/* Checkbox */}
            <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              step.done ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            }`}>
              {step.done && (
                <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              )}
            </div>

            {/* Action */}
            {!step.done && (
              <Link
                href={step.href}
                className="flex-shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap"
              >
                Go →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* All done state */}
      {data.completedCount === data.totalCount && (
        <div className="px-5 py-4 bg-primary/5 border-t text-center">
          <p className="text-sm font-medium text-primary">🎉 You&apos;re all set!</p>
          <button onClick={handleDismiss} className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors">
            Dismiss checklist
          </button>
        </div>
      )}
    </div>
  )
}

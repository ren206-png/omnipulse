'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '../context/WorkspaceContext'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const PLATFORMS = [
  { id: 'INSTAGRAM', label: 'Instagram', color: '#e1306c', icon: '📸' },
  { id: 'FACEBOOK',  label: 'Facebook',  color: '#1877f2', icon: '👤' },
  { id: 'X',         label: 'X (Twitter)', color: '#000', icon: '🐦' },
  { id: 'TIKTOK',   label: 'TikTok',    color: '#010101', icon: '🎵' },
  { id: 'LINKEDIN',  label: 'LinkedIn',  color: '#0A66C2', icon: '💼' },
]

const STEPS = [
  { id: 'workspace', title: 'Name your workspace',   emoji: '🏢' },
  { id: 'accounts',  title: 'Connect social accounts', emoji: '🔗' },
  { id: 'post',      title: 'Create your first post',  emoji: '✍️' },
  { id: 'done',      title: 'You\'re all set!',         emoji: '🎉' },
]

interface Props { token: string }

export function OnboardingWizard({ token }: Props) {
  const router = useRouter()
  const { activeWorkspace } = useWorkspace()
  const [step, setStep] = useState(0)
  const [workspaceName, setWorkspaceName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    if (activeWorkspace?.name) setWorkspaceName(activeWorkspace.name)
  }, [activeWorkspace?.name])

  async function saveWorkspaceName() {
    if (!activeWorkspace?.id || !workspaceName.trim()) return
    setSavingName(true)
    setNameError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/workspaces/${activeWorkspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: workspaceName.trim() }),
      })
      if (!res.ok) { setNameError('Failed to save — try again'); return }
      setStep(1)
    } catch {
      setNameError('Network error')
    } finally {
      setSavingName(false)
    }
  }

  async function finish() {
    if (!activeWorkspace?.id) { router.push('/dashboard'); return }
    setDismissing(true)
    try {
      await fetch(`${API_URL}/api/v1/onboarding/dismiss?workspaceId=${activeWorkspace.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* silent */ } finally {
      setDismissing(false)
      router.push('/dashboard')
    }
  }

  function connectPlatform(platformId: string) {
    if (!activeWorkspace?.id) return
    window.location.href = `${API_URL}/api/v1/social-accounts/oauth/connect?platform=${platformId}&workspaceId=${activeWorkspace.id}`
  }

  const progress = ((step) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start py-10 px-4">
      {/* Logo / brand */}
      <div className="mb-8 text-center">
        <div className="text-3xl font-bold tracking-tight">OmniPulse</div>
        <p className="text-sm text-muted-foreground mt-1">Let's get you set up in a few steps</p>
      </div>

      {/* Step indicator */}
      <div className="w-full max-w-xl mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${
                i < step ? 'bg-primary border-primary text-primary-foreground' :
                i === step ? 'border-primary text-primary bg-primary/10' :
                'border-muted-foreground/30 text-muted-foreground/50'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block text-center leading-tight ${
                i === step ? 'text-foreground' : 'text-muted-foreground'
              }`}>{s.emoji} {s.title}</span>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step card */}
      <div className="w-full max-w-xl rounded-2xl border bg-card shadow-sm overflow-hidden">

        {/* Step 0 — Workspace name */}
        {step === 0 && (
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl">🏢</div>
              <h2 className="text-xl font-semibold">Name your workspace</h2>
              <p className="text-sm text-muted-foreground">This is how your workspace appears across OmniPulse. You can change it later.</p>
            </div>
            <div className="space-y-2">
              <Input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveWorkspaceName() }}
                placeholder="e.g. Acme Marketing"
                className="text-base h-11"
                autoFocus
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="flex justify-end">
              <Button onClick={saveWorkspaceName} disabled={savingName || !workspaceName.trim()} className="px-8">
                {savingName ? 'Saving…' : 'Continue →'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 — Connect accounts */}
        {step === 1 && (
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl">🔗</div>
              <h2 className="text-xl font-semibold">Connect your social accounts</h2>
              <p className="text-sm text-muted-foreground">Connect at least one account to start publishing. You can add more later.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => connectPlatform(p.id)}
                  className="flex items-center gap-3 rounded-xl border p-3.5 hover:shadow-sm transition-all text-left group"
                  style={{ borderColor: `${p.color}30` }}
                >
                  <span
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${p.color}15` }}
                  >
                    {p.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">Click to connect</p>
                  </div>
                  <span className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors text-sm">→</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setStep(0)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Back
              </button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Skip for now</Button>
                <Button onClick={() => setStep(2)}>Continue →</Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Create first post */}
        {step === 2 && (
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl">✍️</div>
              <h2 className="text-xl font-semibold">Create your first post</h2>
              <p className="text-sm text-muted-foreground">Head to the calendar to schedule your first post. It only takes a minute.</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📅</span>
                <div>
                  <p className="text-sm font-semibold">Calendar</p>
                  <p className="text-xs text-muted-foreground">Pick a date, write your content, choose platforms, and schedule — done.</p>
                </div>
              </div>
              <Link href="/dashboard/calendar">
                <Button className="w-full" onClick={() => setStep(3)}>
                  Open Calendar & Schedule a Post →
                </Button>
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Back
              </button>
              <Button variant="outline" onClick={() => setStep(3)}>Skip for now</Button>
            </div>
          </div>
        )}

        {/* Step 3 — Done / Confetti */}
        {step === 3 && (
          <div className="p-8 space-y-6 text-center relative overflow-hidden">
            {/* CSS confetti */}
            <style>{`
              @keyframes confetti-fall {
                0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(300px) rotate(720deg); opacity: 0; }
              }
              .confetti-piece {
                position: absolute;
                width: 8px;
                height: 8px;
                border-radius: 2px;
                animation: confetti-fall 2.5s ease-in forwards;
              }
            `}</style>
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="confetti-piece pointer-events-none"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-10px',
                  background: ['#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899'][i % 5],
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${1.5 + Math.random() * 1.5}s`,
                }}
              />
            ))}

            <div className="space-y-3">
              <div className="text-6xl">🎉</div>
              <h2 className="text-2xl font-bold">You're all set!</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Your workspace is ready. Explore the dashboard, schedule posts, track analytics, and grow your audience.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {[
                { icon: '📅', title: 'Calendar', desc: 'Schedule & manage posts', href: '/dashboard/calendar' },
                { icon: '📊', title: 'Analytics', desc: 'Track your performance', href: '/dashboard/analytics' },
                { icon: '🤖', title: 'AI Tools',  desc: 'Generate content with AI', href: '/dashboard/calendar' },
              ].map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  className="rounded-xl border p-3.5 hover:bg-muted/40 transition-colors group"
                >
                  <div className="text-2xl mb-1">{link.icon}</div>
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">{link.title}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </Link>
              ))}
            </div>

            <Button size="lg" className="w-full" onClick={finish} disabled={dismissing}>
              {dismissing ? 'Almost done…' : 'Go to Dashboard →'}
            </Button>
          </div>
        )}
      </div>

      {/* Skip entirely */}
      {step < 3 && (
        <button
          type="button"
          onClick={finish}
          className="mt-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip setup — I'll explore on my own
        </button>
      )}
    </div>
  )
}

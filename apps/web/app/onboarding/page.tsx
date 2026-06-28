'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STEPS = ['Welcome', 'Connect Account', 'Schedule Post', 'Invite Team', 'All Set']

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)

  const next = () => setStep(s => Math.min(s + 1, 4))
  const skip = () => setStep(s => Math.min(s + 1, 4))

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="mb-8 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{STEPS[step]}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="bg-background rounded-2xl border shadow-lg p-8 space-y-6">
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && <ConnectStep onNext={next} onSkip={skip} />}
          {step === 2 && <ScheduleStep onNext={next} onSkip={skip} />}
          {step === 3 && <InviteStep onNext={next} onSkip={skip} />}
          {step === 4 && <DoneStep onFinish={() => router.push('/dashboard')} />}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-4">
      <div className="text-5xl">🎉</div>
      <h1 className="text-2xl font-bold">Welcome to OmniPulse!</h1>
      <p className="text-muted-foreground">Your all-in-one social media management platform. Let&apos;s get you set up in just a few steps.</p>
      <div className="grid grid-cols-3 gap-3 py-4 text-sm">
        <div className="rounded-lg border p-3 space-y-1"><div className="text-xl">📅</div><div className="font-medium">Schedule</div><div className="text-xs text-muted-foreground">Plan your content</div></div>
        <div className="rounded-lg border p-3 space-y-1"><div className="text-xl">📊</div><div className="font-medium">Analyze</div><div className="text-xs text-muted-foreground">Track performance</div></div>
        <div className="rounded-lg border p-3 space-y-1"><div className="text-xl">🤖</div><div className="font-medium">AI Assist</div><div className="text-xs text-muted-foreground">Generate content</div></div>
      </div>
      <Button className="w-full" onClick={onNext}>Let&apos;s get started →</Button>
    </div>
  )
}

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const
const PLATFORM_COLORS: Record<string, string> = { FACEBOOK: '#1877F2', INSTAGRAM: '#E1306C', TIKTOK: '#000000', X: '#000000', GOOGLE: '#4285F4' }

function ConnectStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Connect a social account</h2>
        <p className="text-sm text-muted-foreground">Connect your platforms to start scheduling posts.</p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {PLATFORMS.map(p => (
          <div key={p} className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ background: PLATFORM_COLORS[p] }}>
                {p[0]}
              </div>
              <span className="text-sm font-medium">{p.charAt(0) + p.slice(1).toLowerCase()}</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open('/dashboard/accounts', '_blank')}>Connect</Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onSkip}>Skip for now</Button>
        <Button className="flex-1" onClick={onNext}>Continue →</Button>
      </div>
    </div>
  )
}

function ScheduleStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Schedule your first post</h2>
        <p className="text-sm text-muted-foreground">Head to the Calendar to create and schedule content.</p>
      </div>
      <div className="rounded-lg border-2 border-dashed p-6 text-center space-y-3">
        <div className="text-4xl">📅</div>
        <p className="text-sm text-muted-foreground">The Calendar lets you compose posts, pick platforms, set exact times, and preview how they&apos;ll look on each platform.</p>
        <Button variant="outline" onClick={() => window.open('/dashboard/calendar', '_blank')}>Open Calendar</Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onSkip}>Skip for now</Button>
        <Button className="flex-1" onClick={onNext}>Continue →</Button>
      </div>
    </div>
  )
}

function InviteStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold">Invite your team</h2>
        <p className="text-sm text-muted-foreground">Collaborate with teammates on your content.</p>
      </div>
      {sent ? (
        <div className="text-center space-y-2 py-4">
          <div className="text-3xl">📧</div>
          <p className="font-medium text-green-600">Invitation sent!</p>
          <p className="text-sm text-muted-foreground">You can invite more people from Settings → Team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email address</Label>
            <Input placeholder="colleague@company.com" value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>
          <Button className="w-full" onClick={() => { if (email) setSent(true) }} disabled={!email}>Send Invitation</Button>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onSkip}>Skip for now</Button>
        <Button className="flex-1" onClick={onNext}>Continue →</Button>
      </div>
    </div>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="text-6xl">🚀</div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
        <p className="text-muted-foreground">OmniPulse is ready to supercharge your social media. Let&apos;s go!</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/50 p-3 text-left space-y-1"><div className="font-medium">✨ AI Captions</div><div className="text-xs text-muted-foreground">Generate content with AI</div></div>
        <div className="rounded-lg bg-muted/50 p-3 text-left space-y-1"><div className="font-medium">⚡ Smart Queue</div><div className="text-xs text-muted-foreground">Auto-schedule at best times</div></div>
        <div className="rounded-lg bg-muted/50 p-3 text-left space-y-1"><div className="font-medium">📊 Analytics</div><div className="text-xs text-muted-foreground">Track every post</div></div>
        <div className="rounded-lg bg-muted/50 p-3 text-left space-y-1"><div className="font-medium">🔗 Link in Bio</div><div className="text-xs text-muted-foreground">Beautiful bio pages</div></div>
      </div>
      <Button size="lg" className="w-full text-base" onClick={onFinish}>Go to Dashboard →</Button>
    </div>
  )
}

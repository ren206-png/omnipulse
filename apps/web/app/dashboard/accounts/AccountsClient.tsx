'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'X', 'GOOGLE'] as const
type Platform = (typeof PLATFORMS)[number]

interface PlatformConfig {
  color: string
  handlePlaceholder: string
  instructions: string
}

const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  FACEBOOK: {
    color: '#1877F2',
    handlePlaceholder: '@your-page-name or Page ID',
    instructions:
      '1. Go to developers.facebook.com → My Apps → Create App\n2. Add Facebook Login product\n3. Generate a Page Access Token in Graph API Explorer\n4. Paste it above',
  },
  INSTAGRAM: {
    color: '#E1306C',
    handlePlaceholder: '@your_instagram_username',
    instructions:
      '1. Your Instagram account must be a Business or Creator account\n2. Link it to a Facebook Page (Instagram app → Settings → Account type → Professional)\n3. Click Connect — you\'ll be taken through Facebook Login\n4. Approve the requested permissions',
  },
  TIKTOK: {
    color: '#000000',
    handlePlaceholder: '@your_tiktok_handle',
    instructions:
      '1. Go to developers.tiktok.com → Manage Apps\n2. Create an app with \'Login Kit\'\n3. Generate an access token from your app dashboard\n4. Paste it above',
  },
  X: {
    color: '#000000',
    handlePlaceholder: '@your_handle',
    instructions:
      '1. Go to developer.twitter.com → Projects & Apps\n2. Create an app and navigate to Keys and Tokens\n3. Generate a Bearer Token or Access Token\n4. Paste it above',
  },
  GOOGLE: {
    color: '#4285F4',
    handlePlaceholder: 'Location ID or Business ID',
    instructions:
      '1. Go to console.cloud.google.com\n2. Enable Google My Business API\n3. Create OAuth 2.0 credentials\n4. Use the OAuth Playground to get a token\n5. Paste it above',
  },
}

function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  if (platform === 'TIKTOK') {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        className="inline-flex items-center justify-center rounded-md bg-black text-white font-bold"
      >
        TT
      </span>
    )
  }

  const paths: Record<Exclude<Platform, 'TIKTOK'>, React.ReactNode> = {
    FACEBOOK: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
    INSTAGRAM: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ),
    X: (
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    ),
    GOOGLE: (
      <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.689 7.689 0 0 1 5.352 2.082l-2.284 2.284A4.347 4.347 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.792 4.792 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.702 3.702 0 0 0 1.599-2.431H8v-3.08h7.545z" />
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths[platform as Exclude<Platform, 'TIKTOK'>]}
    </svg>
  )
}

interface SocialAccount {
  id: string
  platform: Platform
  externalProfileId: string
}

interface Props {
  token: string
}

interface ConnectModalProps {
  platform: Platform
  onClose: () => void
  onSuccess: () => void
  token: string
  workspaceId: string
  apiUrl: string
}

function ConnectModal({ platform, onClose, onSuccess, token, workspaceId, apiUrl }: ConnectModalProps) {
  const config = PLATFORM_CONFIG[platform]
  const [step, setStep] = useState<1 | 2>(1)
  const [profileId, setProfileId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  async function handleSubmit() {
    setFormError(null)
    if (step === 1) {
      if (!profileId.trim()) { setFormError('Profile ID / Handle is required'); return }
      setStep(2)
      return
    }
    if (!accessToken.trim()) { setFormError('Access token is required'); return }

    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/v1/social-accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspaceId, platform, externalProfileId: profileId, accessToken }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setFormError(body.error ?? 'Failed to connect account')
        return
      }
      onSuccess()
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${config.color}18, ${config.color}08)`, borderBottom: `2px solid ${config.color}30` }}
        >
          <span
            className="flex items-center justify-center w-10 h-10 rounded-xl text-white shadow-sm"
            style={{ background: config.color }}
          >
            <PlatformIcon platform={platform} size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold">Connect {platform.charAt(0) + platform.slice(1).toLowerCase()}</h2>
            <p className="text-xs text-muted-foreground">Step {step} of 2 — {step === 1 ? 'Profile details' : 'Access token'}</p>
          </div>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1.5 flex-1 rounded-full transition-all duration-300"
              style={{ background: s <= step ? config.color : '#e5e7eb' }}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {step === 1 ? (
            <div className="space-y-2">
              <Label htmlFor="modal-profile-id" className="text-sm font-medium">
                Profile ID / Handle
              </Label>
              <Input
                id="modal-profile-id"
                placeholder={config.handlePlaceholder}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                autoFocus
                className="h-10"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="modal-access-token" className="text-sm font-medium">
                Access Token
              </Label>
              <Input
                id="modal-access-token"
                type="password"
                placeholder="Paste your access token here"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                autoFocus
                className="h-10 font-mono text-sm"
              />
            </div>
          )}

          {formError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{formError}</p>
          )}

          {/* Collapsible instructions */}
          <div className="rounded-lg border overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setInstructionsOpen((o) => !o)}
            >
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                How to get your token
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={cn('transition-transform duration-200', instructionsOpen && 'rotate-180')}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {instructionsOpen && (
              <div className="px-3 pb-3 pt-1 border-t bg-muted/20">
                <ol className="space-y-1.5">
                  {config.instructions.split('\n').map((line, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center gap-2 justify-end">
          {step === 2 && (
            <Button variant="ghost" size="sm" onClick={() => { setStep(1); setFormError(null) }} disabled={loading}>
              Back
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={loading}
            style={{ background: config.color, borderColor: config.color }}
            className="text-white hover:opacity-90 transition-opacity border"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                Connecting…
              </span>
            ) : step === 1 ? 'Next →' : 'Connect'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PlatformCard({
  platform,
  account,
  onConnect,
  onDisconnect,
  deleting,
}: {
  platform: Platform
  account: SocialAccount | undefined
  onConnect: (p: Platform) => void
  onDisconnect: (id: string) => void
  deleting: boolean
}) {
  const config = PLATFORM_CONFIG[platform]
  const connected = !!account

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md',
        'flex flex-col gap-4 p-5',
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: config.color }}
    >
      {/* Top row: icon + name + badge */}
      <div className="flex items-center gap-3">
        <span
          className="flex items-center justify-center w-10 h-10 rounded-xl text-white flex-shrink-0"
          style={{ background: config.color }}
        >
          <PlatformIcon platform={platform} size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none mb-1 capitalize">
            {platform.charAt(0) + platform.slice(1).toLowerCase()}
          </p>
          {connected ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 inline-block" />
              Not connected
            </span>
          )}
        </div>
      </div>

      {/* Handle */}
      {connected && account && (
        <p className="text-xs text-muted-foreground truncate font-mono bg-muted/50 rounded-md px-2.5 py-1.5">
          {account.externalProfileId}
        </p>
      )}

      {/* Instagram requires Business account notice */}
      {!connected && platform === 'INSTAGRAM' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5 leading-relaxed">
          Requires a Business or Creator account linked to a Facebook Page
        </p>
      )}

      {/* Action button */}
      {connected && account ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/20 h-8 mt-auto"
          onClick={() => onDisconnect(account.id)}
          disabled={deleting}
        >
          {deleting ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Disconnecting…
            </span>
          ) : 'Disconnect'}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 mt-auto border transition-colors hover:text-white"
          style={{
            borderColor: config.color,
            color: config.color,
          }}
          onClick={() => onConnect(platform)}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = config.color
            ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = ''
            ;(e.currentTarget as HTMLButtonElement).style.color = config.color
          }}
        >
          Connect
        </Button>
      )}
    </div>
  )
}

export function AccountsClient({ token }: Props) {
  const { activeWorkspace, workspacesLoading } = useWorkspace()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)
  const didHandleParams = useRef(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const headers = { Authorization: `Bearer ${token}` }

  const fetchAccounts = useCallback(
    async (workspaceId: string) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${apiUrl}/api/v1/social-accounts?workspaceId=${workspaceId}`, { headers })
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const data = (await res.json()) as { accounts: SocialAccount[] }
        setAccounts(data.accounts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts')
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  )

  useEffect(() => {
    if (activeWorkspace) fetchAccounts(activeWorkspace.id)
  }, [activeWorkspace, fetchAccounts])

  // Handle OAuth redirect back from API (?connected=PLATFORM or ?error=...)
  useEffect(() => {
    if (didHandleParams.current) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const oauthError = params.get('error')
    if (connected || oauthError) {
      didHandleParams.current = true
      // Remove query params from URL without reloading
      const clean = window.location.pathname
      window.history.replaceState({}, '', clean)
      if (connected) showToast(`${connected} connected successfully!`, 'success')
      else if (oauthError === 'no_ig_business_account') {
        showToast('No Instagram Business Account found. Convert your account to Business/Creator and link it to a Facebook Page first.', 'info')
      } else if (oauthError) showToast(`OAuth failed: ${oauthError}`, 'info')
    }
  }, [])

  function handleOAuthConnect(platform: Platform) {
    if (!activeWorkspace) return
    window.location.href = `${apiUrl}/api/v1/social-accounts/oauth/connect?platform=${platform}&workspaceId=${activeWorkspace.id}`
  }

  function showToast(message: string, type: 'success' | 'info' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleDisconnect(id: string) {
    setDeletingId(id)
    try {
      await fetch(`${apiUrl}/api/v1/social-accounts/${id}`, { method: 'DELETE', headers })
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      showToast('Account disconnected.', 'info')
    } catch {
      // account list stays intact — user can retry
    } finally {
      setDeletingId(null)
    }
  }

  function handleConnectSuccess() {
    setConnectingPlatform(null)
    if (activeWorkspace) fetchAccounts(activeWorkspace.id)
    showToast('Account connected successfully!')
  }

  if (workspacesLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed h-48 gap-3">
        <svg className="animate-spin h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm text-muted-foreground">Loading workspace…</span>
      </div>
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed h-48">
        <p className="text-sm text-muted-foreground">Select a workspace from the sidebar to manage accounts.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Connected Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your social media accounts to start publishing and tracking analytics.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => fetchAccounts(activeWorkspace.id)}>
            Retry
          </Button>
        </div>
      )}

      {/* Platform cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((p) => (
            <div key={p} className="animate-pulse rounded-2xl border bg-card h-36" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((platform) => {
            const account = accounts.find((a) => a.platform === platform)
            return (
              <PlatformCard
                key={platform}
                platform={platform}
                account={account}
                onConnect={handleOAuthConnect}
                onDisconnect={handleDisconnect}
                deleting={deletingId === account?.id}
              />
            )
          })}
        </div>
      )}

      {/* Stats bar */}
      {!loading && (
        <div className="rounded-xl border bg-muted/30 px-5 py-3 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{accounts.length}</span> of {PLATFORMS.length} platforms connected
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(accounts.length / PLATFORMS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Connect modal kept for manual-token fallback — not used by OAuth flow */}
      {connectingPlatform && (
        <ConnectModal
          platform={connectingPlatform}
          onClose={() => setConnectingPlatform(null)}
          onSuccess={handleConnectSuccess}
          token={token}
          workspaceId={activeWorkspace.id}
          apiUrl={apiUrl}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl border shadow-lg px-4 py-3 text-sm font-medium',
            'animate-in fade-in slide-in-from-bottom-3 duration-300',
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200'
              : 'bg-background border text-foreground',
          )}
        >
          {toast.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  )
}

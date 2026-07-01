'use client'

interface Props {
  open: boolean
  onClose: () => void
  featureName: string
  message?: string
}

export function UpgradeModal({ open, onClose, featureName, message }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <div className="text-4xl">⚡</div>
          <h2 className="text-xl font-bold">Unlock {featureName}</h2>
          <p className="text-sm text-muted-foreground">
            {message ?? `${featureName} is available on Pro and Agency plans. Upgrade to unlock AI-powered features, unlimited scheduling, and more.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-xl p-3 space-y-2">
            <p className="font-semibold text-sm">Pro</p>
            <p className="text-2xl font-bold">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ All AI features</li>
              <li>✓ Unlimited posts</li>
              <li>✓ 5 social accounts</li>
              <li>✓ Analytics</li>
            </ul>
          </div>
          <div className="border-2 border-primary rounded-xl p-3 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">BEST VALUE</div>
            <p className="font-semibold text-sm">Agency</p>
            <p className="text-2xl font-bold">$79<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>✓ Everything in Pro</li>
              <li>✓ Unlimited accounts</li>
              <li>✓ Team collaboration</li>
              <li>✓ Client portal</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <a href="/dashboard/billing" className="w-full text-center py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors" onClick={onClose}>
            Upgrade Now →
          </a>
          <button onClick={onClose} className="w-full text-center py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

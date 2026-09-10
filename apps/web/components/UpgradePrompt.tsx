import Link from 'next/link'

interface UpgradePromptProps {
  feature: string
  requiredPlan: 'STARTER' | 'PRO' | 'AGENCY'
}

const PLAN_LABELS: Record<'STARTER' | 'PRO' | 'AGENCY', string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  AGENCY: 'Agency',
}

export function UpgradePrompt({ feature, requiredPlan }: UpgradePromptProps) {
  const planLabel = PLAN_LABELS[requiredPlan]

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-8 py-12 text-center">
      {/* Lock icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{feature}</p>
        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Upgrade to {planLabel} to unlock
        </p>
      </div>

      <Link
        href="/dashboard/billing"
        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
      >
        Upgrade to {planLabel}
      </Link>
    </div>
  )
}

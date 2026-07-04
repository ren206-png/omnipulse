import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account — OmniPulse',
  robots: { index: false, follow: false },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

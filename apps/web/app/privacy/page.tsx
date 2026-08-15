import type { Metadata } from 'next'
import Link from 'next/link'
import { OmniPulseLogo } from '@/components/OmniPulseLogo'

export const metadata: Metadata = {
  title: 'Privacy Policy — OmniPulse',
  description: 'Learn how OmniPulse collects, uses, and protects your personal information.',
  alternates: { canonical: 'https://getomnipulse.com/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Nav */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Link href="/">
              <OmniPulseLogo variant="wordmark" height={36} />
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-400">
            <a href="/#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="/#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Effective date: July 27, 2026</p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-10 text-gray-700 dark:text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">1. Introduction</h2>
            <p>
              Welcome to OmniPulse (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). We operate the website{' '}
              <a href="https://getomnipulse.com" className="text-indigo-600 hover:underline">getomnipulse.com</a>{' '}
              and the OmniPulse platform (collectively, the &ldquo;Service&rdquo;). This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you use our Service. Please read this policy
              carefully. If you disagree with its terms, please discontinue use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">2. Information We Collect</h2>
            <p>We may collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Account Information:</strong> When you register, we collect your name, email address, and
                password (hashed).
              </li>
              <li>
                <strong>Profile & Content:</strong> Any content you create, upload, or schedule through the Service,
                including social media posts, captions, and media files.
              </li>
              <li>
                <strong>Connected Social Accounts:</strong> OAuth tokens and metadata from social platforms you connect
                (e.g., Instagram, X, LinkedIn, TikTok, Facebook, YouTube). We store only what is necessary to operate
                the Service on your behalf.
              </li>
              <li>
                <strong>Usage Data:</strong> Log data including your IP address, browser type, pages visited, referring
                URLs, and timestamps.
              </li>
              <li>
                <strong>Payment Information:</strong> Billing details processed securely through our third-party payment
                processor. We do not store full credit card numbers.
              </li>
              <li>
                <strong>Communications:</strong> Messages you send to our support team.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process transactions and send related information (receipts, invoices)</li>
              <li>Schedule and publish content to your connected social media accounts</li>
              <li>Send administrative communications, security alerts, and support messages</li>
              <li>Send marketing communications (you may opt out at any time)</li>
              <li>Analyze usage patterns to improve and develop new features</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">4. Sharing of Information</h2>
            <p>We do not sell your personal information. We may share your information with:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Service Providers:</strong> Third-party vendors who assist us in operating the Service (e.g.,
                cloud hosting, payment processing, analytics, email delivery).
              </li>
              <li>
                <strong>Social Media Platforms:</strong> To post content on your behalf per your instructions.
              </li>
              <li>
                <strong>Legal Authorities:</strong> When required by law, subpoena, or to protect the rights and safety
                of OmniPulse or others.
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your
                information may be transferred.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">5. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide the
              Service. You may request deletion of your account and associated data at any time by contacting us. We may
              retain certain information for legitimate business or legal purposes after account deletion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">6. Security</h2>
            <p>
              We implement industry-standard security measures including encryption in transit (TLS), hashed passwords,
              and access controls. However, no method of transmission over the Internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">7. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Data portability (receive your data in a structured format)</li>
              <li>Withdraw consent at any time (where processing is based on consent)</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at{' '}
              <a href="mailto:privacy@getomnipulse.com" className="text-indigo-600 hover:underline">
                privacy@getomnipulse.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">8. Cookies</h2>
            <p>
              We use cookies and similar tracking technologies to enhance your experience, analyze usage, and deliver
              relevant content. You can control cookie settings through your browser. Disabling certain cookies may
              affect the functionality of the Service. We use:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Essential cookies:</strong> Required for the Service to function (e.g., authentication sessions)</li>
              <li><strong>Analytics cookies:</strong> Help us understand how users interact with the Service</li>
              <li><strong>Preference cookies:</strong> Remember your settings and preferences</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">9. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed to children under the age of 13. We do not knowingly collect personal
              information from children. If we become aware that a child has provided us with personal information, we
              will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting
              the new policy on this page and updating the effective date. Your continued use of the Service after any
              changes constitutes your acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">11. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at:</p>
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <p className="font-medium">OmniPulse</p>
              <p>
                Email:{' '}
                <a href="mailto:privacy@getomnipulse.com" className="text-indigo-600 hover:underline">
                  privacy@getomnipulse.com
                </a>
              </p>
              <p>Website: <a href="https://getomnipulse.com" className="text-indigo-600 hover:underline">getomnipulse.com</a></p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <OmniPulseLogo variant="wordmark" height={32} className="mb-1 opacity-80 dark:opacity-90" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your all-in-one social media command center.
              </p>
            </div>
            <nav className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-gray-900 dark:hover:text-white transition-colors">Terms</Link>
              <Link href="/contact" className="hover:text-gray-900 dark:hover:text-white transition-colors">Contact</Link>
            </nav>
          </div>
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-600">
            &copy; {new Date().getFullYear()} OmniPulse. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

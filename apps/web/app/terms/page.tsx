import type { Metadata } from 'next'
import Link from 'next/link'
import { OmniPulseLogo } from '@/components/OmniPulseLogo'

export const metadata: Metadata = {
  title: 'Terms and Conditions — OmniPulse',
  description: 'Read the OmniPulse Terms and Conditions governing your use of our platform.',
  alternates: { canonical: 'https://getomnipulse.com/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight mb-3">Terms and Conditions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Effective date: July 27, 2026</p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-10 text-gray-700 dark:text-gray-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the OmniPulse platform at{' '}
              <a href="https://getomnipulse.com" className="text-indigo-600 hover:underline">getomnipulse.com</a>{' '}
              (the &ldquo;Service&rdquo;), you agree to be bound by these Terms and Conditions (&ldquo;Terms&rdquo;).
              If you do not agree to these Terms, please do not use the Service. These Terms apply to all visitors,
              users, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">2. Use of Service</h2>
            <p>
              OmniPulse grants you a limited, non-exclusive, non-transferable, revocable license to access and use the
              Service for your personal or business purposes, subject to these Terms. You agree not to use the Service
              for any unlawful purpose or in any way that could harm OmniPulse, its users, or third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">3. Account Registration</h2>
            <p>
              To access certain features of the Service, you must create an account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Keep your login credentials confidential</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p className="mt-3">
              You must be at least 13 years of age to create an account. By creating an account, you represent that
              you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">4. Subscription &amp; Billing</h2>
            <p>
              OmniPulse offers free and paid subscription plans. By selecting a paid plan, you agree to pay the
              applicable fees. All fees are:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Billed in advance on a monthly or annual basis</li>
              <li>Non-refundable except as required by law or at our sole discretion</li>
              <li>Subject to change with 30 days&apos; notice</li>
            </ul>
            <p className="mt-3">
              We use a third-party payment processor to handle billing. You authorize us to charge your payment method
              for all fees incurred. Failure to pay may result in suspension or termination of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">5. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Use the Service to post illegal, harmful, defamatory, or abusive content</li>
              <li>Violate the terms of service of any connected social media platform</li>
              <li>Use the Service to send spam or unsolicited communications</li>
              <li>Reverse engineer, decompile, or disassemble the Service</li>
              <li>Attempt to gain unauthorized access to any part of the Service or its systems</li>
              <li>Use automated tools to scrape or extract data from the Service without permission</li>
              <li>Impersonate any person or entity or misrepresent your affiliation</li>
              <li>Use the Service in any manner that could disable, overburden, or impair it</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">6. Your Content</h2>
            <p>
              You retain ownership of any content you create or upload to the Service (&ldquo;User Content&rdquo;). By
              using the Service, you grant OmniPulse a limited, non-exclusive, royalty-free license to use, store, and
              process your User Content solely to provide and improve the Service. You are solely responsible for your
              User Content and represent that you have all rights necessary to grant this license.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">7. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are and will remain the exclusive
              property of OmniPulse and its licensors. Our trademarks, logos, and service marks may not be used in
              connection with any product or service without our prior written consent. Nothing in these Terms grants
              you any rights to use OmniPulse&apos;s intellectual property beyond what is needed to use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">8. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES
              OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
              UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">9. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, OMNIPULSE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT
              OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM YOUR USE OF THE SERVICE SHALL NOT EXCEED THE
              AMOUNT YOU PAID TO OMNIPULSE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">10. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time, with or without cause, and with or
              without notice. You may cancel your account at any time from your account settings. Upon termination, your
              right to use the Service will immediately cease. Provisions that by their nature should survive
              termination (including intellectual property, disclaimers, and limitations of liability) will survive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws, without regard to
              conflict of law principles. Any disputes arising under these Terms shall be resolved through binding
              arbitration or in the courts of competent jurisdiction, as appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of material changes by posting
              the updated Terms on this page and updating the effective date. Your continued use of the Service after
              any changes constitutes your acceptance of the new Terms. If you do not agree to the updated Terms, you
              must stop using the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">13. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <p className="font-medium">OmniPulse</p>
              <p>
                Email:{' '}
                <a href="mailto:legal@getomnipulse.com" className="text-indigo-600 hover:underline">
                  legal@getomnipulse.com
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

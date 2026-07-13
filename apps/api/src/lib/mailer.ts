import { Resend } from 'resend'
import { env } from '../config/env.js'
import { logger } from './logger.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const FROM = env.EMAIL_FROM || 'OmniPulse <noreply@getomnipulse.com>'

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  if (!resend) {
    logger.warn({ to: params.to, subject: params.subject }, '[Mailer] RESEND_API_KEY not set — email skipped')
    return
  }
  try {
    await resend.emails.send({ from: FROM, ...params })
  } catch (err) {
    logger.error({ err, to: params.to }, '[Mailer] Failed to send email — non-fatal')
    // Never throw — email failure must never crash the calling flow
  }
}

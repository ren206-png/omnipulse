import { Resend } from 'resend'
import { logger } from './logger.js'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_placeholder')

export async function sendInvitationEmail(opts: {
  to: string
  inviterEmail: string
  workspaceName: string
  role: string
  inviteToken: string
}) {
  const appUrl = process.env.WEB_URL ?? 'http://localhost:3000'
  const acceptUrl = `${appUrl}/invite/${opts.inviteToken}`

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
      to: opts.to,
      subject: `You've been invited to join ${opts.workspaceName} on OmniPulse`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
          <h2 style="color:#1f2937">You're invited!</h2>
          <p style="color:#4b5563">${opts.inviterEmail} has invited you to join <strong>${opts.workspaceName}</strong> as a <strong>${opts.role}</strong>.</p>
          <a href="${acceptUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Accept Invitation</a>
          <p style="color:#9ca3af;font-size:12px">This invitation expires in 7 days. If you didn't expect this, you can ignore this email.</p>
        </div>
      `,
    })
  } catch (err) {
    logger.error({ err, to: opts.to }, 'Invitation email send failed')
  }
}

export async function sendPostSubmittedEmail(opts: {
  to: string
  submitterEmail: string
  postContent: string
  workspaceName: string
  approvalsUrl: string
}) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
      to: opts.to,
      subject: `New post awaiting your review in ${opts.workspaceName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
          <h2 style="color:#1f2937">Post awaiting review</h2>
          <p style="color:#4b5563"><strong>${opts.submitterEmail}</strong> submitted a post for approval in <strong>${opts.workspaceName}</strong>.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
            <p style="color:#374151;margin:0;font-size:14px;white-space:pre-wrap">${opts.postContent.slice(0, 280)}${opts.postContent.length > 280 ? '…' : ''}</p>
          </div>
          <a href="${opts.approvalsUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">Review Post</a>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">You received this because you are an admin or owner of ${opts.workspaceName}.</p>
        </div>
      `,
    })
  } catch (err) {
    logger.error({ err, to: opts.to }, 'Post submitted email send failed')
  }
}

export async function sendPostApprovedEmail(opts: {
  to: string
  postContent: string
  calendarUrl: string
}) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
      to: opts.to,
      subject: 'Your post was approved and scheduled',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
          <h2 style="color:#1f2937">Post approved! 🎉</h2>
          <p style="color:#4b5563">Great news — your post has been approved and is now scheduled.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
            <p style="color:#374151;margin:0;font-size:14px;white-space:pre-wrap">${opts.postContent.slice(0, 280)}${opts.postContent.length > 280 ? '…' : ''}</p>
          </div>
          <a href="${opts.calendarUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">View Calendar</a>
        </div>
      `,
    })
  } catch (err) {
    logger.error({ err, to: opts.to }, 'Post approved email send failed')
  }
}

export async function sendPostRejectedEmail(opts: {
  to: string
  postContent: string
  note?: string
  calendarUrl: string
}) {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
      to: opts.to,
      subject: 'Your post needs some changes',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
          <h2 style="color:#1f2937">Post sent back for revisions</h2>
          <p style="color:#4b5563">Your post was reviewed and needs a few changes before it can be published.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
            <p style="color:#374151;margin:0;font-size:14px;white-space:pre-wrap">${opts.postContent.slice(0, 280)}${opts.postContent.length > 280 ? '…' : ''}</p>
          </div>
          ${opts.note ? `
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0">
            <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 4px">Reviewer feedback:</p>
            <p style="color:#374151;margin:0;font-size:14px">${opts.note}</p>
          </div>` : ''}
          <a href="${opts.calendarUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">Edit Post</a>
        </div>
      `,
    })
  } catch (err) {
    logger.error({ err, to: opts.to }, 'Post rejected email send failed')
  }
}

export async function sendPasswordResetEmail(opts: { to: string; resetToken: string }) {
  const appUrl = process.env.WEB_URL ?? 'http://localhost:3000'
  const resetUrl = `${appUrl}/reset-password/${opts.resetToken}`

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
      to: opts.to,
      subject: 'Reset your OmniPulse password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h1 style="color:#6366f1;margin-bottom:8px">OmniPulse</h1>
          <h2 style="color:#1f2937">Reset your password</h2>
          <p style="color:#4b5563">We received a request to reset the password for your account. Click the button below to choose a new password.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
          <p style="color:#9ca3af;font-size:12px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    })
  } catch (err) {
    logger.error({ err, to: opts.to }, 'Password reset email send failed')
  }
}

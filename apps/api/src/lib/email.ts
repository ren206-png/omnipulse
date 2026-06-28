import { Resend } from 'resend'

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
    // Non-fatal — log but don't throw
    console.error('Email send failed:', err)
  }
}

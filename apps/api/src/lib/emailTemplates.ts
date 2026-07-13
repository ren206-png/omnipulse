// ── OmniPulse email templates ─────────────────────────────────────────────────
// All functions return { subject, html }. Templates use inline styles only,
// indigo #6366f1 primary colour, mobile-friendly single-column layout.

const BASE = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;padding:32px 16px;min-height:100%">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
`
const FOOTER = `
      <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">OmniPulse &bull; <a href="https://getomnipulse.com" style="color:#9ca3af">getomnipulse.com</a></p>
      </div>
    </div>
  </div>
`

function header(title: string): string {
  return `
      <div style="background:#6366f1;padding:28px 32px">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;letter-spacing:-0.3px">OmniPulse</h1>
        <p style="color:#c7d2fe;font-size:13px;margin:4px 0 0">${title}</p>
      </div>
      <div style="padding:28px 32px">
  `
}

function body(content: string): string {
  return `${BASE}${content}${FOOTER}`
}

function ctaButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:20px 0">${label}</a>`
}

function postPreview(content: string): string {
  return `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
      <p style="color:#374151;margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${content.slice(0, 280)}${content.length > 280 ? '…' : ''}</p>
    </div>
  `
}

// ── 1. Publish failure ────────────────────────────────────────────────────────
export function publishFailureEmail(params: {
  workspaceName: string
  postContent: string
  platform: string
  errorMessage: string
  retryUrl: string
}): { subject: string; html: string } {
  const subject = `OmniPulse: Post failed to publish on ${params.platform}`
  const html = body(`
    ${header('Post publish failure')}
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="color:#b91c1c;font-weight:600;margin:0 0 4px;font-size:15px">Your post failed to publish</p>
      <p style="color:#dc2626;margin:0;font-size:13px">Platform: <strong>${params.platform}</strong> &bull; Workspace: <strong>${params.workspaceName}</strong></p>
    </div>
    ${params.postContent ? postPreview(params.postContent) : ''}
    <p style="color:#374151;font-size:14px;margin:0 0 8px"><strong>Error reason:</strong></p>
    <p style="color:#6b7280;font-size:13px;font-family:monospace;background:#f3f4f6;border-radius:6px;padding:12px;margin:0 0 20px;word-break:break-all">${params.errorMessage.slice(0, 300)}</p>
    ${ctaButton('View Post &amp; Retry', params.retryUrl)}
    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">The post has been moved to the dead-letter queue. You can retry or dismiss it from your dashboard.</p>
    </div>
  `)
  return { subject, html }
}

// ── 2. Post approval requested ────────────────────────────────────────────────
export function approvalRequestedEmail(params: {
  workspaceName: string
  postContent: string
  approvalUrl: string
}): { subject: string; html: string } {
  const subject = `OmniPulse: A post in ${params.workspaceName} needs your approval`
  const html = body(`
    ${header('Post awaiting your approval')}
    <p style="color:#374151;font-size:15px;margin:0 0 16px">A post in <strong>${params.workspaceName}</strong> has been submitted and is waiting for your review.</p>
    ${postPreview(params.postContent)}
    ${ctaButton('Review Post', params.approvalUrl)}
    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">You received this because you are an admin or owner of ${params.workspaceName}.</p>
    </div>
  `)
  return { subject, html }
}

// ── 3. Post approved / rejected ───────────────────────────────────────────────
export function approvalDecisionEmail(params: {
  decision: 'approved' | 'rejected'
  postContent: string
  reason?: string
  postUrl: string
}): { subject: string; html: string } {
  const isApproved = params.decision === 'approved'
  const subject = isApproved
    ? 'OmniPulse: Your post was approved'
    : 'OmniPulse: Your post needs changes'

  const decisionBanner = isApproved
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px">
         <p style="color:#15803d;font-weight:600;margin:0;font-size:15px">Your post has been approved</p>
       </div>`
    : `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:20px">
         <p style="color:#c2410c;font-weight:600;margin:0;font-size:15px">Your post was sent back for revisions</p>
       </div>`

  const reasonBlock = !isApproved && params.reason
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:16px 0">
         <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 4px">Reviewer feedback:</p>
         <p style="color:#374151;margin:0;font-size:14px">${params.reason}</p>
       </div>`
    : ''

  const buttonLabel = isApproved ? 'View Post' : 'Edit Post'

  const html = body(`
    ${header(isApproved ? 'Post approved' : 'Post needs changes')}
    ${decisionBanner}
    ${postPreview(params.postContent)}
    ${reasonBlock}
    ${ctaButton(buttonLabel, params.postUrl)}
    </div>
  `)
  return { subject, html }
}

// ── 4. Magic link delivery ────────────────────────────────────────────────────
export function magicLinkEmail(params: {
  workspaceName: string
  inviterName: string
  magicLinkUrl: string
  expiresAt: Date
}): { subject: string; html: string } {
  const subject = `OmniPulse: You've been invited to review content for ${params.workspaceName}`
  const expiryStr = params.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const html = body(`
    ${header(`Invitation from ${params.inviterName}`)}
    <p style="color:#374151;font-size:15px;margin:0 0 8px">You've been invited by <strong>${params.inviterName}</strong> to review and approve content for <strong>${params.workspaceName}</strong>.</p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px">Click the button below to access the approval portal. No account required.</p>
    ${ctaButton('Open Approval Portal', params.magicLinkUrl)}
    <p style="color:#9ca3af;font-size:12px;margin:20px 0 0">This link expires on <strong>${expiryStr}</strong>. If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
  `)
  return { subject, html }
}

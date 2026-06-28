import { prisma } from './prisma.js'
import { Resend } from 'resend'
import { logger } from './logger.js'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_placeholder')

export async function sendWeeklyDigest(workspaceId?: string) {
  const where = workspaceId ? { id: workspaceId } : {}
  const workspaces = await prisma.workspace.findMany({
    where,
    include: {
      owner: true,
      socialAccounts: {
        include: {
          snapshots: { orderBy: { recordedAt: 'desc' }, take: 2 },
        },
      },
      posts: {
        where: {
          status: 'PUBLISHED',
          scheduledFor: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: { metrics: true },
      },
    },
  })

  for (const workspace of workspaces) {
    try {
      const totalPosts = workspace.posts.length
      const totalEngagement = workspace.posts.reduce((sum: number, p: any) =>
        sum + p.metrics.reduce((s: number, m: any) => s + m.likes + m.comments + m.shares, 0), 0)
      const totalReach = workspace.posts.reduce((sum: number, p: any) =>
        sum + p.metrics.reduce((s: number, m: any) => s + m.reach, 0), 0)

      const accountRows = workspace.socialAccounts.map((a: any) => {
        const latest = a.snapshots[0]
        const prev = a.snapshots[1]
        const followerDiff = latest && prev ? latest.followers - prev.followers : 0
        const diffStr = followerDiff >= 0 ? `+${followerDiff}` : `${followerDiff}`
        return `<tr><td style="padding:8px;border-bottom:1px solid #f3f4f6">${a.platform}</td><td style="padding:8px;border-bottom:1px solid #f3f4f6">${latest?.followers?.toLocaleString() ?? 'N/A'}</td><td style="padding:8px;border-bottom:1px solid #f3f4f6;color:${followerDiff >= 0 ? '#10b981' : '#ef4444'}">${diffStr}</td></tr>`
      }).join('')

      const topPost = workspace.posts.sort((a: any, b: any) => {
        const ae = a.metrics.reduce((s: number, m: any) => s + m.likes + m.comments, 0)
        const be = b.metrics.reduce((s: number, m: any) => s + m.likes + m.comments, 0)
        return be - ae
      })[0]

      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff">
          <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
            <h1 style="color:#fff;margin:0;font-size:24px">📊 Your Weekly Report</h1>
            <p style="color:#e0e7ff;margin:8px 0 0">${workspace.name} · Week of ${new Date().toLocaleDateString()}</p>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
            <div style="background:#f9fafb;padding:16px;border-radius:8px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#6366f1">${totalPosts}</div>
              <div style="color:#6b7280;font-size:12px">Posts Published</div>
            </div>
            <div style="background:#f9fafb;padding:16px;border-radius:8px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#6366f1">${totalEngagement.toLocaleString()}</div>
              <div style="color:#6b7280;font-size:12px">Total Engagement</div>
            </div>
            <div style="background:#f9fafb;padding:16px;border-radius:8px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#6366f1">${totalReach.toLocaleString()}</div>
              <div style="color:#6b7280;font-size:12px">Total Reach</div>
            </div>
          </div>

          ${accountRows ? `
          <h3 style="color:#1f2937;margin-bottom:12px">Follower Growth</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead><tr style="background:#f9fafb"><th style="padding:8px;text-align:left">Platform</th><th style="padding:8px;text-align:left">Followers</th><th style="padding:8px;text-align:left">Change</th></tr></thead>
            <tbody>${accountRows}</tbody>
          </table>` : ''}

          ${topPost ? `
          <h3 style="color:#1f2937;margin-bottom:12px">🏆 Top Post This Week</h3>
          <div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px">
            <p style="color:#374151;margin:0 0 8px">${topPost.content.substring(0, 200)}${topPost.content.length > 200 ? '...' : ''}</p>
            <div style="color:#6b7280;font-size:12px">Platforms: ${topPost.platforms.join(', ')}</div>
          </div>` : ''}

          <div style="text-align:center;padding-top:16px;border-top:1px solid #f3f4f6">
            <a href="${process.env.WEB_URL ?? 'http://localhost:3000'}/dashboard/analytics" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">View Full Analytics →</a>
          </div>
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px">OmniPulse · <a href="${process.env.WEB_URL ?? 'http://localhost:3000'}/dashboard/settings" style="color:#9ca3af">Manage notifications</a></p>
        </div>
      `

      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? 'OmniPulse <noreply@getomnipulse.com>',
        to: workspace.owner.email,
        subject: `📊 ${workspace.name} — Weekly Performance Report`,
        html,
      })

      logger.info({ workspaceId: workspace.id }, 'Weekly digest sent')
    } catch (err) {
      logger.error({ err, workspaceId: workspace.id }, 'Failed to send digest')
    }
  }
}

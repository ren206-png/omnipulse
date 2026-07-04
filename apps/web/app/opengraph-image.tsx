import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'OmniPulse — AI-Powered Social Media Management'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#0f172a',
          padding: '80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            right: '-120px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-80px',
            left: '-80px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)',
          }}
        />

        {/* Logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              fontSize: '28px',
            }}
          >
            ⚡
          </div>
          <span
            style={{
              fontSize: '40px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-1px',
            }}
          >
            OmniPulse
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '52px',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            maxWidth: '780px',
            marginBottom: '48px',
          }}
        >
          AI-Powered{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Social Media
          </span>{' '}
          Management
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: 'auto' }}>
          {[
            { icon: '📅', label: 'Scheduling' },
            { icon: '📊', label: 'Analytics' },
            { icon: '🤖', label: 'AI Content' },
            { icon: '🔍', label: 'SEO' },
          ].map((pill) => (
            <div
              key={pill.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '100px',
                padding: '12px 24px',
                fontSize: '22px',
                fontWeight: 600,
                color: '#e2e8f0',
              }}
            >
              <span style={{ fontSize: '24px' }}>{pill.icon}</span>
              {pill.label}
            </div>
          ))}
        </div>

        {/* Bottom: domain */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '48px',
            paddingTop: '24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            style={{
              fontSize: '22px',
              color: '#64748b',
              fontWeight: 500,
              letterSpacing: '0.5px',
            }}
          >
            getomnipulse.com
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '100px',
              padding: '8px 20px',
              fontSize: '18px',
              color: '#818cf8',
              fontWeight: 600,
            }}
          >
            ✦ Free 14-day trial
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

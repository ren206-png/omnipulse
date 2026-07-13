interface OmniPulseLogoProps {
  /** 'full' = icon + wordmark + tagline, 'wordmark' = icon + OMNIPULSE only, 'icon' = icon only */
  variant?: 'full' | 'wordmark' | 'icon'
  /** Height in px — width scales proportionally */
  height?: number
  className?: string
}

export function OmniPulseLogo({ variant = 'wordmark', height = 40, className }: OmniPulseLogoProps) {
  const aspectFull = 320 / 100
  const aspectWord = 290 / 70
  const aspectIcon = 1

  const aspect = variant === 'icon' ? aspectIcon : variant === 'wordmark' ? aspectWord : aspectFull
  const width = Math.round(height * aspect)

  if (variant === 'icon') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={width}
        height={height}
        fill="none"
        className={className}
        aria-label="OmniPulse"
      >
        <circle cx="50" cy="50" r="48" fill="#0a0a0f" />
        <circle
          cx="50" cy="50" r="40"
          stroke="url(#ip-ring)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="220 32"
          strokeDashoffset="-10"
          fill="none"
        />
        <polyline
          points="14,50 22,50 28,32 34,68 40,40 46,60 50,50 58,50 64,34 70,66 76,50 84,50 88,50"
          stroke="url(#ip-pulse)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <defs>
          <linearGradient id="ip-ring" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <linearGradient id="ip-pulse" x1="14" y1="50" x2="88" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
    )
  }

  if (variant === 'wordmark') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 290 70"
        width={width}
        height={height}
        fill="none"
        className={className}
        aria-label="OmniPulse"
      >
        {/* Icon */}
        <circle cx="35" cy="35" r="33" fill="#0a0a0f" />
        <circle
          cx="35" cy="35" r="27"
          stroke="url(#wm-ring)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="148 22"
          strokeDashoffset="-7"
          fill="none"
        />
        <polyline
          points="10,35 16,35 20,24 25,46 29,29 33,41 35,35 40,35 44,24 48,46 52,35 58,35 62,35"
          stroke="url(#wm-pulse)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Wordmark */}
        <text
          x="80" y="41"
          fontFamily="'Inter', 'SF Pro Display', -apple-system, sans-serif"
          fontSize="22"
          fontWeight="700"
          letterSpacing="2"
          fill="url(#wm-text)"
        >
          OMNIPULSE
        </text>
        <defs>
          <linearGradient id="wm-ring" x1="8" y1="8" x2="62" y2="62" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <linearGradient id="wm-pulse" x1="10" y1="35" x2="62" y2="35" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
          <linearGradient id="wm-text" x1="80" y1="20" x2="285" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="60%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
      </svg>
    )
  }

  // full — icon + wordmark + tagline
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 100"
      width={width}
      height={height}
      fill="none"
      className={className}
      aria-label="OmniPulse — One System. Every Pulse."
    >
      <circle cx="50" cy="50" r="38" stroke="url(#fl-ring)" strokeWidth="3" strokeLinecap="round"
        strokeDasharray="210 30" strokeDashoffset="-10" fill="none" />
      <polyline
        points="16,50 24,50 29,35 34,65 39,42 44,58 49,50 56,50 61,38 66,62 71,50 79,50 84,50"
        stroke="url(#fl-pulse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      <text x="105" y="44"
        fontFamily="'Inter', 'SF Pro Display', -apple-system, sans-serif"
        fontSize="26" fontWeight="700" letterSpacing="2" fill="url(#fl-text)">
        OMNIPULSE
      </text>
      <text x="107" y="62"
        fontFamily="'Inter', 'SF Pro Display', -apple-system, sans-serif"
        fontSize="9" fontWeight="400" letterSpacing="3.5" fill="url(#fl-tag)">
        ONE SYSTEM. EVERY PULSE.
      </text>
      <defs>
        <linearGradient id="fl-ring" x1="12" y1="12" x2="88" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="fl-pulse" x1="16" y1="50" x2="84" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="fl-text" x1="105" y1="20" x2="290" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="60%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="fl-tag" x1="107" y1="60" x2="290" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
    </svg>
  )
}

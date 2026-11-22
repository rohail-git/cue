export function CueIcon({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cueIconGrad" x1="0.35" y1="0" x2="0.65" y2="1">
          <stop offset="0%" stopColor="#F2EFEA" />
          <stop offset="62%" stopColor="#F2EFEA" />
          <stop offset="84%" stopColor="#F9C4B4" />
          <stop offset="100%" stopColor="#FF7856" />
        </linearGradient>
        <radialGradient id="cueIconGlow" cx="0.6" cy="0.78" r="0.72">
          <stop offset="0%" stopColor="rgba(255,74,45,0.4)" />
          <stop offset="48%" stopColor="rgba(255,74,45,0.12)" />
          <stop offset="100%" stopColor="rgba(255,74,45,0)" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#110F0F" />
      <rect width="64" height="64" rx="15" fill="url(#cueIconGlow)" />
      <text
        x="32"
        y="47"
        textAnchor="middle"
        fontFamily="Outfit, system-ui, -apple-system, sans-serif"
        fontSize="46"
        fontWeight="800"
        fill="url(#cueIconGrad)"
      >
        c
      </text>
    </svg>
  );
}

export function CueWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`select-none font-display font-bold lowercase tracking-tight text-2xl text-ink ${className}`}
    >
      cue
    </span>
  );
}

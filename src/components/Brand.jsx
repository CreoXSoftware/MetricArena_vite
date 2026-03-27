import React from 'react';

export function LogoSVG({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      style={{ filter: 'drop-shadow(0 0 20px rgba(0, 229, 160, 0.3))' }}>
      <polygon points="50,5 91,28 91,72 50,95 9,72 9,28"
        fill="url(#hexGlow)" className="hex-pulse" />
      <polygon points="50,5 91,28 91,72 50,95 9,72 9,28"
        fill="none" stroke="url(#gradStroke)" strokeWidth="2.5"
        strokeLinejoin="round" className="logo-ring" />
      {/* Ascending metric bars */}
      <rect x="26" y="58" width="8" height="14" rx="2" fill="#ff8c00" opacity="0.85">
        <animate attributeName="opacity" values="0.85;1;0.85" dur="3s" begin="0s" repeatCount="indefinite" />
      </rect>
      <rect x="38" y="48" width="8" height="24" rx="2" fill="#ffb800" opacity="0.9">
        <animate attributeName="opacity" values="0.9;1;0.9" dur="3s" begin="0.3s" repeatCount="indefinite" />
      </rect>
      <rect x="50" y="38" width="8" height="34" rx="2" fill="#00e5a0" opacity="0.9">
        <animate attributeName="opacity" values="0.9;1;0.9" dur="3s" begin="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="62" y="28" width="8" height="44" rx="2" fill="#00b8ff" opacity="0.95">
        <animate attributeName="opacity" values="0.95;1;0.95" dur="3s" begin="0.9s" repeatCount="indefinite" />
      </rect>
      {/* Peak indicator arrow */}
      <polygon points="66,22 62,28 70,28" fill="#00b8ff" opacity="0.9">
        <animate attributeName="opacity" values="0.9;1;0.7;0.9" dur="2.5s" repeatCount="indefinite" />
      </polygon>
      <defs>
        <linearGradient id="gradStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8c00" />
          <stop offset="50%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="#00b8ff" />
        </linearGradient>
        <radialGradient id="hexGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb800" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#00e5a0" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function LogoSmallSVG({ size = 32 }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      style={{ filter: 'drop-shadow(0 0 8px rgba(0, 229, 160, 0.25))' }}>
      <polygon points="50,5 91,28 91,72 50,95 9,72 9,28"
        fill="none" stroke="url(#gs2)" strokeWidth="3" strokeLinejoin="round" />
      {/* Ascending metric bars - static for small version */}
      <rect x="26" y="58" width="8" height="14" rx="2" fill="#ff8c00" opacity="0.85" />
      <rect x="38" y="48" width="8" height="24" rx="2" fill="#ffb800" opacity="0.9" />
      <rect x="50" y="38" width="8" height="34" rx="2" fill="#00e5a0" opacity="0.9" />
      <rect x="62" y="28" width="8" height="44" rx="2" fill="#00b8ff" opacity="0.95" />
      <polygon points="66,22 62,28 70,28" fill="#00b8ff" opacity="0.9" />
      <defs>
        <linearGradient id="gs2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8c00" />
          <stop offset="50%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="#00b8ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandFull() {
  return (
    <div className="brand">
      <div className="brand-logo"><LogoSVG /></div>
      <div className="brand-wordmark">METRIC<span className="arena"> ARENA</span></div>
      <div className="brand-tagline">Performance Session Analytics</div>
    </div>
  );
}

export function BrandSmall() {
  return (
    <div className="brand-sm">
      <div className="brand-logo-sm"><LogoSmallSVG /></div>
      <span className="brand-text-sm">METRIC<span className="arena-sm"> ARENA</span></span>
    </div>
  );
}

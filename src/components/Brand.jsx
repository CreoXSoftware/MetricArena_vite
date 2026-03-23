import React from 'react';

export function LogoSVG({ size = 72 }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      style={{ filter: 'drop-shadow(0 0 20px rgba(0, 229, 160, 0.3))' }}>
      <polygon points="50,5 91,28 91,72 50,95 9,72 9,28"
        fill="url(#hexGlow)" className="hex-pulse" />
      <polygon points="50,5 91,28 91,72 50,95 9,72 9,28"
        fill="none" stroke="url(#gradStroke)" strokeWidth="3"
        strokeLinejoin="round" className="logo-ring" />
      <line x1="28" y1="58" x2="52" y2="58" stroke="#00e5a0" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <line x1="32" y1="50" x2="68" y2="50" stroke="#00b8ff" strokeWidth="3.5" strokeLinecap="round">
        <animate attributeName="x2" values="68;72;68" dur="3s" repeatCount="indefinite" />
      </line>
      <line x1="28" y1="42" x2="48" y2="42" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <polygon points="70,50 60,42 60,58" fill="url(#gradFill)" opacity="0.9">
        <animate attributeName="opacity" values="0.9;1;0.9" dur="2s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="translate" values="0,0;4,0;0,0" dur="2.2s" repeatCount="indefinite" />
      </polygon>
      <defs>
        <linearGradient id="gradStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="#00b8ff" />
        </linearGradient>
        <linearGradient id="gradFill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="#00b8ff" />
        </linearGradient>
        <radialGradient id="hexGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00e5a0" stopOpacity="0.12" />
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
      <line x1="28" y1="58" x2="52" y2="58" stroke="#00e5a0" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <line x1="32" y1="50" x2="68" y2="50" stroke="#00b8ff" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="28" y1="42" x2="48" y2="42" stroke="#00e5a0" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <polygon points="70,50 60,42 60,58" fill="url(#gf2)" opacity="0.9" />
      <defs>
        <linearGradient id="gs2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00e5a0" />
          <stop offset="100%" stopColor="#00b8ff" />
        </linearGradient>
        <linearGradient id="gf2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5a0" />
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

import React from 'react';

/**
 * TechTrekLogo - Inline SVG logo, works on dark and light sidebar themes.
 * - collapsed: small shield icon only
 * - expanded: full horizontal banner with text
 * - isLight: switches title/subtitle text colors for readability
 */
export function TechTrekLogo({ collapsed = false, isLight = false }) {
  if (collapsed) {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="TechTrek Finance">
        <defs>
          <linearGradient id="cs" x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#8B5E1A" />
            <stop offset="50%" stopColor="#C8922A" />
            <stop offset="100%" stopColor="#6B4510" />
          </linearGradient>
          <linearGradient id="cb" x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F5D78E" />
            <stop offset="50%" stopColor="#C8922A" />
            <stop offset="100%" stopColor="#F5D78E" />
          </linearGradient>
        </defs>
        <path d="M18 2L4 7V18C4 25.7 10.3 32.4 18 34C25.7 32.4 32 25.7 32 18V7L18 2Z" fill="url(#cs)" stroke="url(#cb)" strokeWidth="0.8" />
        <path d="M18 6L8 10V18C8 23.5 12.4 28.2 18 29.5C23.6 28.2 28 23.5 28 18V10L18 6Z" fill="#8B5E1A" opacity="0.4" />
        <text x="18" y="23" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#F5D78E" fontFamily="Georgia, serif">$</text>
        <line x1="18" y1="6.5" x2="18" y2="9.5" stroke="#F5D78E" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 25L18 28.5L23 25" stroke="#C8922A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }

  const titleColor = isLight ? '#1a2a6c' : '#f0d080';
  const subColor   = isLight ? '#6b4510' : '#c8922a';

  return (
    <svg
      width="100%"
      viewBox="0 0 530 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="TechTrek Finance - Personal Finance OS"
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id="ls" x1="0" y1="0" x2="88" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9B6E2A" />
          <stop offset="45%" stopColor="#D4A030" />
          <stop offset="100%" stopColor="#6B4510" />
        </linearGradient>
        <linearGradient id="lb" x1="0" y1="0" x2="88" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5D78E" />
          <stop offset="50%" stopColor="#C8922A" />
          <stop offset="100%" stopColor="#F5D78E" />
        </linearGradient>
        <linearGradient id="lbar" x1="0" y1="0" x2="530" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="70%" stopColor="#4a4a4a" />
          <stop offset="85%" stopColor="#3a5a50" />
          <stop offset="100%" stopColor="#2a6a5a" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c8922a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c8922a" stopOpacity="0" />
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Emblem ambient glow */}
      <ellipse cx="47" cy="52" rx="47" ry="50" fill="url(#halo)" />

      {/* Shield */}
      <path d="M47 5L7 18V52C7 76 24 94 47 101C70 94 87 76 87 52V18L47 5Z" fill="url(#ls)" stroke="url(#lb)" strokeWidth="1.3" filter="url(#glow)" />
      <path d="M47 12L14 22V52C14 73 28 89 47 95C66 89 80 73 80 52V22L47 12Z" fill="#8B5E1A" opacity="0.35" />

      {/* Globe */}
      <circle cx="47" cy="43" r="13" fill="none" stroke="#d4a030" strokeWidth="0.9" opacity="0.75" />
      <line x1="47" y1="30" x2="47" y2="56" stroke="#d4a030" strokeWidth="0.7" opacity="0.6" />
      <path d="M34 43 Q47 37 60 43 Q47 49 34 43Z" fill="none" stroke="#d4a030" strokeWidth="0.7" opacity="0.6" />

      {/* Trend arrow on globe */}
      <path d="M36 54L43 46L49 51L60 37" stroke="#F5D78E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M57 33L62 37L58 41" stroke="#F5D78E" strokeWidth="1.3" strokeLinecap="round" fill="none" />

      {/* Compass tick */}
      <line x1="47" y1="6" x2="47" y2="12" stroke="#F5D78E" strokeWidth="1.8" strokeLinecap="round" />

      {/* Chevrons */}
      <path d="M32 68L47 76L62 68" stroke="#D4A030" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M36 63L47 69L58 63" stroke="#C8922A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Coin stacks */}
      <ellipse cx="32" cy="88" rx="8" ry="2.5" fill="#C8922A" />
      <rect x="24" y="82" width="16" height="6" rx="1" fill="#A07020" />
      <ellipse cx="32" cy="82" rx="8" ry="2.5" fill="#D4A030" />
      <ellipse cx="32" cy="79" rx="8" ry="2.5" fill="#C8922A" />

      <ellipse cx="62" cy="88" rx="8" ry="2.5" fill="#C8922A" />
      <rect x="54" y="82" width="16" height="6" rx="1" fill="#A07020" />
      <ellipse cx="62" cy="82" rx="8" ry="2.5" fill="#D4A030" />
      <ellipse cx="62" cy="79" rx="8" ry="2.5" fill="#C8922A" />

      {/* Binary code hints */}
      <text x="7" y="50" fontSize="5" fill="#c8922a" opacity="0.45" fontFamily="monospace">01110</text>
      <text x="72" y="50" fontSize="5" fill="#c8922a" opacity="0.45" fontFamily="monospace">01110</text>

      {/* Bottom metallic bar */}
      <rect x="4" y="96" width="522" height="10" rx="2" fill="url(#lbar)" />
      <rect x="4" y="96" width="522" height="1" fill="#F5D78E" opacity="0.25" rx="1" />
      {/* Star accent */}
      <text x="510" y="105" fontSize="6" fill="#F5D78E" opacity="0.4" fontFamily="serif">&#9733;</text>

      {/* Title */}
      <text x="105" y="53" fontSize="30" fontWeight="900" fontFamily="Georgia, 'Times New Roman', serif" fill={titleColor} letterSpacing="0.8">TechTrek Finance</text>

      {/* Subtitle */}
      <text x="105" y="74" fontSize="15" fontWeight="500" fontFamily="Georgia, 'Times New Roman', serif" fill={subColor} letterSpacing="0.4">Personal Finance OS</text>
    </svg>
  );
}


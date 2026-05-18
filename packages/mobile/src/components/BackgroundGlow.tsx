/**
 * Background-Glow — exaktes Pendant zu Desktop CSS classes
 * .fiano-bg-tint + .fiano-bg-glow.
 *
 * Verwendet react-native-svg's <RadialGradient> für SAUBERE Verläufe ohne
 * harte Kreis-Kanten (View+borderRadius gibt harte Ränder).
 *
 * Desktop-Specs (aus index.css):
 *   .fiano-bg-tint:
 *     radial-gradient(circle at 70% 40%, rgba(255,16,57,0.15), transparent 40%)
 *     radial-gradient(circle at 30% 70%, rgba(255,16,57,0.10), transparent 50%)
 *   .fiano-bg-glow:
 *     radial-gradient(circle at 60% 50%, rgba(255,16,57,0.25), transparent 50%)
 *     radial-gradient(circle at 20% 80%, rgba(255,16,57,0.15), transparent 60%)
 *     filter: blur(120px); opacity: 0.6
 */

import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import { useResolvedMode } from '../lib/theme';

export function BackgroundGlow() {
  // Phase B3 (2026-05-18): theme-aware glow opacity. Light-Mode bekommt weniger
  // Sättigung, damit der rote Schein nicht über das helle BG dominiert.
  const mode = useResolvedMode();
  const isLight = mode === 'light';
  const tintBase = isLight ? 0.06 : 0.15;
  const tintMid = isLight ? 0.04 : 0.10;
  const glowMain = isLight ? 0.06 : 0.15;
  const glowSecond = isLight ? 0.04 : 0.09;
  const baseWash = isLight ? 0.02 : 0.04;
  return (
    <Svg
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="tint1" cx="70%" cy="40%" rx="40%" ry="40%">
          <Stop offset="0%" stopColor="#ff1039" stopOpacity={tintBase} />
          <Stop offset="100%" stopColor="#ff1039" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="tint2" cx="30%" cy="70%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor="#ff1039" stopOpacity={tintMid} />
          <Stop offset="100%" stopColor="#ff1039" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glow1" cx="60%" cy="50%" rx="55%" ry="55%">
          <Stop offset="0%" stopColor="#ff1039" stopOpacity={glowMain} />
          <Stop offset="100%" stopColor="#ff1039" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glow2" cx="20%" cy="80%" rx="65%" ry="65%">
          <Stop offset="0%" stopColor="#ff1039" stopOpacity={glowSecond} />
          <Stop offset="100%" stopColor="#ff1039" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`rgba(255,16,57,${baseWash})`}
      />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow1)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow2)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#tint1)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#tint2)" />
    </Svg>
  );
}

/** Background-Glow (Desktop .fiano-bg-tint + .fiano-bg-glow). Phase R10 (Bug-1): Container via onLayout messen + <Svg> mit EXPLIZITEN Pixel-Maßen rendern — `height="100%"` füllt in react-native-svg unzuverlässig, dadurch hörte der Gradient vor dem unteren Rand auf. */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import { useResolvedMode } from '../lib/theme';

export function BackgroundGlow() {
  const mode = useResolvedMode();
  const isLight = mode === 'light';
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Theme-aware Glow-Stärken. Light-Mode: nur EIN sehr subtiler red-tint.
  const tintBase = isLight ? 0.025 : 0.15;
  const tintMid = isLight ? 0 : 0.1;
  const glowMain = isLight ? 0.02 : 0.15;
  const glowSecond = isLight ? 0 : 0.09;
  const baseWash = isLight ? 0 : 0.04;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev.w === width && prev.h === height ? prev : { w: width, h: height },
        );
      }}
    >
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
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
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`rgba(255,16,57,${baseWash})`} />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#glow1)" />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#glow2)" />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#tint1)" />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#tint2)" />
        </Svg>
      )}
    </View>
  );
}

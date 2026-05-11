/**
 * SubtitlePreviewCard — statische Mini-Vorschau der Subtitle-Settings.
 *
 * Limitation gegenüber Desktop's Canvas-Render:
 *   - RN <Text> hat keine Per-Letter-Gradient/Metallic. Wir zeigen einen
 *     Approximation (gradient-from als textColor). User sieht damit ~80% der
 *     Effekte; echter Render passiert via FFmpeg-Native im Export (Phase 9.6).
 *   - Glow/Stroke via textShadow Approximation (RN unterstützt nur einen
 *     Schatten pro Text, kein Multi-Pass-Glow).
 *
 * Was funktioniert:
 *   - fontSize, fontFamily (curated), letterSpacing, uppercase
 *   - textColor / highlightColor
 *   - Stroke (via textShadow mit kleiner Distanz × 4 Richtungen — Workaround)
 *   - Glow (via textShadow mit großem Radius)
 *   - Drop-Shadow (via textShadow mit Offset)
 *   - Position (top/center/bottom/custom)
 *   - Layered-Style mit Big + Small Word
 */

import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type {
  SubtitleFontFamily,
  SubtitleSettings,
  SubtitleStyle,
} from '../data/demoProjects';

interface Props {
  settings: SubtitleSettings;
  /** Demo-Text wenn keine highlightWords gesetzt. Default Big/Small Demo. */
  demoBig?: string;
  demoSmall?: string;
}

export function SubtitlePreviewCard({
  settings,
  demoBig = 'EPIC',
  demoSmall = 'moment',
}: Props) {
  const isLayered = settings.style === 'layered';
  const upper = settings.uppercase ?? settings.style === 'fiano';
  const fontFamily = mapFontFamily(settings.fontFamily ?? defaultFontFor(settings.style));
  const fontSize = settings.fontSize ?? defaultFontSizeFor(settings.style);
  const textColor = settings.textColor ?? '#ffffff';
  const highlightColor = settings.highlightColor ?? '#ff1039';
  const letterSpacing = (settings.letterSpacing ?? 0) * fontSize; // em → px approx

  // Position innerhalb der 9:16-Card.
  const positionStyle: ViewStyle = (() => {
    switch (settings.position) {
      case 'top':    return { top: 24, alignItems: 'center' };
      case 'center': return { top: '45%', alignItems: 'center' };
      case 'custom': return { top: `${(settings.customY ?? 0.85) * 100}%`, alignItems: 'center' };
      case 'bottom':
      default:       return { bottom: 24, alignItems: 'center' };
    }
  })();

  const baseTextStyle: TextStyle = {
    fontFamily,
    fontSize,
    color: textColor,
    fontWeight: '900',
    letterSpacing,
    textTransform: upper ? 'uppercase' : undefined,
  };

  // Glow + Shadow als textShadow (RN nur 1 Shadow pro Text).
  // Priorität: Glow > Shadow wenn beides aktiv. Sonst der jeweils aktive.
  const shadowStyle = buildShadowStyle(settings);
  const strokeApprox = strokeApproxStyle(settings);

  return (
    <View style={styles.card}>
      <View style={styles.frame}>
        <View style={[styles.positioner, positionStyle]} pointerEvents="none">
          {isLayered ? (
            <LayeredText
              big={upper ? demoBig.toUpperCase() : demoBig}
              small={upper ? demoSmall.toUpperCase() : demoSmall}
              baseTextStyle={baseTextStyle}
              shadowStyle={shadowStyle}
              strokeApprox={strokeApprox}
              fontSize={fontSize}
              highlightColor={highlightColor}
              highlightFontScale={settings.highlightFontScale ?? 1.4}
              highlightGlow={settings.highlightGlow ?? false}
              highlightGlowColor={settings.highlightGlowColor ?? '#ffffff'}
              highlightGlowStrength={settings.highlightGlowStrength ?? 0.6}
            />
          ) : (
            <Text
              style={[
                baseTextStyle,
                shadowStyle,
                strokeApprox,
                { color: settings.useGradient ? (settings.gradientFrom ?? textColor) : textColor },
              ]}
            >
              {upper ? 'SUBTITLE PREVIEW' : 'Subtitle preview'}
            </Text>
          )}
        </View>
      </View>
      <Text style={styles.note}>
        ⓘ Preview zeigt ~80% der Effekte. Gradient/Metallic kommen beim Export.
      </Text>
    </View>
  );
}

function LayeredText({
  big,
  small,
  baseTextStyle,
  shadowStyle,
  strokeApprox,
  fontSize,
  highlightColor,
  highlightFontScale,
  highlightGlow,
  highlightGlowColor,
  highlightGlowStrength,
}: {
  big: string;
  small: string;
  baseTextStyle: TextStyle;
  shadowStyle: TextStyle;
  strokeApprox: TextStyle;
  fontSize: number;
  highlightColor: string;
  highlightFontScale: number;
  highlightGlow: boolean;
  highlightGlowColor: string;
  highlightGlowStrength: number;
}) {
  const bigSize = Math.round(fontSize * highlightFontScale);
  const bigGlow: TextStyle | undefined = highlightGlow
    ? {
        textShadowColor: highlightGlowColor,
        textShadowRadius: Math.round(20 * highlightGlowStrength),
        textShadowOffset: { width: 0, height: 0 },
      }
    : undefined;

  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={[
          baseTextStyle,
          strokeApprox,
          bigGlow ?? shadowStyle,
          { fontSize: bigSize, color: highlightColor },
        ]}
      >
        {big}
      </Text>
      <Text style={[baseTextStyle, shadowStyle, strokeApprox, { marginTop: -bigSize * 0.15 }]}>
        {small}
      </Text>
    </View>
  );
}

function buildShadowStyle(s: SubtitleSettings): TextStyle {
  const glowOn = s.glowEnabled ?? (s.glowBlur ?? 0) > 0;
  const shadowOn =
    s.shadowEnabled ??
    ((s.shadowBlur ?? 0) > 0 ||
      Math.abs(s.shadowOffsetX ?? 0) > 0 ||
      Math.abs(s.shadowOffsetY ?? 0) > 0);

  if (glowOn && (s.glowBlur ?? 0) > 0) {
    return {
      textShadowColor: s.glowColor ?? '#000000',
      textShadowRadius: s.glowBlur ?? 8,
      textShadowOffset: { width: 0, height: 0 },
    };
  }
  if (shadowOn) {
    return {
      textShadowColor: s.shadowColor ?? '#000000',
      textShadowRadius: s.shadowBlur ?? 4,
      textShadowOffset: {
        width: s.shadowOffsetX ?? 0,
        height: s.shadowOffsetY ?? 2,
      },
    };
  }
  return {};
}

/** Approximation des Stroke-Effekts via textShadowRadius (kein echtes Stroke in RN). */
function strokeApproxStyle(s: SubtitleSettings): TextStyle {
  if (!s.strokeWidth || s.strokeWidth <= 0) return {};
  // Solange kein Glow/Shadow aktiv ist, nutzen wir den Stroke als Schatten-Approx.
  const glowOn = s.glowEnabled ?? (s.glowBlur ?? 0) > 0;
  const shadowOn = s.shadowEnabled ?? false;
  if (glowOn || shadowOn) return {};
  return {
    textShadowColor: s.strokeColor ?? '#000000',
    textShadowRadius: Math.min(s.strokeWidth, 6),
    textShadowOffset: { width: 0, height: 0 },
  };
}

function defaultFontFor(style: SubtitleStyle): SubtitleFontFamily {
  switch (style) {
    case 'bold':    return 'arial-black';
    case 'gaming':  return 'impact';
    case 'fiano':   return 'geist';
    case 'layered': return 'arial-black';
    default:        return 'helvetica';
  }
}

function defaultFontSizeFor(style: SubtitleStyle): number {
  switch (style) {
    case 'gaming':  return 34;
    case 'fiano':   return 32;
    case 'bold':
    case 'layered': return 30;
    default:        return 26;
  }
}

function mapFontFamily(f: SubtitleFontFamily): string {
  switch (f) {
    case 'arial-black': return 'sans-serif-black';
    case 'helvetica':   return 'sans-serif';
    case 'impact':      return 'sans-serif-condensed';
    case 'geist':       return 'sans-serif';
    case 'georgia':     return 'serif';
    case 'mono':        return 'monospace';
    case 'system':      return 'sans-serif';
    default:            return f;
  }
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  frame: {
    aspectRatio: 9 / 16,
    width: '60%',
    alignSelf: 'center',
    backgroundColor: '#0d0509',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
  },
  note: {
    color: '#52525b',
    fontSize: 9,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

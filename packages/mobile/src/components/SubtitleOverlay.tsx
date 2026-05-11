/**
 * SubtitleOverlay — absolute-positionierter Text-Layer der die Subtitle-Settings
 * ins Bild rendert. Nutzbar in:
 *   - SubtitlePreviewCard (Mini-Preview im Modal, mit 9:16-Frame)
 *   - StackedSplitPreview (Live-Overlay auf der echten 9:16-Vorschau im TikTok-Tab)
 *
 * Render-Strategie:
 *   - Wenn useGradient ODER metallic aktiv: rendere via react-native-svg mit
 *     LinearGradient-Fill (echter Per-Letter-Gradient). Trade-off: SVG-Text hat
 *     kein textShadow, also kein Glow/Shadow in der Preview wenn Gradient aktiv.
 *   - Sonst: RN <Text> mit textShadow für Glow/Shadow.
 *
 * Echte Multi-Pass-Render (Multi-Color-Stroke + Glow + Gradient gleichzeitig)
 * kommt beim FFmpeg-Render (Phase 9.6).
 */

import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  FeGaussianBlur,
  Filter,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type {
  SubtitleFontFamily,
  SubtitleSettings,
  SubtitleStyle,
} from '../data/demoProjects';

interface Props {
  settings: SubtitleSettings;
  demoBig?: string;
  demoSmall?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Wenn true: ignoriere settings.enabled (für Preview-Card im Modal). Default false. */
  forceVisible?: boolean;
}

export function SubtitleOverlay({
  settings,
  demoBig = 'EPIC',
  demoSmall = 'moment',
  containerStyle,
  forceVisible = false,
}: Props) {
  if (!forceVisible && !settings.enabled) return null;

  const isLayered = settings.style === 'layered';
  const upper = settings.uppercase ?? settings.style === 'fiano';
  const fontFamily = mapFontFamily(settings.fontFamily ?? defaultFontFor(settings.style));
  const fontSize = settings.fontSize ?? defaultFontSizeFor(settings.style);
  const textColor = settings.textColor ?? '#ffffff';
  const highlightColor = settings.highlightColor ?? '#ff1039';
  const letterSpacing = (settings.letterSpacing ?? 0) * fontSize;

  const useGradientRender = !!(settings.useGradient || settings.metallic);

  const positionStyle: ViewStyle = (() => {
    switch (settings.position) {
      case 'top':    return { top: '5%', alignItems: 'center' };
      case 'center': return { top: '45%', alignItems: 'center' };
      case 'custom': return { top: `${(settings.customY ?? 0.85) * 100}%`, alignItems: 'center' };
      case 'bottom':
      default:       return { bottom: '8%', alignItems: 'center' };
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

  const shadowStyle = buildShadowStyle(settings);
  const strokeApprox = strokeApproxStyle(settings);
  // Kurzer Demo-Text damit er auch in schmalen Preview-Containern (Modal-Mini-
  // Preview, Stacked-Preview-Pane) komplett sichtbar bleibt — Width-Math im
  // SvgGradientText kalkuliert grosszuegig aber wir wollen kein Overflow.
  const demoText = upper ? 'SUBTITLE' : 'Subtitle';

  return (
    <View style={[styles.positioner, positionStyle, containerStyle]} pointerEvents="none">
      {isLayered ? (
        <LayeredText
          big={upper ? demoBig.toUpperCase() : demoBig}
          small={upper ? demoSmall.toUpperCase() : demoSmall}
          baseTextStyle={baseTextStyle}
          shadowStyle={shadowStyle}
          strokeApprox={strokeApprox}
          fontSize={fontSize}
          fontFamily={fontFamily}
          highlightColor={highlightColor}
          highlightFontScale={settings.highlightFontScale ?? 1.4}
          highlightGlow={settings.highlightGlow ?? false}
          highlightGlowColor={settings.highlightGlowColor ?? '#ffffff'}
          highlightGlowStrength={settings.highlightGlowStrength ?? 0.6}
          useGradientRender={useGradientRender}
          gradientFrom={settings.gradientFrom ?? settings.textColor ?? '#ff1039'}
          gradientTo={settings.gradientTo ?? '#ff8c00'}
          metallic={settings.metallic ?? false}
          upper={upper}
        />
      ) : useGradientRender ? (
        <SvgGradientText
          text={demoText}
          fontFamily={fontFamily}
          fontSize={fontSize}
          letterSpacing={letterSpacing}
          gradientFrom={settings.gradientFrom ?? settings.textColor ?? '#ff1039'}
          gradientTo={settings.gradientTo ?? '#ff8c00'}
          metallic={settings.metallic ?? false}
          /* strict checks: nur wenn explizit aktiviert greifen die Effekte */
          strokeWidth={settings.strokeEnabled === true ? settings.strokeWidth ?? 0 : 0}
          strokeColor={settings.strokeColor ?? '#000000'}
          glowEnabled={settings.glowEnabled === true}
          glowColor={settings.glowColor ?? '#ff1039'}
          glowBlur={settings.glowBlur ?? 8}
          glowStrength={settings.glowStrength ?? 0.7}
          shadowEnabled={settings.shadowEnabled === true}
          shadowColor={settings.shadowColor ?? '#000000'}
          shadowOffsetX={settings.shadowOffsetX ?? 0}
          shadowOffsetY={settings.shadowOffsetY ?? 2}
          shadowBlur={settings.shadowBlur ?? 4}
        />
      ) : (
        <Text style={[baseTextStyle, shadowStyle, strokeApprox]}>{demoText}</Text>
      )}
    </View>
  );
}

/* ─── SVG-Gradient-Text (für useGradient / metallic) ─────────────────── */

interface SvgGradientTextProps {
  text: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  gradientFrom: string;
  gradientTo: string;
  metallic: boolean;
  strokeWidth: number;
  strokeColor: string;
  glowEnabled?: boolean;
  glowColor?: string;
  glowBlur?: number;
  glowStrength?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
}

function SvgGradientText({
  text,
  fontFamily,
  fontSize,
  letterSpacing,
  gradientFrom,
  gradientTo,
  metallic,
  strokeWidth,
  strokeColor,
  glowEnabled = false,
  glowColor = '#ff1039',
  glowBlur = 8,
  glowStrength = 0.7,
  shadowEnabled = false,
  shadowColor = '#000000',
  shadowOffsetX = 0,
  shadowOffsetY = 2,
  shadowBlur = 4,
}: SvgGradientTextProps) {
  // Großzügige Box damit Stroke/Glow/Shadow nicht abgeschnitten werden.
  // Glyph-Width-Faktor 0.85 (vorher 0.7) — bei breiten Fonts (Arial Black,
  // Impact) extending stroke kann den Text deutlich breiter machen.
  // Stroke malt halb innen + halb außen (strokeWidth × 4 = sicheres outside-pad).
  const extraPad = Math.max(
    strokeWidth * 4,
    Math.abs(shadowOffsetX) + shadowBlur * 2,
    glowBlur,
    8,
  );
  const w = Math.ceil(
    text.length * fontSize * 0.85 +
      letterSpacing * Math.max(0, text.length - 1) +
      extraPad * 2,
  );
  const h = Math.ceil(fontSize * 1.6 + extraPad);
  const cx = w / 2;
  const cy = h * 0.7;
  const gradId = `grad-${text.length}-${metallic ? 'm' : 'g'}`;
  const glowFilterId = `glow-${text.length}`;
  const shadowFilterId = `shadow-${text.length}`;

  const glowAlpha = Math.round((glowStrength ?? 0.7) * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <Svg width={w} height={h}>
      <Defs>
        {metallic ? (
          // 7-Stop Metallic-Sheen analog Desktop's drawMetallicSheen
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"    stopColor={darken(gradientFrom, 0.4)} />
            <Stop offset="0.18" stopColor={lighten(gradientFrom, 0.55)} />
            <Stop offset="0.32" stopColor={lighten(gradientFrom, 0.1)} />
            <Stop offset="0.48" stopColor={darken(gradientTo, 0.1)} />
            <Stop offset="0.66" stopColor={lighten(gradientTo, 0.2)} />
            <Stop offset="0.85" stopColor={darken(gradientTo, 0.2)} />
            <Stop offset="1"    stopColor={darken(gradientTo, 0.55)} />
          </LinearGradient>
        ) : (
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={gradientFrom} />
            <Stop offset="1" stopColor={gradientTo} />
          </LinearGradient>
        )}
        {glowEnabled && glowBlur > 0 && (
          <Filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
            <FeGaussianBlur stdDeviation={glowBlur / 2} />
          </Filter>
        )}
        {shadowEnabled && shadowBlur > 0 && (
          <Filter id={shadowFilterId} x="-50%" y="-50%" width="200%" height="200%">
            <FeGaussianBlur stdDeviation={shadowBlur / 2} />
          </Filter>
        )}
      </Defs>

      {/* Drop-Shadow Pass: separater Text-Layer mit shadow-color + offset + blur */}
      {shadowEnabled && (
        <SvgText
          x={cx + shadowOffsetX}
          y={cy + shadowOffsetY}
          textAnchor="middle"
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontWeight="900"
          fill={shadowColor}
          opacity={0.6}
          letterSpacing={letterSpacing}
          filter={shadowBlur > 0 ? `url(#${shadowFilterId})` : undefined}
        >
          {text}
        </SvgText>
      )}

      {/* Glow Pass: Text in glow-color mit blur-Filter (Halo hinter dem Haupt-Text) */}
      {glowEnabled && glowBlur > 0 && (
        <SvgText
          x={cx}
          y={cy}
          textAnchor="middle"
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontWeight="900"
          fill={`${glowColor}${glowAlpha}`}
          letterSpacing={letterSpacing}
          filter={`url(#${glowFilterId})`}
        >
          {text}
        </SvgText>
      )}

      {/* Main Text mit Gradient-Fill + optional Stroke */}
      <SvgText
        x={cx}
        y={cy}
        textAnchor="middle"
        fontFamily={fontFamily}
        fontSize={fontSize}
        fontWeight="900"
        fill={`url(#${gradId})`}
        stroke={strokeWidth > 0 ? strokeColor : undefined}
        strokeWidth={strokeWidth > 0 ? strokeWidth : 0}
        letterSpacing={letterSpacing}
      >
        {text}
      </SvgText>
    </Svg>
  );
}

/* ─── Layered (Big + Small) ──────────────────────────────────────────── */

function LayeredText({
  big,
  small,
  baseTextStyle,
  shadowStyle,
  strokeApprox,
  fontSize,
  fontFamily,
  highlightColor,
  highlightFontScale,
  highlightGlow,
  highlightGlowColor,
  highlightGlowStrength,
  useGradientRender,
  gradientFrom,
  gradientTo,
  metallic,
  upper,
}: {
  big: string;
  small: string;
  baseTextStyle: TextStyle;
  shadowStyle: TextStyle;
  strokeApprox: TextStyle;
  fontSize: number;
  fontFamily: string;
  highlightColor: string;
  highlightFontScale: number;
  highlightGlow: boolean;
  highlightGlowColor: string;
  highlightGlowStrength: number;
  useGradientRender: boolean;
  gradientFrom: string;
  gradientTo: string;
  metallic: boolean;
  upper: boolean;
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
      {useGradientRender ? (
        <SvgGradientText
          text={big}
          fontFamily={fontFamily}
          fontSize={bigSize}
          letterSpacing={0}
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
          metallic={metallic}
          strokeWidth={0}
          strokeColor="#000000"
        />
      ) : (
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
      )}
      <Text style={[baseTextStyle, shadowStyle, strokeApprox, { marginTop: -bigSize * 0.15 }]}>
        {small}
      </Text>
    </View>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function buildShadowStyle(s: SubtitleSettings): TextStyle {
  // STRICT checks: nur wenn enabled-flag explizit true ist greift der Effekt.
  // Frueher: ?? fallback auf '(blur > 0)' — gab false-positives bei legacy data
  // ohne enabled-field (e.g. Drop-Shadow-Slider triggerte fälschlich Glow weil
  // default glowBlur=8 den fallback aktivierte).
  const glowOn = s.glowEnabled === true && (s.glowBlur ?? 0) > 0;
  const shadowOn = s.shadowEnabled === true;

  if (glowOn) {
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

function strokeApproxStyle(s: SubtitleSettings): TextStyle {
  // Stroke nur wenn strokeEnabled === true + width > 0. Kein implicit-on aus
  // strokeWidth-default mehr.
  const strokeOn = s.strokeEnabled === true && (s.strokeWidth ?? 0) > 0;
  if (!strokeOn) return {};
  const glowOn = s.glowEnabled === true && (s.glowBlur ?? 0) > 0;
  const shadowOn = s.shadowEnabled === true;
  if (glowOn || shadowOn) return {};
  return {
    textShadowColor: s.strokeColor ?? '#000000',
    textShadowRadius: Math.min(s.strokeWidth ?? 0, 6),
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
  }
  return f;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return {
    r: parseInt(m.substring(0, 2), 16),
    g: parseInt(m.substring(2, 4), 16),
    b: parseInt(m.substring(4, 6), 16),
  };
}

function lighten(hex: string, amount: number): string {
  const p = parseHex(hex);
  if (!p) return hex;
  const r = Math.min(255, Math.round(p.r + (255 - p.r) * amount));
  const g = Math.min(255, Math.round(p.g + (255 - p.g) * amount));
  const b = Math.min(255, Math.round(p.b + (255 - p.b) * amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function darken(hex: string, amount: number): string {
  const p = parseHex(hex);
  if (!p) return hex;
  const r = Math.max(0, Math.round(p.r * (1 - amount)));
  const g = Math.max(0, Math.round(p.g * (1 - amount)));
  const b = Math.max(0, Math.round(p.b * (1 - amount)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
  },
});

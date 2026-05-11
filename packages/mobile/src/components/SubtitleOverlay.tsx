/**
 * SubtitleOverlay — absolute-positionierter Text-Layer der die Subtitle-Settings
 * ins Bild rendert. Nutzbar in:
 *   - SubtitlePreviewCard (Mini-Preview im Modal, mit 9:16-Frame)
 *   - StackedSplitPreview (Live-Overlay auf der echten 9:16-Vorschau im TikTok-Tab)
 *
 * Render-Strategie: 1 oder 2 <Text> mit Style-Tokens (color, fontSize, textShadow).
 * RN's textShadow ist single-pass — Glow + Shadow gleichzeitig geht nicht. Wir
 * priorisieren Glow > Shadow > Stroke. Gradient/Metallic sind im Preview nicht
 * darstellbar (RN <Text> hat keinen Per-Letter-Fill) — kommen beim FFmpeg-Render.
 */

import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type {
  SubtitleFontFamily,
  SubtitleSettings,
  SubtitleStyle,
} from '../data/demoProjects';

interface Props {
  settings: SubtitleSettings;
  /** Demo-Text wenn keine highlightWords gesetzt. */
  demoBig?: string;
  demoSmall?: string;
  /** Zusätzliche Style für den Container (z.B. transparente Background fürs Overlay). */
  containerStyle?: StyleProp<ViewStyle>;
}

export function SubtitleOverlay({
  settings,
  demoBig = 'EPIC',
  demoSmall = 'moment',
  containerStyle,
}: Props) {
  if (!settings.enabled) return null;

  const isLayered = settings.style === 'layered';
  const upper = settings.uppercase ?? settings.style === 'fiano';
  const fontFamily = mapFontFamily(settings.fontFamily ?? defaultFontFor(settings.style));
  const fontSize = settings.fontSize ?? defaultFontSizeFor(settings.style);
  const textColor = settings.textColor ?? '#ffffff';
  const highlightColor = settings.highlightColor ?? '#ff1039';
  const letterSpacing = (settings.letterSpacing ?? 0) * fontSize;

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

  return (
    <View
      style={[
        styles.positioner,
        positionStyle,
        containerStyle,
      ]}
      pointerEvents="none"
    >
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
            {
              color: settings.useGradient
                ? settings.gradientFrom ?? textColor
                : textColor,
            },
          ]}
        >
          {upper ? 'SUBTITLE PREVIEW' : 'Subtitle preview'}
        </Text>
      )}
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

function strokeApproxStyle(s: SubtitleSettings): TextStyle {
  if (!s.strokeWidth || s.strokeWidth <= 0) return {};
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
  }
  return f;
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
  },
});

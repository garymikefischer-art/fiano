/**
 * Canvas-Renderer für Subtitle-Cues (Layered-Style).
 *
 * Spiegelt die Live-Preview-Logik aus TikTokPreview (drawWordHighlights/drawLayeredDemo)
 * 1:1 in einem standalone <canvas>. Output: PNG-base64 für FFmpeg-Overlay-Compositing.
 *
 * Nur Layered-Style: andere Subtitle-Styles (default/bold/gaming/fiano) verwenden weiterhin
 * libass im Export — ihre flache Style-Logik (solid Color, einzelner Outline) lässt sich dort
 * sauber abbilden. Layered scheitert an libass-Limits (kein vertikaler Gradient, kein 7-Stop
 * Metallic, kein Multi-Layer Glow).
 */

import type { SubtitleHighlightWord } from '@shared/types';

export interface SubtitleRenderSettings {
  // Style (für non-layered styles wie 'fiano', 'bold', 'gaming', 'default')
  style?: 'default' | 'bold' | 'gaming' | 'fiano' | 'layered';
  // Position
  position?: 'top' | 'bottom' | 'center' | 'custom';
  customY?: number;
  // Typography
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  // Colors
  textColor?: string;
  highlightColor?: string;
  useGradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  // Stroke
  strokeWidth?: number;
  strokeColor?: string;
  // Glow / Drop-Shadow
  glowEnabled?: boolean;
  glowBlur?: number;
  glowStrength?: number;
  glowColor?: string;
  shadowEnabled?: boolean;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowColor?: string;
  shadowBlur?: number;
  metallic?: boolean;
  // Layered Highlight
  highlightFontScale?: number;
  highlightUseGradient?: boolean;
  highlightGradientFrom?: string;
  highlightGradientTo?: string;
  highlightDropShadow?: number;
  highlightMetallic?: boolean;
  highlightGlow?: boolean;
  highlightGlowColor?: string;
  highlightGlowStrength?: number;
}

/** Universal-Renderer: dispatcht zu Layered ODER Simple-Style. */
export function renderSubtitleCueToPng(
  cueText: string,
  highlightWords: SubtitleHighlightWord[] | undefined,
  settings: SubtitleRenderSettings,
  canvasW: number,
  canvasH: number,
): string {
  if (settings.style === 'layered') {
    return renderLayeredSubtitleToPng(cueText, highlightWords, settings, canvasW, canvasH);
  }
  return renderSimpleSubtitleToPng(cueText, settings, canvasW, canvasH);
}

/** Render non-layered Subtitle (single line, optional gradient/metallic/glow/shadow). */
export function renderSimpleSubtitleToPng(
  cueText: string,
  settings: SubtitleRenderSettings,
  canvasW: number,
  canvasH: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const upper = settings.uppercase ?? false;
  const text = upper ? cueText.toUpperCase() : cueText;
  if (!text.trim()) return '';

  const baseScale = canvasW / 540;
  const fontSizePx = (settings.fontSize ?? 30) * baseScale;
  const strokeW = (settings.strokeWidth ?? 4) * baseScale;
  const fontFamily = settings.fontFamily ?? '"Arial Black", sans-serif';
  const textColor = settings.textColor ?? '#ffffff';
  const strokeColor = settings.strokeColor ?? '#000000';

  // Y-Position
  let y: number;
  switch (settings.position) {
    case 'top':    y = canvasH * (120 / 1920) + fontSizePx; break;
    case 'center': y = canvasH / 2; break;
    case 'custom': y = canvasH * Math.max(0, Math.min(1, settings.customY ?? 0.5)); break;
    case 'bottom':
    default:       y = canvasH * 0.88; break;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSizePx}px ${fontFamily}`;
  // letter-spacing
  if (settings.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${settings.letterSpacing}em`;
  }

  // Build fill style: metallic > gradient > solid
  const fillStyle: string | CanvasGradient = (() => {
    if (settings.metallic) {
      const from = settings.gradientFrom ?? lightenHex(textColor, 0.35);
      const to   = settings.gradientTo   ?? darkenHex(textColor, 0.45);
      const grad = ctx.createLinearGradient(0, y - fontSizePx / 2, 0, y + fontSizePx / 2);
      grad.addColorStop(0,    darkenHex(from, 0.40));
      grad.addColorStop(0.18, lightenHex(from, 0.55));
      grad.addColorStop(0.32, lightenHex(from, 0.10));
      grad.addColorStop(0.48, darkenHex(to,   0.10));
      grad.addColorStop(0.66, lightenHex(to,  0.20));
      grad.addColorStop(0.85, darkenHex(to,   0.20));
      grad.addColorStop(1,    darkenHex(to,   0.55));
      return grad;
    }
    if (settings.useGradient && settings.gradientFrom && settings.gradientTo) {
      const grad = ctx.createLinearGradient(0, y - fontSizePx / 2, 0, y + fontSizePx / 2);
      grad.addColorStop(0, settings.gradientFrom);
      grad.addColorStop(1, settings.gradientTo);
      return grad;
    }
    return textColor;
  })();

  // Drop-Shadow Pass — auf fill (nicht stroke) damit auch ohne Stroke sichtbar
  const shadowOnLegacy = (settings.shadowBlur ?? 0) > 0
    || Math.abs(settings.shadowOffsetX ?? 0) > 0.1
    || Math.abs(settings.shadowOffsetY ?? 0) > 0.1;
  const shadowOn = settings.shadowEnabled ?? shadowOnLegacy;
  if (shadowOn && shadowOnLegacy) {
    ctx.save();
    ctx.shadowColor = (settings.shadowColor ?? '#000000') + 'cc';
    ctx.shadowBlur = (settings.shadowBlur ?? 0) * baseScale;
    ctx.shadowOffsetX = (settings.shadowOffsetX ?? 0) * baseScale;
    ctx.shadowOffsetY = (settings.shadowOffsetY ?? 0) * baseScale;
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, canvasW / 2, y);
    ctx.restore();
  }

  // Neon-Glow Multi-Pass — Text strahlt selbst in glow-color
  const glowOn = settings.glowEnabled ?? ((settings.glowBlur ?? 0) > 0);
  if (glowOn && (settings.glowBlur ?? 0) > 0) {
    const baseBlur = (settings.glowBlur ?? 0) * baseScale * Math.max(0.5, settings.glowStrength ?? 0.7);
    const glowColor = settings.glowColor ?? '#ff1039';
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.fillStyle = glowColor;
    for (const b of [baseBlur * 1.5, baseBlur, baseBlur * 0.6, baseBlur * 0.3]) {
      ctx.shadowBlur = b;
      ctx.fillText(text, canvasW / 2, y);
    }
    ctx.restore();
  }

  // Stroke (nur wenn > 0)
  if (strokeW > 0) {
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, canvasW / 2, y);
  }

  // Final fill
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, canvasW / 2, y);

  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

/**
 * Rendert einen Layered-Subtitle-Cue zu PNG-base64.
 *
 * @param cueText      Subtitle-Text (ein Segment)
 * @param highlightWords  optional: explizit markierte Big-Words. Wenn leer/undefined: das letzte/längste Wort wird highlight.
 * @param settings     Style-Einstellungen
 * @param canvasW/H    Output-Auflösung (= TikTok-Format-Resolution, typisch 1080×1920)
 */
export function renderLayeredSubtitleToPng(
  cueText: string,
  highlightWords: SubtitleHighlightWord[] | undefined,
  settings: SubtitleRenderSettings,
  canvasW: number,
  canvasH: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const upper = settings.uppercase ?? true;
  const text = upper ? cueText.toUpperCase() : cueText;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  // Big-Words bestimmen: aus highlightWords filtern, sonst auto = letztes Wort
  const bigSet = new Set<string>();
  if (highlightWords && highlightWords.length > 0) {
    for (const hw of highlightWords) {
      if (hw.big) bigSet.add(upper ? hw.text.toUpperCase() : hw.text);
    }
  }
  const hasBig = words.some((w) => bigSet.has(w.replace(/[^\w\säöüÄÖÜß]/g, '')));
  const bigWords = hasBig
    ? words.filter((w) => bigSet.has(w.replace(/[^\w\säöüÄÖÜß]/g, '')))
    : [words[words.length - 1]];
  const smallWords = hasBig
    ? words.filter((w) => !bigSet.has(w.replace(/[^\w\säöüÄÖÜß]/g, '')))
    : words.slice(0, -1);

  // Sizes (TikTok-Canvas hat skalierte fontSize relativ zu 540 base — hier nutzen wir
  // canvasW direkt damit Größe in Output-Pixeln richtig ist)
  const baseScale = canvasW / 540;
  const fontSizePx = (settings.fontSize ?? 30) * baseScale;
  const smallSize = Math.round(fontSizePx * 0.7);
  const bigSize = Math.round(fontSizePx * (settings.highlightFontScale ?? 2.0));
  const strokeW = (settings.strokeWidth ?? 4) * baseScale;
  const fontFamily = settings.fontFamily ?? '"Arial Black", sans-serif';
  const textColor = settings.textColor ?? '#ffffff';
  const strokeColor = settings.strokeColor ?? '#000000';
  const highlightColor = settings.highlightColor ?? '#ff1039';

  // Y-Position bestimmen
  let yCenter: number;
  switch (settings.position) {
    case 'top':    yCenter = canvasH * (120 / 1920) + fontSizePx; break;
    case 'center': yCenter = canvasH / 2; break;
    case 'custom': yCenter = canvasH * Math.max(0, Math.min(1, settings.customY ?? 0.5)); break;
    case 'bottom':
    default:       yCenter = canvasH * 0.88; break;
  }

  // Layered-Layout: big oben, small überlappend darunter (gleich wie TikTokPreview)
  const yBig = yCenter - smallSize / 4;
  const ySmall = yBig + bigSize * 0.42;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Drop-Shadow für die small-words (falls global-shadow gesetzt)
  const shadowOnLegacy = (settings.shadowBlur ?? 0) > 0 || Math.abs(settings.shadowOffsetX ?? 0) > 0.1 || Math.abs(settings.shadowOffsetY ?? 0) > 0.1;
  const globalShadowOn = settings.shadowEnabled ?? shadowOnLegacy;
  const globalGlowOn = settings.glowEnabled ?? ((settings.glowBlur ?? 0) > 0);
  const globalShadowBlur = (settings.shadowBlur ?? 0) * baseScale;
  const globalShadowX    = (settings.shadowOffsetX ?? 0) * baseScale;
  const globalShadowY    = (settings.shadowOffsetY ?? 0) * baseScale;
  const globalShadowColor = settings.shadowColor ?? '#000000';
  const hasGlobalShadow = globalShadowOn && (globalShadowBlur > 0 || Math.abs(globalShadowX) > 0.1 || Math.abs(globalShadowY) > 0.1);

  // Glow für die small-words (falls global-glow gesetzt — als Halo um Outline)
  const globalGlowBlur = (settings.glowBlur ?? 0) * baseScale;
  const globalGlowColor = settings.glowColor ?? '#ff1039';
  const globalGlowStrength = settings.glowStrength ?? 0.7;

  // ─── BIG-WORD ZUERST RENDERN (z-order: big hinten, small drüber/davor) ─────────
  if (bigWords.length > 0) {
    const bigText = bigWords.join(' ');
    ctx.font = `900 ${bigSize}px ${fontFamily}`;
    ctx.lineJoin = 'round';

    // Big-Fill: solid / gradient / metallic
    const bigFill = buildBigFill(ctx, yBig, bigSize, settings, highlightColor);

    // Drop-Shadow für big-word (separater layered-drop-shadow)
    const bigDrop = (settings.highlightDropShadow ?? 0) * baseScale;
    if (bigDrop > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(bigText, canvasW / 2 + bigDrop * 0.4, yBig + bigDrop);
      ctx.restore();
    }

    // Big-Highlight-Glow als Multi-Pass mit fillStyle = glowColor (Text SELBST strahlt).
    if (settings.highlightGlow) {
      const strength = settings.highlightGlowStrength ?? 0.6;
      const blur = strength * 60 * baseScale;
      const glowColor = settings.highlightGlowColor ?? '#ffffff';
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.fillStyle = glowColor;
      for (const b of [blur * 1.5, blur, blur * 0.6, blur * 0.3]) {
        ctx.shadowBlur = b;
        ctx.fillText(bigText, canvasW / 2, yBig);
      }
      ctx.restore();
    }

    // Big-Stroke proportional zur User-strokeW (= 0 wenn User strokeW=0 setzt)
    const bigStrokeW = strokeW * 1.4;
    if (bigStrokeW > 0) {
      ctx.lineWidth = bigStrokeW;
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(bigText, canvasW / 2, yBig);
    }

    // Final Fill (text core, in bigFill)
    ctx.fillStyle = bigFill;
    ctx.fillText(bigText, canvasW / 2, yBig);
  }

  // ─── SMALL-WORDS DANACH (vorne über big-word) ───────────────────────────────────
  if (smallWords.length > 0) {
    const smallText = smallWords.join(' ');
    ctx.font = `700 ${smallSize}px ${fontFamily}`;
    ctx.lineJoin = 'round';

    // Drop-Shadow oder Glow als Pre-Pass — auf FILL (nicht stroke-only) damit auch
    // bei strokeWidth=0 ein sichtbarer Halo entsteht.
    const smallStrokeW = strokeW * 0.7;
    const fillStyle: string | CanvasGradient = settings.useGradient && settings.gradientFrom && settings.gradientTo
      ? buildGradient(ctx, ySmall, smallSize, settings.gradientFrom, settings.gradientTo)
      : textColor;

    if (hasGlobalShadow) {
      ctx.save();
      ctx.shadowColor = globalShadowColor + 'cc';
      ctx.shadowBlur = globalShadowBlur;
      ctx.shadowOffsetX = globalShadowX;
      ctx.shadowOffsetY = globalShadowY;
      ctx.fillStyle = fillStyle;
      ctx.fillText(smallText, canvasW / 2, ySmall);
      ctx.restore();
    } else if (globalGlowOn && globalGlowBlur > 0) {
      // Multi-Pass Neon-Glow: text strahlt SELBST in glow-color
      ctx.save();
      ctx.shadowColor = globalGlowColor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = globalGlowColor;
      const baseBlur = globalGlowBlur * Math.max(0.5, globalGlowStrength);
      for (const b of [baseBlur * 1.5, baseBlur, baseBlur * 0.6, baseBlur * 0.3]) {
        ctx.shadowBlur = b;
        ctx.fillText(smallText, canvasW / 2, ySmall);
      }
      ctx.restore();
    }

    // Stroke (nur wenn > 0)
    if (smallStrokeW > 0) {
      ctx.lineWidth = smallStrokeW;
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(smallText, canvasW / 2, ySmall);
    }

    // Fill final clean
    ctx.fillStyle = fillStyle;
    ctx.fillText(smallText, canvasW / 2, ySmall);
  }

  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

/* ─── Helpers ────────────────────────────────────────────────── */

function buildBigFill(
  ctx: CanvasRenderingContext2D,
  yCenter: number,
  size: number,
  s: SubtitleRenderSettings,
  defaultColor: string,
): string | CanvasGradient {
  const top = yCenter - size / 2;
  const bot = yCenter + size / 2;
  if (s.highlightMetallic) {
    const from = s.highlightGradientFrom ?? '#ffffff';
    const to = s.highlightGradientTo ?? '#7a7a7a';
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0,    darkenHex(from, 0.4));
    grad.addColorStop(0.18, lightenHex(from, 0.55));
    grad.addColorStop(0.32, lightenHex(from, 0.10));
    grad.addColorStop(0.48, darkenHex(to, 0.10));
    grad.addColorStop(0.66, lightenHex(to, 0.20));
    grad.addColorStop(0.85, darkenHex(to, 0.20));
    grad.addColorStop(1,    darkenHex(to, 0.55));
    return grad;
  }
  if (s.highlightUseGradient && s.highlightGradientFrom && s.highlightGradientTo) {
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, s.highlightGradientFrom);
    grad.addColorStop(1, s.highlightGradientTo);
    return grad;
  }
  return defaultColor;
}

function buildGradient(
  ctx: CanvasRenderingContext2D,
  yCenter: number,
  size: number,
  from: string,
  to: string,
): CanvasGradient {
  const grad = ctx.createLinearGradient(0, yCenter - size / 2, 0, yCenter + size / 2);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  return grad;
}

function lightenHex(hex: string, amount: number): string {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const r = Math.min(255, Math.round(parseInt(m.slice(0, 2), 16) + (255 - parseInt(m.slice(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(m.slice(2, 4), 16) + (255 - parseInt(m.slice(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(m.slice(4, 6), 16) + (255 - parseInt(m.slice(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darkenHex(hex: string, amount: number): string {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const r = Math.max(0, Math.round(parseInt(m.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(m.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(m.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

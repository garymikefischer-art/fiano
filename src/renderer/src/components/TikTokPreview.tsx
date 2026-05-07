import { useEffect, useRef } from 'react';
import type {
  ClipEffects, ClipSegment, FacecamRegion, FilterPreset, GameplayRegion,
  ProjectIntro, ProjectVoiceOver, SubtitleFontFamily, SubtitleHighlightWord, SubtitlePosition, SubtitleStyle, TikTokLayout,
} from '@shared/types';
import { DEFAULT_GAMEPLAY, DEFAULT_INTRO_OVERLAY } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';

export interface SubtitlePreviewSettings {
  style: SubtitleStyle;
  position: SubtitlePosition;
  customY: number;
  fontFamily?: SubtitleFontFamily;
  fontSize?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  textColor?: string;
  highlightColor?: string;
  useGradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  strokeWidth?: number;
  strokeColor?: string;
  glowBlur?: number;
  glowStrength?: number;
  glowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowColor?: string;
  shadowBlur?: number;
  highlightWords?: SubtitleHighlightWord[];
  // ─── Layered-Style ──────────────────────────────────────────
  highlightUseGradient?: boolean;
  highlightGradientFrom?: string;
  highlightGradientTo?: string;
  highlightFontScale?: number;
  highlightDropShadow?: number;
  highlightMetallic?: boolean;
  highlightGlow?: boolean;
  highlightGlowColor?: string;
  highlightGlowStrength?: number;
}

interface Props {
  src?: string;
  layout: TikTokLayout;
  facecam: FacecamRegion;
  gameplay?: GameplayRegion;
  splitRatio: number;
  segments: ClipSegment[];
  playing: boolean;
  intro?: ProjectIntro;
  effects?: ClipEffects;
  subtitlePreview?: SubtitlePreviewSettings;
  /** Voice-Overs (TTS) die parallel zum Video bei ihrer startSec-Position abgespielt werden. */
  voiceOvers?: ProjectVoiceOver[];
  /** Callback der das interne <video>-Element exposed — für Custom-Controls von außen. */
  onVideoReady?: (video: HTMLVideoElement | null) => void;
}

/** CSS-Filter-Approximation der FFmpeg-Color-Presets. Motion-Blur ist temporal — nicht im Browser
 * abbildbar (CSS blur() blurt das ganze Bild, nicht nur Bewegung). Daher kein blur() hier;
 * stattdessen zeigt ein Badge im Preview an dass Motion-Blur im Export aktiv wird. */
function cssFilterFor(effects?: ClipEffects): string {
  const parts: string[] = [];
  const f = effects?.filter ?? 'none';
  switch (f as FilterPreset) {
    case 'vivid':  parts.push('saturate(1.3) contrast(1.2) brightness(1.05)'); break;
    case 'dark':   parts.push('contrast(1.4) brightness(0.9)'); break;
    case 'warm':   parts.push('sepia(0.15) saturate(1.1)'); break;
    case 'cold':   parts.push('hue-rotate(-10deg) saturate(1.05) brightness(0.98)'); break;
    case 'gaming': parts.push('saturate(1.4) contrast(1.3)'); break;
  }
  return parts.length ? parts.join(' ') : 'none';
}

/**
 * Canvas-basierte 9:16 Vorschau mit dynamischem splitRatio + Multi-Segment-Loop.
 */
export function TikTokPreview({ src, layout, facecam, gameplay, splitRatio, segments, playing, intro, effects, subtitlePreview, voiceOvers, onVideoReady }: Props) {
  const gp = gameplay ?? DEFAULT_GAMEPLAY;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const introRef = useRef<HTMLVideoElement>(null);
  const segIdxRef = useRef(0);

  // Expose das video-Element nach außen für Custom-Controls
  useEffect(() => {
    onVideoReady?.(videoRef.current);
    return () => onVideoReady?.(null);
  }, [onVideoReady, src]);

  const introOverlayActive = !!(intro?.path && intro.mode === 'overlay');
  const introScale = intro?.scale ?? DEFAULT_INTRO_OVERLAY.scale;
  const introX = intro?.x ?? DEFAULT_INTRO_OVERLAY.x;
  const introY = intro?.y ?? DEFAULT_INTRO_OVERLAY.y;

  // Explizit Intro-Video starten — autoplay+muted reicht in Chromium nicht immer
  useEffect(() => {
    if (!introOverlayActive) return;
    const iv = introRef.current;
    if (!iv) return;
    const tryPlay = () => iv.play().catch(() => {});
    tryPlay();
    iv.addEventListener('loadeddata', tryPlay);
    return () => iv.removeEventListener('loadeddata', tryPlay);
  }, [introOverlayActive, intro?.path]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing && segments.length > 0) {
      segIdxRef.current = 0;
      v.currentTime = segments[0].start;
      v.play().catch(() => {});
    } else {
      v.pause();
      segIdxRef.current = 0;
      if (segments.length > 0) v.currentTime = segments[0].start;
    }
  }, [playing, segments]);

  // Ref-Pattern: alle Props die sich häufig ändern (subtitle-style, transforms, intro)
  // werden via ref durchgereicht damit der RAF-Loop sie OHNE Re-Run liest. Sonst müsste
  // das useEffect-Deps-Array jedes einzelne Subtitle-Property tracken — bei subtitle.glowColor
  // oder .fontSize lief der RAF mit stalem Closure und Updates wurden erst nach Tab-Switch sichtbar.
  const propsRef = useRef({ layout, facecam, gp, splitRatio, introOverlayActive, introScale, introX, introY, subtitlePreview });
  propsRef.current = { layout, facecam, gp, splitRatio, introOverlayActive, introScale, introX, introY, subtitlePreview };

  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      // Live-aktuelle Werte aus ref lesen (nicht Closure)
      const p = propsRef.current;
      const layout = p.layout;
      const facecam = p.facecam;
      const gp = p.gp;
      const splitRatio = p.splitRatio;
      const introOverlayActive = p.introOverlayActive;
      const introScale = p.introScale;
      const introX = p.introX;
      const introY = p.introY;
      const subtitlePreview = p.subtitlePreview;
      // Multi-Segment-Loop
      if (segments.length > 0) {
        const cur = segments[segIdxRef.current] ?? segments[0];
        if (v.currentTime > cur.end || v.currentTime < cur.start - 0.1) {
          const nextIdx = (segIdxRef.current + 1) % segments.length;
          segIdxRef.current = nextIdx;
          v.currentTime = segments[nextIdx].start;
        }
      }

      const vw = v.videoWidth;
      const vh = v.videoHeight;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);

      if (vw && vh) {
        if (layout === 'stacked') {
          const ratio = clamp(splitRatio, 0.2, 0.8);
          const topH = Math.round(c.height * ratio);
          const botH = c.height - topH;

          drawCover(ctx, v,
            facecam.x * vw, facecam.y * vh,
            facecam.width * vw, facecam.height * vh,
            0, 0, c.width, topH);

          // Gameplay-Region (default 0/0/1/1 = ganzes Frame)
          drawCover(ctx, v,
            gp.x * vw, gp.y * vh, gp.width * vw, gp.height * vh,
            0, topH, c.width, botH);

          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(0, topH - 1, c.width, 2);
        } else {
          drawCover(ctx, v, 0, 0, vw, vh, 0, 0, c.width, c.height);
        }
      }

      // ─── Intro Overlay (live preview) ───────────────────────
      if (introOverlayActive) {
        const iv = introRef.current;
        const ready = iv && iv.readyState >= 2 && iv.videoWidth > 0 && !iv.error;
        const targetW = c.width * clamp(introScale, 0.05, 1);
        const targetH = ready
          ? (targetW / iv!.videoWidth) * iv!.videoHeight
          : targetW * 0.5625; // 16:9-Aspect estimate für Placeholder
        const tx = c.width * clamp(introX, 0, 1);
        const ty = c.height * clamp(introY, 0, 1);

        if (ready) {
          ctx.drawImage(iv!, tx, ty, targetW, targetH);
        } else {
          // Fallback: Browser kann den Codec nicht decodieren (typisch ProRes 4444 / HEVC alpha).
          // Zeige Placeholder-Box damit der User Position+Größe trotzdem visuell hat.
          ctx.fillStyle = 'rgba(255, 107, 53, 0.20)';
          ctx.fillRect(tx, ty, targetW, targetH);
          ctx.strokeStyle = 'rgba(255, 107, 53, 0.95)';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(tx, ty, targetW, targetH);
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('intro (export only)', tx + 8, ty + 22);
        }
      }

      // ─── Subtitle Preview (Demo-Zeile an gewählter Position) ─
      if (subtitlePreview) {
        drawSubtitlePreview(ctx, c.width, c.height, subtitlePreview);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // KEINE props-deps — alle dynamischen Werte kommen via propsRef. Effekt mountet einmal
    // pro src/segments-Wechsel, RAF läuft dann für die ganze Lebensdauer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  return (
    <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
      {/*
        Hidden video sources for canvas-drawImage.
        IMPORTANT: NICHT display:none — Chromium hält dann manche Codecs/Frames an.
        Stattdessen: 1×1 absolute & invisible.
      */}
      <video
        ref={videoRef}
        src={mediaUrl(src)}
        playsInline
        loop
        preload="metadata"
        className="absolute -left-px -top-px w-px h-px opacity-0 pointer-events-none"
      />
      {introOverlayActive && (
        <video
          ref={introRef}
          src={mediaUrl(intro!.path)}
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          onError={(e) => console.warn('[intro preview] video error:', (e.target as HTMLVideoElement).error)}
          className="absolute -left-px -top-px w-px h-px opacity-0 pointer-events-none"
        />
      )}
      {/* Voice-Overs (TTS-Audio): parallel laufende audio-Elemente, sync via videoRef.currentTime */}
      {(voiceOvers ?? []).map((vo, i) => (
        <VoiceOverAudio key={`vo-${i}-${vo.path}`} voiceOver={vo} videoRef={videoRef} playing={playing} />
      ))}
      <canvas
        ref={canvasRef}
        width={540}
        height={960}
        className="w-full h-full"
        style={{ filter: cssFilterFor(effects) }}
      />
      {introOverlayActive && (
        <div className="absolute top-1.5 right-1.5 text-[9px] bg-brand/80 text-white px-1.5 py-0.5 rounded">
          intro overlay
        </div>
      )}
      {effects?.motionBlur && effects.motionBlur !== 'off' && (
        <div className="absolute bottom-1.5 left-1.5 text-[9px] bg-black/80 text-amber-300 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
          motion blur ({effects.motionBlur}) · export only
        </div>
      )}
    </div>
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  v: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
) {
  const sAspect = sw / sh;
  const dAspect = dw / dh;
  let cx = sx, cy = sy, cw = sw, ch = sh;
  if (sAspect > dAspect) {
    cw = sh * dAspect;
    cx = sx + (sw - cw) / 2;
  } else {
    ch = sw / dAspect;
    cy = sy + (sh - ch) / 2;
  }
  ctx.drawImage(v as any, cx, cy, cw, ch, dx, dy, dw, dh);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Zeichnet die Subtitle-Vorschau. Wenn highlightWords gesetzt:
 *   → Word-by-Word-Rendering mit Big (highlight) + Small (klein, vorne)
 * Sonst:
 *   → Demo-Zeile "SUBTITLE PREVIEW" im aktuellen Style.
 */
function fontFamilyCss(f?: SubtitleFontFamily): string {
  if (!f) return 'sans-serif';
  switch (f) {
    case 'arial-black': return '"Arial Black", sans-serif';
    case 'helvetica':   return '"Helvetica Neue", sans-serif';
    case 'impact':      return 'Impact, sans-serif';
    case 'geist':       return 'Geist, sans-serif';
    case 'georgia':     return 'Georgia, serif';
    case 'mono':        return 'Menlo, ui-monospace, monospace';
    case 'system':      return '"Helvetica Neue", sans-serif';
    default:
      // Custom system-font name aus queryLocalFonts() — direkt verwenden,
      // Anführungszeichen für Family-Names mit Spaces ("Comic Sans MS" etc.)
      return `"${f.replace(/"/g, '\\"')}", sans-serif`;
  }
}

function drawSubtitlePreview(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  s: SubtitlePreviewSettings,
) {
  // Style-Defaults pro preset
  let baseFamily: SubtitleFontFamily = 'helvetica';
  let baseColor = '#ffffff';
  let baseSizePx = 26;
  switch (s.style) {
    case 'bold':    baseFamily = 'arial-black'; baseSizePx = 30; break;
    case 'gaming':  baseFamily = 'impact';      baseColor = '#ffff33'; baseSizePx = 34; break;
    case 'fiano':   baseFamily = 'geist';       baseSizePx = 32; break;
    case 'layered': baseFamily = 'arial-black'; baseSizePx = 30; break;
    default:        /* keep */ break;
  }

  const fontFamily = fontFamilyCss(s.fontFamily ?? baseFamily);
  const sizePx = (s.fontSize ?? baseSizePx) * (w / 540);
  const strokeW = (s.strokeWidth ?? 4) * (w / 540);
  const letterSp = s.letterSpacing ?? 0;
  const textColor = s.textColor ?? baseColor;
  const highlightColor = s.highlightColor ?? '#ff1039';
  const strokeColor = s.strokeColor ?? '#000000';
  const upper = s.uppercase ?? (s.style === 'fiano');
  const glowBlur = s.glowBlur ?? 0;
  const glowStrength = s.glowStrength ?? 0.7;
  const glowColor = s.glowColor ?? '#000000';
  const shadowX = (s.shadowOffsetX ?? 0) * (w / 540);
  const shadowY = (s.shadowOffsetY ?? 0) * (w / 540);
  const shadowColor = s.shadowColor ?? '#000000';
  const shadowBlur = s.shadowBlur ?? 0;
  // shadowEnabled (neuer Master-Toggle). Wenn undefined → legacy: aktiv wenn werte gesetzt.
  const shadowOn = s.shadowEnabled ?? (shadowBlur > 0 || Math.abs(shadowX) > 0.1 || Math.abs(shadowY) > 0.1);
  const hasDropShadow = shadowOn && (shadowBlur > 0 || Math.abs(shadowX) > 0.1 || Math.abs(shadowY) > 0.1);
  // glowEnabled (neuer Master-Toggle). Legacy: aktiv wenn glowBlur > 0.
  const glowOn = s.glowEnabled ?? glowBlur > 0;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${letterSp}em`;

  // Y-Position
  let y: number;
  switch (s.position) {
    case 'top':    y = h * (120 / 1920) + sizePx; break;
    case 'center': y = h / 2; break;
    case 'custom': y = h * clamp(s.customY, 0, 1); break;
    case 'bottom':
    default:       y = h * 0.88; break;
  }

  // Apply Drop-Shadow (canvas-shadow Pre-Pass) — nur Drop-Shadow nicht Glow.
  // Glow läuft separat als Multi-Pass-Neon (siehe drawNeonGlow).
  const applyShadow = () => {
    if (hasDropShadow) {
      ctx.shadowBlur = shadowBlur * (w / 540);
      ctx.shadowColor = shadowColor + 'cc';  // 80% alpha
      ctx.shadowOffsetX = shadowX;
      ctx.shadowOffsetY = shadowY;
    } else {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  };
  const clearShadow = () => {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
  // Neon-Glow als Multi-Pass: text strahlt SELBST in glow-color (4 layers für Tiefe).
  // Aufruf vor strokeText/fillText, optional nach Drop-Shadow-Pass.
  const drawNeonGlow = (text: string, gx: number, gy: number) => {
    if (!glowOn || glowBlur <= 0) return;
    const baseBlur = glowBlur * (w / 540) * Math.max(0.5, glowStrength);
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = glowColor;
    for (const b of [baseBlur * 1.5, baseBlur, baseBlur * 0.6, baseBlur * 0.3]) {
      ctx.shadowBlur = b;
      ctx.fillText(text, gx, gy);
    }
    ctx.restore();
  };

  // Gradient für Text-Fill
  const fillStyleFor = (size: number, color: string): string | CanvasGradient => {
    // Metallic hat Vorrang — wirkt auch ohne useGradient. Falls keine gradientFrom/To
    // gesetzt sind, nutzen wir lighten/darken vom textColor als Sheen-Basis.
    if (s.metallic) {
      const from = s.gradientFrom ?? lighten(color, 0.35);
      const to   = s.gradientTo   ?? darken(color, 0.45);
      const grad = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      grad.addColorStop(0,    darken(from, 0.40));
      grad.addColorStop(0.18, lighten(from, 0.55));
      grad.addColorStop(0.32, lighten(from, 0.10));
      grad.addColorStop(0.48, darken(to,   0.10));
      grad.addColorStop(0.66, lighten(to,  0.20));
      grad.addColorStop(0.85, darken(to,   0.20));
      grad.addColorStop(1,    darken(to,   0.55));
      return grad;
    }
    if (!s.useGradient || !s.gradientFrom || !s.gradientTo) return color;
    const grad = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    grad.addColorStop(0, s.gradientFrom);
    grad.addColorStop(1, s.gradientTo);
    return grad;
  };

  const useWords = s.highlightWords && s.highlightWords.length > 0;
  const isLayered = s.style === 'layered';

  // Bei layered-Style: das Highlight-Wort kriegt eigenes Gradient + Scale + Drop-Shadow.
  // Demo-Text wenn keine highlightWords gesetzt: zeigt das Layered-Konzept generisch.
  if (isLayered && !useWords) {
    const demoBig = upper ? 'EPIC' : 'Epic';
    const demoSmall = upper ? 'MOMENT' : 'moment';
    drawLayeredDemo(ctx, w, y, demoBig, demoSmall, {
      fontFamily, baseColor: textColor, baseSizePx: sizePx, strokeW, strokeColor,
      highlightColor, highlightFontScale: s.highlightFontScale ?? 2.0,
      highlightUseGradient: s.highlightUseGradient ?? false,
      highlightGradientFrom: s.highlightGradientFrom,
      highlightGradientTo: s.highlightGradientTo,
      highlightDropShadow: (s.highlightDropShadow ?? 0) * (w / 540),
      highlightMetallic: s.highlightMetallic ?? false,
      highlightGlow: s.highlightGlow ?? false,
      highlightGlowColor: s.highlightGlowColor ?? '#ffffff',
      highlightGlowStrength: s.highlightGlowStrength ?? 0.6,
      canvasScale: w / 540,
      applyShadow, clearShadow, fillStyleFor, drawNeonGlow,
    });
  } else if (useWords) {
    drawWordHighlights(ctx, w, y, s.highlightWords!, {
      fontFamily, baseColor: textColor, baseSizePx: sizePx, strokeW, upper, highlightColor, strokeColor,
      isLayered,
      highlightFontScale: s.highlightFontScale ?? 1.4,
      highlightUseGradient: s.highlightUseGradient ?? false,
      highlightGradientFrom: s.highlightGradientFrom,
      highlightGradientTo: s.highlightGradientTo,
      highlightDropShadow: (s.highlightDropShadow ?? 0) * (w / 540),
      highlightMetallic: s.highlightMetallic ?? false,
      highlightGlow: s.highlightGlow ?? false,
      highlightGlowColor: s.highlightGlowColor ?? '#ffffff',
      highlightGlowStrength: s.highlightGlowStrength ?? 0.6,
      canvasScale: w / 540,
      applyShadow, clearShadow, fillStyleFor, drawNeonGlow,
    });
  } else {
    const text = upper ? 'SUBTITLE PREVIEW' : 'Subtitle preview';
    ctx.font = `900 ${sizePx}px ${fontFamily}`;
    // Drop-Shadow Pre-Pass auf FILL (positionierter weicher Schatten unter Text)
    if (hasDropShadow) {
      applyShadow();
      ctx.fillStyle = fillStyleFor(sizePx, textColor);
      ctx.fillText(text, w / 2, y);
      clearShadow();
    }
    // Neon-Glow Multi-Pass (text strahlt SELBST in glow-color)
    drawNeonGlow(text, w / 2, y);
    // Stroke nur wenn > 0
    if (strokeW > 0) {
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(text, w / 2, y);
    }
    // Final clean fill
    ctx.fillStyle = fillStyleFor(sizePx, textColor);
    ctx.fillText(text, w / 2, y);
  }
  clearShadow();
}

/** Layered-Demo wenn keine highlightWords gesetzt. Zeigt Big-Word über Small-Word. */
function drawLayeredDemo(
  ctx: CanvasRenderingContext2D,
  w: number, y: number,
  bigText: string, smallText: string,
  o: {
    fontFamily: string;
    baseColor: string;
    baseSizePx: number;
    strokeW: number;
    strokeColor: string;
    highlightColor: string;
    highlightFontScale: number;
    highlightUseGradient: boolean;
    highlightGradientFrom?: string;
    highlightGradientTo?: string;
    highlightDropShadow: number;
    highlightMetallic: boolean;
    highlightGlow: boolean;
    highlightGlowColor: string;
    highlightGlowStrength: number;
    canvasScale: number;
    applyShadow: () => void;
    clearShadow: () => void;
    fillStyleFor: (size: number, color: string) => string | CanvasGradient;
    drawNeonGlow: (text: string, x: number, y: number) => void;
  },
) {
  const smallSize = Math.round(o.baseSizePx);
  const bigSize = Math.round(o.baseSizePx * o.highlightFontScale);
  const yBig = y - smallSize / 4;
  const ySmall = yBig + bigSize * 0.42;

  drawHighlightBigWord(ctx, bigText, w / 2, yBig, bigSize, {
    fontFamily: o.fontFamily,
    strokeW: o.strokeW,
    strokeColor: o.strokeColor,
    highlightColor: o.highlightColor,
    highlightUseGradient: o.highlightUseGradient,
    highlightGradientFrom: o.highlightGradientFrom,
    highlightGradientTo: o.highlightGradientTo,
    highlightDropShadow: o.highlightDropShadow,
    highlightMetallic: o.highlightMetallic,
    highlightGlow: o.highlightGlow,
    highlightGlowColor: o.highlightGlowColor,
    highlightGlowStrength: o.highlightGlowStrength,
    canvasScale: o.canvasScale,
  });

  // SMALL word (Other words) mit normalem stroke + base color
  ctx.font = `700 ${smallSize}px ${o.fontFamily}`;
  const demoSw = o.strokeW * 0.8;
  // Drop-Shadow Pre-Pass auf FILL (positionierter weicher Schatten)
  o.applyShadow();
  ctx.fillStyle = o.fillStyleFor(smallSize, o.baseColor);
  ctx.fillText(smallText, w / 2, ySmall);
  o.clearShadow();
  // Neon-Glow Multi-Pass (text strahlt SELBST in glow-color)
  o.drawNeonGlow(smallText, w / 2, ySmall);
  if (demoSw > 0) {
    ctx.lineWidth = demoSw;
    ctx.strokeStyle = o.strokeColor;
    ctx.strokeText(smallText, w / 2, ySmall);
  }
  ctx.fillStyle = o.fillStyleFor(smallSize, o.baseColor);
  ctx.fillText(smallText, w / 2, ySmall);
}

/** Render das Big-Highlight-Word mit allen Effekten (gradient/metallic/glow/dropshadow/stroke). */
function drawHighlightBigWord(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, fontSize: number,
  o: {
    fontFamily: string;
    strokeW: number;
    strokeColor: string;
    highlightColor: string;
    highlightUseGradient: boolean;
    highlightGradientFrom?: string;
    highlightGradientTo?: string;
    highlightDropShadow: number;
    highlightMetallic: boolean;
    highlightGlow: boolean;
    highlightGlowColor: string;
    highlightGlowStrength: number;
    canvasScale: number;
  },
) {
  const top = y - fontSize / 2;
  const bot = y + fontSize / 2;

  // Highlight-Fill aufbauen (solid / gradient / metallic).
  // Metallic: 7-Stop hochkontrastig — sehr dunkler Body, scharfer heller Streak, zweite Reflexion.
  const highlightFill = (): string | CanvasGradient => {
    if (o.highlightMetallic) {
      const from = o.highlightGradientFrom ?? lighten(o.highlightColor, 0.35);
      const to   = o.highlightGradientTo   ?? darken(o.highlightColor, 0.45);
      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0.00, darken(from, 0.40));     // sehr dunkel oben
      grad.addColorStop(0.18, lighten(from, 0.55));    // scharfer heller Streak
      grad.addColorStop(0.32, lighten(from, 0.10));
      grad.addColorStop(0.48, darken(to, 0.10));        // dunkle Mitte (Body-Schatten)
      grad.addColorStop(0.66, lighten(to, 0.20));       // zweite Reflexion (untere Hälfte)
      grad.addColorStop(0.85, darken(to, 0.20));
      grad.addColorStop(1.00, darken(to, 0.55));        // ganz dunkel unten
      return grad;
    }
    if (!o.highlightUseGradient || !o.highlightGradientFrom || !o.highlightGradientTo) {
      return o.highlightColor;
    }
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, o.highlightGradientFrom);
    grad.addColorStop(1, o.highlightGradientTo);
    return grad;
  };

  ctx.font = `900 ${fontSize}px ${o.fontFamily}`;

  // Wenn nur Glow aktiv (kein Gradient/Metallic): Text-Fill = Glow-Color, sodass der
  // Text SELBST in der Glow-Farbe leuchtet (nicht nur ein Halo dahinter).
  const glowOnly = o.highlightGlow && !o.highlightMetallic && !o.highlightUseGradient;
  const effectiveFill = glowOnly ? o.highlightGlowColor : highlightFill();

  // Phase 1: Drop-Shadow (positionierter Schatten unter Buchstaben)
  if (o.highlightDropShadow > 0) {
    ctx.save();
    ctx.shadowColor = '#000000cc';
    ctx.shadowOffsetX = o.highlightDropShadow * 0.4;
    ctx.shadowOffsetY = o.highlightDropShadow;
    ctx.shadowBlur = o.highlightDropShadow * 0.5;
    ctx.fillStyle = '#000000';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Phase 2: Outer Glow-Halo (groß, weich, hinter dem Text)
  if (o.highlightGlow && o.highlightGlowStrength > 0) {
    ctx.save();
    const glowPx = Math.round(o.highlightGlowStrength * 60 * o.canvasScale);
    ctx.shadowBlur = glowPx;
    ctx.shadowColor = o.highlightGlowColor;
    ctx.fillStyle = o.highlightGlowColor;
    // Mehrere Pässe → exponentiell stärkerer Halo
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Phase 3: Stroke (Kontur) — nur wenn user-stroke > 0
  const bigStrokeW = o.strokeW * 1.4;
  if (bigStrokeW > 0) {
    ctx.lineWidth = bigStrokeW;
    ctx.strokeStyle = o.strokeColor;
    ctx.strokeText(text, x, y);
  }

  // Phase 4: Fill (entweder glow-color, gradient oder metallic) — der Text selbst
  ctx.fillStyle = effectiveFill;
  ctx.fillText(text, x, y);

  // Phase 5: Inner Glow nach Fill — mehrere kurze shadowBlur-Pässe für leuchtenden Effekt
  // ÜBER dem fill, sodass der Text wirklich strahlt (nicht nur halo dahinter).
  if (o.highlightGlow && o.highlightGlowStrength > 0) {
    ctx.save();
    const innerGlowPx = Math.round(o.highlightGlowStrength * 25 * o.canvasScale);
    ctx.shadowBlur = innerGlowPx;
    ctx.shadowColor = o.highlightGlowColor;
    ctx.fillStyle = effectiveFill;
    ctx.fillText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Phase 6: Metallic Top-Highlight als screen-blend Sheen (scharfer Glanz)
  if (o.highlightMetallic) {
    drawMetallicSheen(ctx, text, x, y, fontSize, o.fontFamily);
  }
}

/** Metallic-Sheen: scharfer heller Highlight-Streak im oberen Drittel + zweite Reflexion. */
function drawMetallicSheen(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, fontSize: number, fontFamily: string,
) {
  ctx.save();
  ctx.font = `900 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalCompositeOperation = 'screen';

  // Streak 1: scharfer heller Highlight im oberen Drittel
  const top = y - fontSize / 2;
  const grad1 = ctx.createLinearGradient(x, top, x, top + fontSize * 0.45);
  grad1.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad1.addColorStop(0.30, 'rgba(255,255,255,0.55)');
  grad1.addColorStop(0.45, 'rgba(255,255,255,0.95)');  // peak — schärfster Streak
  grad1.addColorStop(0.60, 'rgba(255,255,255,0.45)');
  grad1.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad1;
  ctx.fillText(text, x, y);

  // Streak 2: subtilere zweite Reflexion in der unteren Hälfte (sub-tle highlight)
  const grad2 = ctx.createLinearGradient(x, y + fontSize * 0.10, x, y + fontSize * 0.50);
  grad2.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad2.addColorStop(0.50, 'rgba(255,255,255,0.30)');
  grad2.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad2;
  ctx.fillText(text, x, y);

  ctx.restore();
}

/** Hex-Color heller machen (mix mit weiß bei amount 0..1). */
function lighten(hex: string, amount: number): string {
  const p = parseHexColor(hex);
  if (!p) return hex;
  const r = Math.min(255, Math.round(p.r + (255 - p.r) * amount));
  const g = Math.min(255, Math.round(p.g + (255 - p.g) * amount));
  const b = Math.min(255, Math.round(p.b + (255 - p.b) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Hex-Color dunkler machen (mix mit schwarz bei amount 0..1). */
function darken(hex: string, amount: number): string {
  const p = parseHexColor(hex);
  if (!p) return hex;
  const r = Math.max(0, Math.round(p.r * (1 - amount)));
  const g = Math.max(0, Math.round(p.g * (1 - amount)));
  const b = Math.max(0, Math.round(p.b * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(m)) {
    return {
      r: parseInt(m.substring(0, 2), 16),
      g: parseInt(m.substring(2, 4), 16),
      b: parseInt(m.substring(4, 6), 16),
    };
  }
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return {
      r: parseInt(m[0] + m[0], 16),
      g: parseInt(m[1] + m[1], 16),
      b: parseInt(m[2] + m[2], 16),
    };
  }
  return null;
}

function drawWordHighlights(
  ctx: CanvasRenderingContext2D,
  w: number, y: number,
  words: SubtitleHighlightWord[],
  o: {
    fontFamily: string;
    baseColor: string;
    baseSizePx: number;
    strokeW: number;
    upper: boolean;
    highlightColor: string;
    strokeColor: string;
    /** Wenn true: Highlight-Word kriegt eigenen Gradient/Scale/Drop-Shadow. */
    isLayered: boolean;
    highlightFontScale: number;
    highlightUseGradient: boolean;
    highlightGradientFrom?: string;
    highlightGradientTo?: string;
    highlightDropShadow: number;
    highlightMetallic: boolean;
    highlightGlow: boolean;
    highlightGlowColor: string;
    highlightGlowStrength: number;
    canvasScale: number;
    applyShadow: () => void;
    clearShadow: () => void;
    fillStyleFor: (size: number, color: string) => string | CanvasGradient;
    drawNeonGlow: (text: string, x: number, y: number) => void;
  },
) {
  const smallWords = words.filter((wd) => !wd.big);
  const bigWords   = words.filter((wd) =>  wd.big);
  const transform = (t: string) => o.upper ? t.toUpperCase() : t;

  const smallSize = Math.round(o.baseSizePx * 0.7);
  const bigSize = Math.round(o.baseSizePx * o.highlightFontScale);
  // Layered: small-word überlappend auf big-word (untere Hälfte). Sonst: getrennte Linien.
  const lineGap = Math.round(o.baseSizePx * 0.2);

  if (bigWords.length === 0) {
    ctx.font = `900 ${smallSize}px ${o.fontFamily}`;
    const text = smallWords.map((wd) => transform(wd.text)).join(' ');
    ctx.lineWidth = o.strokeW;
    ctx.strokeStyle = o.strokeColor;
    o.applyShadow();
    ctx.strokeText(text, w / 2, y);
    o.clearShadow();
    ctx.fillStyle = o.fillStyleFor(smallSize, o.baseColor);
    ctx.fillText(text, w / 2, y);
    return;
  }

  // Layout je nach Style:
  //   - layered: Big OBEN + Small UNTEN überlappend (a video sitzt auf bottom-half von UPLOAD)
  //   - sonst:   Small OBEN + Big UNTEN getrennt (klassisches highlight-pattern)
  let yBig: number;
  let ySmall: number;
  if (o.isLayered) {
    yBig = y - smallSize / 4;
    ySmall = yBig + bigSize * 0.42;
  } else {
    yBig = y + smallSize / 2 + lineGap;
    ySmall = y - bigSize / 2 - lineGap;
  }

  // Bei layered FIRST big word zeichnen (hinten) DANN small word (vorne überlappend)
  // Bei klassisch FIRST small word zeichnen (oben) DANN big word (unten)
  const drawSmall = () => {
    if (smallWords.length === 0) return;
    ctx.font = `700 ${smallSize}px ${o.fontFamily}`;
    const text = smallWords.map((wd) => transform(wd.text)).join(' ');
    const sw = o.strokeW * 0.7;
    // Drop-Shadow Pre-Pass auf FILL (positionierter weicher Schatten)
    o.applyShadow();
    ctx.fillStyle = o.fillStyleFor(smallSize, o.baseColor);
    ctx.fillText(text, w / 2, ySmall);
    o.clearShadow();
    // Neon-Glow Multi-Pass (text strahlt SELBST in glow-color)
    o.drawNeonGlow(text, w / 2, ySmall);
    // Stroke nur wenn > 0
    if (sw > 0) {
      ctx.lineWidth = sw;
      ctx.strokeStyle = o.strokeColor;
      ctx.strokeText(text, w / 2, ySmall);
    }
    // Final clean fill drüber
    ctx.fillStyle = o.fillStyleFor(smallSize, o.baseColor);
    ctx.fillText(text, w / 2, ySmall);
  };

  if (!o.isLayered) drawSmall();

  const bigText = bigWords.map((wd) => transform(wd.text)).join(' ');

  // Layered: kompletter Effekt-Stack (gradient/metallic/glow/dropshadow/stroke)
  if (o.isLayered) {
    drawHighlightBigWord(ctx, bigText, w / 2, yBig, bigSize, {
      fontFamily: o.fontFamily,
      strokeW: o.strokeW,
      strokeColor: o.strokeColor,
      highlightColor: o.highlightColor,
      highlightUseGradient: o.highlightUseGradient,
      highlightGradientFrom: o.highlightGradientFrom,
      highlightGradientTo: o.highlightGradientTo,
      highlightDropShadow: o.highlightDropShadow,
      highlightMetallic: o.highlightMetallic,
      highlightGlow: o.highlightGlow,
      highlightGlowColor: o.highlightGlowColor,
      highlightGlowStrength: o.highlightGlowStrength,
      canvasScale: o.canvasScale,
    });
    // Bei layered: small-word VORNE über big-word (überlappend)
    drawSmall();
    return;
  }

  // Klassisch (nicht layered): einfacher Fill mit highlightColor + applyShadow
  ctx.font = `900 ${bigSize}px ${o.fontFamily}`;
  const bigSw = o.strokeW * 1.2;
  // Drop-Shadow Pre-Pass auf FILL
  o.applyShadow();
  ctx.fillStyle = o.fillStyleFor(bigSize, o.highlightColor);
  ctx.fillText(bigText, w / 2, yBig);
  o.clearShadow();
  // Neon-Glow Multi-Pass (text strahlt SELBST in glow-color)
  o.drawNeonGlow(bigText, w / 2, yBig);
  if (bigSw > 0) {
    ctx.lineWidth = bigSw;
    ctx.strokeStyle = o.strokeColor;
    ctx.strokeText(bigText, w / 2, yBig);
  }
  ctx.fillStyle = o.fillStyleFor(bigSize, o.highlightColor);
  ctx.fillText(bigText, w / 2, yBig);
}

/* ─── Voice-Over Audio Sync ───────────────────────────────────
   Spielt ein einzelnes Voice-Over synchron zu videoRef.currentTime.
   Bei video-time >= vo.startSec → audio läuft (mit currentTime = video-time - startSec).
   Bei pause → audio pausiert.
*/
function VoiceOverAudio({
  voiceOver, videoRef, playing,
}: {
  voiceOver: ProjectVoiceOver;
  videoRef: React.RefObject<HTMLVideoElement>;
  playing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;

    audio.volume = Math.max(0, Math.min(1, voiceOver.volume ?? 1));

    let raf = 0;
    const tick = () => {
      const v = videoRef.current; const a = audioRef.current;
      if (!v || !a) { raf = requestAnimationFrame(tick); return; }
      const offset = v.currentTime - voiceOver.startSec;
      if (playing && offset >= 0 && offset < (a.duration || 1e9)) {
        // Sync: drift > 0.3s → seek
        if (Math.abs(a.currentTime - offset) > 0.3) a.currentTime = offset;
        if (a.paused) a.play().catch(() => {});
      } else {
        if (!a.paused) a.pause();
        if (offset < 0) a.currentTime = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [voiceOver.startSec, voiceOver.volume, playing, videoRef]);

  return (
    <audio
      ref={audioRef}
      src={mediaUrl(voiceOver.path)}
      preload="auto"
      className="hidden"
    />
  );
}

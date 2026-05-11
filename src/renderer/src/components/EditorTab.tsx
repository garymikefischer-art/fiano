import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { Project } from '@shared/types';
import { effectiveSegments } from '@shared/types';
import { mediaUrl } from '../lib/mediaUrl';
import * as sounds from '../lib/sounds';
import * as aiMask from '../lib/aiMask';
import { renderTextClipToPng } from '../lib/textClipCanvas';
import { LutVideoOverlay } from './LutVideoOverlay';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import { LockBadge } from './FeatureLock';

/* ════════════════════════════════════════════════════════════════
   EDITOR TAB — Multi-track timeline editor.
   - Top-Bar: Asset categories (Media/Audio/Text/Effects/...)
   - Left Sidebar: Asset grid for selected category, drag onto timeline
   - Center: Preview Player with playhead
   - Right Inspector: context-sensitive settings for selected clip
   - Bottom Timeline: multi-track, draggable/trimmable clips
   - Keyboard: S=split, Del=delete, Space=play/pause
   ════════════════════════════════════════════════════════════════ */

type AssetCategory = 'media' | 'audio' | 'tts' | 'text' | 'effects' | 'transitions' | 'filters';

function useEditorCategories(): Array<{ key: AssetCategory; label: string; icon: React.ReactNode }> {
  const t = useT();
  return [
    { key: 'media',       label: t('editor.catMedia'),       icon: <IconMedia /> },
    { key: 'audio',       label: t('editor.catAudio'),       icon: <IconAudio /> },
    { key: 'tts',         label: t('editor.catTts'),         icon: <IconTts /> },
    { key: 'text',        label: t('editor.catText'),        icon: <IconText /> },
    { key: 'effects',     label: t('editor.catEffects'),     icon: <IconEffects /> },
    { key: 'transitions', label: t('editor.catTransitions'), icon: <IconTransitions /> },
    { key: 'filters',     label: t('editor.catFilters'),     icon: <IconFilter /> },
  ];
}

type TrackKind = 'video' | 'audio' | 'overlay' | 'text' | 'effect';
type TransitionType = 'cross' | 'non-additive' | 'additive' | 'blur' | 'dip-to-color';
type TransitionEasing = 'linear' | 'ease-in' | 'ease-out';

type EffectId =
  | 'glitch' | 'shake' | 'glow' | 'zoom-pulse' | 'rgb-split'
  | 'combo-montage' | 'combo-hype' | 'combo-clean'
  | 'aura-purple' | 'light-burst' | 'speed-lines' | 'energy-trail'
  | 'motion-blur-low' | 'motion-blur-medium' | 'motion-blur-high';

/** CSS mix-blend-mode + FFmpeg-Mapping — alle Premier-Pro-typischen Modi. */
type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

const BLEND_MODES: Array<{ value: BlendMode; label: string }> = [
  { value: 'normal',      label: 'Normal' },
  { value: 'multiply',    label: 'Multiply' },
  { value: 'screen',      label: 'Screen' },
  { value: 'overlay',     label: 'Overlay' },
  { value: 'darken',      label: 'Darken' },
  { value: 'lighten',     label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn',  label: 'Color Burn' },
  { value: 'hard-light',  label: 'Hard Light' },
  { value: 'soft-light',  label: 'Soft Light' },
  { value: 'difference',  label: 'Difference' },
  { value: 'exclusion',   label: 'Exclusion' },
  { value: 'hue',         label: 'Hue' },
  { value: 'saturation',  label: 'Saturation' },
  { value: 'color',       label: 'Color' },
  { value: 'luminosity',  label: 'Luminosity' },
];

interface EffectInstance {
  id: EffectId;
  /** Sekunde innerhalb des Clips ab der der Effekt aktiv ist. Default 0 (Start). */
  startSec?: number;
  /** Dauer in Sekunden. Wenn nicht gesetzt: bis zum Clip-Ende. */
  duration?: number;
  /** 0..1, default 1. */
  intensity?: number;
}

/** Liefert Anzeigenamen + Farbe für Timeline-Pill pro Effect. */
const EFFECT_META: Record<EffectId, { label: string; color: string }> = {
  'glitch':        { label: 'Glitch',       color: '#a78bfa' },
  'shake':         { label: 'Shake',        color: '#f59e0b' },
  'glow':          { label: 'Glow',         color: '#fbbf24' },
  'zoom-pulse':    { label: 'Zoom',         color: '#34d399' },
  'rgb-split':     { label: 'RGB',          color: '#ec4899' },
  'combo-montage': { label: 'Montage',      color: '#ff1039' },
  'combo-hype':    { label: 'Hype',         color: '#ff1039' },
  'combo-clean':   { label: 'Clean',        color: '#ff1039' },
  'aura-purple':   { label: 'Aura',         color: '#c084fc' },
  'light-burst':   { label: 'Burst',        color: '#fde047' },
  'speed-lines':   { label: 'Speed',        color: '#60a5fa' },
  'energy-trail':  { label: 'Trail',        color: '#22d3ee' },
  // Motion-Blur sticht hervor (Orange) damit User sieht: aktiv, aber NUR im Export sichtbar.
  // Live-Preview kann keinen temporalen Motion-Blur — daher wirkt der Clip in der Preview "normal".
  'motion-blur-low':    { label: 'Blur L · Export',    color: '#fb923c' },
  'motion-blur-medium': { label: 'Blur M · Export',    color: '#f97316' },
  'motion-blur-high':   { label: 'Blur H · Export',    color: '#ea580c' },
};

const TRANSITION_LABELS: Record<TransitionType, string> = {
  'cross':         'Cross Dissolve',
  'non-additive':  'Non-Additive Dissolve',
  'additive':      'Additive Dissolve',
  'blur':          'Blur Dissolve',
  'dip-to-color':  'Dip To Color',
};

/** Browser-Playback nutzt previewSrc wenn vorhanden (transcoded MP4), sonst Original. */
const playbackSrc = (c: { src?: string; previewSrc?: string }): string | undefined =>
  c.previewSrc ?? c.src;

/** Liefert die effects-Liste eines Clips — legacy `effects[]`/`effect` für backwards-compat. */
function clipEffects(c: TimelineClip): EffectInstance[] {
  if (c.effects && c.effects.length > 0) return c.effects;
  if (c.effect) return [{ id: c.effect, intensity: c.effectIntensity ?? 1 }];
  return [];
}

/** Filtert effects die am gegebenen lokalen Playhead aktiv sind. */
function activeEffectsAt(c: TimelineClip, localTime: number): EffectInstance[] {
  return clipEffects(c).filter((e) => {
    const start = e.startSec ?? 0;
    const dur = e.duration ?? c.duration;
    return localTime >= start && localTime < start + dur;
  });
}

/** Sammelt alle Effect-Clips die am globalen Playhead aktiv sind (vom Effects-Track). */
function activeEffectClipsAtPlayhead(
  clips: TimelineClip[], tracks: Track[], playhead: number,
): EffectInstance[] {
  return clips
    .filter((c) =>
      c.type === 'effect' &&
      c.effectId &&
      playhead >= c.start &&
      playhead < c.start + c.duration &&
      !tracks[c.trackIdx]?.hidden,
    )
    .map((c) => ({ id: c.effectId!, intensity: c.effectIntensity ?? 1 }));
}

/** Kombiniert CSS-Filter aller aktiven effects zu einem String (additive concat). */
function combinedEffectsCssFilter(effects: EffectInstance[]): string {
  return effects.map((e) => effectCssFilter(e.id, e.intensity ?? 1)).filter(Boolean).join(' ');
}

/** CSS-Filter-Approximation für Live-Preview. Saturation deutlich dezenter (0.05-0.15
 *  statt 0.3-0.5) — User-Feedback. Glitch nutzt jetzt clip-path-Animation für echtes
 *  digital-glitch-feel. */
function effectCssFilter(effect: EffectId | undefined, intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity));
  switch (effect) {
    case 'glitch':       return `contrast(${1 + 0.15 * i}) saturate(${1 + 0.05 * i})`;
    case 'shake':        return `contrast(${1 + 0.05 * i})`;
    case 'glow':         return `brightness(${1 + 0.12 * i}) saturate(${1 + 0.05 * i})`;
    case 'zoom-pulse':   return `contrast(${1 + 0.05 * i})`;
    case 'rgb-split':    return `contrast(${1 + 0.1 * i}) saturate(${1 + 0.1 * i})`;
    case 'combo-montage': return `brightness(${1 + 0.08 * i}) saturate(${1 + 0.1 * i})`;
    case 'combo-hype':   return `saturate(${1 + 0.15 * i}) contrast(${1 + 0.1 * i})`;
    case 'combo-clean':  return `brightness(${1 + 0.06 * i})`;
    // Magic / Anime-Style Effects
    case 'aura-purple':  return `brightness(${1 + 0.08 * i}) hue-rotate(${i * 15}deg)`;
    case 'light-burst':  return `brightness(${1 + 0.2 * i}) contrast(${1 + 0.1 * i})`;
    case 'speed-lines':  return `contrast(${1 + 0.1 * i})`;
    case 'energy-trail': return `saturate(${1 + 0.08 * i})`;  // Sehr dezent, gradient macht Hauptarbeit
    // Motion-Blur ist temporal — kein echter Live-Preview im Browser möglich.
    // Im Export wirkt tmix richtig. Hier nur ein kleiner saturation-tweak als Indikator.
    case 'motion-blur-low':
    case 'motion-blur-medium':
    case 'motion-blur-high':
      return '';
    default:             return '';
  }
}

/** CSS-Filter-Approximation für Color-Grading-Filter-Presets. */
function filterCssFilter(filter: TimelineClip['filter']): string {
  switch (filter) {
    case 'vivid':   return 'saturate(1.35) contrast(1.18) brightness(1.04)';
    case 'gaming':  return 'saturate(1.45) contrast(1.32) brightness(0.98)';
    case 'bw':      return 'saturate(0) contrast(1.1)';
    case 'cinema':  return 'contrast(1.15) brightness(0.95) saturate(0.85) sepia(0.05)';
    case 'warm':    return 'saturate(1.15) sepia(0.18) hue-rotate(-5deg)';
    case 'cool':    return 'saturate(1.05) hue-rotate(180deg) brightness(0.98)';
    default:        return '';
  }
}

/** Animation-CSS für Effects. Shake/Zoom laufen nur EINMAL (forwards). Combos
 *  kombinieren mehrere Animations parallel via comma-separated string. */
function effectAnimation(effect: EffectId | undefined): string {
  switch (effect) {
    case 'shake':
    case 'combo-hype':
      return 'fiano-shake 0.45s ease-out 1 forwards';
    case 'zoom-pulse':
    case 'combo-clean':
      return 'fiano-zoom-pulse 1.4s ease-in-out 1 forwards';
    case 'combo-montage':
      // Glow + Shake + Zoom-Pulse INFINITE während Effect aktiv ist (sichtbarer)
      return 'fiano-zoom-pulse 1.4s ease-in-out infinite, fiano-shake 0.6s ease-in-out infinite';
    case 'light-burst':
      return 'fiano-zoom-pulse 0.8s ease-out 1 forwards';
    case 'energy-trail':
      return 'fiano-shake 0.6s ease-out 1 forwards';
    // Stil-Effekte laufen kontinuierlich (Dauer-Look)
    case 'glitch':
      return 'fiano-glitch-jump 0.7s steps(8) infinite';
    case 'rgb-split':
      return 'fiano-rgb-split 0.4s steps(2) infinite';
    default:
      return '';
  }
}

/** Manche Effects ändern die Video-Playback-Geschwindigkeit (Slow-Motion etc.).
 *  Wird im CenterPreview auf videoElement.playbackRate angewandt wenn aktiv. */
function effectPlaybackRate(effect: EffectId | undefined): number | undefined {
  if (effect === 'combo-montage') return 0.5;  // Slow-Mo Drop für Montage-Look
  return undefined;
}

/** Render einen Text-Clip als Overlay. Kann simple oder layered Style.
 *  Bei layered: big-word + small-word überlappend mit gradient/metallic/glow. */
function TextOverlay({ clip }: { clip: TimelineClip }) {
  const c: any = clip;
  if (c.textStyle === 'layered') {
    return (
      <div className="absolute pointer-events-none z-10" style={layeredOuterStyle(c)}>
        <LayeredTextDom clip={c} />
      </div>
    );
  }
  return (
    <div
      className="absolute pointer-events-none z-10"
      style={textOverlayStyle(c)}
    >
      {c.text ?? c.label}
    </div>
  );
}

/** Outer-Position für Layered (kein font-size hier — children übernehmen). */
function layeredOuterStyle(c: any): React.CSSProperties {
  return {
    left: `${50 + (c.posX ?? 0) * 40}%`,
    top:  `${50 + (c.posY ?? 0) * 40}%`,
    transform: `translate(-50%, -50%) rotate(${c.rotation ?? 0}deg)`,
    opacity: c.opacity ?? 1,
    fontFamily: c.textFont ?? '"Arial Black", system-ui, sans-serif',
    color: c.textColor ?? '#ffffff',
  };
}

/** Layered DOM render: big highlight word + optional small word (überlappend). */
function LayeredTextDom({ clip: c }: { clip: any }) {
  const baseSize = c.textSize ?? Math.round(24 * (c.scale ?? 1));
  const scale = c.textLayeredScale ?? 2.0;
  const bigSize = Math.round(baseSize * scale);
  const small = c.textLayeredSecond ?? '';
  const bigText = c.text ?? 'EPIC';

  // Highlight-Fill: solid / gradient / metallic
  const buildBigFill = (): string => {
    if (c.textLayeredMetallic) {
      const from = c.textLayeredGradientFrom ?? '#ffffff';
      const to   = c.textLayeredGradientTo   ?? '#7a7a7a';
      // 7-Stop für scharfen Glanz wie Canvas-Version
      return `linear-gradient(180deg,
        ${darkenHex(from, 0.4)} 0%,
        ${lightenHex(from, 0.55)} 18%,
        ${lightenHex(from, 0.10)} 32%,
        ${darkenHex(to, 0.10)} 48%,
        ${lightenHex(to, 0.20)} 66%,
        ${darkenHex(to, 0.20)} 85%,
        ${darkenHex(to, 0.55)} 100%)`;
    }
    if (c.textLayeredUseGradient && c.textLayeredGradientFrom && c.textLayeredGradientTo) {
      return `linear-gradient(180deg, ${c.textLayeredGradientFrom} 0%, ${c.textLayeredGradientTo} 100%)`;
    }
    return c.textColor ?? '#ff1039';
  };

  const bigFill = buildBigFill();
  const isGradient = bigFill.startsWith('linear-gradient');
  // Glow-only: Text selbst leuchtet in glow-color (kein gradient/metallic dahinter)
  const glowOnly = c.textLayeredGlow && !c.textLayeredMetallic && !c.textLayeredUseGradient;
  const glowColor = c.textLayeredGlowColor ?? '#ffffff';
  const effectiveSolidFill = glowOnly ? glowColor : (isGradient ? null : bigFill);

  // Glow as text-shadow stack — mehrfache Layer (3 sizes) für intensiven Halo
  const glowShadow = (() => {
    if (!c.textLayeredGlow) return '';
    const strength = c.textLayeredGlowStrength ?? 0.6;
    const blur = Math.round(strength * 50);
    return [
      `0 0 ${blur}px ${glowColor}`,
      `0 0 ${blur * 0.6}px ${glowColor}`,
      `0 0 ${blur * 0.3}px ${glowColor}`,
      `0 0 ${blur * 1.5}px ${glowColor}`,
    ].join(', ');
  })();

  const dropShadow = c.textLayeredDropShadow > 0
    ? `${(c.textLayeredDropShadow * 0.4).toFixed(0)}px ${c.textLayeredDropShadow}px ${(c.textLayeredDropShadow * 0.5).toFixed(0)}px rgba(0,0,0,0.8)`
    : '';

  const combinedShadow = [glowShadow, dropShadow].filter(Boolean).join(', ');

  const bigStyle: React.CSSProperties = {
    fontSize: `${bigSize}px`,
    fontWeight: 900,
    lineHeight: 0.95,
    textAlign: 'center',
    WebkitTextStroke: '2px #000',
    ...(isGradient ? {
      background: bigFill,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      // Bei gradient-text muss text-shadow via filter:drop-shadow nachempfunden werden
      filter: [
        dropShadow ? `drop-shadow(${dropShadow})` : '',
        c.textLayeredGlow ? `drop-shadow(0 0 ${Math.round((c.textLayeredGlowStrength ?? 0.6) * 20)}px ${glowColor}) drop-shadow(0 0 ${Math.round((c.textLayeredGlowStrength ?? 0.6) * 40)}px ${glowColor})` : '',
      ].filter(Boolean).join(' ') || 'none',
    } : {
      color: effectiveSolidFill ?? '#ffffff',
      textShadow: combinedShadow || 'none',
    }),
  };
  const smallStyle: React.CSSProperties = {
    fontSize: `${baseSize}px`,
    fontWeight: 700,
    lineHeight: 0.9,
    textAlign: 'center',
    color: '#ffffff',
    WebkitTextStroke: '1.5px #000',
    textShadow: '0 2px 8px rgba(0,0,0,0.7)',
    marginTop: `-${bigSize * 0.42}px`,  // überlappt unteren Teil von big
    position: 'relative',
    zIndex: 1,
  };

  return (
    <div className="flex flex-col items-center" style={{ whiteSpace: 'nowrap' }}>
      <div style={bigStyle}>{bigText}</div>
      {small && <div style={smallStyle}>{small}</div>}
    </div>
  );
}

/** Hex-helpers — DOM-Layered braucht's auch im Editor. */
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

/** Baut das CSS-Style-Object für Text-Overlay-Preview aus den TimelineClip-Text-Style-Feldern. */
function textOverlayStyle(c: any): React.CSSProperties {
  const fontSize = c.textSize ?? Math.round(24 * (c.scale ?? 1));
  const hex = (h: string | undefined, alpha: number = 1): string => {
    if (!h) return `rgba(0,0,0,${alpha})`;
    const m = h.replace('#', '');
    if (m.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };
  const shadows: string[] = [];
  if (c.textGlowColor && c.textGlowBlur) {
    shadows.push(`0 0 ${c.textGlowBlur}px ${c.textGlowColor}`);
  }
  if (c.textShadowColor) {
    shadows.push(`${c.textShadowOffsetX ?? 0}px ${c.textShadowOffsetY ?? 0}px ${c.textShadowBlur ?? 0}px ${c.textShadowColor}`);
  }
  if (shadows.length === 0) shadows.push('0 2px 8px rgba(0,0,0,0.8)'); // legacy fallback
  return {
    left: `${50 + (c.posX ?? 0) * 40}%`,
    top:  `${50 + (c.posY ?? 0) * 40}%`,
    transform: `translate(-50%, -50%) rotate(${c.rotation ?? 0}deg)`,
    fontFamily: c.textFont ?? 'Inter, system-ui, sans-serif',
    fontSize: `${fontSize}px`,
    fontWeight: c.textWeight === '900' ? 900 : c.textWeight === 'bold' ? 700 : (c.textWeight === 'normal' ? 400 : 700),
    fontStyle: c.textItalic ? 'italic' : 'normal',
    color: c.textColor ?? '#ffffff',
    background: c.textBgColor ? hex(c.textBgColor, c.textBgOpacity ?? 0.7) : 'transparent',
    padding: c.textBgColor ? '0.2em 0.5em' : 0,
    borderRadius: c.textBgColor ? '0.2em' : 0,
    textShadow: shadows.join(', '),
    opacity: c.opacity ?? 1,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  };
}

/** Konvertiert Mask-Daten (sigmoid 0..1) zu Grayscale-PNG-base64 für FFmpeg alphamerge.
    Binary threshold @ 0.5: White = keep subject, Black = remove. KEIN soft-edge —
    sonst werden Edge-Pixel halb-transparent und zeigen Green-Bleed im Export. */
function maskToPngBase64(mask: { width: number; height: number; data: number[] }): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const img = ctx.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      const lum = mask.data[i] > 0.5 ? 255 : 0;  // binary
      img.data[i * 4 + 0] = lum;
      img.data[i * 4 + 1] = lum;
      img.data[i * 4 + 2] = lum;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  } catch (e) {
    console.warn('[ai-mask] PNG encode failed:', e);
    return undefined;
  }
}

interface TimelineClip {
  id: string;
  trackIdx: number;
  start: number;
  duration: number;
  src?: string;
  /** Browser-kompatibler Preview-Pfad (z.B. transcoded MP4 für ProRes/HEVC). FFmpeg-Export nutzt weiter `src`. */
  previewSrc?: string;
  /** Während Background-Transcode läuft → CenterPreview zeigt Spinner statt "Codec not supported". */
  transcoding?: boolean;
  /** Source-Duration in Sekunden (gesetzt nach onLoadedMetadata). Für Trim-Cap. */
  srcDuration?: number;
  /** Phase 2.5: Fade-In/Out-Duration (Sekunden). Wirkt im Export via FFmpeg fade-filter. */
  fadeInDuration?: number;
  fadeOutDuration?: number;
  /** Phase 2.5+: Transition INTO this clip from previous adjacent clip on same track. */
  transitionType?: TransitionType;
  transitionDuration?: number;     // Sekunden, default 0.5
  transitionEasing?: TransitionEasing;
  transitionColor?: string;         // hex, nur für dip-to-color
  trimStart?: number;
  type: TrackKind;
  label: string;
  color?: string;
  text?: string;
  posX?: number;
  posY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  // Greenscreen / Chroma-Key (Inspector, FFmpeg-render)
  chromaEnabled?: boolean;
  chromaColor?: string;     // hex
  chromaTolerance?: number; // 0..1
  /** Bildstabilisator (FFmpeg vidstab). 2-Pass Pre-Process beim Export.
   *  Live-Preview unverändert (kein realtime stabilize möglich). */
  stabilizeEnabled?: boolean;
  stabilizeSmoothness?: number;  // 5..30 (default 10 = mild, 25 = stark)
  // Color Adjustments (-1..+1, 0 = no change)
  brightness?: number;
  contrast?: number;
  saturation?: number;
  // AI Subject Mask via SAM ONNX
  aiMaskEnabled?: boolean;
  /** Click-Points im Frame (0..1 normalized). label=1 → include, label=0 → exclude. */
  aiMaskPoints?: Array<{ x: number; y: number; label: 0 | 1 }>;
  /** Static-Mask: einzelner Snapshot wird auf alle Frames angewandt. */
  aiMaskData?: { width: number; height: number; data: number[] };
  /** Tracked-Masks: per-Frame Mask-Daten (Zeitstempel relativ zum Clip-Start in Sekunden). */
  aiMaskFrames?: Array<{ time: number; mask: { width: number; height: number; data: number[] } }>;
  /** Sampling-FPS für Tracking (1-10). Höher = smoother aber langsamer. */
  aiMaskTrackFps?: number;
  // ─── TTS (AI Text-to-Speech) ──────────────────────────────
  /** Wenn vorhanden: dieser Clip wurde via TTS generiert — Text + Voice für Re-Edit. */
  ttsText?: string;
  ttsVoice?: string;
  // ─── Blend Mode (CSS mix-blend-mode + FFmpeg blend-filter) ──
  /** Premier-Pro-Style Blend-Modes. Default 'normal' (kein Blend). */
  blendMode?: BlendMode;
  // ─── Effects ─────────────────────────────────────────────
  /** Bei type='effect': welcher Effect-Preset auf diesem Effect-Clip. */
  effectId?: EffectId;
  /** Effect-Stärke 0..1 (default 1). */
  effectIntensity?: number;
  /** @deprecated single-effect legacy */
  effect?: EffectId;
  /** @deprecated multi-array auf video-clips legacy */
  effects?: EffectInstance[];
  // ─── Filter (Color-Grading-Presets oder Custom-LUT) ────────
  /** Filter-Preset-ID. */
  filter?: 'vivid' | 'gaming' | 'bw' | 'cinema' | 'warm' | 'cool';
  /** Pfad zu einem User-uploaded LUT-File (.cube). Überschreibt filter wenn gesetzt. */
  lutPath?: string;
  // ─── Text-Clip Styling (nur bei type='text') ────────────────
  textFont?: string;       // CSS font-family (z.B. 'Inter', 'Arial Black', oder System-Font)
  textSize?: number;       // px
  textColor?: string;      // hex
  textBgColor?: string;    // hex (transparent wenn leer)
  textBgOpacity?: number;  // 0..1
  textGlowColor?: string;  // hex
  textGlowBlur?: number;   // px
  textShadowColor?: string;
  textShadowOffsetX?: number;
  textShadowOffsetY?: number;
  textShadowBlur?: number;
  textWeight?: 'normal' | 'bold' | '700' | '900';
  textItalic?: boolean;
  // Layered-Style (analog Subtitle-Layered): big highlight word + optional small word überlappend.
  textStyle?: 'simple' | 'layered';
  textLayeredSecond?: string;     // Small-Word unter/über big text (z.B. "moment" wenn big = "EPIC")
  textLayeredScale?: number;      // 1..3 (Big-Wort relativ zur Base size)
  textLayeredUseGradient?: boolean;
  textLayeredGradientFrom?: string;
  textLayeredGradientTo?: string;
  textLayeredMetallic?: boolean;
  textLayeredGlow?: boolean;
  textLayeredGlowColor?: string;
  textLayeredGlowStrength?: number;   // 0..1
  textLayeredDropShadow?: number;     // 0..40 px
}

interface UserAsset {
  id: string;
  kind: TrackKind;
  label: string;
  src: string;
  /** Browser-Preview-Pfad (transcoded MP4). Bleibt undefined während Transcode läuft. */
  previewSrc?: string;
  transcoding?: boolean;
}

interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  /** Phase 9.3: Encoder-Mode pro Export — 'fast' = Hardware, 'quality' = Software/libx264. */
  qualityMode?: 'fast' | 'quality';
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  width: 1920, height: 1080, fps: 30, bitrate: '30M', qualityMode: 'fast',
};

const RESOLUTION_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '4K (3840×2160)',     w: 3840, h: 2160 },
  { label: '1440p (2560×1440)',  w: 2560, h: 1440 },
  { label: '1080p (1920×1080)',  w: 1920, h: 1080 },
  { label: '720p (1280×720)',    w: 1280, h: 720 },
  { label: '480p (854×480)',     w: 854,  h: 480 },
];

const FPS_PRESETS = [24, 30, 60];
const BITRATE_PRESETS = [
  { label: 'Lossless (50 Mbps)',   value: '50M' },
  { label: 'Maximum (30 Mbps)',    value: '30M' },
  { label: 'High (20 Mbps)',       value: '20M' },
  { label: 'Standard (15 Mbps)',   value: '15M' },
  { label: 'Compressed (10 Mbps)', value: '10M' },
  // Phase 9.3: Creator-Optionen (≤5 Mbps = kein Pro-Lock)
  { label: 'Eco (5 Mbps)',         value: '5M' },
  { label: 'Mobile (3 Mbps)',      value: '3M' },
];

interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  height: number;  // px
  muted?: boolean;
  hidden?: boolean;
}

let clipIdCtr = 0;
const newClipId = () => `c-${Date.now()}-${++clipIdCtr}`;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

/* ─── Main Component ─────────────────────────────────────────── */

export function EditorTab({ project }: { project: Project }) {
  const [exporting, setExporting] = useState(false);
  const lutFeature = useFeature('lut_filters');
  const openUpgrade = useUpgradeModal((s) => s.open);

  // Initial Tracks — drei Spuren: Video, Overlay, Audio
  const [tracks, setTracks] = useState<Track[]>([
    { id: 't-video',   kind: 'video',   name: 'Video',   height: 56 },
    { id: 't-overlay', kind: 'overlay', name: 'Overlay', height: 44 },
    { id: 't-audio',   kind: 'audio',   name: 'Audio',   height: 36 },
    // Effect-Track für mehrere stapelbare effect-clips (drag/resize)
    { id: 't-effect',  kind: 'effect',  name: 'Effects', height: 32 },
    // Text-Track ist im UI „oben" (höchster Index = top in reversed render-order)
    { id: 't-text',    kind: 'text',    name: 'Text',    height: 32 },
  ]);

  // Initial Clips: project.highlights als Video-Track-Clips
  const initialClips = useMemo<TimelineClip[]>(() => {
    let cursor = 0;
    return project.highlights
      .filter((h) => !!h.clipPath)
      .map((h) => {
        const dur = effectiveSegments(h).reduce((a, s) => a + (s.end - s.start), 0);
        const segStart = effectiveSegments(h)[0]?.start ?? 0;
        const c: TimelineClip = {
          id: newClipId(),
          trackIdx: 0,
          start: cursor,
          duration: Math.max(0.5, dur),
          src: h.clipPath,
          trimStart: segStart,
          type: 'video',
          label: (h.reason ?? 'clip').slice(0, 24),
          scale: 1,
          posX: 0,
          posY: 0,
          rotation: 0,
          volume: 1,
          // Upfront-Spinner: verhindert dass Video-Element erstmal HEVC src probiert
          // und "Codec not supported" zeigt bevor Revalidate cache check fertig ist.
          transcoding: !!h.clipPath,
        };
        cursor += c.duration;
        return c;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const [clips, setClips] = useState<TimelineClip[]>(initialClips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('media');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'video' | 'audio' | 'speed' | 'animation' | 'adjust'>('video');
  const [userImports, setUserImports] = useState<UserAsset[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  // Initialer Export-Default kommt aus appDefaults.editorExport (in Settings änderbar).
  // Saved-state pro Project überschreibt das später (siehe state-load).
  // Phase 9.3: qualityMode aus appDefaults — Encoder-Picker zeigt aktiven Default-Wert.
  const editorExportDefaults = useApp((s) => s.appDefaults.editorExport);
  const defaultQualityMode = useApp((s) => s.appDefaults.qualityMode ?? 'fast');
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    ...DEFAULT_EXPORT_SETTINGS,
    ...(editorExportDefaults ?? {}),
    qualityMode: defaultQualityMode,
  });
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showTtsModal, setShowTtsModal] = useState(false);
  /** Wenn gesetzt: TTS-Modal ist im Edit-Modus für diesen Clip (replace anstatt add). */
  const [editingTtsClipId, setEditingTtsClipId] = useState<string | null>(null);
  const [showTextDialog, setShowTextDialog] = useState(false);
  /** Wenn gesetzt: Text-Dialog ist im Edit-Modus für diesen Clip (replace anstatt add). */
  const [editingTextClipId, setEditingTextClipId] = useState<string | null>(null);
  /** Snapshot des Original-Clips beim Edit-Begin — für Cancel-Rollback nach Live-Edits. */
  const editingTextClipOriginalRef = useRef<TimelineClip | null>(null);
  /** User-hochgeladene LUT-Files (.cube etc.) — werden in Filters-Tab als Assets gezeigt. */
  const [userLuts, setUserLuts] = useState<Array<{ id: string; kind: TrackKind; label: string; src: string }>>([]);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);

  /* ─── Drag-to-resize (vertikal=Timeline, horizontal=Sidebars) ── */
  const startDrag = (
    axis: 'y' | 'x',
    startVal: number,
    apply: (next: number) => void,
    min: number,
    max: number,
    direction: 1 | -1 = 1, // +1 = vergrößern wenn man "nach hinten" zieht (links→rechts oder oben→unten)
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startCoord = axis === 'y' ? e.clientY : e.clientX;
    const cursor = axis === 'y' ? 'row-resize' : 'col-resize';
    const onMove = (ev: MouseEvent) => {
      const cur = axis === 'y' ? ev.clientY : ev.clientX;
      const delta = (cur - startCoord) * direction;
      const next = Math.max(min, Math.min(max, startVal + delta));
      apply(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onTimelineResize = startDrag('y', timelineHeight, setTimelineHeight, 180, Math.round(window.innerHeight * 0.7), -1);
  const onLeftResize     = startDrag('x', leftWidth,      setLeftWidth,      200, 500, +1);
  const onRightResize    = startDrag('x', rightWidth,     setRightWidth,     240, 520, -1);

  /* ─── Persistence: Editor-State pro Project laden + speichern ── */
  const [stateLoaded, setStateLoaded] = useState(false);
  const [saveRequested, setSaveRequested] = useState(0);  // increment → immediate save (skip debounce)

  // Load on mount / Project-Switch
  useEffect(() => {
    let cancelled = false;
    setStateLoaded(false);
    (async () => {
      const r = await window.api.invoke<{ state: any }>('editor.loadState', { projectId: project.id });
      if (cancelled) return;
      const s = r.ok ? r.data?.state : null;
      let loadedClips: TimelineClip[] = [];
      if (s && typeof s === 'object') {
        // ALL clips bekommen frisch transcoding=true UND previewSrc=undefined → revalidate
        // Single source of truth = aktuelles Backend (cache or fresh transcode).
        // Verhindert "stale previewSrc → fs.exists OK aber Datei doch defekt"-Bugs.
        if (Array.isArray(s.clips)) {
          // transcoding=true upfront damit User nicht "Codec not supported" sieht während
          // fs.exists check läuft. Wird unten geclear sobald cache valid ist (~50ms).
          const cleaned = s.clips.map((c: TimelineClip) => ({
            ...c,
            transcoding: !!c.src,
          }));
          setClips(cleaned);
          loadedClips = cleaned;
        }
        if (Array.isArray(s.tracks))  setTracks(s.tracks);
        if (Array.isArray(s.userImports)) setUserImports(s.userImports.map((a: UserAsset) => ({ ...a, transcoding: false })));
        if (Array.isArray(s.userLuts)) setUserLuts(s.userLuts);
        if (s.exportSettings)         setExportSettings(s.exportSettings);
        if (typeof s.pxPerSec === 'number') setPxPerSec(s.pxPerSec);
        if (typeof s.snapEnabled === 'boolean') setSnapEnabled(s.snapEnabled);
        if (typeof s.timelineHeight === 'number') setTimelineHeight(s.timelineHeight);
        if (typeof s.leftWidth === 'number') setLeftWidth(s.leftWidth);
        if (typeof s.rightWidth === 'number') setRightWidth(s.rightWidth);
        console.log(`[editor] state loaded for project ${project.id} (${s.clips?.length ?? 0} clips)`);
      }
      setStateLoaded(true);

      // Wenn kein saved state → initialClips nutzen (fresh project) und transcoding=true
      // upfront damit user Spinner statt "Codec not supported" sieht
      let clipsForRevalidate: TimelineClip[] = loadedClips;
      if (clipsForRevalidate.length === 0 && initialClips.length > 0) {
        clipsForRevalidate = initialClips.map((c) => ({ ...c, transcoding: !!c.src }));
        setClips(clipsForRevalidate);
      }

      // Revalidate ALLE unique srcs — transcodeForPreview ist idempotent (cache-hit ~50ms).
      // Keine fs.exists-Optimierung weil sie zu Codec-Error-Flash führte vor dem Check.
      const uniqueSrcs = Array.from(new Set(clipsForRevalidate.map((c) => c.src).filter(Boolean) as string[]));
      if (uniqueSrcs.length === 0 || cancelled) {
        if (!cancelled) setSaveRequested((n) => n + 1);
        return;
      }
      console.log(`[editor] revalidating ${uniqueSrcs.length} sources...`);

      await Promise.all(uniqueSrcs.map(async (src) => {
        try {
          const res = await window.api.invoke<{ previewPath: string; fromCache: boolean; transcoded: boolean }>(
            'media.transcodeForPreview',
            { path: src },
          );
          if (cancelled) return;
          if (!res.ok) {
            console.warn(`[editor] revalidate failed for ${src.split('/').pop()}:`, res.error);
            setClips((prev) => prev.map((c) => c.src === src ? { ...c, transcoding: false } : c));
            return;
          }
          const previewPath = res.data?.previewPath ?? src;
          setClips((prev) => prev.map((c) =>
            c.src === src ? { ...c, previewSrc: previewPath, transcoding: false } : c,
          ));
          setUserImports((prev) => prev.map((a) =>
            a.src === src ? { ...a, previewSrc: previewPath, transcoding: false } : a,
          ));
        } catch (err) {
          console.warn(`[editor] revalidate ${src.split('/').pop()} threw:`, err);
          if (!cancelled) {
            setClips((prev) => prev.map((c) => c.src === src ? { ...c, transcoding: false } : c));
          }
        }
      }));

      if (!cancelled) {
        console.log(`[editor] revalidate done — forcing save`);
        setSaveRequested((n) => n + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  // Debounced save (300ms) bei state-Änderungen — saveRequested → 0ms (immediate)
  useEffect(() => {
    if (!stateLoaded) return; // nicht während initial-load speichern
    const debounceMs = saveRequested > 0 ? 0 : 300;
    const t = setTimeout(() => {
      window.api.invoke('editor.saveState', {
        projectId: project.id,
        state: {
          version: 1,
          clips, tracks, userImports, userLuts, exportSettings,
          pxPerSec, snapEnabled, timelineHeight, leftWidth, rightWidth,
          savedAt: Date.now(),
        },
      }).catch((e) => console.warn('[editor] save failed:', e));
    }, debounceMs);
    return () => clearTimeout(t);
  }, [stateLoaded, saveRequested, clips, tracks, userImports, userLuts, exportSettings, pxPerSec, snapEnabled, timelineHeight, leftWidth, rightWidth, project.id]);

  /* ─── Add new track (User klickt "+ Track") ────────────── */
  const addTrack = (kind: TrackKind) => {
    pushSnapshot();
    const heightFor: Record<TrackKind, number> = { video: 56, overlay: 44, audio: 36, text: 36, effect: 32 };
    const count = tracks.filter((t) => t.kind === kind).length + 1;
    setTracks((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, kind, name: `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${count}`, height: heightFor[kind] },
    ]);
  };
  const removeTrack = (idx: number) => {
    if (tracks.length <= 1) return;
    pushSnapshot();
    setTracks((prev) => prev.filter((_, i) => i !== idx));
    setClips((prev) => prev
      .filter((c) => c.trackIdx !== idx)
      .map((c) => ({ ...c, trackIdx: c.trackIdx > idx ? c.trackIdx - 1 : c.trackIdx })),
    );
  };

  /* ─── Undo/Redo (snapshot stacks) ─────────────────────── */
  const [history, setHistory] = useState<Array<{ tracks: Track[]; clips: TimelineClip[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ tracks: Track[]; clips: TimelineClip[] }>>([]);
  const skipNextSnapshot = useRef(false);

  const pushSnapshot = () => {
    setHistory((prev) => [...prev.slice(-19), { tracks, clips }]);
    setRedoStack([]);
  };
  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setRedoStack((prev) => [...prev, { tracks, clips }]);
    skipNextSnapshot.current = true;
    setTracks(last.tracks);
    setClips(last.clips);
    setHistory((prev) => prev.slice(0, -1));
  };
  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, { tracks, clips }]);
    skipNextSnapshot.current = true;
    setTracks(next.tracks);
    setClips(next.clips);
    setRedoStack((prev) => prev.slice(0, -1));
  };

  // Total timeline-duration = max end-time of all clips
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);

  const selected = clips.find((c) => c.id === selectedId);

  /* ─── Clip operations ──────────────────────────────────── */

  const updateClip = (id: string, patch: Partial<TimelineClip>) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeClip = (id: string) =>
    setClips((prev) => prev.filter((c) => c.id !== id));

  const splitClipAt = (id: string, atTime: number) => {
    setClips((prev) => {
      const c = prev.find((x) => x.id === id);
      if (!c) return prev;
      const localT = atTime - c.start;
      if (localT <= 0.2 || localT >= c.duration - 0.2) return prev;
      const left: TimelineClip = { ...c, duration: localT };
      const right: TimelineClip = {
        ...c,
        id: newClipId(),
        start: c.start + localT,
        duration: c.duration - localT,
        trimStart: (c.trimStart ?? 0) + localT,
      };
      return prev.filter((x) => x.id !== id).concat([left, right]);
    });
  };

  const splitAtPlayhead = () => {
    // Find clip at playhead in selected clip's track or first track
    const c = clips.find(
      (x) => playhead > x.start + 0.1 && playhead < x.start + x.duration - 0.1,
    );
    if (c) splitClipAt(c.id, playhead);
  };

  /* ─── Add asset to timeline (drop) ─────────────────────── */

  const addClipAt = (
    src: string,
    trackIdx: number,
    atTime: number,
    type: TrackKind,
    label: string,
    previewSrc?: string,
    transcoding?: boolean,
  ) => {
    const newClip: TimelineClip = {
      id: newClipId(),
      trackIdx,
      start: Math.max(0, atTime),
      duration: 5, // default — wird beim onLoadedMetadata adjusted
      src,
      previewSrc,
      transcoding,
      type,
      label,
      scale: 1,
      volume: 1,
    };
    setClips((prev) => [...prev, newClip]);
  };

  /* ─── Asset list per category ──────────────────────────── */

  const projectAssets = project.highlights
    .filter((h) => !!h.clipPath)
    .map((h, i) => ({
      id: `proj-${i}`,
      kind: 'video' as TrackKind,
      label: (h.reason ?? `Clip ${i + 1}`).slice(0, 28),
      src: h.clipPath!,
    }));

  const assetsByCategory: Record<AssetCategory, Array<{ id: string; kind: TrackKind; label: string; src?: string; previewSrc?: string; transcoding?: boolean; transitionType?: TransitionType }>> = {
    media:       [...projectAssets, ...userImports],
    audio:       userImports.filter((a) => a.kind === 'audio'),
    tts:         userImports.filter((a) => a.kind === 'audio' && a.id.startsWith('tts-')),
    text:        [
      { id: 't-headline',  kind: 'text', label: 'Bold Headline' },
      { id: 't-subtitle',  kind: 'text', label: 'Subtitle' },
      { id: 't-lower',     kind: 'text', label: 'Lower third' },
      { id: 't-callout',   kind: 'text', label: 'Callout / Tag' },
      { id: 't-glow',      kind: 'text', label: 'Glow Title' },
      { id: 't-shadow',    kind: 'text', label: 'Drop Shadow' },
      { id: 't-layered',   kind: 'text', label: 'Layered Title' },
    ],
    effects:     [
      { id: 'e-glitch',  kind: 'overlay', label: 'Glitch' },
      { id: 'e-shake',   kind: 'overlay', label: 'Shake' },
      { id: 'e-glow',    kind: 'overlay', label: 'Glow' },
      { id: 'e-zoomin',  kind: 'overlay', label: 'Zoom In Pulse' },
      { id: 'e-rgb',     kind: 'overlay', label: 'RGB Split' },
      { id: 'e-blur-low',    kind: 'overlay', label: 'Motion Blur · Low' },
      { id: 'e-blur-medium', kind: 'overlay', label: 'Motion Blur · Medium' },
      { id: 'e-blur-high',   kind: 'overlay', label: 'Motion Blur · High' },
      // ─── Fortnite-Montage-Combo-Presets ─────────────────────
      { id: 'e-combo-montage', kind: 'overlay', label: 'Montage (slow + glow + zoom)' },
      { id: 'e-combo-hype',    kind: 'overlay', label: 'Hype Drop (shake + RGB)' },
      { id: 'e-combo-clean',   kind: 'overlay', label: 'Clean Pop (zoom + glow)' },
      // ─── Magic / Anime-Style Effects ────────────────────────
      { id: 'e-aura-purple',  kind: 'overlay', label: 'Purple Aura' },
      { id: 'e-light-burst',  kind: 'overlay', label: 'Light Burst' },
      { id: 'e-speed-lines',  kind: 'overlay', label: 'Speed Lines' },
      { id: 'e-energy-trail', kind: 'overlay', label: 'Energy Trail' },
    ],
    transitions: [
      { id: 'tr-cross',        kind: 'overlay', label: 'Cross Dissolve',        transitionType: 'cross' },
      { id: 'tr-non-additive', kind: 'overlay', label: 'Non-Additive Dissolve', transitionType: 'non-additive' },
      { id: 'tr-additive',     kind: 'overlay', label: 'Additive Dissolve',     transitionType: 'additive' },
      { id: 'tr-blur',         kind: 'overlay', label: 'Blur Dissolve',         transitionType: 'blur' },
      { id: 'tr-dip',          kind: 'overlay', label: 'Dip To Color',          transitionType: 'dip-to-color' },
    ],
    filters:     [
      { id: 'f-vivid',   kind: 'overlay', label: 'Vivid' },
      { id: 'f-gaming',  kind: 'overlay', label: 'Gaming' },
      { id: 'f-bw',      kind: 'overlay', label: 'B & W' },
      { id: 'f-cinema',  kind: 'overlay', label: 'Cinematic' },
      { id: 'f-warm',    kind: 'overlay', label: 'Warm Sun' },
      { id: 'f-cool',    kind: 'overlay', label: 'Cool Blue' },
      // User-uploaded LUTs werden hier dynamisch dazwischengemischt (siehe userLuts state)
      ...userLuts,
    ],
  };

  /* ─── TTS (AI Text-to-Speech) Result-Handler ─────────────── */

  const onTtsGenerated = (audioPath: string, label: string, text: string, voice: string) => {
    pushSnapshot();
    if (editingTtsClipId) {
      // Edit-Modus: existing clip's audio-src ersetzen, Metadata aktualisieren
      setClips((prev) => prev.map((c) =>
        c.id === editingTtsClipId
          ? { ...c, src: audioPath, label, ttsText: text, ttsVoice: voice, srcDuration: undefined }
          : c,
      ));
      // Auch im userImports updaten falls vorhanden (matching by id-pattern oder src)
      setUserImports((prev) => prev.map((a) =>
        a.id === editingTtsClipId ? { ...a, src: audioPath, label } : a,
      ));
      setEditingTtsClipId(null);
      return;
    }
    // Neu-Modus: am PLAYHEAD einfügen (nicht am Ende)
    const id = `tts-${Date.now()}`;
    setUserImports((prev) => [...prev, { id, kind: 'audio', label, src: audioPath, transcoding: false }]);
    setActiveCategory('audio');
    const targetTrackIdx = Math.max(0, tracks.findIndex((t) => t.kind === 'audio'));
    // Default-Dauer: wir kennen die echte Audio-Länge noch nicht (lädt erst nach onLoadedMetadata).
    // Pragma: starte mit 5s als Platzhalter, wird beim ersten Metadata-Event aktualisiert.
    const startTime = playhead;
    addClipAt(audioPath, targetTrackIdx, startTime, 'audio', label);
    // Setze ttsText/ttsVoice + ID-Marker auf den frisch erzeugten Clip
    setClips((prev) => {
      // letzter clip ist der frisch added (addClipAt appendet)
      const lastClipIdx = prev.length - 1;
      if (lastClipIdx < 0) return prev;
      return prev.map((c, i) => i === lastClipIdx
        ? { ...c, id, ttsText: text, ttsVoice: voice }
        : c);
    });
  };

  /* ─── Upload from file system ──────────────────────────── */

  const onUploadAsset = async () => {
    // Generischer Editor-Picker: Video + Audio erlaubt (statt nur Video wie pickIntroFile)
    const pickRes = await window.api.invoke<{ path: string } | null>('dialog.openEditorAsset');
    if (!pickRes.ok || !pickRes.data?.path) return;
    const path = pickRes.data.path;
    const id = `imp-${Date.now()}`;
    const label = path.split('/').pop() ?? 'asset';

    // Kind aus Extension bestimmen
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const isAudio = ['mp3','m4a','wav','aac','ogg','flac'].includes(ext);
    const kind: TrackKind = isAudio ? 'audio' : 'video';

    // Audio braucht keinen Transcode (Browser kann mp3/aac/wav direkt)
    const needsTranscode = !isAudio;

    setUserImports((prev) => [...prev, { id, kind, label, src: path, transcoding: needsTranscode }]);
    setActiveCategory(isAudio ? 'audio' : 'media');
    pushSnapshot();
    const newClipStart = totalDuration;

    // Track auswählen — Audio auf den ersten audio-Track, Video auf 0 (Base-Layer)
    const targetTrackIdx = isAudio
      ? Math.max(0, tracks.findIndex((t) => t.kind === 'audio'))
      : 0;
    addClipAt(path, targetTrackIdx, newClipStart, kind, label, undefined, needsTranscode);

    if (!needsTranscode) return;

    // Video → Transcode im Hintergrund
    try {
      const res = await window.api.invoke<{ previewPath: string; fromCache: boolean; transcoded: boolean }>(
        'media.transcodeForPreview',
        { path },
      );
      if (!res.ok) throw new Error(res.error ?? 'transcode failed');
      const previewPath = res.data?.previewPath ?? path;
      console.log(`[transcode] ${label} → ${previewPath} (cache=${res.data?.fromCache} transcoded=${res.data?.transcoded})`);

      setUserImports((prev) => prev.map((a) =>
        a.id === id ? { ...a, previewSrc: previewPath, transcoding: false } : a,
      ));
      setClips((prev) => prev.map((c) =>
        c.src === path ? { ...c, previewSrc: previewPath, transcoding: false } : c,
      ));
    } catch (err) {
      console.error('[transcode] failed:', err);
      setUserImports((prev) => prev.map((a) =>
        a.id === id ? { ...a, transcoding: false } : a,
      ));
      setClips((prev) => prev.map((c) =>
        c.src === path ? { ...c, transcoding: false } : c,
      ));
      window.alert(`Could not optimize "${label}" for preview:\n\n${(err as Error).message}\n\nThe export will still work — but preview may show "Codec not supported".`);
    }
  };

  /* ─── Snap-Helper ─────────────────────────────────────── */
  const SNAP_THRESHOLD = 0.5; // sec
  const snapTime = (t: number, ignoreClipId?: string): number => {
    if (!snapEnabled) return t;
    // Snap-Targets: 0, playhead, clip-edges
    const targets: number[] = [0, playhead];
    clips.forEach((c) => {
      if (c.id !== ignoreClipId) {
        targets.push(c.start, c.start + c.duration);
      }
    });
    let best = t, bestDiff = SNAP_THRESHOLD;
    for (const target of targets) {
      const diff = Math.abs(target - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = target;
      }
    }
    return best;
  };

  /* ─── Ripple Delete: löscht Clip und schließt Lücke ──── */
  const rippleDelete = (id: string) => {
    pushSnapshot();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const dur = clip.duration;
    setClips((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) =>
          c.trackIdx === clip.trackIdx && c.start > clip.start
            ? { ...c, start: Math.max(0, c.start - dur) }
            : c,
        ),
    );
    setSelectedId(null);
  };

  /* ─── Detach Audio (Stub — würde audio aus video extrahieren) ─ */
  const detachAudio = (id: string) => {
    const clip = clips.find((c) => c.id === id);
    if (!clip || !clip.src) return;
    pushSnapshot();
    const audioClip: TimelineClip = {
      ...clip,
      id: newClipId(),
      trackIdx: 2, // audio track
      type: 'audio',
      label: clip.label + ' (audio)',
    };
    setClips((prev) => [...prev, audioClip]);
  };

  /* ─── Freeze Frame (1s freeze am Playhead) ──────────────── */
  const freezeFrame = () => {
    const c = clips.find((x) => playhead > x.start + 0.1 && playhead < x.start + x.duration - 0.1);
    if (!c) return;
    pushSnapshot();
    splitClipAt(c.id, playhead);
    // Insert freeze (1s, no movement)
    setTimeout(() => {
      const split = clips.find((x) => x.id === c.id);
      if (!split) return;
      const freezeStart = split.start + split.duration;
      setClips((prev) => prev.map((x) => x.start >= freezeStart && x.id !== c.id
        ? { ...x, start: x.start + 1 }
        : x));
    }, 50);
  };

  /* ─── Export → Backend (renderEditorTimeline, Multi-Track) ── */
  const onExport = async () => {
    if (exporting) return;

    // Alle Visual + Audio + Text-Clips, gefiltert nach hidden/muted
    const renderClips = clips.filter((c) => {
      const t = tracks[c.trackIdx];
      if (!t) return false;
      if (c.type === 'text') {
        // Text-Clips: kein src nötig — werden via PNG-Pre-Render exportiert.
        if (t.hidden) return false;
        if (!c.text || !c.text.trim()) return false;
        return true;
      }
      if (!c.src) return false;
      if ((c.type === 'video' || c.type === 'overlay') && t.hidden) return false;
      if (c.type === 'audio' && t.muted) return false;
      if (c.type === 'effect') return false; // Effect-Clips selbst nicht — werden auf overlapping video appliziert
      return true;
    });

    // Effect-Track-Clips → auf überlappende video-clips als effects[] mappen für Backend
    const effectTrackClips = clips.filter((c) =>
      c.type === 'effect' && c.effectId && !tracks[c.trackIdx]?.hidden,
    );
    const enrichedRenderClips = renderClips.map((c) => {
      if (c.type !== 'video' && c.type !== 'overlay') return c;
      // Finde alle Effects die mit diesem Video-Clip überlappen
      const overlapping = effectTrackClips.filter((eff) =>
        eff.start < c.start + c.duration && eff.start + eff.duration > c.start,
      );
      if (overlapping.length === 0) return c;
      const additional: EffectInstance[] = overlapping.map((eff) => ({
        id: eff.effectId!,
        intensity: eff.effectIntensity ?? 1,
        // Translate global time-range zu clip-local startSec/duration
        startSec: Math.max(0, eff.start - c.start),
        duration: Math.min(c.duration, eff.start + eff.duration - c.start) - Math.max(0, eff.start - c.start),
      }));
      const existing = clipEffects(c);
      return { ...c, effects: [...existing, ...additional] };
    });

    const hasVisual = renderClips.some((c) => c.type === 'video' || c.type === 'overlay');
    if (!hasVisual) {
      window.alert('No video/overlay clips on the timeline. Add at least one visual clip before exporting.');
      return;
    }

    // Save-As-Dialog VOR dem Encode
    const suggestedName = `${project.name}-edit-${Date.now()}.mp4`.replace(/[^\w\-.]/g, '_');
    const saveRes = await window.api.invoke<{ path: string } | null>('dialog.saveEditorExport', {
      suggestedName,
    });
    if (!saveRes.ok || !saveRes.data?.path) return; // User canceled

    setExporting(true);
    try {
      // Scale-Faktor: DOM-Preview-Höhe → Export-Höhe (Live-Preview rendert in einer
      // responsive 16:9-Box mit variabler Pixel-Größe; textSize ist DOM-px → in Output-px
      // muss skaliert werden, damit Live-Preview und Export visuell übereinstimmen).
      const previewBox = document.querySelector<HTMLElement>('[data-editor-preview-box]');
      const previewH = previewBox?.offsetHeight ?? 540;
      const textSizeScale = previewH > 0 ? exportSettings.height / previewH : 1;

      const editorClips = enrichedRenderClips.map((c) => {
        // Text-Clips: Pre-Render via Canvas → PNG-base64 → Main schreibt temp file.
        // src ist Dummy (Main setzt es auf den temp-Pfad), trackKind='text' bleibt für ffmpeg-Detection.
        if (c.type === 'text') {
          const pngB64 = renderTextClipToPng(c as any, exportSettings.width, exportSettings.height, textSizeScale);
          return {
            src: '',  // Main füllt mit temp-PNG-Pfad
            trackKind: 'text' as const,
            trackIdx: c.trackIdx,
            start: c.start,
            duration: c.duration,
            opacity: c.opacity,
            fadeInDuration: c.fadeInDuration,
            fadeOutDuration: c.fadeOutDuration,
            textPngBase64: pngB64,
          };
        }

        // AI Mask: bei aiMaskFrames > 1 → Per-Frame-Export (PNG-Sequenz + fps).
        // Sonst Static-Mask (ein Snapshot wird auf alle Frames angewandt).
        let aiMaskPng: string | undefined;
        let aiMaskPngs: string[] | undefined;
        let aiMaskFps: number | undefined;
        if (c.aiMaskEnabled) {
          if (c.aiMaskFrames && c.aiMaskFrames.length > 1) {
            const encoded = c.aiMaskFrames
              .map((f) => maskToPngBase64(f.mask))
              .filter((s): s is string => !!s);
            if (encoded.length > 0) {
              aiMaskPngs = encoded;
              aiMaskFps = c.aiMaskTrackFps && c.aiMaskTrackFps > 0 ? c.aiMaskTrackFps : 5;
            }
          } else {
            const mask = c.aiMaskData ?? c.aiMaskFrames?.[0]?.mask;
            if (mask) aiMaskPng = maskToPngBase64(mask);
          }
        }
        return {
          src: c.src!,
          trackKind: c.type as 'video' | 'overlay' | 'audio' | 'text',
          trackIdx: c.trackIdx,
          start: c.start,
          duration: c.duration,
          trimStart: c.trimStart ?? 0,
          posX: c.posX,
          posY: c.posY,
          scale: c.scale,
          opacity: c.opacity,
          volume: c.volume,
          speed: c.speed,
          chromaEnabled: c.chromaEnabled,
          chromaColor: c.chromaColor,
          chromaTolerance: c.chromaTolerance,
          stabilizeEnabled: c.stabilizeEnabled,
          stabilizeSmoothness: c.stabilizeSmoothness,
          fadeInDuration: c.fadeInDuration,
          fadeOutDuration: c.fadeOutDuration,
          transitionType: c.transitionType,
          transitionDuration: c.transitionDuration,
          transitionEasing: c.transitionEasing,
          transitionColor: c.transitionColor,
          brightness: c.brightness,
          contrast: c.contrast,
          saturation: c.saturation,
          aiMaskPng,
          aiMaskPngs,
          aiMaskFps,
          // Effects + Filters + LUT — multi-effects array senden
          effects: clipEffects(c),
          filter: c.filter,
          lutPath: c.lutPath,
          // Blend-Mode (Photoshop-Style) — Pyramide schaltet automatisch auf
          // blend-Filter wenn != 'normal' und Mode supported (siehe ffmpeg.ts).
          blendMode: c.blendMode,
        };
      });
      // Phase 9.4: StatusBar SOFORT zeigen damit User Cancel-Button hat
      // (auch während FFmpeg noch nicht den ersten time-Frame ausgegeben hat).
      // Wird beim ersten progress-event vom main process überschrieben + bei
      // Erfolg/Fehler im finally gecleared.
      useApp.setState({ currentJob: { projectId: 'shell', step: 'editor-export', percent: 0 } });
      const res = await window.api.invoke<{ path: string; canceled?: boolean }>('editor.renderTimeline', {
        outputPath: saveRes.data.path,
        clips: editorClips,
        options: {
          width: exportSettings.width,
          height: exportSettings.height,
          fps: exportSettings.fps,
          bitrate: exportSettings.bitrate,
        },
        qualityMode: exportSettings.qualityMode,
      });
      if (!res.ok) throw new Error(res.error ?? 'export failed');
      if (res.data?.canceled) {
        console.log('[editor export] canceled by user');
        return;
      }
      console.log(`[editor export] done → ${res.data?.path}`);
      try { sounds.exportDone(); } catch {}
      // Reveal in Finder/Explorer
      window.api.invoke('shell.revealInFolder', { path: res.data?.path });
    } catch (err: any) {
      console.error('[editor export] failed:', err);
      try { sounds.error(); } catch {}
      window.alert('Export failed: ' + (err?.message ?? err));
    } finally {
      setExporting(false);
      useApp.setState({ currentJob: null });
    }
  };

  /* ─── Keyboard ─────────────────────────────────────────── */

  // AI Mask Events: CenterPreview dispatches 'aimask:update' nach Decoder-Run.
  // Wir applizieren das auf den entsprechenden Clip im State.
  useEffect(() => {
    const onMaskUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        clipId: string;
        points: Array<{ x: number; y: number; label: 0 | 1 }>;
        mask: { width: number; height: number; data: number[] };
      };
      pushSnapshot();
      setClips((prev) => prev.map((c) => c.id === detail.clipId
        ? { ...c, aiMaskPoints: detail.points, aiMaskData: detail.mask }
        : c));
    };
    const onMaskClear = () => {
      if (!selectedId) return;
      pushSnapshot();
      setClips((prev) => prev.map((c) => c.id === selectedId
        ? { ...c, aiMaskPoints: undefined, aiMaskData: undefined, aiMaskFrames: undefined }
        : c));
    };
    const onMaskRemovePoint = (e: Event) => {
      const detail = (e as CustomEvent).detail as { index?: number; clipId?: string };
      const idx = detail?.index;
      const targetId = detail?.clipId ?? selectedId;
      console.log(`[ai-mask] removePoint event: idx=${idx} clipId=${targetId}`);
      if (typeof idx !== 'number' || !targetId) return;
      pushSnapshot();
      setClips((prev) => prev.map((c) => {
        if (c.id !== targetId) return c;
        const newPoints = (c.aiMaskPoints ?? []).filter((_, i) => i !== idx);
        return { ...c, aiMaskPoints: newPoints, aiMaskData: newPoints.length > 0 ? c.aiMaskData : undefined };
      }));
    };
    const onFramesUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        clipId: string;
        frames: Array<{ time: number; mask: { width: number; height: number; data: number[] } }>;
        samplingFps?: number;
      };
      if (!detail?.clipId) return;
      pushSnapshot();
      setClips((prev) => prev.map((c) => c.id === detail.clipId
        ? { ...c, aiMaskFrames: detail.frames, aiMaskTrackFps: detail.samplingFps ?? c.aiMaskTrackFps }
        : c));
    };
    // Inspector dispatcht trackRequest ohne clipId — wir kennen selectedId, re-emitten an OverlayVideos
    const onTrackRequest = (e: Event) => {
      if (!selectedId) return;
      const detail = (e as CustomEvent).detail as { samplingFps?: number };
      window.dispatchEvent(new CustomEvent('aimask:track', {
        detail: { clipId: selectedId, samplingFps: detail?.samplingFps },
      }));
    };
    window.addEventListener('aimask:update', onMaskUpdate);
    window.addEventListener('aimask:clear', onMaskClear);
    window.addEventListener('aimask:removePoint', onMaskRemovePoint);
    window.addEventListener('aimask:framesUpdate', onFramesUpdate);
    window.addEventListener('aimask:trackRequest', onTrackRequest);
    return () => {
      window.removeEventListener('aimask:update', onMaskUpdate);
      window.removeEventListener('aimask:clear', onMaskClear);
      window.removeEventListener('aimask:removePoint', onMaskRemovePoint);
      window.removeEventListener('aimask:framesUpdate', onFramesUpdate);
      window.removeEventListener('aimask:trackRequest', onTrackRequest);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const cmd = e.metaKey || e.ctrlKey;

      // Undo/Redo
      if (cmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (cmd && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return; }
      if (cmd && e.key === 'y') { e.preventDefault(); redo(); return; }

      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); pushSnapshot(); splitAtPlayhead(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        if (e.shiftKey) rippleDelete(selectedId);
        else { pushSnapshot(); removeClip(selectedId); setSelectedId(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, playhead, clips, history, redoStack]);

  return (
    <div className="h-full flex flex-col bg-fiano-black">
      {/* ═══ TOP-BAR ═══════════════════════════════════════════ */}
      <EditorTopBar
        active={activeCategory}
        onChange={setActiveCategory}
        onUpload={onUploadAsset}
        onExport={() => setShowExportDialog(true)}
        exporting={exporting}
      />

      {/* ═══ MIDDLE — Sidebar | Center | Inspector ═══════════ */}
      <div className="flex-1 flex min-h-0 border-t border-white/[0.06]">
        {/* Left: Asset library */}
        <AssetSidebar
          width={leftWidth}
          category={activeCategory}
          assets={assetsByCategory[activeCategory]}
          onOpenTts={() => setShowTtsModal(true)}
          onOpenTextDialog={() => setShowTextDialog(true)}
          onUploadLut={async () => {
            // Plan-Gate: nur Pro/Lifetime können eigene LUT-Files importieren.
            if (!lutFeature.unlocked) {
              openUpgrade('lut_filters');
              return;
            }
            const r = await window.api.invoke<{ path: string } | null>('dialog.openFile', {
              filters: [{ name: 'LUT', extensions: ['cube', 'lut', '3dl'] }],
              title: 'Upload LUT file',
            });
            if (r.ok && r.data?.path) {
              const label = r.data.path.split('/').pop()?.replace(/\.(cube|lut|3dl)$/i, '') ?? 'LUT';
              setUserLuts((prev) => [
                ...prev,
                { id: `lut-${Date.now()}`, kind: 'overlay', label: `📁 ${label}`, src: r.data!.path },
              ]);
            }
          }}
          lutLocked={!lutFeature.unlocked}
          onAddToTimeline={(asset) => {
            // Spezialfall: Transition-Asset → applique auf 2. Clip auf Track-0
            if (asset.transitionType) {
              const track0Clips = clips
                .filter((c) => c.trackIdx === 0 && c.type === 'video')
                .sort((a, b) => a.start - b.start);
              const target = track0Clips.length >= 2 ? track0Clips[1] : track0Clips[0];
              if (!target) {
                window.alert('Add at least 2 video clips to track 0 before applying a transition.');
                return;
              }
              pushSnapshot();
              setClips((prev) => prev.map((c) => c.id === target.id
                ? { ...c, transitionType: asset.transitionType, transitionDuration: c.transitionDuration ?? 0.5 }
                : c));
              setSelectedId(target.id);
              setActiveInspectorTab('animation');
              return;
            }
            // Spezialfall: Effect-Asset (id beginnt mit 'e-') → applique auf SELECTED clip
            // (oder ersten Video-Clip auf Track 0 wenn keiner selected)
            const effectMap: Record<string, EffectId> = {
              'e-glitch': 'glitch', 'e-shake': 'shake', 'e-glow': 'glow',
              'e-zoomin': 'zoom-pulse', 'e-rgb': 'rgb-split',
              'e-combo-montage': 'combo-montage', 'e-combo-hype': 'combo-hype', 'e-combo-clean': 'combo-clean',
              'e-aura-purple': 'aura-purple', 'e-light-burst': 'light-burst',
              'e-speed-lines': 'speed-lines', 'e-energy-trail': 'energy-trail',
              'e-blur-low': 'motion-blur-low', 'e-blur-medium': 'motion-blur-medium', 'e-blur-high': 'motion-blur-high',
            };
            if (asset.id in effectMap) {
              const effectId = effectMap[asset.id];
              // Effect-Track suchen, sonst auto-erzeugen
              let effectTrackIdx = tracks.findIndex((t) => t.kind === 'effect');
              if (effectTrackIdx === -1) {
                const newTrack: Track = { id: `t-effect-${Date.now()}`, kind: 'effect', name: 'Effects', height: 32 };
                setTracks((prev) => [...prev, newTrack]);
                effectTrackIdx = tracks.length;
              }
              pushSnapshot();
              // Default-Dauer: 3 Sekunden ab playhead — User kann via drag-handles resizen
              const defaultDur = 3;
              const newClip: TimelineClip = {
                id: `effect-${Date.now()}`,
                trackIdx: effectTrackIdx,
                start: playhead,
                duration: defaultDur,
                type: 'effect',
                label: EFFECT_META[effectId].label,
                effectId,
                effectIntensity: 1,
              };
              setClips((prev) => [...prev, newClip]);
              setSelectedId(newClip.id);
              return;
            }
            // Spezialfall: Filter-Asset (id beginnt mit 'f-' oder 'lut-')
            const filterMap: Record<string, TimelineClip['filter']> = {
              'f-vivid': 'vivid', 'f-gaming': 'gaming', 'f-bw': 'bw',
              'f-cinema': 'cinema', 'f-warm': 'warm', 'f-cool': 'cool',
            };
            if (asset.id in filterMap) {
              const target = selectedId
                ? clips.find((c) => c.id === selectedId)
                : clips.filter((c) => c.type === 'video').sort((a, b) => a.start - b.start)[0];
              if (!target) { window.alert('Select a clip first.'); return; }
              pushSnapshot();
              setClips((prev) => prev.map((c) => c.id === target.id
                ? { ...c, filter: filterMap[asset.id], lutPath: undefined }
                : c));
              setSelectedId(target.id);
              return;
            }
            // User-Uploaded LUT (id startet mit 'lut-')
            if (asset.id.startsWith('lut-') && asset.src) {
              const target = selectedId
                ? clips.find((c) => c.id === selectedId)
                : clips.filter((c) => c.type === 'video').sort((a, b) => a.start - b.start)[0];
              if (!target) { window.alert('Select a clip first.'); return; }
              pushSnapshot();
              setClips((prev) => prev.map((c) => c.id === target.id
                ? { ...c, lutPath: asset.src, filter: undefined }
                : c));
              setSelectedId(target.id);
              return;
            }
            // Spezialfall: Text-Preset (id beginnt mit 't-') → erzeuge text-Clip mit Style-Defaults
            const textPresets: Record<string, Partial<TimelineClip>> = {
              't-headline': {
                text: 'Headline', textFont: 'Arial Black', textSize: 64, textColor: '#ffffff',
                textWeight: '900',
              },
              't-subtitle': {
                text: 'Subtitle', textFont: 'Helvetica Neue', textSize: 32, textColor: '#ffffff',
                textWeight: 'bold',
              },
              't-lower': {
                text: 'Lower third', textFont: 'Helvetica Neue', textSize: 28, textColor: '#ffffff',
                textWeight: 'bold', textBgColor: '#000000', textBgOpacity: 0.7,
                posY: 0.5,
              },
              't-callout': {
                text: 'CALLOUT', textFont: 'Arial Black', textSize: 48, textColor: '#ff1039',
                textWeight: '900',
              },
              't-glow': {
                text: 'GLOW', textFont: 'Arial Black', textSize: 80, textColor: '#ffffff',
                textWeight: '900',
                textStyle: 'layered',
                textLayeredScale: 1.0,
                textLayeredUseGradient: false,
                textLayeredMetallic: false,
                textLayeredGlow: true,
                textLayeredGlowColor: '#ffffff',
                textLayeredGlowStrength: 0.8,
                textLayeredDropShadow: 0,
              },
              't-shadow': {
                text: 'Drop Shadow', textFont: 'Arial Black', textSize: 56, textColor: '#ffffff',
                textWeight: '900',
                textShadowColor: '#000000', textShadowOffsetX: 4, textShadowOffsetY: 6, textShadowBlur: 12,
              },
              't-layered': {
                text: 'EPIC', textFont: 'Arial Black', textSize: 60, textColor: '#ffffff',
                textWeight: '900',
                textStyle: 'layered',
                textLayeredSecond: 'moment',
                textLayeredScale: 2.0,
                textLayeredUseGradient: true,
                textLayeredGradientFrom: '#ff5570',
                textLayeredGradientTo: '#ff1039',
                textLayeredMetallic: false,
                textLayeredGlow: false,
                textLayeredGlowColor: '#ffffff',
                textLayeredGlowStrength: 0.6,
                textLayeredDropShadow: 8,
              },
            };
            if (asset.id in textPresets) {
              pushSnapshot();
              let textTrackIdx = tracks.findIndex((t) => t.kind === 'text');
              if (textTrackIdx === -1) {
                const newTrack: Track = { id: `t-text-${Date.now()}`, kind: 'text', name: 'Text', height: 32 };
                setTracks((prev) => [...prev, newTrack]);
                textTrackIdx = tracks.length;
              }
              const newId = `text-${Date.now()}`;
              setClips((prev) => [...prev, {
                id: newId,
                trackIdx: textTrackIdx,
                start: playhead,
                duration: 5,
                type: 'text',
                label: asset.label,
                scale: 1,
                ...textPresets[asset.id],
              } as TimelineClip]);
              setSelectedId(newId);
              setActiveCategory('text');
              return;
            }

            // Default: Asset als neuer Clip auf passender Track-Kind
            const trackForKind = asset.kind === 'audio'
              ? tracks.findIndex((t) => t.kind === 'audio')
              : asset.kind === 'video'
                ? tracks.findIndex((t) => t.kind === 'video')
                : tracks.findIndex((t) => t.kind === 'overlay');
            const idx = trackForKind >= 0 ? trackForKind : 0;
            addClipAt(asset.src ?? '', idx, totalDuration, tracks[idx]?.kind ?? 'video', asset.label, asset.previewSrc);
          }}
        />

        {/* Resize-Handle Asset-Sidebar */}
        <ResizeHandleVertical onMouseDown={onLeftResize} />

        {/* Center: Preview */}
        <CenterPreview
          clips={clips}
          tracks={tracks}
          playhead={playhead}
          playing={playing}
          stateLoaded={stateLoaded}
          onPlayheadChange={setPlayhead}
          onPlayingChange={setPlaying}
          totalDuration={totalDuration}
          onExpand={() => setShowPreviewModal(true)}
          onClipMetadata={(clipId, srcDuration) => {
            setClips((prev) => prev.map((c) =>
              c.id === clipId && !c.srcDuration ? { ...c, srcDuration } : c,
            ));
          }}
        />

        {/* Resize-Handle Inspector */}
        <ResizeHandleVertical onMouseDown={onRightResize} />

        {/* Right: Inspector */}
        <InspectorPanel
          width={rightWidth}
          selected={selected}
          tracks={tracks}
          activeTab={activeInspectorTab}
          onTabChange={setActiveInspectorTab}
          onChange={(patch) => selected && updateClip(selected.id, patch)}
          onRemove={() => { if (selected) { pushSnapshot(); removeClip(selected.id); setSelectedId(null); } }}
          onEditTts={(clipId) => { setEditingTtsClipId(clipId); setShowTtsModal(true); }}
        />
      </div>

      {/* ═══ Resize-Handle (Preview ↕ Timeline) ═════════════ */}
      <ResizeHandleHorizontal onMouseDown={onTimelineResize} />

      {/* ═══ BOTTOM — Timeline ═══════════════════════════════ */}
      <Timeline
        height={timelineHeight}
        tracks={tracks}
        clips={clips}
        playhead={playhead}
        pxPerSec={pxPerSec}
        selectedId={selectedId}
        totalDuration={totalDuration}
        snapEnabled={snapEnabled}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        onPlayheadChange={setPlayhead}
        onSelect={setSelectedId}
        onClipChange={(id, patch) => {
          // pushSnapshot wird hier NICHT aufgerufen — drag triggert sehr oft.
          // Snapshot kommt vor Drag-Start (in TrackRow onMouseDown).
          updateClip(id, patch);
        }}
        onClipDrop={(asset, trackIdx, atTime) => {
          // Spezialfall: Transition → applique auf nächstgelegenen Clip auf diesem Track
          // Smart-Match: wenn Drop nahe einer Clip-Grenze (innerhalb 1.5s), apply als
          // transitionIn auf den NACHFOLGENDEN Clip (oder den Clip dessen Start am
          // nächsten zu atTime liegt).
          if (asset.transitionType) {
            const trackClips = clips
              .filter((c) => c.trackIdx === trackIdx && c.type === 'video')
              .sort((a, b) => a.start - b.start);
            if (trackClips.length === 0) {
              window.alert('No clips on this track. Drop a video first, then add a transition between two clips.');
              return;
            }
            // Finde Clip dessen Start atTime am nächsten ist (transition gilt INTO this clip)
            let target = trackClips[0];
            let bestDist = Math.abs(trackClips[0].start - atTime);
            for (const c of trackClips) {
              const d = Math.abs(c.start - atTime);
              if (d < bestDist) { bestDist = d; target = c; }
            }
            // Wenn der nächste Clip TRACK-INDEX 0 ist (= keine Transition möglich, kein A davor)
            // dann nimm den 2. Clip
            const targetIdx = trackClips.indexOf(target);
            if (targetIdx === 0 && trackClips.length >= 2) {
              target = trackClips[1];
            }
            pushSnapshot();
            setClips((prev) => prev.map((c) => c.id === target.id
              ? { ...c, transitionType: asset.transitionType, transitionDuration: c.transitionDuration ?? 0.5 }
              : c));
            setSelectedId(target.id);
            setActiveInspectorTab('animation');
            return;
          }
          if (asset.src) {
            pushSnapshot();
            const trackKind = tracks[trackIdx]?.kind ?? 'video';
            addClipAt(asset.src, trackIdx, atTime, trackKind, asset.label, asset.previewSrc);
          }
        }}
        onSplit={() => { pushSnapshot(); splitAtPlayhead(); }}
        onRippleDelete={() => { if (selectedId) rippleDelete(selectedId); }}
        onDetachAudio={() => { if (selectedId) detachAudio(selectedId); }}
        onFreezeFrame={freezeFrame}
        onUndo={undo}
        onRedo={redo}
        onSnapToggle={() => setSnapEnabled((s) => !s)}
        onZoom={(d) => setPxPerSec((v) => Math.max(20, Math.min(200, v + d)))}
        onTrackToggleHidden={(idx) => setTracks((prev) => prev.map((t, i) => i === idx ? { ...t, hidden: !t.hidden } : t))}
        onTrackToggleMuted={(idx) => setTracks((prev) => prev.map((t, i) => i === idx ? { ...t, muted: !t.muted } : t))}
        snapTime={snapTime}
        onPushSnapshot={pushSnapshot}
        onAddTrack={addTrack}
        onRemoveTrack={removeTrack}
        onEditText={(clipId) => {
          // Snapshot vor Edit-Begin: für Undo-History + Cancel-Rollback nach Live-Edits.
          const orig = clips.find((c) => c.id === clipId);
          editingTextClipOriginalRef.current = orig ? { ...orig } : null;
          if (orig) pushSnapshot();
          setEditingTextClipId(clipId);
          setShowTextDialog(true);
        }}
      />

      {/* ═══ Export Settings Dialog ═════════════════════════ */}
      {showExportDialog && (
        <ExportDialog
          settings={exportSettings}
          onChange={setExportSettings}
          onClose={() => setShowExportDialog(false)}
          onConfirm={() => { setShowExportDialog(false); onExport(); }}
        />
      )}

      {/* ═══ Preview Modal (großes Preview) ════════════════ */}
      {showPreviewModal && (
        <PreviewModal
          clips={clips}
          tracks={tracks}
          totalDuration={totalDuration}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {/* ═══ TTS-Modal (AI Text-to-Speech) ═════════════════ */}
      {showTtsModal && (() => {
        const editingClip = editingTtsClipId
          ? clips.find((c) => c.id === editingTtsClipId)
          : null;
        return (
          <TtsModal
            initialText={editingClip?.ttsText ?? ''}
            initialVoice={editingClip?.ttsVoice ?? 'nova'}
            isEditMode={!!editingClip}
            onClose={() => { setShowTtsModal(false); setEditingTtsClipId(null); }}
            onGenerated={onTtsGenerated}
          />
        );
      })()}

      {/* ═══ Text-Style-Dialog (Add + Edit) ═════════════════════════════ */}
      {showTextDialog && (() => {
        // Im Edit-Modus arbeiten wir mit dem Original-Snapshot (vor Live-Edits),
        // sonst hätte der Dialog nach Re-Render durch onLiveChange die zwischendurch
        // veränderten Werte als "initial" — Slider würden dann live mit wandern.
        const editingClip = editingTextClipId
          ? (editingTextClipOriginalRef.current ?? clips.find((c) => c.id === editingTextClipId) ?? null)
          : null;
        return (
          <TextStyleDialog
            initial={editingClip ?? undefined}
            onLiveChange={editingClip ? (spec) => {
              setClips((prev) => prev.map((c) =>
                c.id === editingClip.id
                  ? { ...c, ...spec, label: (spec.text || '').slice(0, 24) || c.label }
                  : c,
              ));
            } : undefined}
            onClose={() => {
              // Cancel: Original aus Ref restoren (Live-Edits zurückrollen).
              if (editingClip && editingTextClipOriginalRef.current) {
                const orig = editingTextClipOriginalRef.current;
                setClips((prev) => prev.map((c) => c.id === orig.id ? orig : c));
              }
              editingTextClipOriginalRef.current = null;
              setShowTextDialog(false);
              setEditingTextClipId(null);
            }}
            onAdd={(spec) => {
              if (editingClip) {
                // Edit-Modus: Snapshot wurde beim onEditText gemacht — nur final apply.
                setClips((prev) => prev.map((c) =>
                  c.id === editingClip.id
                    ? { ...c, ...spec, label: spec.text.slice(0, 24) || c.label }
                    : c,
                ));
              } else {
                // Add-Modus: neuen Clip erzeugen
                pushSnapshot();
                let textTrackIdx = tracks.findIndex((t) => t.kind === 'text');
                if (textTrackIdx === -1) {
                  const newTrack: Track = { id: `t-text-${Date.now()}`, kind: 'text', name: 'Text', height: 32 };
                  setTracks((prev) => [...prev, newTrack]);
                  textTrackIdx = tracks.length;
                }
                const clipId = `text-${Date.now()}`;
                setClips((prev) => [...prev, {
                  id: clipId,
                  trackIdx: textTrackIdx,
                  start: playhead,
                  duration: 5,
                  type: 'text',
                  label: spec.text.slice(0, 24) || 'Text',
                  ...spec,
                } as TimelineClip]);
                setSelectedId(clipId);
                setActiveCategory('text');
              }
              editingTextClipOriginalRef.current = null;
              setShowTextDialog(false);
              setEditingTextClipId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

/* ─── TopBar ─────────────────────────────────────────────────── */

function EditorTopBar({
  active, onChange, onUpload, onExport, exporting,
}: {
  active: AssetCategory;
  onChange: (c: AssetCategory) => void;
  onUpload: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const categories = useEditorCategories();
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-fiano-black min-w-0">
      {/* Categories — scrollable wenn Platz nicht reicht */}
      <div className="flex items-center gap-1 overflow-x-auto min-w-0 -mx-1 px-1">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => onChange(c.key)}
            className={clsx(
              'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
              active === c.key
                ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
            )}
          >
            <span className="w-3.5 h-3.5">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Right cluster — fix sichtbar */}
      <div className="flex items-center gap-2 shrink-0 ml-auto pl-2 border-l border-white/[0.06]">
        <button
          onClick={onUpload}
          className="text-[11px] font-medium text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg
                     bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition flex items-center gap-1.5"
          title="Import asset"
        >
          <IconUpload /> Import
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className="bg-fiano-red text-white text-[11px] font-semibold px-4 py-1.5 rounded-lg
                     hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)]
                     active:scale-[0.97] disabled:opacity-50 transition flex items-center gap-1.5"
        >
          {exporting ? (
            <>
              <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
              </svg>
              Rendering…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 11V3 M5 6l3-3 3 3 M3 13h10" />
              </svg>
              Export
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── ResizeHandle Components ──────────────────────────────── */

function ResizeHandleVertical({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="shrink-0 w-1 bg-white/[0.04] hover:bg-fiano-red/40 active:bg-fiano-red/60
                 cursor-col-resize transition-colors relative group z-10"
    >
      {/* Hit-area extender (-1px außen für leichteres Greifen) */}
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-10
                      rounded-full bg-white/10 group-hover:bg-fiano-red/80 transition-colors" />
    </div>
  );
}

function ResizeHandleHorizontal({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="shrink-0 h-1 bg-white/[0.04] hover:bg-fiano-red/40 active:bg-fiano-red/60
                 cursor-row-resize transition-colors relative group z-10"
    >
      <div className="absolute inset-x-0 -top-1 -bottom-1" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-0.5
                      rounded-full bg-white/10 group-hover:bg-fiano-red/80 transition-colors" />
    </div>
  );
}

/* ─── AiMaskPanel — SAM Model-Status + Setup-Workflow ───────── */

function AiMaskPanel() {
  const [status, setStatus] = useState<{ encoderAvailable: boolean; decoderAvailable: boolean; modelsDir?: string; activeVariant?: 'sam1' | 'sam2' } | null>(null);
  const [showSam2Help, setShowSam2Help] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await window.api.invoke<{ encoderAvailable: boolean; decoderAvailable: boolean; modelsDir: string }>('aiMask.modelStatus');
      if (r.ok && r.data) setStatus(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  // Lausche Download-Progress-Events
  useEffect(() => {
    if (!downloading) return;
    const off = window.api.onEvent((e: any) => {
      if (e?.type === 'progress' && e?.step === 'aiMask.download') {
        setProgress({ percent: e.percent ?? 0, message: e.message ?? '' });
      }
    });
    return off;
  }, [downloading]);

  // Auto-refresh bei "aimask:modelsReset" (z.B. nach SAM_INCOMPATIBLE auto-cleanup)
  useEffect(() => {
    const onReset = () => refresh();
    window.addEventListener('aimask:modelsReset', onReset);
    return () => window.removeEventListener('aimask:modelsReset', onReset);
  }, []);

  const startDownload = async (variant: 'sam1' | 'sam2') => {
    setDownloading(true);
    setProgress({ percent: 0, message: 'Starting…' });
    try {
      const r = await window.api.invoke<{ ok: boolean; modelsDir: string }>('aiMask.downloadModels', { variant });
      if (!r.ok) throw new Error(r.error ?? 'download failed');
      await refresh();
    } catch (err: any) {
      window.alert('Download failed: ' + (err?.message ?? err));
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  if (!status) return <div className="text-[10px] text-zinc-500 italic">Checking model status…</div>;

  const allReady = status.encoderAvailable && status.decoderAvailable;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className={clsx('w-2 h-2 rounded-full',
          allReady ? 'bg-emerald-500' : downloading ? 'bg-fiano-red animate-pulse' : 'bg-amber-500')} />
        <span className="text-zinc-300">
          {allReady ? 'SAM models ready' : downloading ? 'Downloading…' : 'Models not installed'}
        </span>
      </div>

      {downloading && progress && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-md p-2.5 space-y-1.5">
          <div className="text-[10px] text-zinc-400">{progress.message}</div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-fiano-red transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="text-[9px] text-zinc-600 font-mono">{progress.percent.toFixed(1)}%</div>
        </div>
      )}

      {!allReady && !downloading && (
        <div className="text-[10px] text-zinc-400 leading-relaxed bg-white/[0.03] border border-white/[0.06] rounded-md p-2.5 space-y-3">
          {/* SAM 2 (recommended für Tracking) */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-mono">
                SAM 2
              </span>
              <span className="text-zinc-300 font-semibold">base_plus · ~344 MB</span>
            </div>
            <div className="text-zinc-500 mb-2">
              Hiera base_plus from GitHub (ibaiGorordo/ONNX-SAM2). Better masks · tracking-capable for next turn.
            </div>
            <button
              onClick={() => startDownload('sam2')}
              className="px-3 py-1.5 text-[11px] rounded-md bg-fiano-red text-white hover:brightness-110 transition shadow-[0_0_12px_rgba(255,16,57,0.3)]"
            >
              Download SAM 2
            </button>
          </div>

          {/* SAM 1 (lite alternative) */}
          <div className="border-t border-white/[0.06] pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.12] text-zinc-400 font-mono">
                SAM 1
              </span>
              <span className="text-zinc-400">ViT-B · ~40 MB</span>
            </div>
            <div className="text-zinc-500 mb-2">
              Lite alternative — single-frame only, no tracking. Faster start.
            </div>
            <button
              onClick={() => startDownload('sam1')}
              className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] transition"
            >
              Download SAM 1 (40 MB)
            </button>
          </div>

          <div className="border-t border-white/[0.06] pt-2 flex gap-2">
            <button
              onClick={() => window.api.invoke('aiMask.revealModelsDir')}
              className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] transition"
            >
              Open Folder
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] transition disabled:opacity-50"
            >
              {loading ? '…' : '↻'} Refresh
            </button>
          </div>
        </div>
      )}

      {allReady && (
        <AiMaskActions status={status} refresh={refresh} />
      )}
    </div>
  );
}

/* ─── AiMaskActions — Track-Button + Clear + Reset wenn Models ready ─ */

function AiMaskActions({
  status,
  refresh,
}: {
  status: { activeVariant?: 'sam1' | 'sam2' };
  refresh: () => void;
}) {
  // Lokal-State für sampling-fps & track-progress (received via window event)
  const [samplingFps, setSamplingFps] = useState(2);
  const [tracking, setTracking] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail as { done: number; total: number };
      setTracking(detail);
    };
    const onDone = () => setTracking(null);
    window.addEventListener('aimask:trackProgress', onProgress);
    window.addEventListener('aimask:framesUpdate', onDone);
    return () => {
      window.removeEventListener('aimask:trackProgress', onProgress);
      window.removeEventListener('aimask:framesUpdate', onDone);
    };
  }, []);

  const onTrack = () => {
    // Inspector kennt selectedId nicht direkt — dispatch event mit "current selected"
    // intent. OverlayVideo's Listener checkt clipId.
    // Wir dispatchen mit '*' und der Listener filtert auf clip.id.
    // Cleaner: emit aus parent. Aber wir können hier einfach an alle dispatchen
    // — der Listener pro OverlayVideo prüft clipId via custom selector.
    window.dispatchEvent(new CustomEvent('aimask:trackRequest', { detail: { samplingFps } }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={clsx(
          'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono',
          status.activeVariant === 'sam2'
            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
            : 'bg-fiano-red/15 border border-fiano-red/40 text-fiano-red',
        )}>
          {status.activeVariant === 'sam2' ? 'SAM 2' : 'SAM 1'}
        </span>
        <span className="text-[10px] text-zinc-500">
          {status.activeVariant === 'sam2'
            ? 'Hiera base_plus · tracking ready'
            : 'ViT-B · single-frame · local · free'}
        </span>
      </div>
      <div className="text-[10px] text-zinc-500 leading-relaxed">
        <strong className="text-zinc-300">Left-click</strong> = include · <strong className="text-zinc-300">Right-click</strong> = exclude · click marker to remove.
      </div>

      {/* Tracking — funktioniert mit SAM 1 ODER SAM 2. Helper ist model-agnostic. */}
      <div className={clsx(
        'rounded-md p-2 space-y-2 border',
        status.activeVariant === 'sam2'
          ? 'bg-emerald-500/[0.06] border-emerald-500/30'
          : 'bg-fiano-red/[0.05] border-fiano-red/30',
      )}>
        <div className={clsx(
          'text-[10px] font-semibold',
          status.activeVariant === 'sam2' ? 'text-emerald-400' : 'text-fiano-red',
        )}>
          Track this clip
        </div>
        <div className="text-[10px] text-zinc-400">
          Re-runs {status.activeVariant === 'sam2' ? 'SAM 2' : 'SAM 1'} frame-by-frame using your click points.
          Per-frame masks follow the moving subject. ~2-3s per frame — sampling more often = smoother but slower.
        </div>
        <Field label={`Sampling rate (${samplingFps} fps)`}>
          <RangeRow
            value={samplingFps}
            min={0.5} max={10} step={0.5}
            onChange={setSamplingFps}
            display={`${samplingFps} fps`}
          />
        </Field>
        {tracking ? (
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-300">Tracking… {tracking.done}/{tracking.total} frames</div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={clsx('h-full transition-all', status.activeVariant === 'sam2' ? 'bg-emerald-500' : 'bg-fiano-red')}
                style={{ width: `${(tracking.done / tracking.total) * 100}%` }}
              />
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('aimask:trackCancel'))}
              className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onTrack}
            className={clsx(
              'px-3 py-1.5 text-[11px] rounded-md text-white hover:brightness-110 transition',
              status.activeVariant === 'sam2'
                ? 'bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                : 'bg-fiano-red shadow-[0_0_12px_rgba(255,16,57,0.3)]',
            )}
          >
            Track Subject
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('aimask:clear'))}
          className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] hover:border-fiano-red/40 transition"
        >
          Clear all
        </button>
        <button
          onClick={async () => {
            if (!confirm('Delete all SAM models? You will need to re-download next time.')) return;
            await window.api.invoke('aiMask.resetModels');
            refresh();
          }}
          className="px-2 py-1 text-[10px] rounded-md bg-white/[0.04] border border-white/[0.08] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.08] transition"
        >
          Reset models
        </button>
      </div>
    </div>
  );
}

/* ─── TransitionIcon — visuelles Symbol pro Transition-Type ──── */

function TransitionIcon({ type }: { type: TransitionType }) {
  switch (type) {
    case 'cross':
    case 'non-additive':
      return (
        <svg viewBox="0 0 32 16" className="w-7 h-3.5" fill="currentColor">
          <rect x="0"  y="2" width="14" height="12" opacity="0.85" rx="1" />
          <rect x="18" y="2" width="14" height="12" opacity="0.55" rx="1" />
          <rect x="11" y="2" width="10" height="12" opacity="0.4" rx="1" />
        </svg>
      );
    case 'additive':
      return (
        <svg viewBox="0 0 32 16" className="w-7 h-3.5" fill="currentColor">
          <rect x="0"  y="2" width="14" height="12" rx="1" />
          <rect x="18" y="2" width="14" height="12" rx="1" />
          <circle cx="16" cy="8" r="4" fill="white" opacity="0.95" />
        </svg>
      );
    case 'blur':
      return (
        <svg viewBox="0 0 32 16" className="w-7 h-3.5" fill="currentColor">
          <rect x="0"  y="2" width="14" height="12" rx="1" filter="blur(1px)" />
          <rect x="18" y="2" width="14" height="12" rx="1" filter="blur(1px)" />
          <rect x="11" y="3" width="10" height="10" opacity="0.4" rx="1" />
        </svg>
      );
    case 'dip-to-color':
      return (
        <svg viewBox="0 0 32 16" className="w-7 h-3.5" fill="currentColor">
          <rect x="0"  y="2" width="12" height="12" rx="1" />
          <rect x="14" y="2" width="4"  height="12" fill="black" stroke="currentColor" strokeWidth="0.5" />
          <rect x="20" y="2" width="12" height="12" rx="1" />
        </svg>
      );
  }
}

/* ─── AssetSidebar ──────────────────────────────────────────── */

function AssetSidebar({
  width, category, assets, onAddToTimeline, onOpenTts, onOpenTextDialog, onUploadLut, lutLocked,
}: {
  width: number;
  category: AssetCategory;
  assets: Array<{ id: string; kind: TrackKind; label: string; src?: string; previewSrc?: string; transcoding?: boolean; transitionType?: TransitionType }>;
  onAddToTimeline: (a: { id: string; kind: TrackKind; label: string; src?: string; previewSrc?: string; transitionType?: TransitionType }) => void;
  onOpenTts?: () => void;
  onOpenTextDialog?: () => void;
  onUploadLut?: () => void;
  lutLocked?: boolean;
}) {
  const t = useT();
  const categories = useEditorCategories();
  // Category-Header-Action-Button basierend auf aktivem Tab
  const headerAction = (() => {
    if (category === 'tts'     && onOpenTts)        return { label: t('editor.generateBtn'), onClick: onOpenTts, locked: false };
    if (category === 'text'    && onOpenTextDialog) return { label: t('editor.customBtn'),   onClick: onOpenTextDialog, locked: false };
    if (category === 'filters' && onUploadLut)      return { label: t('editor.uploadLutBtn'), onClick: onUploadLut, locked: !!lutLocked };
    return null;
  })();

  return (
    <aside className="shrink-0 flex flex-col" style={{ width }}>
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
          {categories.find((c) => c.key === category)?.label}
        </div>
        {headerAction && (
          <button
            onClick={headerAction.onClick}
            className={clsx(
              'flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md',
              'border border-fiano-red/45 text-fiano-red bg-transparent',
              'hover:bg-fiano-red/10 hover:border-fiano-red/70',
              'active:scale-[0.97] transition-all',
            )}
          >
            {headerAction.locked && <LockBadge />}
            {headerAction.label}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {assets.length === 0 ? (
          <div className="text-[11px] text-zinc-600 italic px-2 py-4 text-center">
            No assets in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((a) => (
              <button
                key={a.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(a));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDoubleClick={() => onAddToTimeline(a)}
                className="group aspect-video rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06]
                           hover:border-fiano-red/40 hover:bg-white/[0.06] transition relative cursor-grab active:cursor-grabbing"
                title={a.label + ' (double-click or drag)'}
              >
                {a.kind === 'audio' && a.src ? (
                  <div className="relative w-full h-full bg-gradient-to-b from-emerald-950/40 via-emerald-950/20 to-emerald-950/40">
                    <AudioWaveformBars clipId={a.id} />
                  </div>
                ) : a.src ? (
                  <video
                    src={mediaUrl(a.previewSrc ?? a.src)}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : a.transitionType ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1
                                  bg-gradient-to-br from-fiano-red/15 to-fiano-red/5
                                  text-fiano-red/90">
                    <TransitionIcon type={a.transitionType} />
                    <span className="text-[8px] uppercase tracking-wider">Drag onto clip</span>
                  </div>
                ) : a.id.startsWith('e-') ? (
                  // Effect-Preview: Mini-Demo der jeweiligen Effekt-Animation
                  <EffectAssetPreview effectId={a.id} />
                ) : a.id.startsWith('f-') || a.id.startsWith('lut-') ? (
                  // Filter-Preview: gleiches Demo-Image mit dem jeweiligen Filter applied
                  <FilterAssetPreview filterId={a.id} />
                ) : a.id.startsWith('t-') ? (
                  // Text-Preview: Mini-Beispiel mit dem zugehörigen Text-Style
                  <TextAssetPreview presetId={a.id} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700">
                    <KindIcon kind={a.kind} />
                  </div>
                )}
                {a.transcoding && (
                  <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1 z-10">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-fiano-red animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
                    </svg>
                    <span className="text-[9px] text-zinc-300 uppercase tracking-wider">Optimizing</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] text-white truncate
                                bg-gradient-to-t from-black/80 to-transparent">
                  {a.label}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/** Visueller Overlay-Layer für Effects die mehr brauchen als nur CSS-filter (z.B. Aura, Speed-Lines).
 *  Wird über das Video-Element gerendert mit mix-blend-mode oder absolute Gradients. */
function EffectVisualOverlay({ effect, intensity }: { effect: EffectId; intensity: number }) {
  const i = Math.max(0, Math.min(1, intensity));
  const alpha = 0.5 + 0.4 * i;
  switch (effect) {
    case 'aura-purple':
      return (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: `radial-gradient(circle at 50% 60%, rgba(168,85,247,${alpha}) 0%, rgba(139,92,246,${alpha * 0.7}) 25%, transparent 60%)`,
            mixBlendMode: 'screen',
            animation: 'fiano-zoom-pulse 1.8s ease-in-out infinite',
          }}
        />
      );
    case 'light-burst':
      return (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,${alpha}) 0%, rgba(255,200,100,${alpha * 0.6}) 15%, transparent 40%)`,
            mixBlendMode: 'screen',
            animation: 'fiano-zoom-pulse 0.8s ease-out 1 forwards',
          }}
        />
      );
    case 'speed-lines':
      // Anime speed-lines via repeating-linear-gradient
      return (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: `repeating-linear-gradient(90deg, transparent 0, transparent 8px, rgba(255,255,255,${alpha * 0.3}) 8px, rgba(255,255,255,${alpha * 0.3}) 10px)`,
            mixBlendMode: 'screen',
            opacity: 0.7,
            maskImage: 'radial-gradient(ellipse at center, transparent 30%, black 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 30%, black 100%)',
          }}
        />
      );
    case 'energy-trail':
      // Farbverlauf cyan → lila → pink, mehr Magenta-Anteil. Subtile saturation.
      return (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background: `linear-gradient(135deg, rgba(34,211,238,${alpha * 0.2}) 0%, rgba(168,85,247,${alpha * 0.28}) 45%, rgba(236,72,153,${alpha * 0.32}) 100%)`,
            mixBlendMode: 'screen',
          }}
        />
      );
    case 'glow':
      return (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            boxShadow: `inset 0 0 ${Math.round(80 * i)}px rgba(255,200,150,${alpha * 0.5})`,
            mixBlendMode: 'screen',
          }}
        />
      );
    case 'combo-montage':
      // Heller weiß-blau Glow + Slow-Mo-Vignette + Light-Streaks für Fortnite-Montage-Look
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* Heller Bloom-Glow (weiß statt orange — vermeidet bräunlichen Look) */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow: `inset 0 0 ${Math.round(120 * i)}px rgba(255,255,255,${alpha * 0.6})`,
              mixBlendMode: 'screen',
            }}
          />
          {/* Cooler kalter Tint für Slow-Mo-Stimmung */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(150,200,255,${alpha * 0.15}) 0%, transparent 70%)`,
              mixBlendMode: 'screen',
            }}
          />
          {/* Diagonale Light-Streak (anime-style) */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, transparent 35%, rgba(255,255,255,${alpha * 0.35}) 50%, transparent 65%)`,
              mixBlendMode: 'screen',
              animation: 'fiano-zoom-pulse 1.4s ease-in-out infinite',
            }}
          />
          {/* Sanfte Vignette für „Cinematic" Slow-Mo-Look */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 50%, transparent 50%, rgba(0,0,0,${alpha * 0.25}) 100%)`,
            }}
          />
        </div>
      );
    case 'rgb-split':
      // Lila + Cyan Split-Ghosts
      return (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div
            className="absolute inset-0"
            style={{
              boxShadow: 'inset 3px 0 0 rgba(255,30,80,0.5), inset -3px 0 0 rgba(60,200,255,0.5)',
              mixBlendMode: 'screen',
            }}
          />
        </div>
      );
    default:
      return null;
  }
}

function KindIcon({ kind }: { kind: TrackKind }) {
  if (kind === 'audio') return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V6l11-2v13" /><circle cx="6" cy="19" r="2.5" /><circle cx="17" cy="17" r="2.5" /></svg>;
  if (kind === 'text')  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 7V5h14v2 M12 5v14 M9 19h6" /></svg>;
  return <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>;
}

/* ─── Asset-Sidebar Mini-Previews ────────────────────────── */

const EFFECT_PREVIEW_MAP: Record<string, EffectId> = {
  'e-glitch': 'glitch', 'e-shake': 'shake', 'e-glow': 'glow',
  'e-zoomin': 'zoom-pulse', 'e-rgb': 'rgb-split',
  'e-combo-montage': 'combo-montage', 'e-combo-hype': 'combo-hype', 'e-combo-clean': 'combo-clean',
  'e-aura-purple': 'aura-purple', 'e-light-burst': 'light-burst',
  'e-speed-lines': 'speed-lines', 'e-energy-trail': 'energy-trail',
};

const FILTER_PREVIEW_MAP: Record<string, NonNullable<TimelineClip['filter']>> = {
  'f-vivid': 'vivid', 'f-gaming': 'gaming', 'f-bw': 'bw',
  'f-cinema': 'cinema', 'f-warm': 'warm', 'f-cool': 'cool',
};

/** Mini-Preview für Effect-Asset-Card. Animiertes Demo-Gradient mit dem Effect applied. */
function EffectAssetPreview({ effectId }: { effectId: string }) {
  const effect = EFFECT_PREVIEW_MAP[effectId];
  const css = effectCssFilter(effect, 1);
  const anim = effectAnimation(effect);
  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-fiano-red/30 via-purple-600/20 to-blue-600/20">
      <div
        className="absolute inset-0 flex items-center justify-center text-[26px]"
        style={{ filter: css || undefined, animation: anim || undefined }}
      >
        ✨
      </div>
    </div>
  );
}

/** Mini-Preview für Filter-Asset-Card. Demo-Gradient mit Color-Filter. */
function FilterAssetPreview({ filterId }: { filterId: string }) {
  const filter = FILTER_PREVIEW_MAP[filterId];
  const css = filter
    ? filterCssFilter(filter)
    : 'saturate(1.1) contrast(1.05)';  // Custom-LUT: subtle hint, real apply nur im Export
  const isLut = filterId.startsWith('lut-');
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-orange-400 via-pink-500 to-cyan-400"
        style={{ filter: css }}
      />
      {isLut && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] font-mono text-white">
          LUT
        </div>
      )}
    </div>
  );
}

/** Mini-Preview für Text-Asset-Card. Zeigt „Aa" mit dem entsprechenden Style. */
function TextAssetPreview({ presetId }: { presetId: string }) {
  const styleMap: Record<string, React.CSSProperties> = {
    't-headline':  { fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' },
    't-subtitle':  { fontSize: 28, fontWeight: 600, color: '#e5e5e5' },
    't-lower':     { fontSize: 22, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '0.1em 0.4em', borderRadius: '0.2em' },
    't-callout':   { fontSize: 24, fontWeight: 800, color: '#ff1039', letterSpacing: '0.05em' },
    't-glow':      { fontSize: 32, fontWeight: 800, color: '#fff', textShadow: '0 0 12px #fff, 0 0 24px #fff, 0 0 36px #fff' },
    't-shadow':    { fontSize: 32, fontWeight: 800, color: '#fff', textShadow: '2px 4px 8px rgba(0,0,0,0.9)' },
  };
  // Layered: 2-line stack mit gradient-Aa über kleinem aa
  if (presetId === 't-layered') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 flex flex-col items-center justify-center leading-none">
        <span style={{
          fontSize: 32, fontWeight: 900,
          background: 'linear-gradient(180deg,#ff5570 0%,#ff1039 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.6))',
        }}>Aa</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: '#fff',
          marginTop: '-12px',
          textShadow: '0 1px 2px rgba(0,0,0,0.7)',
        }}>aa</span>
      </div>
    );
  }
  const style = styleMap[presetId] ?? { fontSize: 24, fontWeight: 700, color: '#fff' };
  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 flex items-center justify-center">
      <span style={style}>Aa</span>
    </div>
  );
}

/* ─── CenterPreview ────────────────────────────────────────── */

function CenterPreview({
  clips, tracks, playhead, playing, stateLoaded, onPlayheadChange, onPlayingChange, totalDuration, onExpand, onClipMetadata,
}: {
  clips: TimelineClip[];
  tracks: Track[];
  playhead: number;
  playing: boolean;
  stateLoaded: boolean;
  onPlayheadChange: (t: number) => void;
  onPlayingChange: (p: boolean) => void;
  totalDuration: number;
  onExpand?: () => void;
  onClipMetadata?: (clipId: string, srcDuration: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [aiMaskBusy, setAiMaskBusy] = useState<'loading' | 'encoding' | 'decoding' | null>(null);
  // Cache: encoded frame pro clip (Encoder ist heavy, ~1-3s — wir cachen pro clipId)
  const encodedFrameRef = useRef<Map<string, aiMask.EncodedFrame>>(new Map());

  // Welcher Video-Clip läuft am Playhead?
  const activeClip = clips
    .filter((c) => c.type === 'video' && !tracks[c.trackIdx]?.hidden)
    .find((c) => playhead >= c.start && playhead < c.start + c.duration);

  // Render mask als rotes Tint-Overlay über das Video wenn aiMaskData gesetzt ist
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mask = activeClip?.aiMaskData;
    if (!activeClip?.aiMaskEnabled || !mask) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = mask.width;
    canvas.height = mask.height;
    const img = ctx.createImageData(mask.width, mask.height);
    // mask.data ist 0..1 sigmoid output. Soft-Edge mit smoothstep für saubere Kanten.
    for (let i = 0; i < mask.data.length; i++) {
      const v = mask.data[i];
      // Smooth-step zwischen 0.4 und 0.6 → weiche Mask-Kanten
      const alpha = v < 0.4 ? 0 : v > 0.6 ? 200 : Math.round((v - 0.4) * 1000);
      img.data[i * 4 + 0] = 255;        // R
      img.data[i * 4 + 1] = 16;         // G
      img.data[i * 4 + 2] = 57;         // B
      img.data[i * 4 + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    console.log(`[ai-mask] rendered mask canvas: ${canvas.width}x${canvas.height}`);
  }, [activeClip?.id, activeClip?.aiMaskEnabled, activeClip?.aiMaskData]);

  // SAM-Click-Handler: capture frame → encode (cached) → decode mit allen points → setClips
  const onMaskClick = async (e: React.MouseEvent<HTMLVideoElement>, isExclude: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeClip || !videoRef.current) return;
    const v = videoRef.current;
    const rect = v.getBoundingClientRect();
    // Klickposition relativ zum gerenderten <video>-Element. Aber object-contain
    // kann das Video horizontal/vertikal padden. Wir mappen auf Video-Native-Auflösung.
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    // Approximation: object-contain → finde das ratio der inneren Video-Box
    const vAspect = v.videoWidth / v.videoHeight;
    const rAspect = rect.width / rect.height;
    let xImg = xRel, yImg = yRel;
    if (vAspect > rAspect) {
      // Video letterboxed top/bottom
      const visibleH = rect.width / vAspect;
      const padY = (rect.height - visibleH) / 2 / rect.height;
      yImg = (yRel - padY) / (1 - 2 * padY);
    } else {
      // Video letterboxed left/right
      const visibleW = rect.height * vAspect;
      const padX = (rect.width - visibleW) / 2 / rect.width;
      xImg = (xRel - padX) / (1 - 2 * padX);
    }
    if (xImg < 0 || xImg > 1 || yImg < 0 || yImg > 1) return; // outside content
    const newPoint = { x: xImg, y: yImg, label: (isExclude ? 0 : 1) as 0 | 1 };
    const points = [...(activeClip.aiMaskPoints ?? []), newPoint];

    try {
      // Models lazy-load on first click
      if (!aiMask.isLoaded()) {
        setAiMaskBusy('loading');
        await aiMask.loadModels();
      }

      // Encode aktuelles Frame falls noch nicht gecached
      let encoded = encodedFrameRef.current.get(activeClip.id);
      if (!encoded) {
        setAiMaskBusy('encoding');
        // Frame zu ImageData
        const tmp = document.createElement('canvas');
        tmp.width = v.videoWidth;
        tmp.height = v.videoHeight;
        tmp.getContext('2d')!.drawImage(v, 0, 0);
        const imgData = tmp.getContext('2d')!.getImageData(0, 0, v.videoWidth, v.videoHeight);
        encoded = await aiMask.encodeImage(imgData);
        encodedFrameRef.current.set(activeClip.id, encoded);
      }

      setAiMaskBusy('decoding');
      const mask = await aiMask.generateMask(encoded, points);
      if (mask) {
        // Update clip via parent (über setClips). Wir brauchen Zugriff zu setClips...
        // Hack: dispatch über Custom-Event, Parent listened. Cleaner: prop-callback.
        window.dispatchEvent(new CustomEvent('aimask:update', {
          detail: { clipId: activeClip.id, points, mask: { width: mask.width, height: mask.height, data: Array.from(mask.data) } },
        }));
      }
    } catch (err) {
      console.error('[ai-mask] click failed:', err);
      window.alert('AI Mask error: ' + ((err as Error).message ?? err));
    } finally {
      setAiMaskBusy(null);
    }
  };

  // Live-Preview Transitions: detektiere ob Playhead in Transition-Window liegt.
  // Cross/Non-Additive/Additive/Blur: Overlap [B.start - D, B.start)
  // Dip-To-Color: Sequentiell [B.start - D, B.start) — A fadet zur Farbe (D/2),
  // dann B fadet von Farbe (D/2). Kein Overlap, aber wir nutzen das gleiche Window
  // damit der Effekt zentriert um den Cut wirkt.
  const transitioning = (() => {
    for (const b of clips) {
      if (b.type !== 'video' || tracks[b.trackIdx]?.hidden) continue;
      if (!b.transitionType) continue;
      const D = b.transitionDuration ?? 0.5;
      if (D <= 0) continue;
      // Für dip-to-color zentrieren wir das Window symmetrisch um den Cut
      const overlapStart = b.transitionType === 'dip-to-color' ? b.start - D / 2 : b.start - D;
      const overlapEnd   = b.transitionType === 'dip-to-color' ? b.start + D / 2 : b.start;
      if (playhead < overlapStart || playhead >= overlapEnd) continue;
      const a = clips.find((c) =>
        c !== b && c.type === 'video' && c.trackIdx === b.trackIdx
        && Math.abs(c.start + c.duration - b.start) < 0.5,
      );
      if (!a) continue;
      const progress = Math.max(0, Math.min(1, (playhead - overlapStart) / (overlapEnd - overlapStart)));
      return { from: a, to: b, progress, duration: D, type: b.transitionType, color: b.transitionColor };
    }
    return null;
  })();

  // Sync der Transition-To-Video (B während Overlap)
  useEffect(() => {
    const v = transitionVideoRef.current;
    if (!v || !transitioning) return;
    const localTime = (transitioning.to.trimStart ?? 0) + (playhead - transitioning.to.start + transitioning.duration);
    const playSrc = playbackSrc(transitioning.to);
    const wantSrc = playSrc ? mediaUrl(playSrc) ?? '' : '';
    if (v.src !== wantSrc) {
      v.src = wantSrc;
      v.addEventListener('loadeddata', () => {
        v.currentTime = Math.max(0, localTime);
        if (playing) v.play().catch(() => {});
      }, { once: true });
    } else {
      if (Math.abs(v.currentTime - localTime) > 0.3) v.currentTime = Math.max(0, localTime);
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitioning?.to.id, transitioning?.to.previewSrc, playing]);

  // Wenn aktiver Clip wechselt → src + currentTime updaten
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!activeClip) { v.pause(); return; }
    // Während Transcode: NIE den Original-src laden — sonst landet das <video>
    // in MEDIA_ERR_DECODE (HEVC/ProRes nicht browser-decodierbar) und bleibt
    // schwarz selbst wenn previewSrc später ankommt. Stattdessen src leeren bis
    // transcoding=false; das Loading-Overlay deckt das visuell ab.
    if (activeClip.transcoding) {
      if (v.src) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
      return;
    }
    const localTime = playhead - activeClip.start + (activeClip.trimStart ?? 0);
    const playSrc = playbackSrc(activeClip);
    const wantSrc = playSrc ? (mediaUrl(playSrc) ?? '') : '';
    if (v.src !== wantSrc) {
      setVideoError(false);
      v.src = wantSrc;
      v.addEventListener('loadeddata', () => {
        v.currentTime = localTime;
        if (playing) v.play().catch(() => {});
      }, { once: true });
      v.load();
    } else {
      // Nur Time anpassen wenn mehr als 0.3s Drift
      if (Math.abs(v.currentTime - localTime) > 0.3) v.currentTime = localTime;
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, activeClip?.previewSrc, activeClip?.transcoding, playing]);

  // Effect-PlaybackRate: wenn ein Effect-Clip am Playhead die Geschwindigkeit überschreibt
  // (z.B. combo-montage = 0.5 für slow-mo), wende das auf das video-Element an.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const trackEffects = activeEffectClipsAtPlayhead(clips, tracks, playhead);
    let rate = 1;
    for (const eff of trackEffects) {
      const r = effectPlaybackRate(eff.id);
      if (r !== undefined) { rate = r; break; }
    }
    if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
  }, [clips, tracks, playhead]);

  // Debug-Log: blend-mode auf dem video-Element überprüfen
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    const computed = window.getComputedStyle(v);
    console.log(
      `[blend-mode] clipId=${activeClip.id} blendMode=${activeClip.blendMode ?? 'normal'}`,
      `inline-style mix-blend-mode=${v.style.mixBlendMode || 'unset'}`,
      `computed mix-blend-mode=${computed.mixBlendMode}`,
      `willChange=${v.style.willChange || 'unset'}`,
      `filter=${v.style.filter || 'none'}`,
    );
  }, [activeClip?.id, activeClip?.blendMode]);

  // Während Transcode läuft: Spinner-Overlay hat priority, videoError soll nicht stale bleiben.
  // Auch beim transcoding=true→false Übergang clearen, damit ein evtl. während Transcode
  // gefireter onError (vom alten src) nicht als „Codec not supported" hängenbleibt — der
  // src-wechsel-Effect fired das Video neu, das gibt onLoadedData/onError fresh.
  useEffect(() => {
    setVideoError(false);
  }, [activeClip?.transcoding]);

  // Vor stateLoaded keinen videoError zeigen — initial-render-Race vermeiden.
  useEffect(() => {
    if (!stateLoaded) setVideoError(false);
  }, [stateLoaded]);

  // Playhead-Tick wenn playing.
  // Wenn ein Video-Clip am Playhead aktiv ist → sync mit videoEl.currentTime (Frame-genau).
  // Wenn KEIN Video-Clip (Gap zwischen Clips, Audio-only oder vor erstem Clip) → tick via Date.now()
  // damit Playhead trotzdem weiterläuft und beim nächsten Clip nahtlos einrastet.
  useEffect(() => {
    if (!playing) return;
    let lastTickMs = Date.now();
    const i = setInterval(() => {
      const v = videoRef.current;
      const now = Date.now();
      const dt = (now - lastTickMs) / 1000;
      lastTickMs = now;
      let newPlayhead: number;
      if (v && activeClip && !v.paused) {
        // Video läuft → nutze video-time als source of truth
        const localT = v.currentTime - (activeClip.trimStart ?? 0);
        newPlayhead = activeClip.start + localT;
      } else {
        // Gap / kein Video → Wallclock-Tick
        newPlayhead = playhead + dt;
      }
      onPlayheadChange(Math.min(totalDuration, newPlayhead));
      if (newPlayhead >= totalDuration) onPlayingChange(false);
    }, 100);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeClip, totalDuration, onPlayheadChange, onPlayingChange]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-fiano-black">
      {/* Preview Frame */}
      <div
        className="flex-1 flex items-center justify-center p-6 min-h-0 relative"
        style={{ containerType: 'size' }}
      >
        <div
          data-editor-preview-box=""
          className="rounded-md overflow-hidden bg-black relative ring-1 ring-fiano-red/35"
          style={{
            width: 'min(100cqw, calc(100cqh * 16 / 9))',
            height: 'min(100cqh, calc(100cqw * 9 / 16))',
          }}
        >
          {/* 16:9 Frame-Label */}
          <div className="absolute top-2 left-2 z-30 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider
                          bg-fiano-red/85 text-white backdrop-blur-sm">
            16:9 Output
          </div>

          {/* Test-Pattern unter dem Video wenn Blend-Mode aktiv ist — damit Screen/Multiply/etc.
              sichtbar werden statt unverändert/schwarz gegen bg-black zu rendern. */}
          {activeClip?.blendMode && activeClip.blendMode !== 'normal' && (
            <div
              aria-hidden
              className="absolute inset-0 z-0"
              style={{
                background: `repeating-conic-gradient(rgba(255,255,255,0.18) 0% 25%, rgba(255,255,255,0.08) 25% 50%) 50% / 40px 40px, linear-gradient(135deg, rgba(168,85,247,0.5), rgba(255,255,255,0.4) 40%, rgba(34,211,238,0.5))`,
              }}
            />
          )}

          {activeClip && activeClip.src ? (
            <>
              <video
                ref={videoRef}
                playsInline
                className="w-full h-full object-contain absolute inset-0"
                style={{
                  transform: [
                    `translate(${(activeClip.posX ?? 0) * 100}%, ${(activeClip.posY ?? 0) * 100}%)`,
                    `scale(${activeClip.scale ?? 1})`,
                    `rotate(${activeClip.rotation ?? 0}deg)`,
                  ].join(' '),
                  filter: (() => {
                    const base = cssAdjustFilter(
                      activeClip,
                      transitioning && transitioning.type === 'blur' && activeClip.id === transitioning.from.id
                        ? `blur(${transitioning.progress * 12}px)` : undefined,
                    );
                    // Plus Filter aus Effect-Track-Clips am playhead
                    const trackEffects = activeEffectClipsAtPlayhead(clips, tracks, playhead);
                    const trackFilter = trackEffects.length > 0 ? combinedEffectsCssFilter(trackEffects) : '';
                    return [base, trackFilter].filter(Boolean).join(' ') || undefined;
                  })(),
                  opacity: activeClip.lutPath
                    ? 0  // LUT aktiv → video unsichtbar, LutVideoOverlay zeigt LUT-graded version
                    : transitioning && transitioning.type === 'dip-to-color' && activeClip.id === transitioning.from.id
                      ? Math.max(0, 1 - transitioning.progress * 2)
                      : (activeClip.opacity ?? 1),
                  cursor: activeClip?.aiMaskEnabled ? 'crosshair' : undefined,
                  // willChange entfernt wenn blend-mode aktiv — sonst erstellt der Browser
                  // einen isolated stacking-context, in dem mix-blend-mode nichts darunter
                  // findet zum Mischen → blend-mode sichtbar nicht.
                  willChange: activeClip.blendMode && activeClip.blendMode !== 'normal'
                    ? undefined
                    : 'transform, opacity, filter',
                  // Effect-Animation: erste aktive transform-Animation gewinnt (legacy + Effect-Track)
                  animation: (() => {
                    const localT = playhead - activeClip.start + (activeClip.trimStart ?? 0);
                    const all = [
                      ...activeEffectsAt(activeClip, localT),
                      ...activeEffectClipsAtPlayhead(clips, tracks, playhead),
                    ];
                    for (const eff of all) {
                      const a = effectAnimation(eff.id);
                      if (a) return a;
                    }
                    return undefined;
                  })(),
                  // Blend-Mode: auch auf Haupt-Video applique (gegen den schwarzen Frame-BG)
                  mixBlendMode: activeClip.blendMode ?? 'normal',
                }}
                onClick={(e) => {
                  if (activeClip?.aiMaskEnabled) { onMaskClick(e, false); return; }
                  onPlayingChange(!playing);
                }}
                onContextMenu={(e) => {
                  if (activeClip?.aiMaskEnabled) onMaskClick(e, true);
                }}
                onError={() => {
                  // Vor stateLoaded oder während transcoding ist videoError sinnlos
                  // (Spinner-Overlay gewinnt sowieso) und führt zu stalem Codec-Error-Flash
                  // beim Edit-Tab-Open. Erst nach stateLoaded ernst nehmen.
                  if (!stateLoaded || activeClip?.transcoding) return;
                  setVideoError(true);
                }}
                onLoadedData={() => setVideoError(false)}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (activeClip && Number.isFinite(v.duration) && v.duration > 0 && !activeClip.srcDuration) {
                    onClipMetadata?.(activeClip.id, v.duration);
                  }
                }}
              />
              {/* LUT Live-Preview — Canvas-Overlay rendert video-frame durch 3D-LUT.
                  Aktiv wenn activeClip.lutPath gesetzt; das `<video>` darüber ist auf opacity:0
                  (frame-source bleibt aktiv für TexImage2D). Transform/Opacity matched mit video. */}
              {activeClip.lutPath && (
                <LutVideoOverlay
                  videoRef={videoRef}
                  lutPath={activeClip.lutPath}
                  style={{
                    transform: [
                      `translate(${(activeClip.posX ?? 0) * 100}%, ${(activeClip.posY ?? 0) * 100}%)`,
                      `scale(${activeClip.scale ?? 1})`,
                      `rotate(${activeClip.rotation ?? 0}deg)`,
                    ].join(' '),
                    opacity: activeClip.opacity ?? 1,
                  }}
                />
              )}
              {/* Effect-Overlay-Layer: legacy clip-effects + globale Effect-Track-Effects */}
              {[
                ...activeEffectsAt(activeClip, playhead - activeClip.start + (activeClip.trimStart ?? 0)),
                ...activeEffectClipsAtPlayhead(clips, tracks, playhead),
              ].map((eff, i) => (
                <EffectVisualOverlay key={`${eff.id}-${i}`} effect={eff.id} intensity={eff.intensity ?? 1} />
              ))}
              {/* AI Mask: rotes Tint-Overlay — Canvas wird auf Video-Größe gestretcht.
                   Cropped mask = video aspect ratio, also keine Verzerrung.
                   Kein mix-blend-mode → red-tint klar sichtbar auf jedem BG. */}
              {activeClip.aiMaskEnabled && activeClip.aiMaskData && (
                <canvas
                  ref={maskCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ objectFit: 'fill' }}
                />
              )}
              {/* AI Mask: Click-Marker — Hover/Click = Punkt löschen */}
              {activeClip.aiMaskEnabled && (activeClip.aiMaskPoints ?? []).map((p, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    console.log(`[ai-mask] remove point ${i} of clip ${activeClip.id}`);
                    window.dispatchEvent(new CustomEvent('aimask:removePoint', {
                      detail: { index: i, clipId: activeClip.id },
                    }));
                  }}
                  className={clsx(
                    'absolute w-5 h-5 rounded-full border-2 border-white cursor-pointer',
                    'transition-all hover:scale-125 hover:border-fiano-red',
                    p.label === 1 ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                  style={{
                    left: `calc(${p.x * 100}% - 10px)`,
                    top: `calc(${p.y * 100}% - 10px)`,
                    boxShadow: '0 0 8px rgba(0,0,0,0.6)',
                    zIndex: 25,
                  }}
                  title={`${p.label === 1 ? 'Include' : 'Exclude'} point — click to remove`}
                />
              ))}
              {/* AI Mask: Busy-Indicator */}
              {aiMaskBusy && (
                <div className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-fiano-black/80 backdrop-blur-sm
                                border border-fiano-red/40 text-[10px] text-zinc-200 flex items-center gap-2 z-30">
                  <svg viewBox="0 0 16 16" className="w-3 h-3 text-fiano-red animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
                  </svg>
                  <span className="uppercase tracking-wider">
                    {aiMaskBusy === 'loading' ? 'Loading model' : aiMaskBusy === 'encoding' ? 'Encoding frame' : 'Generating mask'}
                  </span>
                </div>
              )}
              {/* Live-Preview Transitions: render Clip B (transitionVideo) + ggf. Color-Dip-Overlay.
                   Cross/Non-Additive: B opacity = progress (clean alpha blend mit A).
                   Additive: gleicher Look wie Cross für Preview-Zwecke (echte addition needs WebGL).
                   Blur: A + B beide CSS-blurred, Sigma anhand progress.
                   Dip-To-Color: A fade zur Farbe (1. Hälfte), Color overlay, B fade von Farbe (2. Hälfte). */}
              {transitioning && (() => {
                const p = transitioning.progress;
                const type = transitioning.type;
                // CSS-Filter für Blur (auch auf das Haupt-Video angewandt via Hauptsync — siehe unten)
                const isBlur = type === 'blur';
                const isDip  = type === 'dip-to-color';
                // B opacity: 0→1 für cross/non-additive/additive/blur. Für dip: nur in 2. Hälfte (>0.5)
                let bOpacity = p;
                let bFilter = '';
                if (isBlur) {
                  bFilter = `blur(${(1 - p) * 12}px)`;  // B blur 12px → 0
                }
                if (isDip) {
                  bOpacity = p > 0.5 ? (p - 0.5) * 2 : 0;
                }
                return (
                  <>
                    <video
                      ref={transitionVideoRef}
                      muted
                      playsInline
                      className="w-full h-full object-contain absolute inset-0"
                      style={{
                        transform: [
                          `translate(${(transitioning.to.posX ?? 0) * 100}%, ${(transitioning.to.posY ?? 0) * 100}%)`,
                          `scale(${transitioning.to.scale ?? 1})`,
                          `rotate(${transitioning.to.rotation ?? 0}deg)`,
                        ].join(' '),
                        opacity: bOpacity,
                        filter: bFilter || undefined,
                        zIndex: 5,
                        willChange: 'transform, opacity, filter',
                      }}
                    />
                    {/* Dip-To-Color: solider Color-Overlay zwischen A und B, peak bei progress=0.5 */}
                    {isDip && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundColor: transitioning.color ?? '#000000',
                          opacity: 1 - Math.abs(p - 0.5) * 2,  // 0 → 1 → 0 über Window
                          zIndex: 6,
                        }}
                      />
                    )}
                  </>
                );
              })()}
              {/* Loading-Overlay (vor stateLoaded oder während Transcode):
                   hat Vorrang vor videoError, weil ein onError während dieser Phase
                   eine erwartete Race und kein echter Codec-Fehler ist. */}
              {(!stateLoaded || activeClip.transcoding) ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-30 px-6">
                  <div className="text-center max-w-sm">
                    <div className="w-10 h-10 rounded-xl bg-fiano-red/15 border border-fiano-red/40 mx-auto mb-3 flex items-center justify-center">
                      <svg viewBox="0 0 16 16" className="w-5 h-5 text-fiano-red animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
                      </svg>
                    </div>
                    <div className="text-[12px] font-semibold text-zinc-200 mb-1">
                      {!stateLoaded ? 'Loading editor…' : 'Optimizing for preview…'}
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-relaxed">
                      {!stateLoaded
                        ? 'Restoring timeline and validating media cache.'
                        : 'Creating browser-compatible cache (one-time, then instant). Original file is used for export — no quality loss.'}
                    </div>
                  </div>
                </div>
              ) : videoError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-30 px-6">
                  <div className="text-center max-w-sm">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 mx-auto mb-3 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v4 M12 17h.01 M12 3l10 18H2L12 3z" />
                      </svg>
                    </div>
                    <div className="text-[12px] font-semibold text-amber-200 mb-1">Codec not supported</div>
                    <div className="text-[10px] text-zinc-400 leading-relaxed">
                      Chromium can't preview this file (likely ProRes / HEVC / Animation in <code className="text-zinc-300">.mov</code>).
                      Try converting to MP4 (H.264 + AAC).
                      The export will still work — it uses FFmpeg directly.
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[12px]">
              {clips.length === 0 ? 'Drag assets to timeline to start editing' : 'No video clip at playhead'}
            </div>
          )}

          {/* Overlay-Track-Clips als echte Videos (alle non-video tracks die Sichtbar sind) */}
          {clips
            .filter((c) => (c.type === 'overlay' || (c.type === 'video' && c.trackIdx !== 0))
              && c.src && playhead >= c.start && playhead < c.start + c.duration
              && !tracks[c.trackIdx]?.hidden)
            .map((c) => c.chromaEnabled
              ? <ChromaKeyVideo key={c.id} clip={c} playing={playing} playhead={playhead} />
              : <OverlayVideo key={c.id} clip={c} playing={playing} playhead={playhead} />,
            )}

          {/* Text-Track-Clips (als Overlay-Text mit voller Style-Übernahme) */}
          {clips
            .filter((c) => c.type === 'text' && playhead >= c.start && playhead < c.start + c.duration && !tracks[c.trackIdx]?.hidden)
            .map((c) => (
              <TextOverlay key={c.id} clip={c} />
            ))}

          {/* Audio-Track-Clips als hidden audio-elements (für Playback-Sync) */}
          {clips
            .filter((c) => c.type === 'audio' && c.src && playhead >= c.start && playhead < c.start + c.duration && !tracks[c.trackIdx]?.muted)
            .map((c) => (
              <AudioPlayback key={c.id} clip={c} playing={playing} playhead={playhead} />
            ))}

          {/* Expand-Button rechts oben — öffnet Preview-Modal */}
          {onExpand && (
            <button
              onClick={onExpand}
              className="absolute top-2 right-2 z-30 w-8 h-8 rounded-md bg-black/60 backdrop-blur-sm
                         text-white hover:bg-black/85 transition flex items-center justify-center"
              title="Open in larger preview"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V3h4 M9 3h4v4 M3 9v4h4 M9 13h4v-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Player Controls */}
      <div className="px-6 py-3 flex items-center justify-center gap-3 border-t border-white/[0.06]">
        <button
          onClick={() => onPlayheadChange(Math.max(0, playhead - 5))}
          className="w-7 h-7 rounded-md text-zinc-300 hover:bg-white/[0.06] flex items-center justify-center transition"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M7 3v10l-7-5zM15 3v10l-7-5z"/></svg>
        </button>
        <button
          onClick={() => onPlayingChange(!playing)}
          className="w-9 h-9 rounded-lg bg-fiano-red text-white shadow-[0_0_16px_rgba(255,16,57,0.4)] hover:brightness-110 transition flex items-center justify-center"
        >
          {playing
            ? <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><rect x="4" y="3" width="2.5" height="10" rx="0.5"/><rect x="9.5" y="3" width="2.5" height="10" rx="0.5"/></svg>
            : <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-0.5" fill="currentColor"><path d="M3.5 3v10l10-5z"/></svg>}
        </button>
        <button
          onClick={() => onPlayheadChange(Math.min(totalDuration, playhead + 5))}
          className="w-7 h-7 rounded-md text-zinc-300 hover:bg-white/[0.06] flex items-center justify-center transition"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M9 3v10l7-5zM1 3v10l7-5z"/></svg>
        </button>
        <span className="text-[11px] font-mono text-zinc-400 tabular-nums ml-3">
          {fmtTime(playhead)} / {fmtTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}

/** CSS-Filter-String für Color-Adjustments + Effect/Filter-Presets (Live-Preview).
 *  `localTime` ist optional — wenn gegeben, werden nur effects appliziert die zu diesem
 *  Zeitpunkt aktiv sind (für position-based effect-instances). Sonst alle effects. */
function cssAdjustFilter(clip: TimelineClip, extra?: string, localTime?: number): string | undefined {
  const parts: string[] = [];
  if (extra) parts.push(extra);
  const br = clip.brightness;
  const co = clip.contrast;
  const sa = clip.saturation;
  if (br != null && br !== 0) parts.push(`brightness(${(1 + br).toFixed(3)})`);
  if (co != null && co !== 0) parts.push(`contrast(${(1 + co).toFixed(3)})`);
  if (sa != null && sa !== 0) parts.push(`saturate(${(1 + sa).toFixed(3)})`);
  if (clip.filter) {
    const f = filterCssFilter(clip.filter);
    if (f) parts.push(f);
  }
  // Multi-Effects: kombiniere alle aktiven (nach localTime gefiltert wenn gegeben)
  const effects = localTime !== undefined ? activeEffectsAt(clip, localTime) : clipEffects(clip);
  if (effects.length > 0) {
    const combined = combinedEffectsCssFilter(effects);
    if (combined) parts.push(combined);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/* ─── Overlay-Video — rendert clip als <video> über main video ─ */

function OverlayVideo({ clip, playing, playhead }: {
  clip: TimelineClip; playing: boolean; playhead: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const encodedRef = useRef<aiMask.EncodedFrame | null>(null);
  const [busy, setBusy] = useState<'loading' | 'encoding' | 'decoding' | null>(null);
  const [trackProgress, setTrackProgress] = useState<{ done: number; total: number } | null>(null);
  const trackCancelRef = useRef(false);

  // Listen for "aimask:track" event — start per-frame tracking
  useEffect(() => {
    const onTrack = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { clipId: string; samplingFps?: number };
      if (detail.clipId !== clip.id) return;
      const v = ref.current;
      if (!v || !clip.aiMaskPoints || clip.aiMaskPoints.length === 0) {
        window.alert('Place at least one click point first, then track.');
        return;
      }
      const samplingFps = detail.samplingFps ?? clip.aiMaskTrackFps ?? 2;
      trackCancelRef.current = false;
      setTrackProgress({ done: 0, total: 1 });
      try {
        if (!aiMask.isLoaded()) {
          setBusy('loading');
          await aiMask.loadModels();
          setBusy(null);
        }
        const frames = await aiMask.trackFrames(
          v,
          clip.aiMaskPoints,
          clip.trimStart ?? 0,
          clip.duration,
          samplingFps,
          (done, total) => {
            setTrackProgress({ done, total });
            // Inspector listens via window event
            window.dispatchEvent(new CustomEvent('aimask:trackProgress', { detail: { done, total } }));
          },
          () => trackCancelRef.current,
        );
        if (frames.length > 0) {
          window.dispatchEvent(new CustomEvent('aimask:framesUpdate', {
            detail: {
              clipId: clip.id,
              frames: frames.map((f) => ({
                time: f.time,
                mask: { width: f.mask.width, height: f.mask.height, data: Array.from(f.mask.data) },
              })),
              samplingFps,
            },
          }));
        }
      } catch (err) {
        console.error('[ai-mask track] failed:', err);
        window.alert('Tracking failed: ' + ((err as Error).message ?? err));
      } finally {
        setTrackProgress(null);
      }
    };
    const onTrackCancel = () => { trackCancelRef.current = true; };
    window.addEventListener('aimask:track', onTrack);
    window.addEventListener('aimask:trackCancel', onTrackCancel);
    return () => {
      window.removeEventListener('aimask:track', onTrack);
      window.removeEventListener('aimask:trackCancel', onTrackCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.aiMaskPoints, clip.trimStart, clip.duration, clip.aiMaskTrackFps]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !clip.src) return;
    const localTime = (clip.trimStart ?? 0) + (playhead - clip.start);
    const tryPlay = () => {
      if (Math.abs(v.currentTime - localTime) > 0.3) v.currentTime = localTime;
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    };
    if (v.readyState >= 2) tryPlay();
    else v.addEventListener('loadeddata', tryPlay, { once: true });
    return () => v.removeEventListener('loadeddata', tryPlay);
  }, [playing, playhead, clip.start, clip.trimStart, clip.src, clip.previewSrc]);

  // Render AI-Mask auf Canvas. Bei tracked-Frames: nimm den Frame mit nächstem
  // Timestamp zum aktuellen playhead-clip-time.
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!clip.aiMaskEnabled) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // 1) tracked frames haben Vorrang: closest by time
    let activeMask: { width: number; height: number; data: number[] } | undefined;
    if (clip.aiMaskFrames && clip.aiMaskFrames.length > 0) {
      const clipTime = playhead - clip.start;
      let closest = clip.aiMaskFrames[0];
      let bestDelta = Math.abs(closest.time - clipTime);
      for (const f of clip.aiMaskFrames) {
        const d = Math.abs(f.time - clipTime);
        if (d < bestDelta) { bestDelta = d; closest = f; }
      }
      activeMask = closest.mask;
    } else if (clip.aiMaskData) {
      // 2) fallback: static mask
      activeMask = clip.aiMaskData;
    }
    if (!activeMask) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = activeMask.width;
    canvas.height = activeMask.height;
    const img = ctx.createImageData(activeMask.width, activeMask.height);
    for (let i = 0; i < activeMask.data.length; i++) {
      const v = activeMask.data[i];
      const alpha = v < 0.4 ? 0 : v > 0.6 ? 200 : Math.round((v - 0.4) * 1000);
      img.data[i * 4 + 0] = 255;
      img.data[i * 4 + 1] = 16;
      img.data[i * 4 + 2] = 57;
      img.data[i * 4 + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  }, [clip.id, clip.aiMaskEnabled, clip.aiMaskData, clip.aiMaskFrames, playhead, clip.start]);

  const onMaskClick = async (e: React.MouseEvent<HTMLElement>, isExclude: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    // Bounds vom Wrapper-Div (e.currentTarget) — das ist die Overlay-Box, NICHT main video
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xRel = (e.clientX - rect.left) / rect.width;
    const yRel = (e.clientY - rect.top) / rect.height;
    const vAspect = v.videoWidth / v.videoHeight;
    const rAspect = rect.width / rect.height;
    let xImg = xRel, yImg = yRel;
    if (vAspect > rAspect) {
      const visibleH = rect.width / vAspect;
      const padY = (rect.height - visibleH) / 2 / rect.height;
      yImg = (yRel - padY) / (1 - 2 * padY);
    } else {
      const visibleW = rect.height * vAspect;
      const padX = (rect.width - visibleW) / 2 / rect.width;
      xImg = (xRel - padX) / (1 - 2 * padX);
    }
    if (xImg < 0 || xImg > 1 || yImg < 0 || yImg > 1) return;
    const newPoint = { x: xImg, y: yImg, label: (isExclude ? 0 : 1) as 0 | 1 };
    const points = [...(clip.aiMaskPoints ?? []), newPoint];

    try {
      if (!aiMask.isLoaded()) {
        setBusy('loading');
        await aiMask.loadModels();
      }
      let encoded = encodedRef.current;
      if (!encoded) {
        setBusy('encoding');
        const tmp = document.createElement('canvas');
        tmp.width = v.videoWidth;
        tmp.height = v.videoHeight;
        tmp.getContext('2d')!.drawImage(v, 0, 0);
        const imgData = tmp.getContext('2d')!.getImageData(0, 0, v.videoWidth, v.videoHeight);
        encoded = await aiMask.encodeImage(imgData);
        encodedRef.current = encoded;
      }
      setBusy('decoding');
      const mask = await aiMask.generateMask(encoded, points);
      if (mask) {
        window.dispatchEvent(new CustomEvent('aimask:update', {
          detail: { clipId: clip.id, points, mask: { width: mask.width, height: mask.height, data: Array.from(mask.data) } },
        }));
      }
    } catch (err: any) {
      console.error('[ai-mask overlay] failed:', err);
      // Auto-Cleanup wenn SAM 2 Model inkompatibel ist
      if (err?.code === 'SAM_INCOMPATIBLE' || String(err?.message).includes('SAM_INCOMPATIBLE')) {
        const ok = window.confirm(
          'The installed AI mask model (SAM 2) is not compatible with this app\'s runtime.\n\n' +
          'I\'ll automatically delete the broken files and you can download SAM 1 instead (works reliably, ~40 MB).\n\n' +
          'Continue?',
        );
        if (ok) {
          await window.api.invoke('aiMask.resetModels');
          window.dispatchEvent(new CustomEvent('aimask:modelsReset'));
          window.alert('Broken models deleted. Now click "Download SAM 1" in the Inspector.');
        }
      } else {
        window.alert('AI Mask error: ' + ((err as Error).message ?? err));
      }
    } finally { setBusy(null); }
  };

  if (!clip.src) return null;

  console.log(`[overlay-render] clipId=${clip.id} type=${clip.type} blendMode=${clip.blendMode ?? 'normal'} → rendered with mixBlendMode on outer wrapper`);

  // Wrapper sized vom video selbst (h-auto über display:block) — keine fixe aspect.
  // Funktioniert für 16:9, 9:16, 1:1 etc. Click-Handler am Wrapper fängt zuverlässig.
  return (
    <div
      className={clsx('absolute', clip.aiMaskEnabled ? '' : 'pointer-events-none')}
      style={{
        left:   `${50 + (clip.posX ?? 0) * 40}%`,
        top:    `${50 + (clip.posY ?? 0) * 40}%`,
        width:  `${(clip.scale ?? 1) * 30}%`,
        transform: `translate(-50%, -50%) rotate(${clip.rotation ?? 0}deg)`,
        zIndex: clip.trackIdx,
        cursor: clip.aiMaskEnabled ? 'crosshair' : undefined,
        // mixBlendMode auf den OUTER wrapper damit der filter im inner video keinen
        // konkurrierenden stacking-context erzeugt der den blend isoliert.
        mixBlendMode: clip.blendMode ?? 'normal',
      }}
      onClick={clip.aiMaskEnabled ? (e) => { console.log(`[ai-mask] overlay click on ${clip.id}`); onMaskClick(e, false); } : undefined}
      onContextMenu={clip.aiMaskEnabled ? (e) => onMaskClick(e, true) : undefined}
    >
      <video
        ref={ref}
        src={mediaUrl(playbackSrc(clip) ?? '')}
        muted
        playsInline
        preload="metadata"
        className="block w-full h-auto object-contain pointer-events-none"
        style={{
          opacity: clip.opacity ?? 1,
          filter: cssAdjustFilter(clip),
        }}
      />
      {clip.aiMaskEnabled && clip.aiMaskData && (
        <canvas
          ref={maskCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}
      {clip.aiMaskEnabled && (clip.aiMaskPoints ?? []).map((p, i) => (
        <button
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('aimask:removePoint', {
              detail: { index: i, clipId: clip.id },
            }));
          }}
          className={clsx(
            'absolute w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-125 hover:border-fiano-red transition',
            p.label === 1 ? 'bg-emerald-500' : 'bg-red-500',
          )}
          style={{
            left: `${p.x * 100}%`,
            top:  `${p.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 30,
          }}
          title={`${p.label === 1 ? 'Include' : 'Exclude'} — click to remove`}
        />
      ))}
      {(busy || trackProgress) && (
        <div className="absolute top-1 right-1 px-2 py-1 rounded-md bg-fiano-black/85 backdrop-blur-sm
                        border border-fiano-red/40 text-[9px] text-zinc-200 flex items-center gap-1.5 z-30">
          <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-fiano-red animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
          </svg>
          <span className="uppercase tracking-wider">
            {trackProgress
              ? `Tracking ${trackProgress.done}/${trackProgress.total}`
              : busy}
          </span>
          {trackProgress && (
            <button
              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('aimask:trackCancel')); }}
              className="ml-1 text-fiano-red hover:text-white text-[10px]"
              title="Cancel tracking"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ChromaKeyVideo — Greenscreen-Live-Preview via WebGL ──────
   Hidden video → upload pro Frame als Texture → Fragment-Shader discardet
   Pixel innerhalb tolerance um chromaColor → display als <canvas>. */

const CHROMA_VS = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const CHROMA_FS = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec3 u_chromaColor;
  uniform float u_tolerance;
  varying vec2 v_texCoord;
  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    float d = distance(color.rgb, u_chromaColor);
    // Soft edge: 0..tolerance → fully transparent, tolerance..tolerance+0.1 → fade
    float alpha = smoothstep(u_tolerance, u_tolerance + 0.1, d);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color.rgb, color.a * alpha);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').trim();
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 1, 0];
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function ChromaKeyVideo({ clip, playing, playhead }: {
  clip: TimelineClip; playing: boolean; playhead: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glStateRef = useRef<{
    gl: WebGLRenderingContext; program: WebGLProgram;
    texture: WebGLTexture; uColor: WebGLUniformLocation; uTolerance: WebGLUniformLocation;
    aPos: number; aTex: number; vbo: WebGLBuffer;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Setup WebGL once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) { console.warn('[chromakey] WebGL not supported'); return; }

    const compile = (src: string, type: number): WebGLShader | null => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[chromakey] shader compile error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(CHROMA_VS, gl.VERTEX_SHADER);
    const fs = compile(CHROMA_FS, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[chromakey] program link error:', gl.getProgramInfoLog(program));
      return;
    }

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // x, y, u, v (TRIANGLE_STRIP) — flip Y in tex coords da Video oben-links
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]), gl.STATIC_DRAW);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    glStateRef.current = {
      gl, program, texture, vbo,
      uColor: gl.getUniformLocation(program, 'u_chromaColor')!,
      uTolerance: gl.getUniformLocation(program, 'u_tolerance')!,
      aPos: gl.getAttribLocation(program, 'a_position'),
      aTex: gl.getAttribLocation(program, 'a_texCoord'),
    };

    return () => {
      gl.deleteProgram(program);
      gl.deleteTexture(texture);
      gl.deleteBuffer(vbo);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      glStateRef.current = null;
    };
  }, []);

  // RAF render loop
  useEffect(() => {
    const tick = () => {
      const v = videoRef.current;
      const canvas = canvasRef.current;
      const state = glStateRef.current;
      if (v && canvas && state && v.readyState >= 2 && v.videoWidth > 0) {
        const { gl, program, texture, vbo, uColor, uTolerance, aPos, aTex } = state;

        if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          gl.viewport(0, 0, canvas.width, canvas.height);
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch { /* video not ready / cross-origin — skip frame */ }

        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aTex);
        gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);

        const [r, g, b] = hexToRgb(clip.chromaColor ?? '#00ff00');
        gl.uniform3f(uColor, r, g, b);
        gl.uniform1f(uTolerance, clip.chromaTolerance ?? 0.30);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [clip.chromaColor, clip.chromaTolerance]);

  // Sync video playback (gleiches Pattern wie OverlayVideo)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip.src) return;
    const localTime = (clip.trimStart ?? 0) + (playhead - clip.start);
    const tryPlay = () => {
      if (Math.abs(v.currentTime - localTime) > 0.3) v.currentTime = localTime;
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    };
    if (v.readyState >= 2) tryPlay();
    else v.addEventListener('loadeddata', tryPlay, { once: true });
    return () => v.removeEventListener('loadeddata', tryPlay);
  }, [playing, playhead, clip.start, clip.trimStart, clip.src, clip.previewSrc]);

  if (!clip.src) return null;
  return (
    <>
      <video
        ref={videoRef}
        src={mediaUrl(playbackSrc(clip) ?? '')}
        muted playsInline preload="metadata"
        crossOrigin="anonymous"
        className="hidden"
      />
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-none object-contain"
        style={{
          left:   `${50 + (clip.posX ?? 0) * 40}%`,
          top:    `${50 + (clip.posY ?? 0) * 40}%`,
          width:  `${(clip.scale ?? 1) * 30}%`,
          transform: `translate(-50%, -50%) rotate(${clip.rotation ?? 0}deg)`,
          opacity: clip.opacity ?? 1,
          zIndex: clip.trackIdx,
        }}
      />
    </>
  );
}

/* ─── AudioPlayback — hidden audio element für Audio-Track-Playback ─ */

function AudioPlayback({ clip, playing, playhead }: {
  clip: TimelineClip; playing: boolean; playhead: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a || !clip.src) return;
    const localTime = (clip.trimStart ?? 0) + (playhead - clip.start);
    if (Math.abs(a.currentTime - localTime) > 0.3) a.currentTime = localTime;
    // HTMLAudioElement.volume akzeptiert nur 0..1 (>1 = IndexSizeError-Crash!).
    // Editor-Slider geht 0..2 für Boost — Browser-Preview wird gecappt, FFmpeg-Export
    // respektiert weiter den vollen Wert via `volume=1.5`-Filter.
    a.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
    if (playing && a.paused) a.play().catch(() => {});
    if (!playing && !a.paused) a.pause();
  }, [playing, playhead, clip.start, clip.trimStart, clip.src, clip.previewSrc, clip.volume]);

  if (!clip.src) return null;
  return <audio ref={ref} src={mediaUrl(playbackSrc(clip) ?? '')} preload="metadata" className="hidden" />;
}

/* ─── PreviewModal — größeres Preview mit eigenen Controls ──── */

function PreviewModal({
  clips, tracks, totalDuration, onClose,
}: {
  clips: TimelineClip[];
  tracks: Track[];
  totalDuration: number;
  onClose: () => void;
}) {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeClip = clips
    .filter((c) => c.type === 'video' && c.trackIdx === 0 && !tracks[c.trackIdx]?.hidden)
    .find((c) => playhead >= c.start && playhead < c.start + c.duration);

  // Sync video src + currentTime
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    const localTime = (activeClip.trimStart ?? 0) + (playhead - activeClip.start);
    const playSrc = playbackSrc(activeClip);
    const wantSrc = playSrc ? mediaUrl(playSrc) ?? '' : '';
    if (v.src !== wantSrc) {
      setVideoError(false);
      v.src = wantSrc;
      const onReady = () => {
        v.currentTime = localTime;
        if (playing) v.play().catch(() => {});
      };
      v.addEventListener('loadeddata', onReady, { once: true });
    } else {
      if (Math.abs(v.currentTime - localTime) > 0.3) v.currentTime = localTime;
      if (playing && v.paused) v.play().catch(() => {});
      if (!playing && !v.paused) v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, activeClip?.previewSrc, playing]);

  // Playhead-tick
  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => {
      const v = videoRef.current;
      if (!v || !activeClip) return;
      const localT = v.currentTime - (activeClip.trimStart ?? 0);
      const next = Math.min(totalDuration, activeClip.start + localT);
      setPlayhead(next);
      if (next >= totalDuration) setPlaying(false);
    }, 100);
    return () => clearInterval(i);
  }, [playing, activeClip, totalDuration]);

  // ESC schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-6 gap-4 animate-fade-in"
         onClick={onClose}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[14px] font-semibold text-white">
          Preview · {fmtTime(playhead)} / {fmtTime(totalDuration)}
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-md text-zinc-400 hover:bg-white/[0.08] flex items-center justify-center transition">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10 M13 3L3 13"/></svg>
        </button>
      </div>

      {/* Video container — 16:9, fits available space via container queries */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center"
        style={{ containerType: 'size' }}
        onClick={(e) => e.stopPropagation()}
      >
      <div
        className="relative bg-black rounded-md overflow-hidden ring-1 ring-fiano-red/40"
        style={{
          width: 'min(100cqw, calc(100cqh * 16 / 9))',
          height: 'min(100cqh, calc(100cqw * 9 / 16))',
        }}
      >
        {activeClip && activeClip.src ? (
          <>
            <video
              ref={videoRef}
              playsInline
              className="w-full h-full object-contain absolute inset-0"
              style={{
                transform: [
                  `translate(${(activeClip.posX ?? 0) * 100}%, ${(activeClip.posY ?? 0) * 100}%)`,
                  `scale(${activeClip.scale ?? 1})`,
                  `rotate(${activeClip.rotation ?? 0}deg)`,
                ].join(' '),
                opacity: activeClip.opacity ?? 1,
              }}
              onClick={() => setPlaying((p) => !p)}
              onError={() => setVideoError(true)}
              onLoadedData={() => setVideoError(false)}
            />
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-6">
                <div className="text-center max-w-sm">
                  <div className="text-[12px] font-semibold text-amber-200 mb-1">Codec not supported</div>
                  <div className="text-[10px] text-zinc-400">Try converting source to MP4 (H.264 + AAC).</div>
                </div>
              </div>
            )}
            {/* Overlay-Clips (mit Live-Greenscreen wenn chromaEnabled) */}
            {clips
              .filter((c) => (c.type === 'overlay' || (c.type === 'video' && c.trackIdx !== 0))
                && c.src && playhead >= c.start && playhead < c.start + c.duration && !tracks[c.trackIdx]?.hidden)
              .map((c) => c.chromaEnabled
                ? <ChromaKeyVideo key={c.id} clip={c} playing={playing} playhead={playhead} />
                : <OverlayVideo key={c.id} clip={c} playing={playing} playhead={playhead} />,
              )}
            {/* Text-Clips mit voller Style-Übernahme */}
            {clips
              .filter((c) => c.type === 'text' && playhead >= c.start && playhead < c.start + c.duration && !tracks[c.trackIdx]?.hidden)
              .map((c) => (
                <TextOverlay key={c.id} clip={c} />
              ))}
            {/* Audio */}
            {clips
              .filter((c) => c.type === 'audio' && c.src && playhead >= c.start && playhead < c.start + c.duration && !tracks[c.trackIdx]?.muted)
              .map((c) => <AudioPlayback key={c.id} clip={c} playing={playing} playhead={playhead} />)}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[12px]">
            No video clip at playhead
          </div>
        )}
      </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 self-center flex items-center gap-3 px-4 py-2 rounded-xl bg-black/50 border border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setPlayhead((p) => Math.max(0, p - 5))}
          className="w-7 h-7 rounded-md text-zinc-300 hover:bg-white/[0.08] flex items-center justify-center transition">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M7 3v10l-7-5zM15 3v10l-7-5z"/></svg>
        </button>
        <button onClick={() => setPlaying(!playing)}
          className="w-9 h-9 rounded-lg bg-fiano-red text-white shadow-[0_0_16px_rgba(255,16,57,0.4)] hover:brightness-110 transition flex items-center justify-center">
          {playing
            ? <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><rect x="4" y="3" width="2.5" height="10" rx="0.5"/><rect x="9.5" y="3" width="2.5" height="10" rx="0.5"/></svg>
            : <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-0.5" fill="currentColor"><path d="M3.5 3v10l10-5z"/></svg>}
        </button>
        <button onClick={() => setPlayhead((p) => Math.min(totalDuration, p + 5))}
          className="w-7 h-7 rounded-md text-zinc-300 hover:bg-white/[0.08] flex items-center justify-center transition">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M9 3v10l7-5zM1 3v10l7-5z"/></svg>
        </button>
        <span className="text-[11px] font-mono text-zinc-400 tabular-nums shrink-0 ml-2">
          {fmtTime(playhead)} / {fmtTime(totalDuration)}
        </span>
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setPlayhead(pct * totalDuration);
          }}
          className="w-64 h-1.5 rounded-full bg-white/[0.08] cursor-pointer relative"
        >
          <div className="absolute inset-y-0 left-0 bg-fiano-red rounded-full"
            style={{ width: `${totalDuration > 0 ? (playhead / totalDuration) * 100 : 0}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Inspector ─────────────────────────────────────────────── */

type InspectorTab = 'video' | 'audio' | 'speed' | 'animation' | 'adjust';
const INSPECTOR_TABS: InspectorTab[] = ['video', 'audio', 'speed', 'animation', 'adjust'];

function InspectorPanel({
  width, selected, tracks, activeTab, onTabChange, onChange, onRemove, onEditTts,
}: {
  width: number;
  selected?: TimelineClip;
  tracks: Track[];
  activeTab: InspectorTab;
  onTabChange: (t: InspectorTab) => void;
  onChange: (patch: Partial<TimelineClip>) => void;
  onRemove: () => void;
  onEditTts?: (clipId: string) => void;
}) {
  const t = useT();
  const aiMaskFeature = useFeature('ai_subject_mask');
  const stabilizerFeature = useFeature('stabilizer');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const tabLabels: Record<InspectorTab, string> = {
    video: t('editor.tabVideo'),
    audio: t('editor.tabAudio'),
    speed: t('editor.tabSpeed'),
    animation: t('editor.tabAnimation'),
    adjust: t('editor.tabAdjust'),
  };
  return (
    <aside className="shrink-0 flex flex-col" style={{ width }}>
      {/* Tabs */}
      <div className="flex border-b border-white/[0.06]">
        {INSPECTOR_TABS.map((tk) => (
          <button
            key={tk}
            onClick={() => onTabChange(tk)}
            className={clsx(
              'flex-1 py-2.5 text-[11px] font-medium transition-colors relative',
              activeTab === tk ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            {tabLabels[tk]}
            {activeTab === tk && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-fiano-red shadow-[0_0_8px_rgba(255,16,57,0.7)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!selected ? (
          <div className="text-[11px] text-zinc-600 italic text-center pt-8">
            {t('editor.selectClipHint')}
          </div>
        ) : (
          <>
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
              <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">{t('editor.selectedLabel')}</div>
              <div className="text-[12px] font-medium text-zinc-200 mt-0.5 truncate">{selected.label}</div>
              <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                {fmtTime(selected.start)} → {fmtTime(selected.start + selected.duration)} · {selected.duration.toFixed(1)}s
              </div>
            </div>

            {activeTab === 'video' && (
              <>
                <Field label="Track">
                  <select value={selected.trackIdx}
                    onChange={(e) => onChange({ trackIdx: parseInt(e.target.value) })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-fiano-red/40">
                    {tracks.map((t, i) => (
                      <option key={i} value={i}>{t.name} (Layer {i + 1})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Position X">
                  <RangeRow value={selected.posX ?? 0} min={-1} max={1} step={0.01}
                    onChange={(v) => onChange({ posX: v })} display={`${Math.round((selected.posX ?? 0) * 100)}%`} />
                </Field>
                <Field label="Position Y">
                  <RangeRow value={selected.posY ?? 0} min={-1} max={1} step={0.01}
                    onChange={(v) => onChange({ posY: v })} display={`${Math.round((selected.posY ?? 0) * 100)}%`} />
                </Field>
                <Field label="Scale">
                  <RangeRow value={selected.scale ?? 1} min={0.1} max={3} step={0.01}
                    onChange={(v) => onChange({ scale: v })} display={`${Math.round((selected.scale ?? 1) * 100)}%`} />
                </Field>
                <Field label="Rotation">
                  <RangeRow value={selected.rotation ?? 0} min={-180} max={180} step={1}
                    onChange={(v) => onChange({ rotation: v })} display={`${selected.rotation ?? 0}°`} />
                </Field>
                <Field label="Opacity">
                  <RangeRow value={selected.opacity ?? 1} min={0} max={1} step={0.01}
                    onChange={(v) => onChange({ opacity: v })} display={`${Math.round((selected.opacity ?? 1) * 100)}%`} />
                </Field>
              </>
            )}

            {activeTab === 'audio' && (
              <>
                <Field label="Volume">
                  <RangeRow value={selected.volume ?? 1} min={0} max={2} step={0.01}
                    onChange={(v) => onChange({ volume: v })} display={`${Math.round((selected.volume ?? 1) * 100)}%`} />
                </Field>
                <Field label="Fade In (s)">
                  <RangeRow value={selected.fadeIn ?? 0} min={0} max={5} step={0.1}
                    onChange={(v) => onChange({ fadeIn: v })} display={`${(selected.fadeIn ?? 0).toFixed(1)}s`} />
                </Field>
                <Field label="Fade Out (s)">
                  <RangeRow value={selected.fadeOut ?? 0} min={0} max={5} step={0.1}
                    onChange={(v) => onChange({ fadeOut: v })} display={`${(selected.fadeOut ?? 0).toFixed(1)}s`} />
                </Field>

                {/* TTS Edit-Section: nur wenn dieser Clip via TTS generiert wurde */}
                {selected.ttsText && onEditTts && (
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">
                      Text-to-Speech
                    </div>
                    <div className="text-[11px] text-zinc-300 leading-relaxed bg-white/[0.03] border border-white/[0.06]
                                    rounded-lg px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {selected.ttsText}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Voice: <span className="text-zinc-300 font-mono">{selected.ttsVoice ?? '—'}</span>
                    </div>
                    <button
                      onClick={() => onEditTts(selected.id)}
                      className="w-full text-[12px] font-semibold py-2 rounded-lg
                                 border border-fiano-red/45 text-fiano-red bg-transparent
                                 hover:bg-fiano-red/10 hover:border-fiano-red/70
                                 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M11.5 2.5l2 2L6 12 3 13l1-3z" />
                      </svg>
                      Edit TTS (text + voice)
                    </button>
                  </div>
                )}
              </>
            )}

            {activeTab === 'speed' && (
              <Field label="Playback Speed">
                <RangeRow value={selected.speed ?? 1} min={0.25} max={4} step={0.05}
                  onChange={(v) => onChange({ speed: v })}
                  display={`${(selected.speed ?? 1).toFixed(2)}×`} />
                <div className="text-[10px] text-zinc-600 mt-1">Render-side: requires FFmpeg setpts/atempo filters</div>
              </Field>
            )}

            {activeTab === 'animation' && (
              <>
                {/* ─── Active Effects (Multi-Stack) ───────────────── */}
                {clipEffects(selected).length > 0 && (
                  <div className="mb-5">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-2 font-semibold">
                      Active Effects ({clipEffects(selected).length})
                    </div>
                    <div className="space-y-1.5">
                      {clipEffects(selected).map((eff, idx) => {
                        const meta = EFFECT_META[eff.id];
                        return (
                          <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                            <span className="text-[11px] text-zinc-200 flex-1 truncate">{meta.label}</span>
                            <button
                              onClick={() => {
                                const next = clipEffects(selected).filter((_, i) => i !== idx);
                                onChange({ effects: next, effect: undefined, effectIntensity: undefined });
                              }}
                              className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                              title="Remove effect"
                            >
                              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M3 3l6 6 M9 3l-6 6" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[9px] text-zinc-600 italic mt-2">
                      Drag more effects from the sidebar to stack. Each effect runs full clip duration.
                    </div>
                  </div>
                )}

                {/* Transition INTO this clip */}
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-2 font-semibold">
                  Transition In
                </div>
                <Field label="Type">
                  <select
                    value={selected.transitionType ?? ''}
                    onChange={(e) => onChange({ transitionType: (e.target.value || undefined) as TransitionType | undefined })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
                  >
                    <option value="">— None —</option>
                    {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((t) => (
                      <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>
                    ))}
                  </select>
                </Field>
                {selected.transitionType && (
                  <>
                    <Field label="Duration">
                      <RangeRow
                        value={selected.transitionDuration ?? 0.5}
                        min={0.1} max={3} step={0.05}
                        onChange={(v) => onChange({ transitionDuration: v })}
                        display={`${(selected.transitionDuration ?? 0.5).toFixed(2)}s`}
                      />
                    </Field>
                    <Field label="Easing">
                      <select
                        value={selected.transitionEasing ?? 'linear'}
                        onChange={(e) => onChange({ transitionEasing: e.target.value as TransitionEasing })}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                      </select>
                    </Field>
                    {selected.transitionType === 'dip-to-color' && (
                      <Field label="Color">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={selected.transitionColor ?? '#000000'}
                            onChange={(e) => onChange({ transitionColor: e.target.value })}
                            className="w-9 h-9 rounded-md border border-white/[0.08] bg-transparent cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            value={selected.transitionColor ?? '#000000'}
                            onChange={(e) => onChange({ transitionColor: e.target.value })}
                            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
                          />
                        </div>
                      </Field>
                    )}
                    <div className="text-[10px] text-zinc-600 leading-relaxed mt-1">
                      Wirkt zwischen diesem Clip und dem direkt davor liegenden Clip auf gleichem Track
                      (muss adjacent sein, max ±0.1s Lücke). Live-Preview aktuell nur für Cross-Dissolve.
                      Andere Typen wirken im Export.
                    </div>
                  </>
                )}

                {/* Per-Clip Fades (alte Phase 2.5 — bleiben unabhängig von Transitions) */}
                <div className="pt-3 border-t border-white/[0.06] mt-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 mb-2 font-semibold">
                    Fade (Alpha)
                  </div>
                  <Field label="Fade In">
                    <RangeRow
                      value={selected.fadeInDuration ?? 0}
                      min={0} max={3} step={0.05}
                      onChange={(v) => onChange({ fadeInDuration: v })}
                      display={`${(selected.fadeInDuration ?? 0).toFixed(2)}s`}
                    />
                  </Field>
                  <Field label="Fade Out">
                    <RangeRow
                      value={selected.fadeOutDuration ?? 0}
                      min={0} max={3} step={0.05}
                      onChange={(v) => onChange({ fadeOutDuration: v })}
                      display={`${(selected.fadeOutDuration ?? 0).toFixed(2)}s`}
                    />
                  </Field>
                </div>

                <div className="pt-3 border-t border-white/[0.06] mt-3">
                  <div className="text-[10px] text-zinc-600 italic">
                    Keyframe-Animations (Position/Scale über Zeit) — Coming soon.
                  </div>
                </div>
              </>
            )}

            {activeTab === 'adjust' && (
              <>
                <Field label="Brightness">
                  <RangeRow
                    value={selected.brightness ?? 0}
                    min={-1} max={1} step={0.01}
                    onChange={(v) => onChange({ brightness: v })}
                    display={`${Math.round((selected.brightness ?? 0) * 100)}%`}
                  />
                </Field>
                <Field label="Contrast">
                  <RangeRow
                    value={selected.contrast ?? 0}
                    min={-1} max={1} step={0.01}
                    onChange={(v) => onChange({ contrast: v })}
                    display={`${Math.round((selected.contrast ?? 0) * 100)}%`}
                  />
                </Field>
                <Field label="Saturation">
                  <RangeRow
                    value={selected.saturation ?? 0}
                    min={-1} max={1} step={0.01}
                    onChange={(v) => onChange({ saturation: v })}
                    display={`${Math.round((selected.saturation ?? 0) * 100)}%`}
                  />
                </Field>

                {/* Blend Mode (Premier-Pro-Style) */}
                <Field label="Blend Mode">
                  <select
                    value={selected.blendMode ?? 'normal'}
                    onChange={(e) => {
                      const v = e.target.value as BlendMode;
                      console.log(`[blend-mode] Inspector change: clipId=${selected.id} type=${selected.type} → blendMode=${v}. Playhead muss in Clip-Range [${selected.start}..${selected.start + selected.duration}]s sein damit Preview greift.`);
                      onChange({ blendMode: v });
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-zinc-200 focus:outline-none focus:border-fiano-red/40 cursor-pointer"
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m.value} value={m.value} className="bg-fiano-black">{m.label}</option>
                    ))}
                  </select>
                  <div className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                    Mixed gegen darunter liegende Layer. Bei Track-0-Clip wirkt es gegen
                    Test-Pattern. Voller Effekt bei Overlay-Clips über Video-Layern.
                  </div>
                </Field>

                {/* Chroma Key (Greenscreen) */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <label className="flex items-center justify-between cursor-pointer mb-2">
                    <span className="text-[11px] font-semibold text-zinc-200">Chroma Key (Greenscreen)</span>
                    <span
                      onClick={() => onChange({ chromaEnabled: !selected.chromaEnabled })}
                      className={clsx('relative w-9 h-5 rounded-full transition-colors',
                        selected.chromaEnabled ? 'bg-fiano-red' : 'bg-white/[0.08]')}>
                      <span className={clsx(
                        'pointer-events-none absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                        selected.chromaEnabled ? 'translate-x-4' : 'translate-x-0')} />
                    </span>
                  </label>
                  {selected.chromaEnabled && (
                    <>
                      <Field label="Key Color">
                        <div className="flex items-center gap-2">
                          <input type="color" value={selected.chromaColor ?? '#00ff00'}
                            onChange={(e) => onChange({ chromaColor: e.target.value })}
                            className="w-9 h-9 rounded-md border border-white/[0.08] bg-transparent cursor-pointer shrink-0" />
                          <input type="text" value={selected.chromaColor ?? '#00ff00'}
                            onChange={(e) => onChange({ chromaColor: e.target.value })}
                            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40" />
                        </div>
                      </Field>
                      <Field label="Tolerance">
                        <RangeRow value={selected.chromaTolerance ?? 0.3} min={0} max={1} step={0.01}
                          onChange={(v) => onChange({ chromaTolerance: v })}
                          display={`${Math.round((selected.chromaTolerance ?? 0.3) * 100)}%`} />
                      </Field>
                      <div className="text-[10px] text-zinc-600 mt-1">
                        Live in preview (WebGL) and at export (FFmpeg <code className="text-zinc-500">chromakey</code>).
                      </div>
                    </>
                  )}
                </div>

                {/* AI Subject Mask (SAM ONNX) */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <label className="flex items-center justify-between cursor-pointer mb-2">
                    <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                      AI Subject Mask
                      {!aiMaskFeature.unlocked && <LockBadge />}
                    </span>
                    <span
                      onClick={() => {
                        if (!aiMaskFeature.unlocked && !selected.aiMaskEnabled) {
                          openUpgrade('ai_subject_mask');
                          return;
                        }
                        onChange({ aiMaskEnabled: !selected.aiMaskEnabled });
                      }}
                      className={clsx('relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                        selected.aiMaskEnabled ? 'bg-fiano-red' : 'bg-white/[0.08]',
                        !aiMaskFeature.unlocked && !selected.aiMaskEnabled && 'opacity-60')}>
                      <span className={clsx(
                        'pointer-events-none absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                        selected.aiMaskEnabled ? 'translate-x-4' : 'translate-x-0')} />
                    </span>
                  </label>
                  {selected.aiMaskEnabled && <AiMaskPanel />}
                  <div className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                    Click on subject to isolate via Segment Anything (SAM). Models stored locally —
                    no internet, no API costs.
                  </div>
                </div>

                {/* Stabilizer (FFmpeg vidstab — 2-Pass beim Export) */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <label className="flex items-center justify-between cursor-pointer mb-2">
                    <span className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5">
                      Stabilizer
                      {!stabilizerFeature.unlocked && <LockBadge />}
                    </span>
                    <span
                      onClick={async () => {
                        // Plan-Gate: nicht-Pro-User können Stabilizer nicht aktivieren.
                        // Wenn schon enabled (z.B. Grandfathering nach Plan-Wechsel), Toggle off bleibt erlaubt.
                        if (!stabilizerFeature.unlocked && !selected.stabilizeEnabled) {
                          openUpgrade('stabilizer');
                          return;
                        }
                        // Beim Aktivieren: live check ob libvidstab installiert ist.
                        if (!selected.stabilizeEnabled) {
                          const res = await window.api.invoke<{ available: boolean }>('bin.hasVidstab', {});
                          if (!res.ok || !res.data?.available) {
                            window.alert(
                              'Stabilizer needs FFmpeg with libvidstab — not found.\n\n' +
                              'Install instructions:\n\n' +
                              'macOS (Homebrew):\n' +
                              '  brew install ffmpeg\n' +
                              '  (libvidstab is included by default since 2020)\n\n' +
                              'If still missing, force a fresh install:\n' +
                              '  brew uninstall ffmpeg && brew install ffmpeg\n\n' +
                              'Linux (Ubuntu/Debian):\n' +
                              '  sudo apt install ffmpeg\n\n' +
                              'Windows:\n' +
                              '  Download a "full" build from gyan.dev or BtbN\n' +
                              '  (regular builds skip libvidstab).\n\n' +
                              'After install, restart the app.',
                            );
                            return;
                          }
                        }
                        onChange({ stabilizeEnabled: !selected.stabilizeEnabled });
                      }}
                      className={clsx('relative w-9 h-5 rounded-full transition-colors cursor-pointer',
                        selected.stabilizeEnabled ? 'bg-fiano-red' : 'bg-white/[0.08]',
                        !stabilizerFeature.unlocked && !selected.stabilizeEnabled && 'opacity-60')}>
                      <span className={clsx(
                        'pointer-events-none absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                        selected.stabilizeEnabled ? 'translate-x-4' : 'translate-x-0')} />
                    </span>
                  </label>
                  {selected.stabilizeEnabled && (
                    <Field label="Smoothness">
                      <RangeRow value={selected.stabilizeSmoothness ?? 10} min={5} max={30} step={1}
                        onChange={(v) => onChange({ stabilizeSmoothness: v })}
                        display={`${selected.stabilizeSmoothness ?? 10}`} />
                    </Field>
                  )}
                  <div className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                    Reduces camera shake. Applied at export only (2-pass FFmpeg vidstab) —
                    live preview shows raw footage. Higher smoothness = stronger stabilization.
                  </div>
                </div>
              </>
            )}

            <button
              onClick={onRemove}
              className="w-full text-[11px] font-medium px-3 py-2 mt-2 rounded-lg
                         bg-white/[0.03] border border-white/[0.06] text-red-400
                         hover:bg-red-500/10 hover:border-red-500/30 transition"
            >
              Delete Clip
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function RangeRow({
  value, min, max, step, onChange, display,
}: {
  value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-fiano-red" />
      <span className="text-[10px] text-fiano-red font-mono w-12 text-right">{display}</span>
    </div>
  );
}

/* ─── Timeline ──────────────────────────────────────────────── */

interface TimelineProps {
  height: number;
  tracks: Track[];
  clips: TimelineClip[];
  playhead: number;
  pxPerSec: number;
  selectedId: string | null;
  totalDuration: number;
  snapEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onPlayheadChange: (t: number) => void;
  onSelect: (id: string | null) => void;
  onClipChange: (id: string, patch: Partial<TimelineClip>) => void;
  onClipDrop: (asset: { id: string; kind: TrackKind; label: string; src?: string; previewSrc?: string; transitionType?: TransitionType }, trackIdx: number, atTime: number) => void;
  onSplit: () => void;
  onRippleDelete: () => void;
  onDetachAudio: () => void;
  onFreezeFrame: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSnapToggle: () => void;
  onZoom: (delta: number) => void;
  onTrackToggleHidden: (idx: number) => void;
  onTrackToggleMuted: (idx: number) => void;
  snapTime: (t: number, ignoreClipId?: string) => number;
  onPushSnapshot: () => void;
  onAddTrack: (kind: TrackKind) => void;
  onRemoveTrack: (idx: number) => void;
  /** Doppelklick auf Text-Clip — öffnet Edit-Modal. */
  onEditText?: (clipId: string) => void;
}

function Timeline(props: TimelineProps) {
  const {
    height,
    tracks, clips, playhead, pxPerSec, selectedId, totalDuration, snapEnabled, canUndo, canRedo,
    onPlayheadChange, onSelect, onClipChange, onClipDrop, onSplit, onRippleDelete, onDetachAudio,
    onFreezeFrame, onUndo, onRedo, onSnapToggle, onZoom, onTrackToggleHidden, onTrackToggleMuted,
    snapTime, onPushSnapshot, onAddTrack, onRemoveTrack, onEditText,
  } = props;
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const visibleDur = Math.max(60, totalDuration + 30);

  // Auto-Scroll: wenn Playhead aus dem sichtbaren Bereich rausläuft, scroll mit.
  // Wir scrollen erst wenn Playhead in den letzten 20% des Viewports kommt → das hält
  // den Cursor zentriert/rechts statt am linken Rand.
  useEffect(() => {
    const el = trackAreaRef.current;
    if (!el) return;
    const playheadX = playhead * pxPerSec;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const triggerRight = viewRight - el.clientWidth * 0.2;
    if (playheadX > triggerRight) {
      // Playhead ist im rechten 20% Bereich → scroll so dass er auf 30% liegt
      el.scrollLeft = playheadX - el.clientWidth * 0.3;
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
    } else if (playheadX < viewLeft) {
      // Playhead ist links rausgelaufen (nach rückwärts-skip) → scroll an Anfang
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth * 0.1);
      if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
    }
  }, [playhead, pxPerSec]);

  const xToTime = (clientX: number): number => {
    const el = trackAreaRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft) / pxPerSec);
  };

  const onRulerClick = (e: React.MouseEvent) => {
    onPlayheadChange(xToTime(e.clientX));
  };

  const hasSelection = !!selectedId;
  const t = useT();

  return (
    <div className="shrink-0 bg-fiano-black flex flex-col" style={{ height }}>
      {/* Toolbar — alle Editor-Tools */}
      <div className="px-3 py-2 flex items-center gap-1 border-b border-white/[0.06] shrink-0 overflow-x-auto">
        {/* Undo/Redo */}
        <ToolButton onClick={onUndo} label={t('editor.undo')} icon={<IconUndo />} disabled={!canUndo} />
        <ToolButton onClick={onRedo} label={t('editor.redo')} icon={<IconRedo />} disabled={!canRedo} />
        <div className="w-px h-4 bg-white/[0.08] mx-1" />

        {/* Cut Tools */}
        <ToolButton onClick={onSplit} label={t('editor.splitS')} icon={<IconSplit />} />
        <ToolButton onClick={onRippleDelete} label={t('editor.rippleDelete')} icon={<IconRippleDelete />} disabled={!hasSelection} />
        <ToolButton onClick={onFreezeFrame} label={t('editor.freezeFrame')} icon={<IconFreeze />} />
        <div className="w-px h-4 bg-white/[0.08] mx-1" />

        {/* Selection / Snap */}
        <ToolButton onClick={() => onSelect(null)} label={t('editor.deselect')} icon={<IconCursor />} />
        <ToolButton onClick={onSnapToggle} label={t('editor.snap')} icon={<IconMagnet />} active={snapEnabled} />
        <div className="w-px h-4 bg-white/[0.08] mx-1" />

        {/* Audio */}
        <ToolButton onClick={onDetachAudio} label={t('editor.detachAudio')} icon={<IconDetach />} disabled={!hasSelection} />

        <div className="flex-1" />

        {/* Time + Zoom */}
        <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0">
          {fmtTime(playhead)}
        </span>
        <div className="w-px h-4 bg-white/[0.08] mx-1" />
        <button onClick={() => onZoom(-10)} className="w-6 h-6 rounded text-zinc-400 hover:bg-white/[0.06] flex items-center justify-center transition shrink-0">−</button>
        <span className="text-[9px] text-zinc-500 font-mono w-12 text-center shrink-0">{Math.round(pxPerSec)}px/s</span>
        <button onClick={() => onZoom(10)} className="w-6 h-6 rounded text-zinc-400 hover:bg-white/[0.06] flex items-center justify-center transition shrink-0">+</button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Track header column — visuell reversed: trackIdx 0 unten (Bottom-Layer), neue Tracks oben */}
        <div className="w-32 shrink-0 border-r border-white/[0.06] flex flex-col bg-white/[0.02]">
          {/* Spacer for ruler */}
          <div className="h-7 border-b border-white/[0.06] shrink-0" />
          {/* Scrollbarer Header-Container (sync mit track-area scroll) */}
          <div
            ref={headerScrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden"
            onScroll={(e) => {
              if (trackAreaRef.current && trackAreaRef.current.scrollTop !== e.currentTarget.scrollTop) {
                trackAreaRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
          >
          {tracks.map((tr, i) => ({ tr, idx: i })).reverse().map(({ tr, idx }) => (
            <div
              key={tr.id}
              style={{ height: tr.height }}
              className="group border-b border-white/[0.06] px-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-zinc-200 truncate">{tr.name}</div>
                <div className="text-[9px] text-zinc-600 capitalize">{tr.kind}</div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onTrackToggleHidden(idx)}
                  className={clsx('w-5 h-5 rounded flex items-center justify-center transition',
                    tr.hidden ? 'text-zinc-700' : 'text-zinc-400 hover:text-white')}
                  title={t('editor.toggleVisibility')}
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5S1 8 1 8z" />
                    <circle cx="8" cy="8" r="2" />
                  </svg>
                </button>
                <button
                  onClick={() => onTrackToggleMuted(idx)}
                  className={clsx('w-5 h-5 rounded flex items-center justify-center transition',
                    tr.muted ? 'text-zinc-700' : 'text-zinc-400 hover:text-white')}
                  title={t('editor.toggleMute')}
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 6h2l4-3v10l-4-3H3V6z" />
                  </svg>
                </button>
                <button
                  onClick={() => onRemoveTrack(idx)}
                  className="w-5 h-5 rounded text-zinc-700 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                  title={t('editor.removeTrack')}
                  disabled={tracks.length <= 1}
                >
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M2 2l8 8 M10 2L2 10" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          </div>
          {/* Add Track Buttons (außerhalb scroll-area, immer sichtbar) */}
          <div className="px-2 py-2 flex flex-col gap-1 border-t border-white/[0.06] shrink-0">
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600 px-1 mb-0.5">{t('editor.addTrack')}</div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => onAddTrack('video')}
                className="text-[9px] py-1 rounded bg-fiano-red/15 text-fiano-red hover:bg-fiano-red/25 border border-fiano-red/30 transition"
                title="Add video track"
              >+ Video</button>
              <button
                onClick={() => onAddTrack('overlay')}
                className="text-[9px] py-1 rounded bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-white/[0.08] transition"
                title="Add overlay/transition track"
              >+ Overlay</button>
              <button
                onClick={() => onAddTrack('audio')}
                className="text-[9px] py-1 rounded bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-white/[0.08] transition"
                title="Add audio track"
              >+ Audio</button>
              <button
                onClick={() => onAddTrack('text')}
                className="text-[9px] py-1 rounded bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] border border-white/[0.08] transition"
                title="Add text track"
              >+ Text</button>
              <button
                onClick={() => onAddTrack('effect')}
                className="text-[9px] py-1 rounded bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-600/40 transition col-span-2"
                title="Add effect layer (stack effects on multiple tracks)"
              >+ Effect Layer</button>
            </div>
          </div>
        </div>

        {/* Track area (scrollable in BEIDE Achsen — vertikal sync mit header-col) */}
        <div
          ref={trackAreaRef}
          className="flex-1 overflow-auto relative"
          onScroll={(e) => {
            if (headerScrollRef.current && headerScrollRef.current.scrollTop !== e.currentTarget.scrollTop) {
              headerScrollRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
        >
          <div style={{ width: visibleDur * pxPerSec, minWidth: '100%' }}>
            {/* Time ruler */}
            <div
              onClick={onRulerClick}
              className="h-7 border-b border-white/[0.06] relative cursor-crosshair"
            >
              {Array.from({ length: Math.ceil(visibleDur / 5) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-white/[0.06] flex items-end pb-0.5 pl-1"
                  style={{ left: i * 5 * pxPerSec }}
                >
                  <span className="text-[8px] font-mono text-zinc-600">{i * 5}s</span>
                </div>
              ))}
            </div>

            {/* Tracks — visuell reversed: trackIdx 0 unten (Bottom-Layer), neue Tracks oben */}
            {tracks.map((t, i) => ({ t, trackIdx: i })).reverse().map(({ t, trackIdx }) => (
              <TrackRow
                key={t.id}
                track={t}
                trackIdx={trackIdx}
                allTracks={tracks}
                allClips={clips}
                clips={clips.filter((c) => c.trackIdx === trackIdx)}
                pxPerSec={pxPerSec}
                selectedId={selectedId}
                onSelect={onSelect}
                onClipChange={onClipChange}
                onDropAsset={(e, atTime) => {
                  try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    onClipDrop(data, trackIdx, snapTime(atTime));
                  } catch { /* ignore */ }
                }}
                xToTime={xToTime}
                snapTime={snapTime}
                onPushSnapshot={onPushSnapshot}
                onEditText={onEditText}
              />
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-fiano-red pointer-events-none shadow-[0_0_8px_rgba(255,16,57,0.7)] z-20"
              style={{ left: playhead * pxPerSec }}
            >
              <div className="absolute -top-0 -left-1.5 w-3 h-3 rounded-sm bg-fiano-red" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  onClick, label, icon, disabled, active,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'shrink-0 px-2.5 py-1.5 rounded-md text-[11px] flex items-center gap-1.5 transition',
        disabled
          ? 'text-zinc-700 cursor-not-allowed'
          : active
            ? 'bg-fiano-red/15 text-fiano-red border border-fiano-red/40'
            : 'text-zinc-300 hover:bg-white/[0.06] border border-transparent',
      )}
      title={label}
    >
      <span className="w-3.5 h-3.5">{icon}</span>
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function TrackRow({
  track, trackIdx, allTracks, allClips, clips, pxPerSec, selectedId, onSelect, onClipChange, onDropAsset, xToTime, snapTime, onPushSnapshot, onEditText,
}: {
  track: Track;
  trackIdx: number;
  allTracks: Track[];
  /** Alle Clips (auch von anderen Tracks) — für Detection von überlappenden Effect-Track-Clips. */
  allClips: TimelineClip[];
  clips: TimelineClip[];
  pxPerSec: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClipChange: (id: string, patch: Partial<TimelineClip>) => void;
  onDropAsset: (e: React.DragEvent, atTime: number) => void;
  xToTime: (x: number) => number;
  snapTime: (t: number, ignoreClipId?: string) => number;
  onPushSnapshot: () => void;
  onEditText?: (clipId: string) => void;
}) {
  const [drag, setDrag] = useState<{
    id: string;
    mode: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    orig: TimelineClip;
    /** Snapshot folgender Clips auf demselben Track für Ripple-Trim. */
    following?: Array<{ id: string; originalStart: number }>;
    /** Snapshot ALLER anderen Clips desselben Tracks für Auto-Push reverse. */
    siblingsSnapshot?: TimelineClip[];
  } | null>(null);
  const [dropHover, setDropHover] = useState(false);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      void allTracks;  // dependency-Hint
      const dx = e.clientX - drag.startX;
      const dt = dx / pxPerSec;
      if (drag.mode === 'move') {
        const rawStart = Math.max(0, drag.orig.start + dt);
        const snapped = snapTime(rawStart, drag.id);
        // Vertikale Track-Wechsel-Erkennung: finde Element unter Cursor mit data-track-idx
        const elementsUnderCursor = document.elementsFromPoint(e.clientX, e.clientY);
        let targetTrackIdx = drag.orig.trackIdx;
        for (const el of elementsUnderCursor) {
          const idx = (el as HTMLElement).dataset?.trackIdx;
          if (idx !== undefined) { targetTrackIdx = parseInt(idx, 10); break; }
        }
        if (targetTrackIdx !== drag.orig.trackIdx) {
          const srcKind = allTracks[drag.orig.trackIdx]?.kind;
          const tgtKind = allTracks[targetTrackIdx]?.kind;
          if (!srcKind || !tgtKind || srcKind !== tgtKind) {
            targetTrackIdx = drag.orig.trackIdx;
          }
        }
        onClipChange(drag.id, { start: snapped, trackIdx: targetTrackIdx });
        // Auto-Push: nutze ORIGINAL-Snapshot der siblings damit reverse-direction die Clips
        // wieder auf ihre ursprüngliche Länge zurückbringt sobald der drag aus dem Overlap raus.
        const dragEnd = snapped + drag.orig.duration;
        for (const orig of drag.siblingsSnapshot ?? []) {
          if (orig.trackIdx !== targetTrackIdx) {
            // Track-Wechsel: orig-clip auf alten Track ist nicht mehr betroffen, nichts tun
            continue;
          }
          const origEnd = orig.start + orig.duration;
          if (snapped > orig.start && snapped < origEnd) {
            // Drag-Clip startet IM original-bereich → kürze orig auf snapped
            const newDur = Math.max(0.1, snapped - orig.start);
            onClipChange(orig.id, { duration: newDur, start: orig.start, trimStart: orig.trimStart ?? 0 });
          } else if (dragEnd > orig.start && dragEnd < origEnd) {
            // Drag-Clip endet IM original-bereich → trim-start auf dragEnd
            const newStart = dragEnd;
            const newDur = Math.max(0.1, origEnd - newStart);
            const trimDelta = newStart - orig.start;
            onClipChange(orig.id, {
              start: newStart, duration: newDur,
              trimStart: (orig.trimStart ?? 0) + trimDelta,
            });
          } else {
            // Kein Overlap mehr → restore zu ORIGINAL
            onClipChange(orig.id, {
              start: orig.start,
              duration: orig.duration,
              trimStart: orig.trimStart ?? 0,
            });
          }
        }
      } else if (drag.mode === 'trim-start') {
        const rawStart = Math.max(0, drag.orig.start + dt);
        const snapped = snapTime(rawStart, drag.id);
        const delta = snapped - drag.orig.start;
        const newDur = Math.max(0.1, drag.orig.duration - delta);
        onClipChange(drag.id, { start: snapped, duration: newDur, trimStart: (drag.orig.trimStart ?? 0) + delta });
      } else if (drag.mode === 'trim-end') {
        const rawEnd = drag.orig.start + drag.orig.duration + dt;
        const snappedEnd = snapTime(rawEnd, drag.id);
        let newDur = Math.max(0.1, snappedEnd - drag.orig.start);
        const srcDur = drag.orig.srcDuration;
        const speed  = drag.orig.speed && drag.orig.speed > 0 ? drag.orig.speed : 1;
        const trimStart = drag.orig.trimStart ?? 0;
        if (srcDur && srcDur > 0) {
          const maxDur = (srcDur - trimStart) / speed;
          if (newDur > maxDur) newDur = Math.max(0.1, maxDur);
        }
        onClipChange(drag.id, { duration: newDur });
        // Ripple: folgende Clips um dieselbe Diff verschieben
        if (drag.following) {
          const durDelta = newDur - drag.orig.duration;
          for (const f of drag.following) {
            onClipChange(f.id, { start: Math.max(0, f.originalStart + durDelta) });
          }
        }
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, pxPerSec, onClipChange, snapTime, allTracks]);

  return (
    <div
      data-track-idx={trackIdx}
      style={{ height: track.height }}
      className={clsx(
        'border-b border-white/[0.06] relative transition-colors',
        track.hidden && 'opacity-40',
        drag && 'cursor-grabbing',
        dropHover && 'bg-fiano-red/[0.08] ring-1 ring-inset ring-fiano-red/40',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!dropHover) setDropHover(true);
      }}
      onDragLeave={(e) => {
        // nur wenn wirklich raus aus der Track-Box (nicht beim wechsel auf children)
        if (e.currentTarget === e.target) setDropHover(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        onDropAsset(e, xToTime(e.clientX));
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      {clips.map((c) => {
        const isSelected = c.id === selectedId;
        const left = c.start * pxPerSec;
        const width = Math.max(8, c.duration * pxPerSec);
        return (
          <div
            key={c.id}
            onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (c.type === 'text' && onEditText) onEditText(c.id);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              onPushSnapshot();
              const siblingsSnapshot = clips.filter((s) => s.id !== c.id);
              setDrag({ id: c.id, mode: 'move', startX: e.clientX, orig: c, siblingsSnapshot });
            }}
            className={clsx(
              'absolute top-1 bottom-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing select-none',
              isSelected
                ? 'ring-2 ring-fiano-red shadow-[0_0_12px_rgba(255,16,57,0.4)]'
                : 'ring-1 ring-white/[0.1]',
              track.kind === 'video'   && 'bg-gradient-to-r from-fiano-red/35 to-fiano-red/15',
              track.kind === 'overlay' && 'bg-gradient-to-r from-fiano-red/20 to-fiano-red/[0.06]',
              track.kind === 'audio'   && 'bg-gradient-to-b from-emerald-900/30 via-emerald-900/15 to-emerald-900/30',
              track.kind === 'text'    && 'bg-gradient-to-r from-white/[0.18] to-fiano-red/[0.06]',
              track.kind === 'effect' && !c.effectId && 'bg-gradient-to-r from-purple-600/40 to-pink-600/30',
            )}
            style={{
              left, width,
              // Effect-Clip: nutze die Effect-spezifische Farbe als Gradient-Tint
              ...(c.type === 'effect' && c.effectId && {
                background: `linear-gradient(135deg, ${EFFECT_META[c.effectId].color}55, ${EFFECT_META[c.effectId].color}22)`,
              }),
            }}
          >
            {/* Trim-handles — breiter (4px) + z-30 damit Nachbar-Clip sie nicht überlagert */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                onPushSnapshot();
                setDrag({ id: c.id, mode: 'trim-start', startX: e.clientX, orig: c });
              }}
              className="absolute top-0 bottom-0 left-0 w-2 bg-white/35 cursor-ew-resize hover:bg-white/70 z-30"
            />
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                onPushSnapshot();
                // Folge-Clips auf demselben Track für Ripple-Trim erfassen
                const oldEnd = c.start + c.duration;
                const following = clips
                  .filter((f) => f.id !== c.id && f.start >= oldEnd - 0.001)
                  .map((f) => ({ id: f.id, originalStart: f.start }));
                setDrag({ id: c.id, mode: 'trim-end', startX: e.clientX, orig: c, following });
              }}
              className="absolute top-0 bottom-0 right-0 w-2 bg-white/35 cursor-ew-resize hover:bg-white/70 z-30"
            />

            {/* Transition-Badge an linker Kante wenn transitionType gesetzt */}
            {c.transitionType && (
              <div
                className="absolute top-0 bottom-0 left-1.5 w-2 bg-fiano-red/90 border-r border-fiano-red
                           flex items-center justify-center pointer-events-none z-10"
                title={`Transition In: ${c.transitionType} (${(c.transitionDuration ?? 0.5).toFixed(2)}s)`}
              >
                <div className="text-[7px] text-white font-bold rotate-90 whitespace-nowrap">
                  {c.transitionType.toUpperCase().slice(0, 3)}
                </div>
              </div>
            )}

            {/* Audio-Waveform-Preview (grün/rot Stereo-Wave) */}
            {track.kind === 'audio' && (
              <AudioWaveformBars clipId={c.id} />
            )}

            {/* Effect-Pills: zeigen WO im Clip welche Effects aktiv sind. Default = ganzer Clip.
                Auf Video-Clips ergänzen wir überlappende Effect-Track-Clips (motion-blur etc.)
                damit User auch ohne in den Effect-Track zu schauen sieht: "dieser Clip wird im
                Export motion-blurred". Bei Effect-Clips selbst zeigen wir nur ihre eigenen Pills. */}
            {(() => {
              const direct = clipEffects(c);
              const overlapping = (c.type === 'video' || c.type === 'overlay')
                ? allClips
                    .filter((other) =>
                      other.type === 'effect' && other.effectId
                      && other.start < c.start + c.duration
                      && other.start + other.duration > c.start
                      && !allTracks[other.trackIdx]?.hidden,
                    )
                    .map((other) => ({ id: other.effectId!, intensity: other.effectIntensity ?? 1 }))
                : [];
              const all = [...direct, ...overlapping];
              if (all.length === 0) return null;
              return (
                <div className="absolute top-0.5 left-1.5 right-1.5 flex flex-wrap gap-0.5 pointer-events-none z-10">
                  {all.slice(0, 4).map((eff, i) => {
                    const meta = EFFECT_META[eff.id];
                    if (!meta) return null;
                    return (
                      <span
                        key={i}
                        className="text-[8px] font-bold px-1 rounded leading-tight uppercase tracking-wider"
                        style={{ background: meta.color, color: '#000' }}
                        title={`${meta.label} effect`}
                      >
                        {meta.label}
                      </span>
                    );
                  })}
                  {all.length > 4 && (
                    <span className="text-[8px] font-bold px-1 rounded bg-white text-black">
                      +{all.length - 4}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Label */}
            <div className="px-2 py-0.5 text-[10px] font-medium text-white truncate relative z-10 mt-3">
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pseudo-Stereo-Waveform für Audio-Clips im Editor-Timeline. Deterministisch aus clipId
 *  generiert (kein echter Audio-Decode) — schnell und stabil. */
export function AudioWaveformBars({ clipId }: { clipId: string }) {
  // Deterministischer Hash aus clipId → reproduzierbare bars pro clip
  const bars = useMemo(() => {
    const N = 80;
    let seed = 0;
    for (let i = 0; i < clipId.length; i++) seed = (seed * 31 + clipId.charCodeAt(i)) >>> 0;
    const out: Array<{ top: number; bot: number }> = [];
    for (let i = 0; i < N; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const r1 = (seed >>> 0) / 0xffffffff;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const r2 = (seed >>> 0) / 0xffffffff;
      const lfo = 0.5 + 0.4 * Math.sin(i / 5);
      out.push({
        top: 0.18 + r1 * 0.5 * lfo,    // grüner Kanal (oben)
        bot: 0.18 + r2 * 0.5 * lfo,    // roter Kanal (unten)
      });
    }
    return out;
  }, [clipId]);

  return (
    <div className="absolute inset-x-0 top-0 bottom-0 flex items-center pointer-events-none px-1">
      <div className="flex-1 flex items-center justify-between h-full gap-[1px]">
        {bars.map((b, i) => (
          <div key={i} className="flex flex-col h-full justify-center flex-1">
            <div className="w-full bg-emerald-400/85 rounded-sm" style={{ height: `${b.top * 50}%`, minHeight: 1 }} />
            <div className="h-px bg-white/20 my-px" />
            <div className="w-full bg-fiano-red/70 rounded-sm" style={{ height: `${b.bot * 50}%`, minHeight: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────── */

function IconUpload() {
  return <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v8 M5 6l3-3 3 3 M3 13h10"/></svg>;
}
function IconMedia()       { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 6l4 2-4 2z" fill="currentColor"/></svg>; }
function IconAudio()       { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12V4l7-1v8"/><circle cx="4" cy="12" r="2"/><circle cx="11" cy="11" r="2"/></svg>; }
function IconTts()         { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6v4l3 1V5L3 6z"/><path d="M6 5l4-2v10l-4-2"/><path d="M11 6c1.5 1 1.5 3 0 4 M13 4c2 1.5 2 6.5 0 8"/></svg>; }
function IconText()        { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4V3h10v1 M8 3v10 M6 13h4"/></svg>; }
function IconSticker()     { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2h8l4 4v8H2zM10 2v4h4"/></svg>; }
function IconEffects()     { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="currentColor"><path d="M8 1l1.5 4 4 1L10 9.5l1 4L8 11.5 5 13.5l1-4L2.5 6l4-1z"/></svg>; }
function IconTransitions() { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="6" height="8" rx="1"/><rect x="9" y="4" width="6" height="8" rx="1"/><path d="M7 8h2"/></svg>; }
function IconFilter()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="4"/><circle cx="10" cy="10" r="4"/></svg>; }
function IconAdjust()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4h10 M3 8h10 M3 12h10"/><circle cx="6" cy="4" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/></svg>; }
function IconTemplate()    { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>; }
function IconSplit()       { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v14 M3 5L8 1l5 4 M3 11l5 4 5-4"/></svg>; }
function IconCursor()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2l3 12 2-5 5-2z"/></svg>; }
function IconUndo()        { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8c0-3 2-5 5-5s5 2 5 5-2 5-5 5 M3 8l3-3 M3 8l3 3"/></svg>; }
function IconRedo()        { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8c0-3-2-5-5-5s-5 2-5 5 2 5 5 5 M13 8l-3-3 M13 8l-3 3"/></svg>; }
function IconRippleDelete(){ return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="3" height="6" rx="0.5"/><path d="M11 5l3 3-3 3 M14 8H7"/></svg>; }
function IconFreeze()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1v14 M2 5l12 6 M2 11l12-6"/></svg>; }
function IconMagnet()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6a5 5 0 0 0 10 0V2 M3 2h3v5 M10 2h3v5"/></svg>; }
function IconDetach()      { return <svg viewBox="0 0 16 16" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="5" rx="1"/><path d="M3 12h2M7 12h2M11 12h2"/></svg>; }

/* ─── Export Dialog ──────────────────────────────────────── */

function ExportDialog({
  settings, onChange, onClose, onConfirm,
}: {
  settings: ExportSettings;
  onChange: (s: ExportSettings) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const matchingPreset = RESOLUTION_PRESETS.find((p) => p.w === settings.width && p.h === settings.height);
  const matchingBitrate = BITRATE_PRESETS.find((b) => b.value === settings.bitrate);
  const t = useT();
  const fourKFeature = useFeature('export_4k');
  const highBitrateFeature = useFeature('export_high_bitrate');
  const openUpgrade = useUpgradeModal((s) => s.open);
  // Phase 9.3: Plan-Limits einheitlich — Creator max 1080p + 5M, Pro alles offen.
  const isResolutionLocked = (w: number, h: number) =>
    Math.min(w, h) > 1080 && !fourKFeature.unlocked;
  const isBitrateLocked = (val: string) => {
    const mbps = parseInt(val.replace(/M$/i, ''), 10);
    return mbps > 5 && !highBitrateFeature.unlocked;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
         onClick={onClose}>
      <div className="glass w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{t('editor.exportSettings')}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-md text-zinc-400 hover:bg-white/[0.06] flex items-center justify-center transition">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10 M13 3L3 13"/></svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* Resolution */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('editor.resolution')}</div>
            <select
              value={matchingPreset ? `${matchingPreset.w}x${matchingPreset.h}` : 'custom'}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                if (!w || !h) return;
                if (isResolutionLocked(w, h)) {
                  openUpgrade('export_4k');
                  return;
                }
                onChange({ ...settings, width: w, height: h });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
            >
              {RESOLUTION_PRESETS.map((p) => {
                const locked = isResolutionLocked(p.w, p.h);
                return (
                  <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                    {locked ? `${p.label} 🔒` : p.label}
                  </option>
                );
              })}
            </select>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <input
                type="number"
                value={settings.width}
                onChange={(e) => onChange({ ...settings, width: parseInt(e.target.value) || 0 })}
                placeholder="Width"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
              />
              <input
                type="number"
                value={settings.height}
                onChange={(e) => onChange({ ...settings, height: parseInt(e.target.value) || 0 })}
                placeholder="Height"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
              />
            </div>
          </div>

          {/* FPS */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('editor.frameRate')}</div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
              {FPS_PRESETS.map((fps) => (
                <button
                  key={fps}
                  onClick={() => onChange({ ...settings, fps })}
                  className={clsx(
                    'text-[11px] py-1.5 rounded-md font-medium transition',
                    settings.fps === fps ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          {/* Bitrate */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('editor.bitrate')}</div>
            <select
              value={matchingBitrate ? matchingBitrate.value : 'custom'}
              onChange={(e) => {
                if (isBitrateLocked(e.target.value)) {
                  openUpgrade('export_high_bitrate');
                  return;
                }
                onChange({ ...settings, bitrate: e.target.value });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
            >
              {BITRATE_PRESETS.map((b) => {
                const locked = isBitrateLocked(b.value);
                return (
                  <option key={b.value} value={b.value}>
                    {locked ? `${b.label} 🔒` : b.label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Phase 9.3: Encoder-Picker — Hardware/Software, gleicher Toggle-Style wie FPS. */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('exportDialog.encoder')}</div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
              {(['fast', 'quality'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onChange({ ...settings, qualityMode: mode })}
                  className={clsx(
                    'text-[11px] py-1.5 rounded-md font-medium transition',
                    (settings.qualityMode ?? 'fast') === mode
                      ? 'bg-white/[0.08] text-white'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {mode === 'fast' ? t('exportDialog.encoderHardware') : t('exportDialog.encoderSoftware')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-zinc-300 text-[12px] font-medium py-2.5 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-fiano-red text-white text-[12px] font-semibold py-2.5 rounded-lg
                       hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)] active:scale-[0.98] transition"
          >
            Start Export
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── TTS-Modal (AI Text-to-Speech via OpenAI) ───────────────────── */

const TTS_LANGUAGES: Array<{ code: string; label: string; native: string }> = [
  { code: 'de', label: 'German',     native: 'Deutsch' },
  { code: 'en', label: 'English',    native: 'English' },
  { code: 'es', label: 'Spanish',    native: 'Español' },
  { code: 'fr', label: 'French',     native: 'Français' },
  { code: 'it', label: 'Italian',    native: 'Italiano' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'nl', label: 'Dutch',      native: 'Nederlands' },
  { code: 'pl', label: 'Polish',     native: 'Polski' },
  { code: 'ru', label: 'Russian',    native: 'Русский' },
];

// OpenAI TTS-Voices, gruppiert nach Gender (subjektiv basierend auf Klang)
const TTS_VOICES_MALE   = [
  { id: 'onyx',  label: 'Onyx',  hint: 'Deep, authoritative' },
  { id: 'echo',  label: 'Echo',  hint: 'Calm, neutral' },
  { id: 'fable', label: 'Fable', hint: 'British accent' },
];
const TTS_VOICES_FEMALE = [
  { id: 'nova',    label: 'Nova',    hint: 'Bright, energetic' },
  { id: 'shimmer', label: 'Shimmer', hint: 'Soft, warm' },
  { id: 'alloy',   label: 'Alloy',   hint: 'Neutral, versatile' },
];

export function TtsModal({
  initialText = '', initialVoice = 'nova', isEditMode = false,
  onClose, onGenerated,
}: {
  initialText?: string;
  initialVoice?: string;
  isEditMode?: boolean;
  onClose: () => void;
  onGenerated: (audioPath: string, label: string, text: string, voice: string) => void;
}) {
  const [text, setText]     = useState(initialText);
  const [lang, setLang]     = useState<string>('de');
  // Voice + Gender aus initialVoice ableiten (falls Edit-Modus)
  const initialGender: 'male' | 'female' =
    TTS_VOICES_MALE.some((v) => v.id === initialVoice) ? 'male' : 'female';
  const [gender, setGender] = useState<'male' | 'female'>(initialGender);
  const [voice, setVoice]   = useState<string>(initialVoice);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const voices = gender === 'male' ? TTS_VOICES_MALE : TTS_VOICES_FEMALE;

  // Wenn Gender manuell wechselt (User-Aktion, nicht Mount), setze Voice auf erstes
  // der neuen Gruppe. Mount-Initialisierung wird durch initialGender abgedeckt.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setVoice(voices[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  const charsLeft = 4096 - text.length;
  const canGenerate = text.trim().length > 0 && !busy && charsLeft >= 0;

  const onGenerate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.api.invoke<{ path: string }>('tts.generate', {
        text: text.trim(),
        voice,
      });
      if (!res.ok || !res.data?.path) throw new Error(res.error ?? 'Generation failed');
      const label = `TTS · ${voice} · ${text.trim().slice(0, 24)}${text.length > 24 ? '…' : ''}`;
      onGenerated(res.data.path, label, text.trim(), voice);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] p-6 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)]
                   bg-fiano-black/95 border border-white/[0.10]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-fiano-red/15 border border-fiano-red/40
                          flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-fiano-red">
              <path d="M3 9v6l5 2V7L3 9z" />
              <path d="M8 6l8-3v18l-8-3" />
              <path d="M19 9c2 1.5 2 4.5 0 6 M21 7c3 2.5 3 7.5 0 10" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-zinc-100 leading-tight">
              {isEditMode ? 'Edit Text-to-Speech' : 'AI Text-to-Speech'}
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
              {isEditMode
                ? 'Update text or voice — generates a new audio file and replaces it on the timeline.'
                : 'Generate voiceover audio with OpenAI TTS. Inserted at the playhead position.'}
            </p>
          </div>
        </div>

        {/* Language */}
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-2">Language</div>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.10]
                       text-[13px] text-zinc-100 cursor-pointer
                       focus:outline-none focus:border-fiano-red/60 transition"
          >
            {TTS_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-fiano-black">
                {l.native} ({l.label})
              </option>
            ))}
          </select>
          <div className="text-[10px] text-zinc-600 mt-1">OpenAI detects language automatically — selection is a UI hint.</div>
        </div>

        {/* Voice Gender */}
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-2">Voice</div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button onClick={() => setGender('female')}
              className={clsx(
                'text-[12px] font-medium py-2 rounded-lg border transition-all',
                gender === 'female'
                  ? 'bg-fiano-red/15 border-fiano-red/55 text-white'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]',
              )}>
              ♀ Female
            </button>
            <button onClick={() => setGender('male')}
              className={clsx(
                'text-[12px] font-medium py-2 rounded-lg border transition-all',
                gender === 'male'
                  ? 'bg-fiano-red/15 border-fiano-red/55 text-white'
                  : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]',
              )}>
              ♂ Male
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {voices.map((v) => (
              <button key={v.id} onClick={() => setVoice(v.id)}
                className={clsx(
                  'text-left p-2 rounded-lg border transition-all',
                  voice === v.id
                    ? 'bg-fiano-red/10 border-fiano-red/45 text-white'
                    : 'bg-white/[0.03] border-white/[0.06] text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.14]',
                )}
                title={v.hint}>
                <div className="text-[12px] font-medium">{v.label}</div>
                <div className="text-[9px] text-zinc-500 truncate">{v.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Text */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Text</div>
            <div className={clsx('text-[10px] font-mono tabular-nums', charsLeft < 100 ? 'text-fiano-red' : 'text-zinc-600')}>
              {text.length} / 4096
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); if (error) setError(null); }}
            placeholder="Type or paste text in any language…"
            rows={6}
            className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.10]
                       text-[13px] text-zinc-100 placeholder:text-zinc-600 leading-relaxed
                       focus:outline-none focus:border-fiano-red/60 focus:bg-black/60
                       focus:shadow-[0_0_0_1px_rgba(255,16,57,0.35),0_0_18px_rgba(255,16,57,0.18)]
                       resize-none transition-all"
          />
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[12px] font-medium border border-white/[0.10]
                       text-zinc-300 hover:bg-white/[0.05] hover:border-white/[0.20] hover:text-white
                       disabled:opacity-40 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold
                       bg-fiano-red text-white flex items-center gap-2
                       hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)]
                       active:scale-[0.98]
                       disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100
                       transition-all"
          >
            {busy && (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
              </svg>
            )}
            {busy ? 'Generating…' : (isEditMode ? 'Re-Generate' : 'Generate')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
    )}
    </>
  );
}

/* ─── TextStyleDialog: Custom Text-Clip mit Font/Color/Glow/Shadow/Background ───── */

const FONT_FALLBACKS = [
  'Inter', 'Geist', 'Arial Black', 'Impact', 'Helvetica Neue',
  'SF Pro Display', 'Segoe UI', 'Roboto', 'Times New Roman', 'Georgia',
  'Courier New', 'Comic Sans MS', 'Trebuchet MS', 'Verdana',
];

function TextStyleDialog({
  onClose, onAdd, onLiveChange, initial,
}: {
  onClose: () => void;
  onAdd: (spec: Partial<TimelineClip> & { text: string }) => void;
  /** Edit-Modus: Live-Propagation jeder Style-Änderung zum Clip-State (ohne Snapshot). */
  onLiveChange?: (spec: Partial<TimelineClip> & { text: string }) => void;
  /** Wenn gesetzt: Edit-Modus mit pre-filled Werten aus existierendem Clip. */
  initial?: TimelineClip;
}) {
  const i: any = initial ?? {};
  const [text, setText]     = useState(i.text ?? 'Your Text');
  const [font, setFont]     = useState(i.textFont ?? 'Inter');
  const [size, setSize]     = useState<number>(i.textSize ?? 64);
  const [color, setColor]   = useState(i.textColor ?? '#ffffff');
  const [weight, setWeight] = useState<'normal' | 'bold' | '900'>(
    (i.textWeight === 'normal' || i.textWeight === '900' ? i.textWeight : 'bold') as 'normal' | 'bold' | '900',
  );
  const [italic, setItalic] = useState<boolean>(i.textItalic ?? false);
  const [bgEnabled, setBgEnabled] = useState<boolean>(!!i.textBgColor);
  const [bgColor, setBgColor]     = useState(i.textBgColor ?? '#000000');
  const [bgOpacity, setBgOpacity] = useState<number>(i.textBgOpacity ?? 0.7);
  const [glowEnabled, setGlowEnabled] = useState<boolean>(!!i.textGlowColor);
  const [glowColor, setGlowColor] = useState(i.textGlowColor ?? '#ff1039');
  const [glowBlur, setGlowBlur]   = useState<number>(i.textGlowBlur ?? 20);
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(!!i.textShadowColor);
  const [shadowColor, setShadowColor] = useState(i.textShadowColor ?? '#000000');
  const [shadowOffsetX, setShadowOffsetX] = useState<number>(i.textShadowOffsetX ?? 2);
  const [shadowOffsetY, setShadowOffsetY] = useState<number>(i.textShadowOffsetY ?? 4);
  const [shadowBlur, setShadowBlur] = useState<number>(i.textShadowBlur ?? 8);
  // Layered-Style state
  const [textStyle, setTextStyle] = useState<'simple' | 'layered'>(i.textStyle ?? 'simple');
  const [layeredSecond, setLayeredSecond] = useState(i.textLayeredSecond ?? 'moment');
  const [layeredScale, setLayeredScale] = useState<number>(i.textLayeredScale ?? 2.0);
  const [layeredUseGradient, setLayeredUseGradient] = useState<boolean>(i.textLayeredUseGradient ?? true);
  const [layeredGradientFrom, setLayeredGradientFrom] = useState(i.textLayeredGradientFrom ?? '#ff5570');
  const [layeredGradientTo, setLayeredGradientTo] = useState(i.textLayeredGradientTo ?? '#ff1039');
  const [layeredMetallic, setLayeredMetallic] = useState<boolean>(i.textLayeredMetallic ?? false);
  const [layeredGlow, setLayeredGlow] = useState<boolean>(i.textLayeredGlow ?? false);
  const [layeredGlowColor, setLayeredGlowColor] = useState(i.textLayeredGlowColor ?? '#ffffff');
  const [layeredGlowStrength, setLayeredGlowStrength] = useState<number>(i.textLayeredGlowStrength ?? 0.6);
  const [layeredDropShadow, setLayeredDropShadow] = useState<number>(i.textLayeredDropShadow ?? 8);
  const isEditing = !!initial;

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  useEffect(() => {
    const w = window as any;
    if (!w.queryLocalFonts) { setSystemFonts(FONT_FALLBACKS); return; }
    w.queryLocalFonts().then((fonts: Array<{ family: string }>) => {
      const unique = Array.from(new Set(fonts.map((f) => f.family))).sort();
      setSystemFonts(unique.length > 0 ? unique : FONT_FALLBACKS);
    }).catch(() => setSystemFonts(FONT_FALLBACKS));
  }, []);

  const buildSpec = (): Partial<TimelineClip> & { text: string } => ({
    text: text.trim() || (initial?.text ?? ''),
    textFont: font,
    textSize: size,
    textColor: color,
    textWeight: weight,
    textItalic: italic,
    // textStyle muss IMMER raus — sonst kann simple→layered Switch nicht zurück
    textStyle: textStyle,
    ...(bgEnabled    ? { textBgColor: bgColor, textBgOpacity: bgOpacity } : { textBgColor: undefined, textBgOpacity: undefined }),
    ...(glowEnabled  ? { textGlowColor: glowColor, textGlowBlur: glowBlur } : { textGlowColor: undefined, textGlowBlur: undefined }),
    ...(shadowEnabled ? {
      textShadowColor: shadowColor,
      textShadowOffsetX: shadowOffsetX,
      textShadowOffsetY: shadowOffsetY,
      textShadowBlur: shadowBlur,
    } : { textShadowColor: undefined, textShadowOffsetX: undefined, textShadowOffsetY: undefined, textShadowBlur: undefined }),
    // Layered-Style — bei textStyle='simple' Felder explizit auf undefined, damit alte Werte aus initial verschwinden
    ...(textStyle === 'layered' ? {
      textLayeredSecond: layeredSecond.trim() || undefined,
      textLayeredScale: layeredScale,
      textLayeredUseGradient: layeredUseGradient,
      textLayeredGradientFrom: layeredGradientFrom,
      textLayeredGradientTo: layeredGradientTo,
      textLayeredMetallic: layeredMetallic,
      textLayeredGlow: layeredGlow,
      textLayeredGlowColor: layeredGlowColor,
      textLayeredGlowStrength: layeredGlowStrength,
      textLayeredDropShadow: layeredDropShadow,
    } : {}),
  });

  const submit = () => {
    if (!text.trim()) return;
    onAdd(buildSpec());
  };

  // Live-Propagation im Edit-Modus: jeder State-Change pusht spec sofort zum Clip-State.
  // Snapshot kommt erst beim Save (im Parent), Cancel restored Original (im Parent).
  useEffect(() => {
    if (!onLiveChange || !initial) return;
    if (!text.trim()) return;
    onLiveChange(buildSpec());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text, font, size, color, weight, italic,
    bgEnabled, bgColor, bgOpacity,
    glowEnabled, glowColor, glowBlur,
    shadowEnabled, shadowColor, shadowOffsetX, shadowOffsetY, shadowBlur,
    textStyle, layeredSecond, layeredScale,
    layeredUseGradient, layeredGradientFrom, layeredGradientTo,
    layeredMetallic, layeredGlow, layeredGlowColor, layeredGlowStrength, layeredDropShadow,
  ]);

  const previewStyle: React.CSSProperties = {
    fontFamily: font,
    fontSize: `${Math.min(size, 72)}px`,
    fontWeight: weight === '900' ? 900 : weight === 'bold' ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    color,
    background: bgEnabled
      ? `rgba(${parseInt(bgColor.slice(1, 3), 16)},${parseInt(bgColor.slice(3, 5), 16)},${parseInt(bgColor.slice(5, 7), 16)},${bgOpacity})`
      : 'transparent',
    padding: bgEnabled ? '0.2em 0.5em' : 0,
    borderRadius: bgEnabled ? '0.2em' : 0,
    textShadow: [
      glowEnabled  ? `0 0 ${glowBlur}px ${glowColor}` : '',
      shadowEnabled ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}` : '',
    ].filter(Boolean).join(', '),
    lineHeight: 1.1,
  };

  // Mock-Clip für Layered-Preview — wiederverwendet LayeredTextDom 1:1 wie Center-Preview.
  // Size auf 72 cap'd, damit Preview in die Modal-Box passt.
  const layeredPreviewClip = {
    text: text || 'Preview',
    textFont: font,
    textSize: Math.min(size, 56),
    textColor: color,
    textLayeredSecond: layeredSecond,
    textLayeredScale: layeredScale,
    textLayeredUseGradient: layeredUseGradient,
    textLayeredGradientFrom: layeredGradientFrom,
    textLayeredGradientTo: layeredGradientTo,
    textLayeredMetallic: layeredMetallic,
    textLayeredGlow: layeredGlow,
    textLayeredGlowColor: layeredGlowColor,
    textLayeredGlowStrength: layeredGlowStrength,
    textLayeredDropShadow: layeredDropShadow,
  } as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="glass w-[640px] max-w-[92vw] max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[15px] font-semibold text-zinc-100 mb-4">{isEditing ? 'Edit Text' : 'Add Custom Text'}</h2>

        <div className="mb-5 rounded-xl bg-black/60 border border-white/[0.08] p-6 min-h-[120px] flex items-center justify-center text-center overflow-hidden">
          {textStyle === 'layered' ? (
            <LayeredTextDom clip={layeredPreviewClip} />
          ) : (
            <div style={previewStyle}>{text || 'Preview'}</div>
          )}
        </div>

        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
          className="w-full px-3 py-2.5 mb-4 rounded-lg bg-black/40 border border-white/[0.10]
                     text-[13px] text-zinc-100 focus:outline-none focus:border-fiano-red/60" />

        {/* Style-Picker — simple vs layered */}
        <div className="mb-4 grid grid-cols-2 gap-1 p-1 bg-black/40 border border-white/[0.08] rounded-lg">
          <button
            onClick={() => setTextStyle('simple')}
            className={clsx('text-[12px] py-1.5 rounded-md font-medium transition-all',
              textStyle === 'simple' ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >Simple</button>
          <button
            onClick={() => setTextStyle('layered')}
            className={clsx('text-[12px] py-1.5 rounded-md font-medium transition-all',
              textStyle === 'layered' ? 'bg-fiano-red/15 border border-fiano-red/40 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >Layered</button>
        </div>

        {textStyle === 'layered' && (
          <div className="mb-4 space-y-3 p-3 rounded-lg bg-fiano-red/[0.04] border border-fiano-red/20">
            <div className="text-[10px] uppercase tracking-[0.16em] text-fiano-red font-semibold">Layered Settings</div>
            <div>
              <TextDialogLabel>Small word (under big)</TextDialogLabel>
              <input value={layeredSecond} onChange={(e) => setLayeredSecond(e.target.value)} maxLength={60}
                placeholder="e.g. moment, clip, play"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.10]
                           text-[12px] text-zinc-100 focus:outline-none focus:border-fiano-red/60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <TextDialogLabel>Scale: <span className="text-zinc-300 font-mono">{layeredScale.toFixed(1)}×</span></TextDialogLabel>
                <input type="range" min={1} max={3} step={0.1} value={layeredScale}
                  onChange={(e) => setLayeredScale(Number(e.target.value))} className={dialogRangeClass()} />
              </div>
              <div>
                <TextDialogLabel>Drop Shadow: <span className="text-zinc-300 font-mono">{layeredDropShadow}px</span></TextDialogLabel>
                <input type="range" min={0} max={40} step={1} value={layeredDropShadow}
                  onChange={(e) => setLayeredDropShadow(Number(e.target.value))} className={dialogRangeClass()} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <TextDialogLabel>Gradient From</TextDialogLabel>
                <input type="color" value={layeredGradientFrom} onChange={(e) => setLayeredGradientFrom(e.target.value)}
                  className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
              </div>
              <div>
                <TextDialogLabel>Gradient To</TextDialogLabel>
                <input type="color" value={layeredGradientTo} onChange={(e) => setLayeredGradientTo(e.target.value)}
                  className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-zinc-300">Use Gradient</span>
                <input type="checkbox" checked={layeredUseGradient} onChange={(e) => setLayeredUseGradient(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-zinc-300">Metallic</span>
                <input type="checkbox" checked={layeredMetallic} onChange={(e) => setLayeredMetallic(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer col-span-2">
                <span className="text-zinc-300">Glow</span>
                <input type="checkbox" checked={layeredGlow} onChange={(e) => setLayeredGlow(e.target.checked)} />
              </label>
            </div>
            {layeredGlow && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <TextDialogLabel>Glow Color</TextDialogLabel>
                  <input type="color" value={layeredGlowColor} onChange={(e) => setLayeredGlowColor(e.target.value)}
                    className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
                </div>
                <div>
                  <TextDialogLabel>Glow Strength: <span className="text-zinc-300 font-mono">{Math.round(layeredGlowStrength * 100)}%</span></TextDialogLabel>
                  <input type="range" min={0} max={1} step={0.05} value={layeredGlowStrength}
                    onChange={(e) => setLayeredGlowStrength(Number(e.target.value))} className={dialogRangeClass()} />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <TextDialogLabel>Font</TextDialogLabel>
            <select value={font} onChange={(e) => setFont(e.target.value)} className={dialogSelectClass()}>
              {systemFonts.map((f) => <option key={f} value={f} className="bg-fiano-black">{f}</option>)}
            </select>
          </div>
          <div>
            <TextDialogLabel>Size: <span className="text-zinc-300 font-mono">{size}px</span></TextDialogLabel>
            <input type="range" min={12} max={160} step={1} value={size}
              onChange={(e) => setSize(Number(e.target.value))} className={dialogRangeClass()} />
          </div>
          <div>
            <TextDialogLabel>Color</TextDialogLabel>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
          </div>
          <div>
            <TextDialogLabel>Weight</TextDialogLabel>
            <div className="grid grid-cols-3 gap-1">
              {(['normal','bold','900'] as const).map((w) => (
                <button key={w} onClick={() => setWeight(w)} className={dialogPillClass(weight === w)}>
                  {w === '900' ? 'Black' : w === 'bold' ? 'Bold' : 'Regular'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer col-span-2">
            <input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} className="accent-fiano-red" />
            <span className="text-[12px] text-zinc-200">Italic</span>
          </label>
        </div>

        <TextDialogSection title="Background" enabled={bgEnabled} onToggle={setBgEnabled}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextDialogLabel>Color</TextDialogLabel>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
            </div>
            <div>
              <TextDialogLabel>Opacity: <span className="text-zinc-300 font-mono">{Math.round(bgOpacity * 100)}%</span></TextDialogLabel>
              <input type="range" min={0} max={1} step={0.05} value={bgOpacity}
                onChange={(e) => setBgOpacity(Number(e.target.value))} className={dialogRangeClass()} />
            </div>
          </div>
        </TextDialogSection>

        <TextDialogSection title="Glow" enabled={glowEnabled} onToggle={setGlowEnabled}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextDialogLabel>Color</TextDialogLabel>
              <input type="color" value={glowColor} onChange={(e) => setGlowColor(e.target.value)}
                className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
            </div>
            <div>
              <TextDialogLabel>Blur: <span className="text-zinc-300 font-mono">{glowBlur}px</span></TextDialogLabel>
              <input type="range" min={0} max={60} step={1} value={glowBlur}
                onChange={(e) => setGlowBlur(Number(e.target.value))} className={dialogRangeClass()} />
            </div>
          </div>
        </TextDialogSection>

        <TextDialogSection title="Drop Shadow" enabled={shadowEnabled} onToggle={setShadowEnabled}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <TextDialogLabel>Color</TextDialogLabel>
              <input type="color" value={shadowColor} onChange={(e) => setShadowColor(e.target.value)}
                className="w-full h-9 rounded-lg cursor-pointer bg-black/40 border border-white/[0.10]" />
            </div>
            <div>
              <TextDialogLabel>Offset X: {shadowOffsetX}px</TextDialogLabel>
              <input type="range" min={-20} max={20} step={1} value={shadowOffsetX}
                onChange={(e) => setShadowOffsetX(Number(e.target.value))} className={dialogRangeClass()} />
            </div>
            <div>
              <TextDialogLabel>Offset Y: {shadowOffsetY}px</TextDialogLabel>
              <input type="range" min={-20} max={20} step={1} value={shadowOffsetY}
                onChange={(e) => setShadowOffsetY(Number(e.target.value))} className={dialogRangeClass()} />
            </div>
            <div className="col-span-2">
              <TextDialogLabel>Blur: {shadowBlur}px</TextDialogLabel>
              <input type="range" min={0} max={40} step={1} value={shadowBlur}
                onChange={(e) => setShadowBlur(Number(e.target.value))} className={dialogRangeClass()} />
            </div>
          </div>
        </TextDialogSection>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium border border-white/[0.10] text-zinc-300 hover:bg-white/[0.05]">
            Cancel
          </button>
          <button onClick={submit} disabled={!text.trim()}
            className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-fiano-red text-white hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,16,57,0.45)] active:scale-[0.98] disabled:opacity-40 transition-all">
            {isEditing ? 'Save Changes' : 'Add to Timeline'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TextDialogLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-1">{children}</div>;
}
function TextDialogSection({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (b: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="mt-4 pt-4 border-t border-white/[0.06]">
      <label className="flex items-center justify-between cursor-pointer mb-3">
        <span className="text-[12px] font-medium text-zinc-200">{title}</span>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="accent-fiano-red" />
      </label>
      {enabled && <div>{children}</div>}
    </div>
  );
}
function dialogSelectClass() {
  return 'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.10] text-[13px] text-zinc-100 cursor-pointer focus:outline-none focus:border-fiano-red/60';
}
function dialogRangeClass() {
  return 'w-full accent-fiano-red';
}
function dialogPillClass(active: boolean) {
  return clsx(
    'text-[11px] py-1.5 rounded-md border transition-all',
    active ? 'bg-fiano-red/15 border-fiano-red/55 text-white' : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]',
  );
}


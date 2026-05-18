import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  Highlight, SubtitleFontFamily, SubtitleSettings, SubtitleStyle, SubtitlePosition,
} from '@shared/types';
import { validateAssContent } from '@shared/assValidator';
import type { Transcript } from './transcribe';

// Output-Höhe für 9:16-Master (libass arbeitet in Pixel; muss zur Render-Höhe passen)
const TIKTOK_HEIGHT = 1920;

/** customY clampen + auf [0,1] beschränken (0=oben, 1=unten). */
function clampCustomY(v: number | undefined): number {
  if (typeof v !== 'number' || isNaN(v)) return 0.85;
  return Math.max(0, Math.min(1, v));
}

/** hex (#rrggbb) → ASS-Color-String (&HBBGGRR) */
function hexToAss(hex?: string): string | null {
  if (!hex) return null;
  const m = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const r = m.slice(0, 2);
  const g = m.slice(2, 4);
  const b = m.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** Font-Family logisch → ASS-FontName. Curated ID → konkreter Name; sonst direkt durch. */
function fontFamilyAss(f?: SubtitleFontFamily): string | null {
  if (!f) return null;
  switch (f) {
    case 'arial-black': return 'Arial Black';
    case 'helvetica':   return 'Helvetica Neue';
    case 'impact':      return 'Impact';
    case 'geist':       return 'Geist';
    case 'georgia':     return 'Georgia';
    case 'mono':        return 'Menlo';
    case 'system':      return 'Helvetica Neue';
    default:            return f; // direkter System-Font-Name (libass via fontconfig)
  }
}

/** drawtext fontfile (mac default paths). Bei unbekanntem Font: fallback Helvetica. */
function fontFamilyDrawtext(f?: SubtitleFontFamily): string | null {
  const SF = '/System/Library/Fonts/Supplemental/';
  switch (f) {
    case 'arial-black': return SF + 'Arial Black.ttf';
    case 'helvetica':   return '/System/Library/Fonts/Helvetica.ttc';
    case 'impact':      return SF + 'Impact.ttf';
    case 'georgia':     return SF + 'Georgia.ttf';
    case 'mono':        return '/System/Library/Fonts/Menlo.ttc';
    case 'geist':
    case 'system':      return '/System/Library/Fonts/Helvetica.ttc';
    default:
      // Custom system font name — drawtext supports `font=` (fontconfig) via libfontconfig.
      // Falls libfontconfig fehlt, fallback path. Best-effort.
      return '/System/Library/Fonts/Helvetica.ttc';
  }
}

/**
 * MVP Subtitle System: SRT aus Transcript-Subset für ein Highlight generieren.
 * Timestamps werden auf Clip-internes Timeline (start ab 0) normalisiert.
 */
/**
 * SRT generieren. Liefert null wenn keine Segmente im Highlight-Bereich liegen.
 * (Z.B. Manual-Highlight ausserhalb des transkribierten Bereichs.)
 */
export async function generateClipSrt(
  transcript: Transcript,
  highlight: Highlight,
  outDir: string,
  fileName: string,
  /** Style + Settings — bei 'layered' wird der Text mit ASS-Inline-Tags transformiert. */
  style?: SubtitleStyle,
  settings?: SubtitleSettings,
): Promise<string | null> {
  const start = highlight.start;
  const end = highlight.end;

  const segs = transcript.segments.filter((s) => s.end > start && s.start < end);

  // Glow: per-cue Inline-Blur damit die Outline weichgezeichnet → Halo-Effekt um Text.
  // Layered-Style hat eigenes Highlight-Glow, daher dort kein Style-Level-Blur.
  // Master-Toggle glowEnabled (neu) hat Vorrang. Legacy-Fallback: glowBlur > 0.
  const glowBlurPx = settings?.glowBlur ?? 0;
  const glowOn = settings?.glowEnabled ?? (glowBlurPx > 0);
  const glowActive = glowOn && glowBlurPx > 0 && style !== 'layered';
  const cueBlurPrefix = glowActive ? `{\\blur${Math.max(1, Math.round(glowBlurPx / 3))}}` : '';

  // User-Edits aus highlight.subtitleEdits anwenden (Cue-Index basiert, identisch
  // zu transcript.getCuesForHighlight). Edit mit text → override; Edit === null → skip.
  const edits = (highlight as any).subtitleEdits as
    Array<{ start: number; end: number; text: string } | null> | undefined;

  const lines: string[] = [];
  let i = 1;
  for (let segIdx = 0; segIdx < segs.length; segIdx++) {
    const s = segs[segIdx];
    const edit = edits?.[segIdx];
    if (edit === null) continue;  // User hat Cue ausgeblendet
    const localStart = Math.max(0, s.start - start);
    const localEnd = Math.min(end - start, s.end - start);
    if (localEnd <= localStart) continue;
    const text = (edit?.text ?? s.text).trim();
    if (!text) continue;

    // Bei layered-Style: Text inline mit ASS-Override-Tags transformieren damit
    // Highlight-Wort GROSS + Color, Rest klein + textColor. Erfordert highlightWords.
    const transformedText = (style === 'layered' && settings?.highlightWords && settings.highlightWords.length > 0)
      ? buildLayeredAssText(text, settings)
      : text;

    lines.push(String(i));
    lines.push(`${formatSrtTime(localStart)} --> ${formatSrtTime(localEnd)}`);
    lines.push(cueBlurPrefix + transformedText);
    lines.push('');
    i++;
  }

  if (lines.length === 0) {
    console.warn(`[subtitles] no transcript segments in highlight ${start}..${end}s — SRT skipped`);
    return null;
  }

  const srtPath = path.join(outDir, fileName);
  // Phase A6.2 (2026-05-18): validateAssContent auf SRT-mit-inline-ASS-Overrides.
  // SRT-Sections gibt's nicht (Validator passt's durch), aber `\bord`/`\blur`/
  // `\fs`/`\p1+`/`\fn`-Checks greifen. Defense-in-depth gegen libass-DoS.
  // Bei reject: error throwen statt silent-fallback — falsche subs sind
  // besser sichtbar als korrumpierter Render.
  const srtBody = lines.join('\n');
  const validation = validateAssContent(srtBody);
  if (!validation.ok) {
    throw new Error(`Subtitle SRT validation failed: ${validation.reason}`);
  }
  await fs.writeFile(srtPath, validation.sanitized, 'utf8');
  console.log(`[subtitles] wrote ${i - 1} cues → ${srtPath}${style === 'layered' ? ' [layered-transformed]' : ''}`);
  return srtPath;
}

/**
 * Layered-Style: Text inline mit ASS-Override-Tags umhüllen.
 * - Highlight-Wörter (settings.highlightWords mit big=true): groß + highlightColor
 * - Andere Wörter: klein (= base size aus libass-Style) + textColor
 *
 * libass kann KEINEN echten Vertikal-Gradient — wir nehmen den Mittelpunkt zwischen
 * highlightGradientFrom und highlightGradientTo als Approximation. Live-Preview im
 * Frontend zeigt den echten Gradient (CSS), Export zeigt eine Solid-Color-Version.
 */
function buildLayeredAssText(text: string, settings: SubtitleSettings): string {
  const big = (settings.highlightWords ?? []).filter((w) => w.big).map((w) => w.text.toLowerCase());
  if (big.length === 0) return text;

  const scale = settings.highlightFontScale ?? 2.0;
  // base fontsize aus libass = 28 (siehe getSubtitleForceStyle layered-case),
  // bei layered scaled wir hoch. ASS \fs ist absolute size.
  const baseSize = 28;
  const bigSize = Math.round(baseSize * scale);

  // Approximated highlight color: gradient mid-point oder highlightColor
  const highlightHex = (() => {
    if (settings.highlightUseGradient && settings.highlightGradientFrom && settings.highlightGradientTo) {
      return midpointHex(settings.highlightGradientFrom, settings.highlightGradientTo);
    }
    return settings.highlightColor ?? '#ff1039';
  })();
  const highlightAss = hexToAss(highlightHex) ?? '&H003910FF';
  const baseTextColor = hexToAss(settings.textColor ?? '#ffffff') ?? '&H00FFFFFF';

  // Word-für-Word transformieren. Whitespaces preserved.
  const words = text.split(/(\s+)/);
  const out = words.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    const isBig = big.some((b) => tok.toLowerCase().replace(/[^\w\säöüÄÖÜß]/g, '') === b);
    if (isBig) {
      return `{\\fs${bigSize}\\1c${highlightAss}\\b1}${tok}{\\fs${baseSize}\\1c${baseTextColor}\\b1}`;
    }
    return tok;
  }).join('');
  return out;
}

/** Mittelpunkt zwischen 2 Hex-Farben (#rrggbb → #rrggbb). Liefert original wenn parsen fehlschlägt. */
function midpointHex(a: string, b: string): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const r = Math.round((pa.r + pb.r) / 2);
  const g = Math.round((pa.g + pb.g) / 2);
  const bl = Math.round((pa.b + pb.b) / 2);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
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

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, '0');
}

/**
 * ASS-style force-style strings für die 3 Presets.
 * ASS Color: &HAABBGGRR (alpha-blue-green-red).
 * Alignment: 1=BL, 2=BC, 3=BR, 5=ML, 8=TC.
 *
 * position überschreibt Alignment + MarginV des Style-Defaults:
 *   - top    → Alignment=8 (top-center),    MarginV=120
 *   - center → Alignment=5 (middle-center), MarginV=0
 *   - bottom → Alignment=2 (bottom-center), Style-Default-MarginV
 *   - custom → Alignment=8,                 MarginV=customY*1920 (0=oben, 1=unten)
 */
export function getSubtitleForceStyle(
  style: SubtitleStyle,
  position: SubtitlePosition = 'bottom',
  customY?: number,
  settings?: SubtitleSettings,
): string {
  let base: string[];
  let defaultMarginV = 80;
  switch (style) {
    case 'bold':
      defaultMarginV = 120;
      base = [
        'FontName=Arial Black',
        'Fontsize=18',
        'PrimaryColour=&H00FFFFFF',
        'OutlineColour=&H00000000',
        'BorderStyle=1',
        'Outline=4',
        'Shadow=2',
        'Bold=1',
      ];
      break;
    case 'gaming':
      defaultMarginV = 140;
      base = [
        'FontName=Impact',
        'Fontsize=22',
        'PrimaryColour=&H0000FFFF',          // gelb
        'OutlineColour=&H00000000',
        'BorderStyle=1',
        'Outline=5',
        'Shadow=3',
        'Bold=1',
      ];
      break;
    case 'fiano':
      // fiano Bold — moderne Sans, weiß mit roter Outline + Glow für Highlight-Look
      defaultMarginV = 130;
      base = [
        'FontName=Helvetica Neue',
        'Fontsize=24',
        'PrimaryColour=&H00FFFFFF',          // weiß
        'OutlineColour=&H003910FF',          // fiano-red als ASS &HBBGGRR (FF1039 → 3910FF)
        'BackColour=&H00000000',
        'BorderStyle=1',
        'Outline=3',
        'Shadow=4',
        'Bold=1',
      ];
      break;
    case 'layered':
      // Layered — Big Highlight-Word + Small Other-Words. Bei libass arbeiten wir mit
      // dem Highlight-Wort als Style-Baseline (große Bold-Schrift, fiano-red als Default)
      // und transformieren das SRT inline mit ASS-Override-Tags ({\fs120} für big,
      // {\fs60} für small) damit beide Größen nebeneinander rendern.
      defaultMarginV = 110;
      base = [
        'FontName=Arial Black',
        'Fontsize=28',                       // base-size (= small-words in layered)
        'PrimaryColour=&H00FFFFFF',          // weiß für small-words (other words)
        'OutlineColour=&H00000000',          // schwarze Outline
        'BackColour=&H00000000',
        'BorderStyle=1',
        'Outline=4',
        'Shadow=6',                          // stärkerer Shadow für Layered-Look
        'Bold=1',
      ];
      break;
    case 'default':
    default:
      defaultMarginV = 80;
      base = [
        'FontName=Arial',
        'Fontsize=14',
        'PrimaryColour=&H00FFFFFF',
        'OutlineColour=&H00000000',
        'BorderStyle=1',
        'Outline=2',
        'Shadow=1',
      ];
      break;
  }

  let alignment = 2;
  let marginV   = defaultMarginV;
  switch (position) {
    case 'top':    alignment = 8; marginV = 120; break;
    case 'center': alignment = 5; marginV = 0;   break;
    case 'custom':
      alignment = 8;
      marginV = Math.round(clampCustomY(customY) * TIKTOK_HEIGHT);
      break;
    case 'bottom':
    default:
      alignment = 2;
      marginV = defaultMarginV;
      break;
  }

  // ─── Settings-Overrides anwenden ────────────────────────────────
  // Wir parsen `base` zu einem Map und überschreiben mit den User-Werten.
  const map = new Map<string, string>();
  for (const kv of base) {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) map.set(k, v);
  }

  if (settings) {
    const fontName = fontFamilyAss(settings.fontFamily);
    if (fontName) map.set('FontName', fontName);
    if (typeof settings.fontSize === 'number') {
      // Frontend-Font-Size (14..48 für ~540px Canvas) → libass arbeitet bei
      // 1920px Höhe, daher Skalierungsfaktor ~3.5x für equivalente Größe
      // Frontend-Font-Size (14..48 für 540px Canvas-Width) → libass output 1080px = 2× scaling.
      // Vorher 3.5× war Mix-Up von 1920-Höhe vs 540-Breite → Output ~75% zu groß.
      map.set('Fontsize', String(Math.round(settings.fontSize * 2)));
    }
    if (settings.uppercase !== undefined) {
      // libass hat keine direkte Uppercase-Property; UTF-8 transform passiert beim SRT
    }
    if (settings.textColor) {
      const c = hexToAss(settings.textColor);
      if (c) map.set('PrimaryColour', c);
    }
    if (settings.strokeColor) {
      const c = hexToAss(settings.strokeColor);
      if (c) map.set('OutlineColour', c);
    }
    if (typeof settings.strokeWidth === 'number') {
      map.set('Outline', String(settings.strokeWidth));
    }
    // ─── Glow: Halo um den Text (NICHT Hintergrund-Box) ──────────────
    // libass kann nur EINEN Outline-Layer. Glow überschreibt also den User-Stroke
    // wenn aktiv: OutlineColour = glowColor, Outline = max(strokeWidth, glow-boost).
    // Per-Cue Inline-Tag {\blur N} wird in generateClipSrt ergänzt damit der Halo
    // weichgezeichnet ist (echtes Glow-Look statt nur dicker Outline).
    const glowOn = settings.glowEnabled ?? (
      (typeof settings.glowBlur === 'number' && settings.glowBlur > 0)
      || (typeof settings.glowStrength === 'number' && settings.glowStrength > 0 && !!settings.glowColor)
    );
    const glowActive = glowOn && (settings.glowBlur ?? 0) > 0;
    if (glowActive) {
      if (settings.glowColor) {
        const c = hexToAss(settings.glowColor);
        if (c) map.set('OutlineColour', c);
      }
      const baseOutline = parseFloat(map.get('Outline') ?? '4');
      const glowBlur = settings.glowBlur ?? 0;
      const glowBoost = Math.max(2, Math.round(glowBlur / 4));
      map.set('Outline', String(Math.max(baseOutline, glowBoost)));
      // Kein BackColour-set: glow ist NICHT mehr Hintergrund-Box
      // Kein Shadow-set durch Glow: Drop-Shadow-Block (unten) bekommt den Slot
    }
    // ─── Drop-Shadow: hat Vorrang vor Glow im libass-Export ─────────
    // libass kann nur EIN Schatten-/Glow-Layer per Style. Wenn explizit Shadow-Settings
    // gesetzt sind (Color oder Blur > 0 oder Offset != 0), überschreiben sie BackColour
    // und Shadow-Größe. Im Live-Preview gewinnt Drop-Shadow ebenfalls.
    const shadowOnLegacy = (typeof settings.shadowBlur === 'number' && settings.shadowBlur > 0)
      || (typeof settings.shadowOffsetX === 'number' && settings.shadowOffsetX !== 0)
      || (typeof settings.shadowOffsetY === 'number' && settings.shadowOffsetY !== 0);
    const hasShadow = (settings.shadowEnabled ?? shadowOnLegacy) && shadowOnLegacy;
    if (hasShadow) {
      if (settings.shadowColor) {
        const c = hexToAss(settings.shadowColor);
        if (c) map.set('BackColour', c);
      }
      // Shadow-Größe: max(blur/2, abs(offsetY)) damit der Shadow auch bei reinem Offset sichtbar ist
      const blurPx = settings.shadowBlur ?? 0;
      const offsetMag = Math.max(Math.abs(settings.shadowOffsetX ?? 0), Math.abs(settings.shadowOffsetY ?? 0));
      const shadowSize = Math.max(Math.round(blurPx / 2), Math.round(offsetMag));
      map.set('Shadow', String(Math.max(1, shadowSize)));
    }
  }

  // Alignment + MarginV immer setzen (überschreiben evtl. alte Defaults)
  map.set('Alignment', String(alignment));
  map.set('MarginV', String(marginV));

  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join(',');
}

// ════════════════════════════════════════════════════════════════════════════
//   DRAWTEXT-FALLBACK (für FFmpeg-Builds OHNE libass)
// ════════════════════════════════════════════════════════════════════════════

interface DrawtextCue {
  text: string;
  start: number;
  end: number;
}

/**
 * Liefert die Cues fürs Highlight als Drawtext-fähiges Array.
 * Timestamps relativ zum Clip-Anfang (0 = Clip-Start).
 */
export function getCuesInRange(transcript: Transcript, highlight: Highlight): DrawtextCue[] {
  const start = highlight.start;
  const end = highlight.end;
  const cues: DrawtextCue[] = [];
  for (const s of transcript.segments) {
    if (s.end <= start || s.start >= end) continue;
    const text = (s.text ?? '').trim();
    if (!text) continue;
    cues.push({
      text,
      start: Math.max(0, s.start - start),
      end: Math.min(end - start, s.end - start),
    });
  }
  return cues;
}

/**
 * Drawtext-Style-Parameter pro Preset.
 * position überschreibt y-Expression:
 *   - top    → y=80
 *   - center → y=(h-text_h)/2
 *   - bottom → Style-Default
 *   - custom → y=h*customY (0=oben, 1=unten)
 */
export function getDrawtextStyleParams(
  style: SubtitleStyle,
  position: SubtitlePosition = 'bottom',
  customY?: number,
  settings?: SubtitleSettings,
): Record<string, string> {
  // Mac-default font, fontconfig-resolved auch auf Linux/Win
  // Falls fontconfig fehlt: drawtext braucht fontfile= explizit
  const macFont = '/System/Library/Fonts/Supplemental/Arial.ttf';
  const macFontBold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
  const macFontImpact = '/System/Library/Fonts/Supplemental/Impact.ttf';

  let params: Record<string, string>;
  switch (style) {
    case 'bold':
      params = {
        fontfile: macFontBold,
        fontsize: '56', fontcolor: 'white',
        bordercolor: 'black', borderw: '4',
        x: '(w-text_w)/2', y: 'h-h/6',
      };
      break;
    case 'gaming':
      params = {
        fontfile: macFontImpact,
        fontsize: '64', fontcolor: 'yellow',
        bordercolor: 'black', borderw: '5',
        x: '(w-text_w)/2', y: 'h-h/5',
      };
      break;
    case 'fiano':
      params = {
        fontfile: macFontBold,
        fontsize: '72', fontcolor: 'white',
        bordercolor: '0xff1039@1.0', borderw: '6',
        x: '(w-text_w)/2', y: 'h-h/6',
      };
      break;
    case 'layered':
      // Layered ist primär libass-Style. drawtext-Fallback rendert ähnlich wie fiano
      // mit ohne Highlight-Layout (Approximation — drawtext kann keine 2 Sizes mischen).
      params = {
        fontfile: macFontBold,
        fontsize: '88', fontcolor: '0xff1039@1.0',
        bordercolor: 'black', borderw: '5',
        shadowcolor: 'black@0.7', shadowx: '4', shadowy: '6',
        x: '(w-text_w)/2', y: 'h-h/5',
      };
      break;
    case 'default':
    default:
      params = {
        fontfile: macFont,
        fontsize: '42', fontcolor: 'white',
        bordercolor: 'black', borderw: '2',
        x: '(w-text_w)/2', y: 'h-h/8',
      };
      break;
  }

  switch (position) {
    case 'top':    params.y = '80'; break;
    case 'center': params.y = '(h-text_h)/2'; break;
    case 'custom': params.y = `h*${clampCustomY(customY).toFixed(3)}`; break;
    case 'bottom':
    default:       /* keep style default */ break;
  }

  // ─── Settings-Overrides ─────────────────────────────────────────
  if (settings) {
    const ff = fontFamilyDrawtext(settings.fontFamily);
    if (ff) params.fontfile = ff;
    if (typeof settings.fontSize === 'number') {
      // Frontend size (14..48) → drawtext-Render bei 1920px ~3.5× Skalierung
      // Wie libass-Pfad: 2× statt 3.5× (Width-Ratio Live→Output, nicht Height)
      params.fontsize = String(Math.round(settings.fontSize * 2));
    }
    if (settings.textColor)   params.fontcolor = settings.textColor;
    if (settings.strokeColor) params.bordercolor = settings.strokeColor;
    if (typeof settings.strokeWidth === 'number') params.borderw = String(settings.strokeWidth);
    // Glow: dicker farbiger Outline statt Drop-Shadow (drawtext kann keinen echten Halo,
    // dies ist die nächste Approximation — Outline-Color wird zu Glow-Color).
    const glowOnDt = settings.glowEnabled ?? ((settings.glowBlur ?? 0) > 0);
    if (glowOnDt && (settings.glowBlur ?? 0) > 0) {
      if (settings.glowColor) params.bordercolor = settings.glowColor;
      const baseW = parseFloat(params.borderw ?? '2');
      const glowBoost = Math.max(2, (settings.glowBlur ?? 0) / 4);
      params.borderw = String(Math.max(baseW, glowBoost));
    }
    // Drop-Shadow nutzt shadowcolor/shadowx/shadowy (unabhängig von Glow)
    const shadowOnLegacyDt = (typeof settings.shadowBlur === 'number' && settings.shadowBlur > 0)
      || (typeof settings.shadowOffsetX === 'number' && settings.shadowOffsetX !== 0)
      || (typeof settings.shadowOffsetY === 'number' && settings.shadowOffsetY !== 0);
    const hasShadow = (settings.shadowEnabled ?? shadowOnLegacyDt) && shadowOnLegacyDt;
    if (hasShadow) {
      params.shadowcolor = (settings.shadowColor ?? '#000000') + '@0.8';
      params.shadowx = String(settings.shadowOffsetX ?? 2);
      params.shadowy = String(settings.shadowOffsetY ?? 2);
    }
  }
  return params;
}

/**
 * Escape für drawtext text-Parameter.
 * drawtext quoting: ' → \' , : → \: , \ → \\ , % → \% , { } → escapen, neue Zeile → unsupported (wir flatten)
 */
export function escapeDrawtextText(text: string): string {
  return text
    .replace(/\n/g, ' ')           // newlines flattenen
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}

/**
 * Baut einen drawtext-Filter-Chain-String — eine drawtext-Instanz pro Cue.
 * Beispiel: drawtext=text='Hello':enable='between(t,1,3)':...,drawtext=...
 */
export function buildDrawtextFilterChain(
  cues: DrawtextCue[],
  style: SubtitleStyle,
  position: SubtitlePosition = 'bottom',
  customY?: number,
  settings?: SubtitleSettings,
): string {
  if (cues.length === 0) return '';
  const params = getDrawtextStyleParams(style, position, customY, settings);
  const upper = settings?.uppercase ?? false;
  const transform = (t: string) => upper ? t.toUpperCase() : t;
  const styleStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(':');

  return cues.map((c) => {
    const txt = escapeDrawtextText(transform(c.text));
    return `drawtext=text='${txt}':enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})':${styleStr}`;
  }).join(',');
}

/**
 * Pfad für FFmpeg subtitles-Filter escapen.
 * Wir landen den String INNERHALB single-quotes ('…') in einem Filter-Arg.
 * FFmpeg-Filter-Parser braucht:
 *   \  →  \\
 *   '  →  \'   (im Quote-Kontext)
 *   :  →  \:   (Filter-Arg-Separator)
 *
 * Wichtig: keine 4-fach-Escape! Das war der Bug — FFmpeg konnte
 * Datei nicht öffnen weil zu viele Backslashes.
 */
export function escapeSubtitlePath(p: string): string {
  return p
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

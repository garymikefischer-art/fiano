/**
 * ASS-Subtitle-Builder (Phase 9.6.7h).
 *
 * Konvertiert SubtitleSettings + cues[] in einen Advanced-Substation-Alpha
 * (.ass) Text, den libass via FFmpeg's `ass`-Filter rendert.
 *
 * Warum nicht weiterhin drawtext?
 *   drawtext kann nur color + stroke + position. Glow, Drop-Shadow, Layered,
 *   per-Word-Highlights, Gradient sind nicht abbildbar (siehe Phase 9.6.7g-
 *   docs). ASS via libass kann all das (inkl. blur via \blur-extension).
 *
 * Plattform-neutral — Mobile baut den Text, Server schreibt ihn nach /tmp/X.ass
 * und gibt ffmpeg den Pfad via `ass=/tmp/X.ass`-Filter.
 *
 * ASS-Color-Codierung: &HAABBGGRR&  (Alpha, Blue, Green, Red — reversed BGR).
 * ASS-Zeit-Codierung:   H:MM:SS.cc   (cc = centisecond, 0..99).
 */

import type { SubtitleSettings, SubtitleHighlightWord } from './types';
import type { SubtitleCue } from './subtitles';
import {
  resolveSubtitleFontPx,
  LAYERED_SMALL_SCALE,
  LAYERED_SMALL_OFFSET,
} from './subtitleLayout';

export interface AssBuildOpts {
  settings: SubtitleSettings;
  cues: SubtitleCue[];
  /** Output-Frame-Größe (für PlayResX/Y + Margin-Berechnung). */
  width: number;
  height: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

/** Hex `#RRGGBB` → ASS `&HAABBGGRR&`. Alpha-Default 0 (vollopak). */
function assColor(hex: string | undefined, alpha = 0): string {
  if (!hex) return '&H00FFFFFF&';
  const cleaned = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!cleaned) return '&H00FFFFFF&';
  const rr = cleaned[1].slice(0, 2).toUpperCase();
  const gg = cleaned[1].slice(2, 4).toUpperCase();
  const bb = cleaned[1].slice(4, 6).toUpperCase();
  const aa = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0').toUpperCase();
  return `&H${aa}${bb}${gg}${rr}&`;
}

/** Sekunden → ASS-Zeit `H:MM:SS.cc`. NaN/Infinity → 0. */
function assTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const totalCs = Math.floor(safe * 100);
  const h = Math.floor(totalCs / 360000);
  const m = Math.floor((totalCs % 360000) / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return (
    `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` +
    `.${cs.toString().padStart(2, '0')}`
  );
}

/** Escape für ASS-Event-Text. Spezielle Zeichen: `\N` = newline, `{` `}` = override-tags. */
function escapeAss(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

/**
 * Mapping curated font-id → libass-rendering-Name.
 * Auf Cloud Run / Linux ist nur ein begrenzter Font-Pool installiert.
 * Wir verwenden generic Sans/Serif/Mono-Namen die libass via fontconfig
 * zu Liberation/DejaVu auflöst. User-eigene System-Fonts (z.B. android-
 * spezifische) werden 1:1 durchgereicht und fallen ggf. auf Default zurück.
 */
const CURATED_FONT_MAP: Record<string, string> = {
  helvetica: 'Liberation Sans',
  'arial-black': 'Liberation Sans',
  impact: 'Liberation Sans',
  geist: 'Liberation Sans',
  georgia: 'Liberation Serif',
  mono: 'Liberation Mono',
  system: 'Liberation Sans',
};

function resolveFontName(family: string | undefined): string {
  if (!family) return 'Liberation Sans';
  return CURATED_FONT_MAP[family] ?? family;
}

/** SubtitlePosition → ASS-Alignment. Phase Builder-8: wir nutzen IMMER
 *  middle-center (=5) damit pro-cue `\pos(cx, cy)` den TEXT-CENTER auf
 *  fixem y verankert. So bleibt eine 1-Zeile und 2-Zeilen-Cue auf gleicher
 *  Höhe (vorher Alignment=2/8 ⇒ bottom/top-edge fix ⇒ 2-Zeilen rückten
 *  nach oben hoch). */
function alignmentFor(_position: string | undefined): number {
  return 5;
}

/** Vertical-Center-Y für `\pos(cx, cy)`-Override pro cue. */
function centerYFor(
  position: string | undefined,
  height: number,
  customY?: number,
): number {
  if (position === 'top') return Math.round(height * 0.12);
  if (position === 'center') return Math.round(height * 0.5);
  if (position === 'custom' && typeof customY === 'number') {
    return Math.round(height * customY);
  }
  return Math.round(height * 0.88); // bottom default
}

/* ─── Style-Builder ────────────────────────────────────────────────── */

interface StyleParts {
  fontname: string;
  fontsize: number;
  primary: string;
  secondary: string;
  outline: string;
  back: string;
  bold: number;
  alignment: number;
  marginV: number;
  outlineWidth: number;
  shadow: number;
  spacing: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return [255, 255, 255];
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function blendHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function buildDefaultStyle(settings: SubtitleSettings, w: number, h: number): StyleParts {
  const baseFontSize = settings.fontSize ?? 26;
  // Phase R9-layered: fontSize-Skalierung über den geteilten Helfer — exakt
  // dieselbe Formel nutzt die Live-Preview (SubtitleOverlay), damit Preview
  // und Export proportional übereinstimmen.
  const fontsize = resolveSubtitleFontPx(baseFontSize, h);

  // Primary-Color-Resolve (Phase Builder-5):
  // - useGradient: gradientFrom als single-color (libass kann keine Gradient-Fill)
  // - metallic: blend zwischen gradientFrom+gradientTo. Wenn keine Gradient-
  //   Farben gesetzt sind aber Metallic an, nutzen wir Silber-Fallback
  //   (#b8b8b8 → #ffffff) statt textColor — sonst war primaryColor immer
  //   weiß wenn User nur metallic-toggle ohne gradient-pick aktivierte.
  let primaryColor: string;
  if (settings.metallic) {
    const a = settings.gradientFrom ?? '#b8b8b8';
    const b = settings.gradientTo ?? '#ffffff';
    // Gewichtung 0.4 → leicht zur dunkleren Seite (Sheen hat dunkleren Mittelteil).
    primaryColor = blendHex(a, b, 0.4);
  } else if (settings.useGradient) {
    primaryColor = settings.gradientFrom ?? settings.textColor ?? '#ffffff';
  } else {
    primaryColor = settings.textColor ?? '#ffffff';
  }

  // Outline: stroke wenn enabled, glow wenn enabled (mit blur), beide werden im
  // Event-override kombiniert. Hier im Style nur Default-Outline für non-overridden cues.
  const strokeEnabled = settings.strokeEnabled === true;
  const outlineWidth = strokeEnabled ? settings.strokeWidth ?? 3 : 0;
  const outlineColor = settings.strokeColor ?? '#000000';

  const shadowEnabled = settings.shadowEnabled === true;
  const shadowMax = shadowEnabled
    ? Math.max(Math.abs(settings.shadowOffsetX ?? 0), Math.abs(settings.shadowOffsetY ?? 0))
    : 0;
  const shadowColor = settings.shadowColor ?? '#000000';

  return {
    fontname: resolveFontName(settings.fontFamily),
    fontsize,
    primary: assColor(primaryColor),
    secondary: assColor('#000000'),
    outline: assColor(outlineColor),
    back: assColor(shadowColor),
    bold: 1, // Phase R10 (Bug-5): immer fett — die Live-Preview rendert durchgängig fett, der Export muss gleichziehen.
    alignment: alignmentFor(settings.position),
    // Phase Builder-8: MarginV=0 — Position kommt via per-cue \pos-override.
    // Damit ist 1-Zeile / 2-Zeilen-Text immer auf gleicher vertikaler Mitte.
    marginV: 0,
    outlineWidth,
    shadow: shadowMax,
    spacing: Math.round((settings.letterSpacing ?? 0) * 10),
  };
}

/* ─── Event-Override-Builder ──────────────────────────────────────── */

/**
 * Pro-cue Override-Tags die im Event-Text als Prefix `{...}` eingebaut werden.
 * Hier landen Effekte die im Style nicht abbildbar sind (Glow via \blur,
 * separate XY-Shadow, Per-Cue-Highlight-Color für Layered).
 */
function buildCueOverrides(settings: SubtitleSettings, includeGlow = true): string {
  const tags: string[] = [];

  // Glow: simulieren via blur auf der outline. Wir setzen \bord >0 (Glow-Color
  // bekommt eigene outline-color) + \blur. Bei aktivem Stroke addieren wir die
  // glow-Stärke auf den outline-Width drauf.
  // Phase R9: includeGlow=false → für das layered big-word, das seinen eigenen
  // highlight-glow hat (sonst doppelter Glow im Export).
  if (includeGlow && settings.glowEnabled === true) {
    const glowBlur = Math.max(0, settings.glowBlur ?? 8);
    const glowStrength = Math.max(0, Math.min(1, settings.glowStrength ?? 0.7));
    const baseStroke = settings.strokeEnabled === true ? settings.strokeWidth ?? 3 : 0;
    const glowWidth = Math.max(1, Math.round(baseStroke + glowStrength * 4));
    const glowColor = settings.glowColor ?? '#ff1039';
    tags.push(`\\bord${glowWidth}`);
    tags.push(`\\3c${assColor(glowColor)}`);
    tags.push(`\\blur${glowBlur}`);
  }

  // Drop-Shadow: separate X/Y offsets (libass extension \xshad \yshad).
  if (settings.shadowEnabled === true) {
    const sx = Math.round(settings.shadowOffsetX ?? 0);
    const sy = Math.round(settings.shadowOffsetY ?? 0);
    if (sx !== 0) tags.push(`\\xshad${sx}`);
    if (sy !== 0) tags.push(`\\yshad${sy}`);
    if (settings.shadowBlur && settings.shadowBlur > 0) {
      // shadow + blur = blur tag affects both outline and shadow. Approximation.
      tags.push(`\\blur${Math.round(settings.shadowBlur)}`);
    }
    tags.push(`\\4c${assColor(settings.shadowColor ?? '#000000')}`);
  }

  // Smooth in/out fade (60ms each).
  tags.push('\\fad(60,60)');

  return tags.length > 0 ? `{${tags.join('')}}` : '';
}

/* ─── Layered-Style: per-word splitting ────────────────────────────── */

/** Sucht ein Wort case-insensitive in `highlightWords`. */
function isHighlightWord(word: string, hwords: SubtitleHighlightWord[] | undefined): boolean {
  if (!hwords || hwords.length === 0) return false;
  const lower = word.toLowerCase().replace(/[.,!?;:]/g, '');
  return hwords.some((h) => h.big && h.text.toLowerCase() === lower);
}

/**
 * Layered-Style: big-words + small-words als ZWEI ÜBERLAPPENDE Dialogue-Events.
 * Big-word hinten (Layer 0), small-words vorne (Layer 1) — der small-Text
 * überlappt die untere Hälfte des big-words ("layered" = überlappende Ebenen).
 *
 * Geometrie — geteilt mit der Live-Preview via ./subtitleLayout:
 *   bigFs   = styleFontSize × highlightFontScale       (default 1.8×)
 *   smallFs = styleFontSize × LAYERED_SMALL_SCALE
 *   yBig    = cy − smallFs/4                           (big leicht über Center)
 *   ySmall  = yBig + bigFs × LAYERED_SMALL_OFFSET      (small im big-word drin)
 *
 * Phase R9-bugfix2 (2026-05-20): Vorher \N-2-Zeilen-Layout — falsch. "Layered"
 * heißt überlappende Ebenen (roter big hinten, weißer small vorne), nicht zwei
 * getrennte Zeilen. Ein Single-Event kann nicht überlappen → zwei \pos-Events
 * mit verschiedenem Layer.
 *
 * Phase C7 (2026-05-19): Big-Word-Zoom via libass \t() — 80%→110% "pop".
 */
function buildLayeredEvents(
  cueText: string,
  settings: SubtitleSettings,
  styleFontSize: number,
  cx: number,
  cy: number,
  cueOverridesInline: string,
): { layer: number; text: string }[] {
  const words = cueText.split(/\s+/).filter(Boolean);
  const normalColor = assColor(settings.textColor ?? '#ffffff');
  const highlightColor = settings.highlightUseGradient
    ? assColor(settings.highlightGradientFrom ?? settings.highlightColor ?? '#ff1039')
    : assColor(settings.highlightColor ?? '#ff1039');
  const bigScale = settings.highlightFontScale ?? 1.8;
  const bigFs = Math.round(styleFontSize * bigScale);
  const smallFs = Math.round(styleFontSize * LAYERED_SMALL_SCALE);

  // Words in big/small splitten — Reihenfolge in jeder Gruppe erhalten.
  const bigWords: string[] = [];
  const smallWords: string[] = [];
  for (const w of words) {
    if (isHighlightWord(w, settings.highlightWords)) {
      bigWords.push(w);
    } else {
      smallWords.push(w);
    }
  }

  // Kein big-word → einfaches Single-Event ohne layered Effekt.
  if (bigWords.length === 0) {
    return [
      { layer: 0, text: `{\\pos(${cx},${cy})${cueOverridesInline}}${escapeAss(cueText)}` },
    ];
  }

  // Geometrie: big leicht über center, small steht tief im big-word drin.
  const yBig = Math.round(cy - smallFs / 4);
  const ySmall = Math.round(yBig + bigFs * LAYERED_SMALL_OFFSET);

  // Big-Event (Layer 0 — hinten). highlight-Style + Zoom-Animation.
  // Phase R9: wenn das big-word seinen eigenen highlight-glow hat, NICHT
  // zusätzlich den cue-glow draufpacken — sonst doppelter Glow (Export sah
  // viel glowiger aus als die Preview).
  const bigOverrides =
    settings.highlightGlow === true
      ? buildCueOverrides(settings, false).replace(/^\{|\}$/g, '')
      : cueOverridesInline;
  let bigTags =
    `{\\pos(${cx},${yBig})${bigOverrides}` +
    `\\fs${bigFs}\\b1\\1c${highlightColor}\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)`;
  if ((settings.highlightDropShadow ?? 0) > 0) {
    bigTags += `\\yshad${Math.round(settings.highlightDropShadow!)}`;
  }
  if (settings.highlightGlow === true) {
    const hgStrength = settings.highlightGlowStrength ?? 0.7;
    const hgColor = assColor(settings.highlightGlowColor ?? settings.highlightColor ?? '#ff1039');
    // \blur proportional zur Glow-Stärke statt hart \blur6.
    bigTags += `\\bord${Math.round(2 + hgStrength * 3)}\\3c${hgColor}\\blur${Math.round(2 + hgStrength * 4)}`;
  }
  bigTags += '}';
  const bigEvent = { layer: 0, text: `${bigTags}${escapeAss(bigWords.join(' '))}` };

  // Nur big-words → nur das big-Event.
  if (smallWords.length === 0) {
    return [bigEvent];
  }

  // Small-Event (Layer 1 — vorne, überlappt big). normal-Style.
  const smallTags = `{\\pos(${cx},${ySmall})${cueOverridesInline}\\fs${smallFs}\\b1\\1c${normalColor}}`;
  const smallEvent = { layer: 1, text: `${smallTags}${escapeAss(smallWords.join(' '))}` };

  return [bigEvent, smallEvent];
}

/* ─── Main Builder ─────────────────────────────────────────────────── */

export function buildAssSubtitle(opts: AssBuildOpts): string {
  const { settings, cues, width, height } = opts;
  const style = buildDefaultStyle(settings, width, height);
  const overrides = buildCueOverrides(settings);
  const isLayered = settings.style === 'layered';
  // Phase Builder-8: per-cue \pos(cx,cy)-Anker. text-center bleibt fix bei
  // 1-Zeile / 2-Zeilen (alignment=5 = middle-center, kein margin-shift).
  const cx = Math.round(width / 2);
  const cy = centerYFor(settings.position, height, settings.customY);
  const posTag = `\\pos(${cx},${cy})`;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'ScaledBorderAndShadow: yes',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.fontname},${style.fontsize},${style.primary},${style.secondary},${style.outline},${style.back},${style.bold},0,0,0,100,100,${style.spacing},0,1,${style.outlineWidth},${style.shadow},${style.alignment},20,20,${style.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const events: string[] = [];
  const overridesInline = overrides.replace(/^\{|\}$/g, '');
  for (const cue of cues) {
    const rawText = settings.uppercase ? cue.text.toUpperCase() : cue.text;
    if (isLayered) {
      // Layered = zwei überlappende Events (big hinten Layer 0, small vorne
      // Layer 1) — jedes Event bringt seinen eigenen \pos mit.
      for (const ev of buildLayeredEvents(
        rawText,
        settings,
        style.fontsize,
        cx,
        cy,
        overridesInline,
      )) {
        events.push(
          `Dialogue: ${ev.layer},${assTime(cue.startSec)},${assTime(cue.endSec)},Default,,0,0,0,,${ev.text}`,
        );
      }
    } else {
      // Override-Prefix: position-tag IMMER FIRST (ASS-spec: \pos muss erstes
      // im Override-Block sein, sonst visual flicker).
      const prefix = `{${posTag}${overridesInline}}`;
      events.push(
        `Dialogue: 0,${assTime(cue.startSec)},${assTime(cue.endSec)},Default,,0,0,0,,${prefix}${escapeAss(rawText)}`,
      );
    }
  }

  return [...header, ...events, ''].join('\n');
}

/** Compatibility wrapper für Pure-Tests + späteres Worker-Side-Rendering. */
export function defaultAssFontMap(): Record<string, string> {
  return { ...CURATED_FONT_MAP };
}

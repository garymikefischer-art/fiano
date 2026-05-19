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

/** Style-Preset → Default-Bold-Flag. */
function isBoldStyle(style: string | undefined): number {
  return style === 'bold' || style === 'gaming' || style === 'fiano' ? 1 : 0;
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
  // SubtitleSettings.fontSize sind UI-Tokens (14..48) — auf Output-Resolution
  // skalieren. 26 → ~5% der Frame-Höhe ist tiktok-typisch.
  const fontsize = Math.round((baseFontSize / 26) * (h * 0.06));

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
    bold: isBoldStyle(settings.style),
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
function buildCueOverrides(settings: SubtitleSettings): string {
  const tags: string[] = [];

  // Glow: simulieren via blur auf der outline. Wir setzen \bord >0 (Glow-Color
  // bekommt eigene outline-color) + \blur. Bei aktivem Stroke addieren wir die
  // glow-Stärke auf den outline-Width drauf.
  if (settings.glowEnabled === true) {
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
 * Layered-Style baut einen Event-Text wo highlight-words inline mit größerer
 * fs + highlight-color formattiert werden. Beispiel:
 *   "I am BIG" mit highlightWords=[{text:'big',big:true}]
 *   → "I am {\fs60\1c<highlight>}BIG{\fs26\1c<normal>}"
 */
function buildLayeredText(
  cueText: string,
  settings: SubtitleSettings,
  styleFontSize: number,
): string {
  const words = cueText.split(/(\s+)/); // keep whitespace between words
  const normalColor = assColor(settings.textColor ?? '#ffffff');
  const highlightColor = settings.highlightUseGradient
    ? assColor(settings.highlightGradientFrom ?? settings.highlightColor ?? '#ff1039')
    : assColor(settings.highlightColor ?? '#ff1039');
  const bigScale = settings.highlightFontScale ?? 1.4;
  const bigFs = Math.round(styleFontSize * bigScale);

  let inHighlight = false;
  let out = '';
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      out += escapeAss(w);
      continue;
    }
    const isBig = isHighlightWord(w, settings.highlightWords);
    if (isBig && !inHighlight) {
      // Phase C7 (2026-05-19): Big-Word-Zoom-Animation via libass \t() tag.
      // Word startet bei 80% scale + animiert über 120ms zu 110% scale —
      // erzeugt einen "pop"-Effekt auf jedes Highlight-Wort. Bias zur
      // current frame: zoom-in ist schneller als zoom-out (kein zoom-out,
      // bleibt auf 110% bis Wort-Ende = nächstes non-highlight token).
      // Desktop hatte das via libass \t() — Mobile war vorher static.
      out += `{\\fs${bigFs}\\1c${highlightColor}\\fscx80\\fscy80\\t(0,120,\\fscx110\\fscy110)`;
      // optional extra drop-shadow on highlight word
      if ((settings.highlightDropShadow ?? 0) > 0) {
        out += `\\yshad${Math.round(settings.highlightDropShadow!)}`;
      }
      if (settings.highlightGlow === true) {
        const hgStrength = settings.highlightGlowStrength ?? 0.7;
        const hgColor = assColor(settings.highlightGlowColor ?? settings.highlightColor ?? '#ff1039');
        out += `\\bord${Math.round(2 + hgStrength * 3)}\\3c${hgColor}\\blur6`;
      }
      out += '}';
      inHighlight = true;
    } else if (!isBig && inHighlight) {
      // Phase C7: reset scale + style nach big-word.
      out += `{\\fs${styleFontSize}\\1c${normalColor}\\xshad0\\yshad0\\fscx100\\fscy100}`;
      inHighlight = false;
    }
    out += escapeAss(w);
  }
  return out;
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
  for (const cue of cues) {
    const rawText = settings.uppercase ? cue.text.toUpperCase() : cue.text;
    const body = isLayered
      ? buildLayeredText(rawText, settings, style.fontsize)
      : escapeAss(rawText);
    // Override-Prefix: position-tag IMMER FIRST damit es nicht von \1c/\bord
    // overrides "leaked" wird (ASS-spec: pos kann nur als erstes funktionieren
    // in der Override-Block — andere Tags davor mischen kann visual flicker).
    const prefix = `{${posTag}${overrides.replace(/^\{|\}$/g, '')}}`;
    events.push(
      `Dialogue: 0,${assTime(cue.startSec)},${assTime(cue.endSec)},Default,,0,0,0,,${prefix}${body}`,
    );
  }

  return [...header, ...events, ''].join('\n');
}

/** Compatibility wrapper für Pure-Tests + späteres Worker-Side-Rendering. */
export function defaultAssFontMap(): Record<string, string> {
  return { ...CURATED_FONT_MAP };
}

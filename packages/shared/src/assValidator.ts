/**
 * ASS (Advanced SubStation Alpha) Content Validator (Phase A6.2 — 2026-05-18).
 *
 * Sicherheits-Validator für .ass-Subtitle-Inhalte vor dem Reichen an libass.
 * Adressiert SECURITY_AUDIT_2026-05-16 P0-4:
 *
 *   "libass `Dialogue:`-Zeilen können Fonts via `\\fnFontName` referenzieren,
 *    `\\p` Drawing-Primitive, embedded Font-Lookups → libass+fontconfig hits
 *    Host-Filesystem. Mit `\\bord1000 \\blur1000` Style-Attacks → CPU-
 *    Exhaustion. Kombiniert mit P0-3: full container env read."
 *
 * Plattform-neutral — wird auf Mobile (vor /v1/upload-url), Worker (nach
 * R2-Download) und Desktop (vor lokalem FFmpeg-call) eingesetzt. Selber
 * Code-Pfad damit Konsistenz garantiert ist.
 *
 * Defense-Strategy:
 *   1. SIZE-LIMIT: > 64 KB → hard-reject (DoS-Prevention)
 *   2. SECTION-CHECK: [Fonts] / [Graphics] → hard-reject (embedded data)
 *   3. DRAWING-MODE: `\\p1+` → hard-reject (vector-primitives, CPU-DoS)
 *   4. PATH-TRAVERSAL: `\\fn` / Style-fontnames mit `/`, `..`, `\\` →
 *      hard-reject (fontconfig könnte beliebige Files öffnen)
 *   5. CONTROL-CHARS: Null-bytes → hard-reject
 *   6. SOFT-SANITIZE: `\\bord`/`\\blur`/`\\fs`/`\\xbord`/`\\ybord`/`\\xshad`/
 *      `\\yshad`/`\\fscx`/`\\fscy` → cap auf safe-Werte (legitime values
 *      bleiben unverändert, Attack-Values werden truncated).
 *
 * Returns:
 *   - ok=true + sanitized = saubere ASS-Datei (immer verwenden statt input)
 *   - ok=false + reason   = hart abgelehnt, NICHT verwenden
 */

export const MAX_ASS_SIZE_BYTES = 64 * 1024;
export const MAX_BORDER = 20;
export const MAX_BLUR = 20;
export const MAX_FONT_SIZE = 200;
export const MAX_SHADOW = 20;
export const MAX_FONT_SCALE = 400;

export interface AssValidationResult {
  ok: boolean;
  /** Bei ok=false: kurze Begründung (loggable, kein internal-data leak). */
  reason?: string;
  /** Bei ok=true: gereinigte ASS-Datei (override-values capped). Verwende
   *  IMMER diesen Wert für die FFmpeg-Pipeline statt des Original-Inputs. */
  sanitized: string;
}

/**
 * Validiert + sanitizes einen ASS-Subtitle-Text.
 *
 * @param input - Roher .ass-Inhalt (z.B. von assBuilder.ts oder von R2)
 * @returns AssValidationResult
 */
export function validateAssContent(input: string): AssValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'ASS content not a string', sanitized: '' };
  }

  // 1. Size-limit. UTF-8 byte length kann größer als char-count sein bei
  //    Unicode-Texten. Wir messen die echte byte-Größe.
  let byteLength: number;
  try {
    byteLength = new TextEncoder().encode(input).length;
  } catch {
    // TextEncoder ist seit ES2017 stable; falls trotzdem fehlt: estimate.
    byteLength = input.length * 2;
  }
  if (byteLength > MAX_ASS_SIZE_BYTES) {
    return {
      ok: false,
      reason: `ASS too large: ${byteLength} bytes (max ${MAX_ASS_SIZE_BYTES})`,
      sanitized: '',
    };
  }

  // 2. Embedded sections. [Fonts] / [Graphics] erlaubt Inline-Base64-Font-
  //    bzw. Image-Daten. Wir wollen das nicht durch libass+fontconfig leiten.
  if (/^\s*\[Fonts\]\s*$/im.test(input)) {
    return {
      ok: false,
      reason: 'ASS contains [Fonts] section (embedded fonts not allowed)',
      sanitized: '',
    };
  }
  if (/^\s*\[Graphics\]\s*$/im.test(input)) {
    return {
      ok: false,
      reason: 'ASS contains [Graphics] section (embedded images not allowed)',
      sanitized: '',
    };
  }

  // 3. Drawing-Mode `\p<n>` mit n≥1. Reine Text-Subs (was assBuilder produziert)
  //    nutzen das NIE — vector-primitive-mode ist nur für Attacks interessant.
  //    `\p0` als closing tag wäre fine, aber öffnender Tag ist suspekt.
  if (/\\p[1-9]/.test(input)) {
    return {
      ok: false,
      reason: 'ASS uses drawing mode (\\p1+, not allowed)',
      sanitized: '',
    };
  }

  // 4. Control-Chars. Null-Bytes können libass/fontconfig confusen.
  if (/\x00/.test(input)) {
    return { ok: false, reason: 'ASS contains null byte', sanitized: '' };
  }

  // 5. Style-Line Fontname-Validation. Format: `Style: Name, Fontname, ...`
  //    Fontname mit /, .. oder \ ist path-traversal-Versuch → reject.
  const styleLines = input.match(/^Style:\s*[^\n]+/gim) ?? [];
  for (const line of styleLines) {
    const body = line.replace(/^Style:\s*/, '');
    const parts = body.split(',');
    if (parts.length >= 2) {
      const fontname = parts[1].trim();
      if (
        fontname.includes('/') ||
        fontname.includes('..') ||
        fontname.includes('\\') ||
        fontname.startsWith('-')
      ) {
        return {
          ok: false,
          reason: `ASS Style fontname rejected: ${fontname.slice(0, 40)}`,
          sanitized: '',
        };
      }
    }
  }

  // 6. Inline `\fn` Override Fontname-Validation. Match alles bis zum
  //    nächsten `\` oder `}` als fontname.
  const fnPattern = /\\fn([^\\}]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = fnPattern.exec(input)) !== null) {
    const fontname = m[1].trim();
    if (
      fontname.includes('/') ||
      fontname.includes('..') ||
      fontname.includes('\\') ||
      fontname.startsWith('-')
    ) {
      return {
        ok: false,
        reason: `ASS \\fn override rejected: ${fontname.slice(0, 40)}`,
        sanitized: '',
      };
    }
  }

  // 7. Soft-Sanitize: cap override-tag-values. legitime values (z.B. \bord4)
  //    bleiben unverändert, Attack-values (z.B. \bord1000) werden truncated.
  let sanitized = input;
  const capPositive = (max: number) => (_full: string, n: string) => {
    const v = Number(n);
    if (!isFinite(v) || v < 0) return _full; // weird value, leave alone (FFmpeg may reject)
    return _full.replace(n, String(Math.min(max, v)));
  };
  const capSigned = (max: number) => (_full: string, n: string) => {
    const v = Number(n);
    if (!isFinite(v)) return _full;
    const clamped = Math.max(-max, Math.min(max, v));
    return _full.replace(n, String(clamped));
  };

  sanitized = sanitized.replace(/\\bord(\d+(?:\.\d+)?)/gi, capPositive(MAX_BORDER));
  sanitized = sanitized.replace(/\\blur(\d+(?:\.\d+)?)/gi, capPositive(MAX_BLUR));
  sanitized = sanitized.replace(/\\fs(\d+(?:\.\d+)?)/gi, capPositive(MAX_FONT_SIZE));
  sanitized = sanitized.replace(/\\xbord(\d+(?:\.\d+)?)/gi, capPositive(MAX_BORDER));
  sanitized = sanitized.replace(/\\ybord(\d+(?:\.\d+)?)/gi, capPositive(MAX_BORDER));
  sanitized = sanitized.replace(/\\xshad(-?\d+(?:\.\d+)?)/gi, capSigned(MAX_SHADOW));
  sanitized = sanitized.replace(/\\yshad(-?\d+(?:\.\d+)?)/gi, capSigned(MAX_SHADOW));
  sanitized = sanitized.replace(/\\fscx(\d+(?:\.\d+)?)/gi, capPositive(MAX_FONT_SCALE));
  sanitized = sanitized.replace(/\\fscy(\d+(?:\.\d+)?)/gi, capPositive(MAX_FONT_SCALE));

  return { ok: true, sanitized };
}

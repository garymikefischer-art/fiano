/**
 * ASS (Advanced SubStation Alpha) Content Validator (Phase A6.2 — 2026-05-18).
 *
 * Sicherheits-Validator für .ass-Subtitle-Inhalte vor dem Reichen an libass.
 * Adressiert SECURITY_AUDIT_2026-05-16 P0-4.
 *
 * !!! WORKER-KOPIE !!! Identisch mit `packages/shared/src/assValidator.ts`.
 * Worker hat keine @fiano/shared dependency (standalone Docker deploy auf
 * Cloud Run). Bei Updates BEIDE Files syncen.
 *
 * Defense-Strategy:
 *   1. SIZE-LIMIT: > 64 KB → hard-reject
 *   2. SECTION-CHECK: [Fonts] / [Graphics] → hard-reject
 *   3. DRAWING-MODE: `\p1+` → hard-reject
 *   4. PATH-TRAVERSAL: `\fn` / Style-fontnames mit `/`, `..`, `\` → hard-reject
 *   5. CONTROL-CHARS: Null-bytes → hard-reject
 *   6. SOFT-SANITIZE: `\bord`/`\blur`/`\fs`/`\xbord`/`\ybord`/`\xshad`/
 *      `\yshad`/`\fscx`/`\fscy` → cap auf safe-Werte
 */

export const MAX_ASS_SIZE_BYTES = 64 * 1024;
export const MAX_BORDER = 20;
export const MAX_BLUR = 20;
export const MAX_FONT_SIZE = 200;
export const MAX_SHADOW = 20;
export const MAX_FONT_SCALE = 400;

export interface AssValidationResult {
  ok: boolean;
  reason?: string;
  sanitized: string;
}

export function validateAssContent(input: string): AssValidationResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'ASS content not a string', sanitized: '' };
  }

  let byteLength: number;
  try {
    byteLength = new TextEncoder().encode(input).length;
  } catch {
    byteLength = input.length * 2;
  }
  if (byteLength > MAX_ASS_SIZE_BYTES) {
    return {
      ok: false,
      reason: `ASS too large: ${byteLength} bytes (max ${MAX_ASS_SIZE_BYTES})`,
      sanitized: '',
    };
  }

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

  if (/\\p[1-9]/.test(input)) {
    return {
      ok: false,
      reason: 'ASS uses drawing mode (\\p1+, not allowed)',
      sanitized: '',
    };
  }

  if (/\x00/.test(input)) {
    return { ok: false, reason: 'ASS contains null byte', sanitized: '' };
  }

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

  let sanitized = input;
  const capPositive = (max: number) => (full: string, n: string) => {
    const v = Number(n);
    if (!isFinite(v) || v < 0) return full;
    return full.replace(n, String(Math.min(max, v)));
  };
  const capSigned = (max: number) => (full: string, n: string) => {
    const v = Number(n);
    if (!isFinite(v)) return full;
    const clamped = Math.max(-max, Math.min(max, v));
    return full.replace(n, String(clamped));
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

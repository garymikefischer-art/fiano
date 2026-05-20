/**
 * Subtitle-Geometrie — geteilt zwischen Live-Preview (React-Native,
 * SubtitleOverlay) und Export (libass, assBuilder).
 *
 * Phase R9-layered (2026-05-20): Vorher hatte jede Render-Engine ihre eigene
 * Skalierung + ihr eigenes Layered-Layout → Preview und exportiertes Video
 * liefen auseinander. Diese Konstanten/Helfer werden jetzt von BEIDEN Seiten
 * importiert, damit Preview ≈ Export.
 */

/**
 * fontSize in Pixeln, relativ zur Frame-Höhe.
 *
 * `uiFontSize` ist der UI-Token aus `SubtitleSettings.fontSize` (~26 = "normal",
 * Range ~14..48). Bei 26 ergibt das ~6 % der Frame-Höhe — TikTok-typisch.
 *
 * - Export: `frameHeight` = Output-Höhe (z.B. 1920).
 * - Preview: `frameHeight` = gemessene Container-Höhe des 9:16-Frames.
 *
 * Dadurch skalieren Modal-Preview, 9:16-Preview und Export identisch.
 */
export function resolveSubtitleFontPx(uiFontSize: number, frameHeight: number): number {
  return Math.round((uiFontSize / 26) * (frameHeight * 0.06));
}

/** Layered-Style: small-word fontSize = style-fontSize × diesem Faktor. */
export const LAYERED_SMALL_SCALE = 0.7;

/**
 * Layered-Style: vertikaler Versatz der small-word-Mitte UNTER die big-word-
 * Mitte, als Faktor der big-word-fontSize. Kleiner = small steht tiefer im
 * big-word drin (mehr Überlappung).
 *
 * 0.32 = small überlappt big's untere Hälfte, big-word bleibt oben lesbar.
 */
export const LAYERED_SMALL_OFFSET = 0.32;

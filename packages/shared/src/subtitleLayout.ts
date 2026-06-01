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

/**
 * Phase E4 (2026-05-26): Effekt-Skalierungs-Faktor für Stroke/Shadow/Glow im
 * Worker-Render. Bringt Worker-Render proportional auf das Preview-Pixel-Bild,
 * sodass beim Resize des Export-Videos auf Phone-Display die Effekte exakt so
 * dick/intensiv aussehen wie in der Modal- + 9:16-Live-Preview.
 *
 * `EFFECT_SCALE_REFERENCE_PX = 720` = approximate Höhe des 9:16-Preview-Frames
 * auf Standard-Phone (75 % von ~1080 Display-Höhe). Bei canvasH=1920 (TikTok-
 * Export) ergibt das effectScale=2.67 — proportional zur (canvasH/720)-
 * Schriftvergrößerung via `resolveSubtitleFontPx`.
 *
 * VORHER (Bug): Worker nutzte `baseScale = canvasW / 540` für Effekte, aber
 * `resolveSubtitleFontPx` skaliert über canvasH × 0.06 → Effekte „hinkten" der
 * Schrift hinterher → User sah Stroke dünner + Glow schwächer im Export.
 */
export const EFFECT_SCALE_REFERENCE_PX = 720;

export function resolveSubtitleEffectScale(frameHeight: number): number {
  return frameHeight / EFFECT_SCALE_REFERENCE_PX;
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

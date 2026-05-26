/**
 * Untertitel-Schriftarten (Phase D-Fonts, 2026-05-20; Multi-Weight 2026-05-26).
 *
 * 20 gebündelte Google Fonts (OFL/Apache — frei bündelbar, auch kommerziell).
 * Die `.ttf`-Dateien liegen in `packages/mobile/assets/fonts/` UND — als Kopie —
 * in `services/render-worker/assets/fonts/`, damit Preview (Mobile) und Export
 * (Worker-Canvas) DIESELBE Schrift rendern.
 *
 * `id` = der fontFamily-String der base-Variante (= Dateiname ohne `.ttf`),
 * z.B. 'Inter'. Für Multi-Weight kombiniert `resolveWeightedFamily` den Suffix
 * (z.B. 'InterBlack' → InterBlack.ttf). RN-Android sucht direkt nach dem
 * exakten Dateinamen im `assets/fonts/`-Ordner — KEINE _bold-Convention mehr.
 *
 * ⚠️ Bei Änderung dieser Liste: `services/render-worker/src/subtitleCanvas.ts`
 * (SUBTITLE_FONT_FILES + defaultWorkerFont) mitziehen — sonst Export ≠ Preview.
 */

import type { SubtitleFontWeight } from '../data/demoProjects';

export interface SubtitleFontDef {
  id: string;
  label: string;
  /** Phase D-Weight (2026-05-26): true wenn die Font echte Weight-Varianten hat
   *  (Sans-Serifs). Display-Fonts (Bangers, Anton, …) sind single-weight und
   *  ignorieren den Weight-Picker visuell. UI grayed die Weight-Pills aus
   *  wenn false. */
  hasWeights?: boolean;
}

/** Die 20 caption/gaming-tauglichen Untertitel-Schriften. */
export const SUBTITLE_FONTS: SubtitleFontDef[] = [
  // Sans-Serifs mit echten Weight-Varianten (Light/Medium/Bold/Black).
  { id: 'Montserrat', label: 'Montserrat', hasWeights: true },
  { id: 'Poppins', label: 'Poppins', hasWeights: true },
  { id: 'Inter', label: 'Inter', hasWeights: true },
  { id: 'Outfit', label: 'Outfit', hasWeights: true },
  { id: 'Sora', label: 'Sora', hasWeights: true },
  { id: 'Oswald', label: 'Oswald', hasWeights: true },
  { id: 'Teko', label: 'Teko', hasWeights: true },
  { id: 'BarlowCondensed', label: 'Barlow Condensed', hasWeights: true },
  { id: 'ChakraPetch', label: 'Chakra Petch', hasWeights: true },
  { id: 'Orbitron', label: 'Orbitron', hasWeights: true },
  // Display-Fonts — single-weight, Weight-Picker ohne visuellen Effekt.
  { id: 'BebasNeue', label: 'Bebas Neue' },
  { id: 'Anton', label: 'Anton' },
  { id: 'FjallaOne', label: 'Fjalla One' },
  { id: 'ArchivoBlack', label: 'Archivo Black' },
  { id: 'Bungee', label: 'Bungee' },
  { id: 'TitanOne', label: 'Titan One' },
  { id: 'LuckiestGuy', label: 'Luckiest Guy' },
  { id: 'Bangers', label: 'Bangers' },
  { id: 'RussoOne', label: 'Russo One' },
  { id: 'PermanentMarker', label: 'Permanent Marker' },
];

/** Set der gültigen Font-IDs — schnelle Validierung in Preview/Picker. */
export const SUBTITLE_FONT_IDS = new Set<string>(SUBTITLE_FONTS.map((f) => f.id));

// Die .ttf werden build-time eingebettet (expo-font Config-Plugin in app.json),
// NICHT zur Laufzeit via useFonts geladen — sonst greift react-native-svg
// (Gradient/Metallic-Preview) die Schriften auf Android nicht ab. Family-Name
// auf Android = Dateiname ohne Endung = der `id` oben.

/**
 * Default-Font pro Subtitle-Style (greift wenn `settings.fontFamily` fehlt).
 * MUSS mit dem Worker (`defaultWorkerFont` in subtitleCanvas.ts) übereinstimmen.
 */
export function defaultSubtitleFont(style?: string): string {
  switch (style) {
    case 'bold':    return 'ArchivoBlack';
    case 'gaming':  return 'RussoOne';
    case 'layered': return 'Anton';
    case 'fiano':   return 'Montserrat';
    default:        return 'Inter';
  }
}

/**
 * Phase D-Weight (2026-05-26): Family-Name + Weight → tatsächlicher
 * Datei-Family-Name den RN-Android/Worker via `assets/fonts/<name>.ttf` lädt.
 *
 *   resolveWeightedFamily('Inter', 'black')    → 'InterBlack'    (→ InterBlack.ttf)
 *   resolveWeightedFamily('Inter', 'regular')  → 'Inter'         (→ Inter.ttf)
 *   resolveWeightedFamily('Bangers', 'black')  → 'Bangers'       (single-weight)
 *
 * Display-Fonts (`hasWeights !== true`) ignorieren den Weight-Picker und nutzen
 * IMMER die Single-Weight-Base-Datei.
 */
export function resolveWeightedFamily(
  family: string,
  weight: SubtitleFontWeight | undefined,
): string {
  const def = SUBTITLE_FONTS.find((f) => f.id === family);
  if (!def?.hasWeights) return family;
  const w = weight ?? 'bold';
  if (w === 'regular') return family;
  // Capitalize: 'light' → 'Light'.
  const suffix = w.charAt(0).toUpperCase() + w.slice(1);
  return family + suffix;
}

/** Die 5 Weight-Buckets der UI. */
export const SUBTITLE_WEIGHTS: { id: SubtitleFontWeight; label: string }[] = [
  { id: 'light',   label: 'Light' },
  { id: 'regular', label: 'Regular' },
  { id: 'medium',  label: 'Medium' },
  { id: 'bold',    label: 'Bold' },
  { id: 'black',   label: 'Black' },
];

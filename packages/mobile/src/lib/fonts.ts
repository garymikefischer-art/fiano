/**
 * Untertitel-Schriftarten (Phase D-Fonts, 2026-05-20).
 *
 * 20 gebündelte Google Fonts (OFL/Apache — frei bündelbar, auch kommerziell).
 * Die `.ttf`-Dateien liegen in `packages/mobile/assets/fonts/` UND — als Kopie —
 * in `services/render-worker/assets/fonts/`, damit Preview (Mobile) und Export
 * (Worker-Canvas) DIESELBE Schrift rendern.
 *
 * `id` = der fontFamily-String, der überall verwendet wird: als expo-font
 * useFonts()-Key, in RN-`<Text>`/SVG (Preview) und im Worker als
 * registerFromPath-Alias.
 *
 * ⚠️ Bei Änderung dieser Liste: `services/render-worker/src/subtitleCanvas.ts`
 * (SUBTITLE_FONT_FILES + defaultWorkerFont) mitziehen — sonst Export ≠ Preview.
 */

export interface SubtitleFontDef {
  id: string;
  label: string;
}

/** Die 20 caption/gaming-tauglichen Untertitel-Schriften. */
export const SUBTITLE_FONTS: SubtitleFontDef[] = [
  { id: 'Montserrat', label: 'Montserrat' },
  { id: 'Poppins', label: 'Poppins' },
  { id: 'Inter', label: 'Inter' },
  { id: 'Outfit', label: 'Outfit' },
  { id: 'Sora', label: 'Sora' },
  { id: 'BebasNeue', label: 'Bebas Neue' },
  { id: 'Anton', label: 'Anton' },
  { id: 'Oswald', label: 'Oswald' },
  { id: 'Teko', label: 'Teko' },
  { id: 'BarlowCondensed', label: 'Barlow Condensed' },
  { id: 'FjallaOne', label: 'Fjalla One' },
  { id: 'ArchivoBlack', label: 'Archivo Black' },
  { id: 'Bungee', label: 'Bungee' },
  { id: 'TitanOne', label: 'Titan One' },
  { id: 'LuckiestGuy', label: 'Luckiest Guy' },
  { id: 'Bangers', label: 'Bangers' },
  { id: 'RussoOne', label: 'Russo One' },
  { id: 'Orbitron', label: 'Orbitron' },
  { id: 'ChakraPetch', label: 'Chakra Petch' },
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

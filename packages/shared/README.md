# @fiano/shared

Plattform-neutraler Code geteilt zwischen `fiano-desktop` (Electron) und `fiano-mobile` (React Native + Expo).

## Inhalt

- **`types.ts`** — TypeScript-Typen für Project / Highlight / TimelineClip / SubtitleSettings / AppEvent / Plan
- **`i18n/locales/{de,en,it,ru,es,fr,pt,nl,pl}.ts`** — 9 Sprachpakete (Plain-Object Maps)
- **`i18n/index.ts`** — Barrel-Export + LanguageCode-Type
- **`ffmpegArgs.ts`** — Pure Funktionen die FFmpeg-CLI-Argumente als `string[]` zurückgeben (NEU für Mobile, perspektivisch auch von Desktop genutzt). Kein `spawn()` — die Plattform-Layer rufen ihre eigene Spawn-API.
- **`subtitles.ts`** — ASS/SRT-Generation für libass/drawtext Burn-In (plattform-neutral)

## Regel

- **Keine** Plattform-Imports (`fs`, `child_process`, `electron`, `react-native`, `expo-*`).
- **Keine** UI (kein React, kein NativeWind).
- Nur reine Logik / Typen / Konstanten.

Desktop und Mobile sollen denselben Code nutzen, damit Verhaltens-Drifts vermieden werden.

## Path-Aliase

Desktop (`tsconfig.{node,web}.json`):
```json
"paths": {
  "@fiano/shared/*": ["packages/shared/src/*"]
}
```

Mobile auflöst via npm-Workspaces — `import { ... } from '@fiano/shared'`.

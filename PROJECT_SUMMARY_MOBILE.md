# 📋 PROJECT SUMMARY — fiano (Mobile + Desktop Hybrid)

> Letzter Update: Phase 9.5 abgeschlossen. Stand: TikTok layout-aware Preview, Multi-Audio-Picker mit Shuffle, Intro-Position-Picker, Search-Modal, Live-Preview-Indikator. Native-Build pending für `expo-video-thumbnails`.

---

## 🏗 1. Architektur

### Monorepo
```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                          ← Desktop (Electron Main + Renderer)
│   ├── main/                     ← Electron Main-Prozess
│   ├── preload/
│   └── renderer/                 ← Vite + React + Tailwind Desktop UI
├── packages/
│   ├── shared/                   ← Geteilt zwischen Desktop + Mobile
│   │   ├── src/types.ts          ← Project, Highlight, FacecamRegion, etc.
│   │   ├── src/i18n/             ← 9 Locales (DE EN IT RU ES FR PT NL PL)
│   │   └── src/ffmpegArgs.ts     ← Plattform-neutrale FFmpeg-Argument-Builder
│   └── mobile/                   ← React-Native + Expo SDK 52
│       ├── src/screens/          ← Home, Library, ProjectDetail, AddVideoProject, …
│       ├── src/components/       ← VideoPlayer, RegionPickerModal, MultiAudioPicker, …
│       ├── src/stores/           ← Zustand: auth, app, projects, notifications, jobs
│       ├── src/lib/              ← i18n, sounds, haptics, thumbnails, pushNotifications
│       └── src/data/demoProjects.ts
├── PROJECT_SUMMARY.md            ← Desktop-Summary (v0.2.0)
└── PROJECT_SUMMARY_MOBILE.md     ← (diese Datei)
```

### Desktop Stack
- Electron 31 (CommonJS Main, Vite-built Renderer)
- TypeScript strict, React 18 + Tailwind + Zustand + react-router HashRouter
- **Bundled FFmpeg** (per-arch in `resources/bin/${os}-${arch}/`)
- Bundled yt-dlp, electron-updater
- Supabase (Auth + Subscriptions), Stripe, Resend SMTP
- 9 Sprachen via shared i18n
- Aktuell **v0.2.0**

### Mobile Stack
- Expo SDK 52, React Native 0.76
- React-Navigation v7 (Stack + BottomTabs)
- Zustand für State
- expo-video-av (Sounds), react-native-video v6 (Player)
- expo-haptics, expo-localization, expo-secure-store, AsyncStorage
- expo-document-picker, expo-image-picker, expo-video-thumbnails, expo-notifications
- expo-blur (Liquid-Glass-Tabbar)
- Supabase JS SDK (gleiche Auth wie Desktop)

### Shared Code (`packages/shared/`)
- `src/types.ts` — Project, Highlight, ClipSegment, FacecamRegion, GameplayRegion, ClipEffects, AppEvent
- `src/i18n/` — 9 Locale-Files (de.ts, en.ts, …) als Single-Source-of-Truth
- `src/ffmpegArgs.ts` — FFmpeg-Argument-Builder (plattform-neutral)
- Desktop importiert via `@shared/types`, Mobile via `@fiano/shared` (workspace-Dep)

### Wichtige Systeme
- **media:// Custom Protocol** (Desktop) — lokale File-URIs für Video/Audio mit Range-Support
- **Job Queue** (Desktop, `core/queue.ts`) — serialisiert FFmpeg-Pipelines
- **IPC Layer** — typed Channels mit `IpcResponse<T>`
- **Settings** persistent in:
  - Desktop: `userData/app-defaults.json`, `userData/api-key.enc`
  - Mobile: `expo-secure-store` (encrypted, gleiche keys: `fiano.api.openai`, `fiano.region.facecam`, `fiano.export.settings`, `fiano.onboarding.completed`, `fiano.lang`, `fiano.sounds.muted`)
- **AsyncStorage** (Mobile) für Projekte + Notifications (under `fiano.projects`, `fiano.notifications`)

### Mobile File-Persistence
Gepickte Videos/Audio werden via `persistInDocuments()` aus dem temp Cache in `FileSystem.documentDirectory/imports/` (Videos) bzw. `documentDirectory/thumbs/` (Frames) kopiert. Bleibt auch nach OS-Cache-Cleanup verfügbar.

---

## ✅ 2. FERTIG (funktioniert auf Mobile)

### Auth + i18n (Phase 9.4.2 → 9.4.9)
- Login / Signup mit Supabase + 9-Sprach-i18n + Geräte-Locale-Detection + persistenter Sprach-Picker
- Settings: Sign-out, Delete-Account-Stub, Language-Picker, Replay-Onboarding

### Navigation (9.4.3 → 9.4.5)
- BottomTab-Liquid-Glass-Bar (BlurView, Capsule-Indicator) mit Safe-Area-Insets
- 5 Tabs: Home / Projects (Library) / Clips / TikTok / Builder
- Modals: AddVideoProject, Search, RegionPicker, LanguagePicker, Notifications, Pricing
- Sub-Screens: ProjectDetail (4 Tabs), Settings, Help, Legal, Onboarding

### UI / Theme (9.4.3 → 9.5)
- Dark-Mode mit roter Brand-Identität
- BackgroundGlow (SVG-Radial-Gradients + Base-Tint-Layer)
- Hero-Logo 96 px Höhe, Header mit weißer Trennlinie
- LiquidGlassTabBar mit dynamic Insets-Position
- Apple-Style Sounds via `expo-av` (5 prozedural via `scripts/generate-sounds.js` generiert)
- Haptics-Feedback bei jeder Aktion (`lib/haptics.ts`)

### Onboarding (9.4.10)
- 4-Slide Carousel (Welcome / AI / 9:16 / Privacy) bei Erststart
- Persistiert via `appStore.onboardingCompleted`
- Reset über Settings → Replay introduction

### Add Video Project Dialog (9.4.29)
- Quick 9:16 Clip / Auto-Mode (Gaming/Podcast/Auto Type) / Single video / YouTube-URL Stub / Manual single
- Pre-Pick Alert: **Cancel / Files / Gallery** (Source-Choice pro Pick)
- File-Picker via `expo-image-picker` + `expo-document-picker` mit erweiterten MIME-Types

### Project Detail mit Tabs (9.4.28 → 9.5)
4 Tabs analog Desktop:

**Highlights**
- VideoPlayer-Hero (mit echtem Source) ODER Hue-Tint-Placeholder bei Demo-Projekten
- Multi-Select Clip-Liste mit „Build YouTube video" → springt zu Builder-Tab
- ProjectStatusBadge (ready / processing / failed)

**Manual**
- ProjectInfoCard (Mode/Source/Status/Created/Duration/Highlights)
- VideoPlayer mit Mark-In/Mark-Out + currentSec-Tracking
- Clip-Liste mit Tap-zum-Seek + Delete

**9:16 (TikTok)**
- **Layout-aware Preview**: Full / Stacked (2 Player vertikal) / Split (2 Player horizontal)
- Hide-Region-Overlay-Toggle (nützlich für Stacked clean view)
- Per-Project-Region-Override-Toggle
- Subtitles + TTS Toggle-Rows
- **MultiAudioPicker** für Music (multi-track + reorder + shuffle)
- **AssetPickerRow** für Intro-Video (max 30 s)
- Intro Mode: Before / Overlay
- Intro Overlay-Position: Top / Center / Bottom / Full
- **Live-Preview Info-Badge** (zeigt aktive add-ons)

**Builder**
- VideoPlayer für ersten ausgewählten Clip
- Reorder-Up/Down-Pfeile pro Clip + ClipOrder am Project persistiert
- TTS-Toggle, MultiAudioPicker, Intro-Picker (gleich wie 9:16)

### VideoPlayer Pro Controls (9.4.25)
- Mute-Pill + Skip ±5s + Big Play/Pause + Tap+Drag Scrubber (PanResponder)
- Auto-Hide Controls beim Playback (2.5 s)
- Loading-Spinner + HEVC-spezifischer Error-Overlay (Android-Emulator → Hint)
- BufferConfig (5/10s, ExoPlayer-Constraint-konform), `disableFocus`, seek-Guard
- **Optional `fill`-Prop** (Phase 9.6) für flex-Sizing in Stacked/Split Panes

### Capture Regions (9.4.30 → 9.4.32)
- `appStore.facecamRegion` + `gameplayRegion` als `{x, y, w, h}` Region-Objects
- Settings → Live-Preview-Card → tap öffnet **RegionPickerModal**
- Modal: Test-Clip-Upload (Gallery/Files) + draggable Boxen + 4 Corner-Resize-Handles + Quick-Presets (TL/TR/BL/BR/None für Facecam, Center/Bottom/Stretch/Full für Gameplay)
- Min-Size 8 %, Drag mit Start-Region-Snapshot (kein Drift)
- Per-Project-Override-Toggle in TikTok-Tab

### Project-Store (9.4.20)
- `addProject` / `updateProject` / `removeProject` / `resetToDemo`
- AsyncStorage-Persistenz (subscribe → write)
- Source-Files in `documentDirectory/imports/` (persistent)
- Auto-Default-Clip beim Mode-Pick (User muss nicht extra trimmen)

### Thumbnails (9.4.31)
- `expo-video-thumbnails` extrahiert Frame bei 1 s nach Import
- Persist in `documentDirectory/thumbs/`
- Library + Home Recent Cards zeigen das Frame statt Hue-Tint

### Settings (9.4.30 → 9.4.32)
- Account / Plan-Badge / Manage-Billing → PricingScreen
- Capture Regions → RegionPickerModal
- API Keys: OpenAI + Gemini Eingabe (secure-text-entry, secureStore-persistent, ● saved Indicator)
- Export Defaults: FPS (24/30/60), Resolution (720p/1080p/4k), Bitrate (5/10/20/40/80 Mbps)
- Sounds-Toggle, Notifications-Switch (mit System-Permission-Request)
- Language-Picker, Send-Test-Notification, Replay-Introduction
- Sign-out + Delete-Account (mit Confirm-Alerts)

### Notifications (9.4.7 → 9.4.11)
- `notificationsStore` mit Persistenz, Bell-Badge dynamisch in allen Headern
- NotificationsScreen Modal mit Mark-Read / Clear / Empty-State
- `expo-notifications` für lokale Pushes (Permission-Request beim Settings-Toggle)
- ExportScreen feuert Local-Notif bei Done

### Sounds (9.4.27)
- 5 prozedurale Töne (`appStart`, `projectOpen`, `exportDone`, `notify`, `error`) als WAV
- Generator-Script `scripts/generate-sounds.js` (Node, no deps, 1:1 zu Desktop sounds.ts)
- `lib/sounds.ts` mit lazy-load + permanentlyDisabled-Fallback
- Mute via Settings + SecureStore-persistent

### Search-Modal (9.5)
- Live-Suche über Projekte + Settings-Quick-Targets + Tab-Navigation
- 3 Result-Gruppen, Tap navigiert + schließt Modal
- Search-Icon in Home/Library/ComingSoon Headers

---

## 🟡 3. TEILWEISE FERTIG

### Stacking-Preview (9:16 Tab)
- Aktuell: 2 VideoPlayer übereinander (Stacked) bzw. nebeneinander (Split), beide zeigen das Source mit cover-crop + farbige FACECAM/GAMEPLAY-Pills
- **Fehlt**: echtes Region-Cropping (Top-Pane = nur Facecam-Region des Source, Bottom = Gameplay-Region). Braucht entweder transform/scale-Tricks (Aspect-Mismatch-Probleme) oder FFmpeg-Native (Phase 9.6)

### Live-Preview Audio-Mixing
- Aktuell: nur Indicator-Badge zeigt aktive Assets
- **Fehlt**: tatsächliches Audio-Mixing in der Vorschau (Music + TTS + Intro-Audio über Source)
- Braucht Native-Audio-Compositor → Phase 9.6 mit FFmpeg-Native

### Export
- ExportScreen-UI komplett (phasen-spezifische Status, Progress, Error-Overlay)
- Project-Status-Updates (processing → ready / failed) wired
- **Fehlt**: echter FFmpeg-Render — `lib/ffmpeg.ts` exportMobile ist Stub. Native-FFmpeg-Bridge folgt Phase 9.6

### Highlights (AI-Detection)
- UI komplett (Highlights-Tab mit Multi-Select)
- **Fehlt**: AI-Run. Aktuell User legt selber Clips an im Manual-Tab. Whisper-API-Key in Settings ist da, aber kein Wiring (mobile braucht eigenen Audio-Extraction-Step → FFmpeg-Native)

### Multi-Clip Manual-Mode
- UI im AddVideoProjectScreen sichtbar (mit „SOON"-Badge)
- **Fehlt**: Project-Modell muss `sourceUris[]` statt single `sourceUri` unterstützen + Builder muss multi-source-concat können (FFmpeg-Native-Pflicht)

---

## 📋 4. Offene TODOs (priorisiert)

### 🔴 HIGH

1. **Phase 9.6 — FFmpeg-Native-Bridge (Mobile)**
   - Eigenes Native-Modul (iOS Swift Package via kewlbear/FFmpeg-iOS, Android NDK build)
   - JS-Bridge für: trim, concat, overlay, audio-mix, scale+pad zu 9:16
   - Real Stacked/Split Composition (Region-Crops)
   - Real Audio-Mixing (Music + TTS + Intro)
   - Real Export (heute Stub, dann End-zu-End funktional)
   - Real AI-Highlights via Whisper (Audio-Extraction → Cloud → Scoring)

2. **Subtitle-Stack** — Mobile noch komplett offen. Desktop hat libass + drawtext-Fallback. Mobile braucht entweder via FFmpeg-Native oder vor dem Export als SRT-Burn-In

3. **YouTube/Twitch URL-Import** — aktuell Stub (Coming-Soon-Alert). Braucht Backend-Fetcher (yt-dlp läuft nicht direkt auf Mobile → Edge-Function-Roundtrip)

### 🟡 MEDIUM

4. **Phase 9.7 — Light-Theme**
   - Theme-Provider + Color-Tokens
   - Alle hardcoded `#0d0509`, `#f1f2f2`, `rgba(255,16,57,…)` → Token-References
   - Settings-Toggle (System / Dark / Light)
   - i18n-Strings: `appearance.system / dark / light`

5. **Phase 9.8 — Thumbnails-Page mit Gemini**
   - Eigener Tab in ProjectDetail (5. Tab) ODER eigener Screen
   - Game-Switcher (Fortnite/Warzone/Valorant + Custom)
   - Prompt-Form + Reference-Picker
   - Gemini-Image-Generation via API (Key existiert in Settings)
   - Auto-fetch verfügbare Modelle, Dropdown statt Text-Input
   - History-Galerie mit Re-Generate
   - Persistente Thumbs in `documentDirectory/thumbs/projects/{id}/`

6. **AI-Highlights Mobile** — Whisper-Pipeline Cloud-side oder via Edge-Function

7. **Multi-Clip Project-Modell** — `sourceUris[]` statt single

### 🟢 LOW

8. Real Region-Crops in Stacked-Preview (transform-Tricks ODER FFmpeg-Native warten)
9. Desktop-Style „Add Multiple Clips" Builder-Multi-Source-Composition
10. Drag-to-Reorder im Builder (statt up/down arrows) via `react-native-draggable-flatlist`
11. Per-Project Region Snapping in der TikTok-Tab Preview
12. Onboarding Tour-Tooltips (interactive Spotlights)
13. Push-Token Registrierung beim Login (für Server-side Pushes via Supabase)
14. Effects-System auf Mobile (Desktop hat `motionBlur`, `filter`-Presets — Mobile noch nicht)

---

## 📊 5. Datenmodell (Mobile)

### Project (`packages/mobile/src/data/demoProjects.ts`)
```ts
type ProjectMode = 'highlights' | 'manual' | 'tiktok' | 'builder';
type VideoType = 'gaming' | 'podcast' | 'auto';
type SourceType = 'file' | 'url' | 'multi-clip';

interface DemoProject {
  id: string;
  title: string;
  subtitle: string;          // "Today · 14:32"
  durationSec: number;
  status: 'ready' | 'processing' | 'failed';
  thumbHue: number;          // 0..360 für Hue-Tint-Placeholder
  thumbUri?: string;         // persistenter Frame nach Import
  clips: DemoClip[];

  // Source (gesetzt bei echten Imports)
  sourceUri?: string;        // file:// in documentDirectory/imports/
  sourceUrl?: string;        // YouTube/Twitch
  sourceType?: SourceType;
  mode?: ProjectMode;
  videoType?: VideoType;
  trimStart?: number;
  trimEnd?: number;
  createdAt?: number;

  // Per-Project Overrides
  facecamRegion?: { x, y, w, h } | null;
  gameplayRegion?: { x, y, w, h };
  clipOrder?: string[];      // manuelle Reihenfolge im Builder

  errorMessage?: string;
}

interface DemoClip {
  id: string;
  startSec: number;
  endSec: number;
  label: string;
  score: number;             // 0..1, AI-Highlight-Score
}
```

### App-Settings (`packages/mobile/src/stores/appStore.ts`)
```ts
interface Region { x: number; y: number; w: number; h: number }  // 0..1

interface ExportSettings {
  fps: 24 | 30 | 60;
  resolution: '720p' | '1080p' | '4k';
  bitrate: '5M' | '10M' | '20M' | '40M' | '80M';
}

interface AppState {
  initializing: boolean;
  onboardingCompleted: boolean;
  facecamRegion: Region | null;
  gameplayRegion: Region;
  openaiKey: string;         // SecureStore: fiano.api.openai
  geminiKey: string;         // SecureStore: fiano.api.gemini
  exportSettings: ExportSettings;
}
```

### Notifications-Store
```ts
interface Notification {
  id, icon, iconColor, iconBg, title, body, time, unread
}
```

### Audio-Track (Multi-Music)
```ts
interface AudioTrack { uri: string; filename: string }
// Stored in TikTokTab/BuilderTab local state, not yet persisted on Project
```

### Shared Types (`packages/shared/src/types.ts`)
Desktop-Type werden für Mobile nicht 1:1 übernommen — Mobile hat ein vereinfachtes Modell. Bei FFmpeg-Native-Phase: Mobile-Project sollte `Highlight` mit `clipPath`-equivalent + `segments[]` adoptieren.

---

## 🐛 6. Bekannte Bugs / Limits

| Bug / Limit | Status | Lösung |
|---|---|---|
| Stacked-Preview zeigt das Source 2× statt cropped Regions | by-design (Phase 9.6) | FFmpeg-Native für echtes Compositing |
| Live-Preview-Audio-Mix funktioniert nicht | by-design (Phase 9.6) | FFmpeg-Native |
| Export endet immer in Failed (FFmpeg fehlt) | by-design (Phase 9.6) | FFmpeg-Native-Bridge |
| HEVC-Crash auf Android-Emulator | environmental | echtes Phone oder iOS-Sim |
| `ExpoVideoThumbnails` not found | nach Install rebuild nötig | `npx expo run:android` |
| AI-Highlights ohne echte Detection | by-design | Whisper-Pipeline Phase 9.6+ |
| YouTube/Twitch URL = Coming-Soon-Alert | by-design | Edge-Function-Backend |
| Region-Crops in Stacked = nur Schaubild | siehe Stacked-Preview oben | Phase 9.6 |

---

## 🎯 7. Wichtige Designentscheidungen

- **16:9 Master-First** — Pipeline rendert IMMER 16:9 als Master pro Highlight, alles weitere (9:16, Builder-Concat) leitet davon ab
- **TikTok-Tab ≠ Builder** — TikTok = pro-Clip-Export mit Layout/Effects/Subs. Builder = Multi-Clip-Concat NUR für YouTube
- **Manual-Mode ohne AI** — Quick-9:16 + Multi-Clip-Import bypass'd Whisper komplett
- **Subtitles als 2-Pass** (Desktop) — separater FFmpeg-Pass, graceful skip bei Fehlern. Mobile noch offen
- **Effects per-Clip** — direkt im FFmpeg-Filtergraph (eq, colorbalance, unsharp, minterpolate)
- **Music Multi-Track + Random** — Pool-basiert, optional Shuffle-per-Build
- **Intro Mode-Switch** — `before` = prepend (concat-demuxer), `overlay` = overlay-Filter mit Alpha. Per Mode separater Code-Pfad
- **Mobile Files persistent** — `persistInDocuments()` kopiert aus Cache in documentDirectory damit Source nach App-Restart noch existiert
- **safeStorage / SecureStore** für API-Keys — nie Klartext, Renderer/Mobile sieht nur `hasKey: boolean` bzw. masked Input
- **Job Queue concurrency=1** — FFmpeg saturiert eh Hardware
- **Mobile Persistence-Architektur** — Auth/Subscription via Supabase (gleicher Stack wie Desktop), Projekte + Source-Files **lokal** auf Mobile (analog Desktop's appData-Filesystem)
- **Lazy-Load Native-Module** — alle expo-Module (av, haptics, video-thumbnails, notifications) via try/catch + cached null. Apps boot auch ohne neuen Native-Build, Funktion ist no-op statt Crash

---

## 💾 8. Saving / Folder / Backups / Git

### Datei-Speicherorte (Mobile)
```
expo-secure-store      — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute, Region-Defaults
AsyncStorage           — Projekte (fiano.projects), Notifications (fiano.notifications)
documentDirectory/imports/   — Source-Videos persistent
documentDirectory/thumbs/    — extrahierte Frame-Thumbnails
cacheDirectory/        — Picker-Tempfiles (OS cleant)
```

### Datei-Speicherorte (Desktop)
```
userData/projects/{id}/exports/    — 16:9 Master-MP4s
userData/app-defaults.json         — facecam, gameplay, splitRatio, geminiImageModel
userData/api-key.enc + gemini-key.enc — Electron safeStorage encrypted
~/Downloads/Neuer Ordner/          — User's Sourcen
```

### Synchronisation Mobile ↔ Desktop
- **Geteilter Code**: alles in `packages/shared/` — Änderungen wirken auf beide.
- **Geteilte Auth**: Supabase, beide Plattformen sehen denselben User + Subscription.
- **Projekte sind LOKAL pro Plattform**: Mobile-Projekte stehen NICHT auf Desktop und umgekehrt. (Desktop's appData ≠ Mobile's documentDirectory). Desktop-Cloud-Sync wäre eigene Phase.
- **Settings teilen sich nicht automatisch**: API-Keys, Capture-Regions, Export-Defaults sind PER-DEVICE. Wenn Cross-Device-Sync gewollt: Supabase-User-Profile-Tabelle (eigene Phase).

### Backups
- **Vor jeder Phase: git tag**. Bestehende Tags:
  - `pre-phase-9.4.x`-Series
  - Aktuell wäre vor Phase 9.6: `git tag pre-phase-9.6 && git push --tags`
- **Rollback**: `git reset --hard <tag>` lokal, oder `git checkout <tag> -- packages/mobile/src/...` für selektives Revert
- **Worktree-Pattern**: Claude-Branches landen in `claude/<branch>/worktree`, User merged in main wenn OK

### Git-Push für Auto-Updates
**Desktop hat electron-updater wired:**
1. `git tag v0.2.X && git push --tags`
2. CI / lokal: `npm run release:mac` + `npm run release:win` (siehe package.json)
3. electron-builder uploaded zu GitHub Releases
4. Bestehende Installationen prüfen via `electron-updater` und ziehen automatisch
5. `.env` muss im Worktree liegen vor DMG-Build

**Mobile hat KEIN Auto-Update — eigene Entscheidung:**
- Variante A: **EAS Update** (Expo OTA) — pushed JS-only-Updates ohne Store-Review. Setup: `eas update:configure`, dann `eas update --channel production`
- Variante B: **App Store / Play Store**-Releases via `eas build` + Upload
- Aktuell: **kein OTA wired**, jede Native-Änderung braucht `npx expo run:android`/`run:ios` lokal. JS-Änderungen via Metro `r` für Devs.

### Mobile-Workflow
```bash
# JS-Änderungen
cd packages/mobile && npm run start:clear   # Metro mit Cache-Reset
# Im Metro-Terminal: r → Reload auf dem Phone

# Native-Änderungen (neue native deps)
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
# Dauer: 3–5 min beim ersten Mal, danach inkrementell
```

### Desktop-Workflow
```bash
npm run dev          # electron-vite dev
npm run build:mac    # produktion DMG für Apple Silicon + Intel
npm run release:mac  # bauen + zu GitHub-Releases publishen
```

---

## 🚀 9. Roadmap — Nächste Phasen (Reihenfolge)

### Phase 9.6 — FFmpeg-Native-Bridge (Mobile) [HIGH]
- iOS: kewlbear/FFmpeg-iOS Swift Package
- Android: NDK-Build mit libass + libfreetype
- JS-Bridge: trim, concat, overlay, audio-mix, scale-pad, region-crop
- Real Stacked/Split-Composition
- Real Audio-Mixing (Music + TTS + Intro)
- Real Export (Camera-Roll-Save funktional)
- Subtitle-Burn-In via libass
- Whisper-Pipeline für AI-Highlights
- Sub-Phase 9.6.1 — Custom-Build vs Bundling-Optionen evaluieren

### Phase 9.7 — Light-Theme [MEDIUM]
- Theme-Provider via React-Context oder dedizierter Store
- Color-Tokens-Datei (`lib/theme.ts`) mit `dark` / `light` Maps
- Migration aller hardcoded Colors zu `useTheme().colors.bg` etc.
- Settings → Appearance: System / Dark / Light Switch
- BackgroundGlow-Variant für Light-Mode

### Phase 9.8 — Thumbnails-Page mit Gemini [MEDIUM]
- Tab oder Sub-Screen in ProjectDetail
- Game-Switcher (Fortnite/Warzone/Valorant/Custom)
- Prompt-Form + Reference-Image-Picker
- Gemini-API-Call mit `useAppStore.geminiKey`
- Auto-list-models → Dropdown
- History-Gallerie pro Projekt
- Save-to-Camera-Roll Action

### Phase 9.9 — YouTube/Twitch-URL-Import [MEDIUM]
- Supabase Edge-Function `download-video` mit yt-dlp
- Mobile fetch'd Video als Stream → file://
- Status-Tracking während Download

### Phase 9.10 — AI-Highlights (Mobile) [MEDIUM]
- FFmpeg-Native-Audio-Extract → Whisper-API
- Highlights-Algorithm vom Desktop port'd nach `packages/shared/`
- Status: project.status = 'analyzing' → 'ready' mit clips[]

### Phase 9.11 — Multi-Clip-Manual-Mode [LOW]
- Project-Type-Erweiterung: `sourceUris: string[]`
- Builder unterstützt multi-source-concat
- AddVideoProject „Import multiple clips"-Card aktiv

### Phase 9.12 — Real-Region-Crops in Live-Preview [LOW]
- transform/scale-Tricks im VideoPlayer (Aspect-Mismatch akzeptieren)
- ODER: nach FFmpeg-Native rendert ein Background-Job einen 5-Sek-Loop und speichert als Preview-File

### Phase 9.13 — Cross-Device-Sync [LOW]
- Supabase `projects`-Tabelle (mit RLS)
- Mobile uploaded source/thumb zu Supabase Storage
- Desktop pulls — und umgekehrt

### Phase 9.14 — Effects-System (Mobile) [LOW]
- Mobile bekommt `clip.effects: ClipEffects` analog Desktop
- TikTok-Tab + Builder-Tab → Effects-Section
- Render via FFmpeg-Native (Phase 9.6 Pflicht)

### Phase 9.15 — Push-Token-Registrierung [LOW]
- Beim Login Expo-Push-Token holen + in Supabase profile speichern
- Server-side Pushes via Supabase Edge-Functions
- Vorbereitung für Real-time Project-Status-Updates

### Phase 9.16 — Auto-Update Mobile [LOW]
- EAS Update OTA für JS-only-Patches
- Settings → „Check for updates" (Desktop hat es schon)

---

## 🧠 SYSTEM PROMPT für neuen Chat

```
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano" — einer Hybrid-Desktop+
Mobile-Video-App. Stack:

- Desktop: Electron 31 + TypeScript + React 18 + Tailwind + Zustand + react-router HashRouter +
  bundled FFmpeg (per-arch resources/bin/${os}-${arch}) + bundled yt-dlp + Supabase + Stripe +
  Resend SMTP + electron-updater. 9 Sprachen. Aktuell v0.2.0.
- Mobile: Expo SDK 52 + React Native 0.76 + React-Navigation v7 + Zustand + react-native-video v6
  + expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/
  notifications/blur. Supabase JS SDK. Phase 9.5 abgeschlossen.

Working Dir: /Users/garyfischer/Downloads/fiano-monorepo/
GitHub: garymikefischer-art/fiano
Monorepo: src/ (Desktop) + packages/{shared,mobile}/ (Mobile + Shared types/i18n/ffmpegArgs)

Arbeitsstil: deutsch, MVP-First, Plan zeigen → OK abwarten → implementieren. i18n × 9 immer.
Vor jeder Phase: git tag pre-phase-9.X. PROJECT_SUMMARY_MOBILE.md im Repo-Root hat alle Details.

WICHTIG für Mobile:
- Native-Module via lazy-load mit try/catch (siehe sounds.ts, haptics.ts, thumbnails.ts pattern)
- Source-Files via persistInDocuments() in documentDirectory speichern
- Settings via expo-secure-store (encrypted), Projekte/Notifications via AsyncStorage
- Bei neuem expo install <native-modul> → User muss `npx expo run:android` ausführen
- JS-only-Änderungen: Metro `r` reicht
- Phone-Serial: ANDROID_SERIAL=10AF7Y16R70010X (User's physical Pixel)

Nächste Phase 9.6 = FFmpeg-Native-Bridge (Mobile) — aktiviert dann real Stacking, Audio-Mix,
Export, Subtitles, Whisper-Highlights. Phase 9.7 = Light-Theme. Phase 9.8 = Thumbnails-Page mit
Gemini. Vollständige Roadmap mit 11 weiteren Phasen in PROJECT_SUMMARY_MOBILE.md §9.

Backups: User merged claude/<branch> in main. Vor Native-Phasen: git tag pre-phase-9.6 +
push --tags. Rollback via git reset --hard <tag>. Mobile auto-updates noch NICHT wired
(EAS Update wäre der Weg).
```

---

**Letzte Logo-Anpassung:** FianoLogo height={72} → height={96} in HomeScreen, LibraryScreen, ComingSoon (≈ +33 %).

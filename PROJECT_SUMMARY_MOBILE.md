# 📋 PROJECT SUMMARY — fiano (Mobile + Desktop Hybrid)

> Letzter Update: **Phase 9.6.6 abgeschlossen + UX-Fixes** (Cloud-Render
> komplett funktional, Multi-Input live, Tab-Navigation mit Quick-Open,
> Music+TTS+Intro in Preview hörbar/sichtbar, Subtitle-Styling, ExportSettings-
> Popup). **Nächste offene Phase: 9.6.7 AI-Highlights (Whisper).**

---

## 🏗 1. Architektur

### Monorepo
```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                          ← Desktop (Electron Main + Renderer)
│   ├── main/                     ← Electron Main-Prozess (Node)
│   ├── preload/
│   └── renderer/                 ← Vite + React + Tailwind Desktop UI
├── packages/
│   ├── shared/                   ← Geteilt zwischen Desktop + Mobile
│   │   ├── src/types.ts          ← Project, Highlight, ClipSegment, FacecamRegion …
│   │   ├── src/subtitles.ts      ← Subtitle-Cue-Parser
│   │   ├── src/i18n/             ← 9 Locales (de/en/it/ru/es/fr/pt/nl/pl)
│   │   └── src/ffmpegArgs.ts     ← Plattform-neutrale FFmpeg-Argument-Builder
│   │                                inkl. buildTikTokExportArgs (stacked/split/full
│   │                                + audio-mix + subtitles + intro)
│   └── mobile/                   ← React-Native + Expo SDK 52
│       ├── src/screens/          ← Home/Library/ProjectDetail/Export/Add/Settings
│       ├── src/components/       ← VideoPlayer, RegionCroppedVideoPlayer,
│       │                          StackedSplitPreview, RegionPreviewCard,
│       │                          SubtitleSettingsModal, SubtitleOverlay,
│       │                          ColorPickerModal, MiniColorPicker,
│       │                          MultiAudioPicker, VoiceOversSection,
│       │                          TtsModal, SimpleSlider
│       ├── src/stores/           ← Zustand: app/auth/projects/notifications/jobs
│       ├── src/lib/              ← env, supabase, sounds, haptics, thumbnails,
│       │                          pushNotifications, tts, renderJob (Cloud-API)
│       ├── plugins/with-large-heap.js  (legacy, durch app.config.js ersetzt)
│       ├── app.config.js         ← Inline Expo-Config-Plugin für largeHeap
│       └── app.json              ← Expo Base-Config
├── services/
│   └── render-worker/            ← Cloud Run FFmpeg-Worker (Phase 9.6)
│       ├── Dockerfile            ← Node 22 + apt FFmpeg
│       ├── src/index.ts          ← Express + /v1/upload-url + /v1/render
│       ├── src/auth.ts           ← Supabase JWT Auth-Middleware
│       ├── src/r2.ts             ← Cloudflare R2 (S3-kompatibel) Storage
│       ├── src/render.ts         ← FFmpeg-spawn + Timeout + Progress-Log
│       └── README.md             ← Full deployment guide
├── PROJECT_SUMMARY.md            ← Desktop-Summary (v0.2.0)
└── PROJECT_SUMMARY_MOBILE.md     ← (diese Datei)
```

### Desktop Stack
- Electron 31 (CommonJS Main, Vite-built Renderer)
- TypeScript strict, React 18 + Tailwind + Zustand + react-router HashRouter
- **Bundled FFmpeg** (per-arch in `resources/bin/${os}-${arch}/`) — lokal, kein Cloud
- Bundled yt-dlp, electron-updater
- Supabase (Auth + Subscriptions), Stripe, Resend SMTP
- 9 Sprachen via shared i18n
- Aktuell **v0.2.0**

### Mobile Stack
- Expo SDK 52, React Native 0.76
- React-Navigation v7 (Stack + BottomTabs)
- Zustand für State
- expo-av (Sounds), react-native-video v6 (Player), react-native-svg (gradient subtitle)
- expo-haptics, expo-localization, expo-secure-store, AsyncStorage
- expo-document-picker, expo-image-picker, expo-video-thumbnails, expo-notifications
- expo-blur (Liquid-Glass-Tabbar), expo-file-system (HTTP-Upload + persistente Files)
- Supabase JS SDK (gleiche Auth wie Desktop)
- **Phase 9.6.6 abgeschlossen** — Cloud-Render läuft

### Cloud-Render-Infrastructure (Phase 9.6+)
**Architektur** ohne lokales FFmpeg auf Mobile — wegen Patent-Risiko (MPEG LA H.264/H.265)
und Hardware-Limits (Vivo OOM-Crashes):

```
Mobile (Expo)              Google Cloud Run         Cloudflare R2
─────────────              ────────────────         ─────────────
POST /v1/upload-url    →   pre-signed PUT-URL  
PUT file               ─────────────────────→       sources/{user}/...
POST /v1/render        →   ├ download from R2 ←     (parallel files)
   { inputs:                ├ ffmpeg ${args}
     {source, intro?,        ├ upload result   ──→  outputs/{user}/...
      music?[], vo?[]},      └ pre-signed DL-URL
     args[], projectId }
GET signed-URL         ←   signed-DL-URL
   (download to phone)  ←─────────────────────       outputs/...
```

**Kostenmodell:**
- Cloud Run: **scale-to-zero** — 0€/Monat wenn niemand exportiert
- R2: **unlimited free egress** (Killer-Feature ggü. Supabase Storage)
- Free-Tier deckt ~10000 Renders/Monat — bei MVP gratis, später ~5-15€/Monat

### Wichtige Systeme
- **media:// Custom Protocol** (Desktop) — lokale File-URIs für Video/Audio mit Range-Support
- **Job Queue** (Desktop, `core/queue.ts`) — serialisiert FFmpeg-Pipelines
- **IPC Layer** — typed Channels mit `IpcResponse<T>`
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`) — Multi-File-Upload + signed-URL-PUT-zu-R2
- **Settings** persistent in:
  - Desktop: `userData/app-defaults.json`, `userData/api-key.enc`
  - Mobile: `expo-secure-store` (encrypted)
- **AsyncStorage** (Mobile) für Projekte + Notifications

### Mobile File-Persistence
Gepickte Videos/Audio via `persistInDocuments()` aus temp-Cache in
`FileSystem.documentDirectory/imports/` (Videos), `/thumbs/` (Frames),
`/voice-overs/` (TTS-MP3s), `/exports/` (Cloud-Render-Results).

---

## ✅ 2. FERTIG (Mobile, alles getestet)

### Auth + i18n (Phase 9.4.2 → 9.4.9)
- Login / Signup mit Supabase + 9-Sprach-i18n + Geräte-Locale-Detection
- Settings: Sign-out, Delete-Account-Stub, Language-Picker, Replay-Onboarding

### Navigation (9.4.3 → 9.4.5)
- BottomTab-Liquid-Glass-Bar (BlurView, Capsule-Indicator)
- 5 Tabs: Home / Projects / Clips / TikTok / Builder
- Modals: AddVideoProject, Search, RegionPicker, LanguagePicker, Notifications, Pricing
- Sub-Screens: ProjectDetail (4 Tabs), Settings, Help, Legal, Onboarding, Export

### UI / Theme (9.4.3 → 9.5)
- Dark-Mode mit roter Brand-Identität
- BackgroundGlow (SVG-Radial-Gradients)
- LiquidGlassTabBar mit dynamic Insets
- 5 prozedurale Sounds via expo-av
- Haptics bei jeder Aktion

### Onboarding (9.4.10)
- 4-Slide Carousel bei Erststart, persistiert via SecureStore

### Project Detail mit 4 Tabs (Phase 9.4.28 → 9.5)
- **Highlights**: VideoPlayer + Multi-Select + Build-YouTube → Builder
- **Manual**: Mark-In/Out + Clip-Liste
- **9:16 (TikTok)**: Layout-aware Preview, Region-Cards, Subtitle-Modal, TTS, Music, Intro
- **Builder**: Reorder Up/Down + ClipOrder

### VideoPlayer Pro Controls (9.4.25)
- Mute / Skip ±5s / Tap+Drag Scrubber
- Auto-Hide nach 2.5s
- HEVC-Error-Overlay mit Hint

### Stacked/Split-Preview mit echtem Region-Crop (Phase 9.5.1 → 9.5.4)
- `RegionCroppedVideoPlayer` — Image.getSize + cover-fit-math
- `StackedSplitPreview` — zentrales Control (Master-Slave-Sync, click-to-play)
- `RegionPreviewCard` — separate Cards unten mit Snap-Presets
- Aspect-mismatch korrekt behandelt

### Facecam-Size-Slider (Phase 9.5.3)
- `SimpleSlider` (PanResponder-based, JS-only)
- splitRatio persistiert auf project, default 0.4
- Live-Reflektion in Stacked-Preview

### TTS Voice-Over (Phase 9.5.5)
- `TtsModal` mit Sprache/Gender/Voice/Text
- OpenAI TTS-API (`lib/tts.ts`) — model `tts-1`, voices alloy/echo/fable/nova/onyx/shimmer
- Audio in `documentDirectory/voice-overs/` persistiert
- `VoiceOversSection` mit Liste + Edit + StartSec-Slider + Volume-Slider

### Subtitle-Styling Modal (Phase 9.5.6)
- `SubtitleSettingsModal` mit allen 30+ Properties analog Desktop
- `SubtitlePreviewCard` + `SubtitleOverlay` (auch in Stacked-Preview live)
- `ColorPickerModal` mit Hex + RGB-Sliders + 24-Preset-Grid
- 15+ Android-System-Fonts + Custom-Input
- SVG-basierter Gradient/Metallic-Render via react-native-svg
- Drop-Shadow + Glow via SVG `<Filter>` mit FeGaussianBlur (echter Multi-Pass)
- Strict `enabled === true` Checks (verhindert false-positive cross-effect-Pollution)
- Enable-Toggle als erste Section im Modal

### Cloud-Render-Worker (Phase 9.6.1)
- Google Cloud Run mit Node 22 + apt FFmpeg
- Cloudflare R2 Storage (S3-kompatibel via @aws-sdk)
- Express + JWT-Auth (Supabase Service-Role)
- Endpoints: GET /health, POST /v1/upload-url, POST /v1/render
- `largeHeap=true` via Expo-Config-Plugin (Vivo-Compat)
- Setup-Anleitung in `services/render-worker/README.md`

### Cloud-Export End-to-End (Phase 9.6.2)
- `lib/renderJob.ts` mit Multi-File-Upload (parallel PUT zu R2)
- ExportScreen verkabelt — Phases uploading/rendering/saving/done
- Save zu Camera-Roll via expo-media-library
- Local-Notification bei Done

### FFmpeg-Args für TikTok-Composition (Phase 9.6.3 - 9.6.6)
- `buildTikTokExportArgs` in shared/ffmpegArgs.ts (plattform-neutral)
- **Stacked**: split=2 + crop(facecam) + crop(gameplay) + vstack mit aspect-fix
- **Split**: hstack analog
- **Full**: center-cover-crop
- **Subtitle**: drawtext mit color/stroke/position
- **Audio-Mix**: amix von [src][music][voiceOvers] mit volume + adelay
- **Intro**: concat n=2:v=1:a=1 mit prepended intro-clip
- **Platzhalter-System**: `{SRC}` `{INTRO}` `{MUSIC_N}` `{VO_N}` `{DST}` — Server ersetzt
  mit echten tmp-Pfaden (Anti-Injection)

---

## 🟡 3. TEILWEISE FERTIG

### Phase 9.6 — Multi-Input nicht testweise deployed
- Worker-Code v0.3.0 mit Multi-Input ist im claude-Branch gepusht
- **User muss noch redeployen** mit `gcloud run deploy --source .`
- Erster Single-Export (nur Stacked) bereits getestet — funktionierte
- Audio-Mix + Subtitle-Burn-In + Intro **noch nicht getestet**

### Intro Overlay-Mode (Phase 9.6.6)
- 'before'-Mode (prepend) funktioniert
- **'overlay'-Mode (transparent über erste 3s)** noch nicht — braucht overlay-filter
  mit x/y/scale-position
- Intro-Position x/y wäre Phase 9.6.6.1

### AI-Highlights (Whisper) — Phase 9.6.7
- UI komplett (Highlights-Tab)
- **Fehlt**: Whisper-API-Call, Cue-Parsing, Auto-Clip-Selection
- Server-side: neuer Endpoint `/v1/transcribe` mit OpenAI Whisper API

### Builder Multi-Clip-Import + Drag-Reorder
- UI im AddVideoProjectScreen sichtbar (mit „SOON"-Badge)
- **Fehlt**: Project-Modell `sourceUris[]` statt single `sourceUri`
- **Fehlt**: BuilderTab multi-source-concat-args
- **Fehlt**: Drag-to-Reorder via `react-native-draggable-flatlist` (Native-Dep)

### Thumbnail-Generierung on-demand
- Beim Import via expo-video-thumbnails ✓
- **Fehlt**: alte Projekte ohne `thumbUri` → automatisch im Hintergrund extrahieren
  beim Library-Open oder ProjectDetail-Open

---

## 📋 4. Offene TODOs (priorisiert)

### 🔴 HIGH — Sofortige nächste Phasen

1. **Phase 9.6 Multi-Input testen** (User-Action): redeploy + Test mit Music/VO/Intro
2. **Phase 9.6.7 — AI-Highlights via Whisper**
   - Server: `/v1/transcribe` Endpoint mit OpenAI Whisper API
   - Mobile: `lib/whisper.ts` analog `lib/tts.ts`
   - Highlights-Algorithmus aus Desktop nach `packages/shared/` portieren
   - Project-Status `analyzing → ready` mit clips[]
3. **Builder Multi-Clip-Import** (User-Wunsch)
   - DemoProject: `sourceUris?: string[]` zusätzlich zu single sourceUri
   - BuilderTab: Liste von Clips mit Reorder
   - FFmpeg-Args: concat-demuxer für Multi-Source

### 🟡 MEDIUM

4. **Phase 9.6.6.1 — Intro x/y Position** (für overlay-mode)
   - DemoProject.intro: `{ scale, x, y }` analog Desktop's `DEFAULT_INTRO_OVERLAY`
   - UI: Position-Picker (Top/Center/Bottom/Full + custom x/y)
   - FFmpeg overlay-filter mit `x=W*${x}:y=H*${y}`
5. **Thumbnail-Generierung on-demand** für alte Projekte
   - Library-Mount/ProjectDetail-Open: wenn `!thumbUri && sourceUri` → background-extract
6. **Phase 9.7 — Light-Theme**
   - Theme-Provider via React-Context oder dedicated Store
   - Color-Tokens (`lib/theme.ts`) mit dark/light Maps
   - BackgroundGlow-Variant für Light
   - Settings → Appearance: System / Dark / Light
7. **Phase 9.8 — Thumbnails-Page mit Gemini**
   - Eigener Tab in ProjectDetail (5.) ODER eigener Screen
   - Game-Switcher (Fortnite/Warzone/Valorant/Custom)
   - Gemini-Image-Generation API
   - History-Galerie
8. **Phase 9.9 — YouTube/Twitch URL-Import** via Supabase Edge-Function mit yt-dlp
9. **Phase 9.10 — AI-Highlights Mobile** (Vollausbau)

### 🟢 LOW

10. **Phase 9.11 — Multi-Clip Manual-Mode** (mit Builder zusammen)
11. **Phase 9.13 — Cross-Device-Sync** via Supabase storage + RLS-table
12. **Phase 9.14 — Effects-System Mobile** (motionBlur, filter-Presets) — braucht
    FFmpeg-Filter `eq`, `colorbalance`, `unsharp`, `minterpolate`
13. **Phase 9.15 — Push-Token-Registrierung** beim Login (Expo-Push-Token in Supabase
    profile-Tabelle für server-side Pushes)
14. **Phase 9.16 — Auto-Update Mobile (EAS Update)**
    - JS-only-OTA-Patches ohne Store-Review
    - Setup: `npm install -g eas-cli`, `eas update:configure`, dann
      `eas update --channel production` bei jedem Release
    - Settings → "Check for updates" Button (Desktop hat das schon)
15. **ExportSettings-Popup** vor Export-Klick (FPS/Resolution/Bitrate override per Export)

---

## 🔄 5. Workflow-Referenz

### Code-Änderungen propagieren (Desktop + Mobile)
- **`packages/shared/`** → wirkt auf BEIDE Plattformen automatisch (Monorepo-Symlink)
- **`src/`** → nur Desktop
- **`packages/mobile/`** → nur Mobile
- **`services/render-worker/`** → nur Cloud-Worker (separates Deploy)

### Mobile-Workflow
```bash
# JS-only-Änderungen (Stores, Components, Screens, FFmpeg-Args)
cd packages/mobile && npm run start:clear   # Metro mit Cache-Reset
# Im Metro-Terminal: r → Reload auf dem Phone

# Native-Änderungen (neue native deps oder app.json plugin-Änderungen)
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
# 3–5 min beim ersten Mal, danach inkrementell
```

### Desktop-Workflow
```bash
npm run dev          # electron-vite dev
npm run build:mac    # produktion DMG für Apple Silicon + Intel
npm run release:mac  # bauen + zu GitHub-Releases publishen (= triggert
                     # electron-updater bei allen Installationen)
```

### Cloud-Render-Worker-Workflow
```bash
cd services/render-worker
# Lokal testen:
npm run dev   # läuft auf localhost:8080

# Production deploy (Cloud Run):
gcloud run deploy fiano-render-worker \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi --cpu 2 --timeout 600 \
  --max-instances 10 --min-instances 0
# env-vars bleiben vom letzten Deploy — bei neuen vars --set-env-vars dazu

# Logs lesen:
gcloud run services logs read fiano-render-worker --region europe-west1 --limit 50
```

### Git-Workflow (sehr wichtig)
- **Claude arbeitet in `claude/<branch>` im Worktree** unter `.claude/worktrees/...`
- Branch wird zu GitHub gepusht: `garymikefischer-art/fiano`
- **User merged via**:
  ```bash
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git fetch origin
  git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
  ```
- Vor jeder größeren Phase: `git tag pre-phase-9.X && git push --tags`
- Rollback: `git reset --hard <tag>`

### Auto-Update-Strategie
- **Desktop** (vollständig wired):
  1. Code-Änderungen committen, in main mergen
  2. `git tag v0.2.X` (z.B. v0.2.1) und `git push --tags`
  3. `npm run release:mac` (oder release:win) — bauen + GitHub-Releases-Upload
  4. Bestehende Installs prüfen via electron-updater + ziehen automatisch
  5. `.env` muss im Worktree liegen vor DMG-Build
- **Mobile** (noch nicht wired, Phase 9.16):
  - EAS Update für JS-only-OTA (kein Store-Review)
  - Settings → "Check for updates" + Auto-Check-on-Start
  - Native-Updates (z.B. neue expo-modules) gehen weiterhin nur über App-Store-Release
- **Cloud-Worker**:
  - Kein Auto-Update — manueller `gcloud run deploy` bei Code-Änderungen
  - Cloud Run macht automatisch Health-Check + Zero-Downtime-Rollout

---

## 📊 6. Datenmodell (Mobile)

### Project (`packages/mobile/src/data/demoProjects.ts`)
```ts
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  // Source
  sourceUri?, sourceUrl?, thumbUri?, mode?, videoType?, sourceType?,
  trimStart?, trimEnd?, createdAt?,
  // Regions / Layout
  facecamRegion?: {x,y,w,h} | null,
  gameplayRegion?: {x,y,w,h},
  splitRatio?: number,          // 0.2..0.8, default 0.4
  tiktokLayout?: 'stacked' | 'full' | 'split',
  // Clips
  clipOrder?: string[],
  // Add-Ons
  voiceOvers?: ProjectVoiceOver[],
  subtitles?: SubtitleSettings,
  musicTracks?: ProjectMusicTrack[],
  musicShuffle?: boolean,
  intro?: ProjectIntro,
  // Misc
  errorMessage?: string,
}

interface ProjectVoiceOver { path, startSec, volume, text?, voice? }
interface ProjectMusicTrack { path, filename?, volume }
interface ProjectIntro { path, filename?, mode?: 'before'|'overlay' }

interface SubtitleSettings {
  enabled, style: 'default'|'bold'|'gaming'|'fiano'|'layered',
  position?, customY?, fontFamily?, fontSize?, letterSpacing?, uppercase?,
  textColor?, highlightColor?, useGradient?, gradientFrom?, gradientTo?,
  strokeEnabled?, strokeWidth?, strokeColor?,
  glowEnabled?, glowBlur?, glowStrength?, glowColor?,
  shadowEnabled?, shadowOffsetX?, shadowOffsetY?, shadowColor?, shadowBlur?,
  metallic?, maxWordsPerChunk?, highlightWords?,
  // Layered-Style
  highlightUseGradient?, highlightGradientFrom?, highlightGradientTo?,
  highlightFontScale?, highlightDropShadow?, highlightMetallic?,
  highlightGlow?, highlightGlowColor?, highlightGlowStrength?,
}
```

### App-Settings (`packages/mobile/src/stores/appStore.ts`)
```ts
interface Region { x, y, w, h: number }  // 0..1
interface ExportSettings {
  fps: 24|30|60,
  resolution: '720p'|'1080p'|'4k',
  bitrate: '5M'|'10M'|'20M'|'40M'|'80M',
}
interface AppState {
  initializing, onboardingCompleted,
  facecamRegion: Region | null,
  gameplayRegion: Region,
  openaiKey: string,         // SecureStore: fiano.api.openai
  geminiKey: string,         // SecureStore: fiano.api.gemini
  exportSettings: ExportSettings,
}
```

### Shared Types (`packages/shared/src/types.ts`)
Desktop+Mobile shared: `TikTokLayout = 'full'|'stacked'|'split'`, `SubtitleStyle`, `SubtitleSettings`, `Highlight`, `ClipSegment`, `ClipEffects`, etc.

### FFmpeg-Args Shared Builder (`packages/shared/src/ffmpegArgs.ts`)
```ts
buildMobileExportArgs(opts)        // single-video legacy (deprecated)
buildTikTokExportArgs(opts)        // ↑ aktuelle main-Function
  - layout: 'stacked'|'full'|'split'
  - facecamRegion, gameplayRegion, splitRatio
  - sourceAudioVolume?, music?[], voiceOvers?[], subtitle?, intro?
  - return: string[] mit {SRC},{DST},{INTRO},{MUSIC_N},{VO_N} Platzhaltern
```

---

## 🐛 7. Bekannte Bugs / Limits (Stand 9.6.6)

| Bug / Limit | Status | Fix-Path |
|---|---|---|
| Multi-Input-Worker noch nicht gedeployed | User-Action pending | `gcloud run deploy --source .` |
| Intro 'overlay'-Mode mit x/y nicht implementiert | by-design (9.6.6.1) | overlay-Filter + Position-Picker |
| AI-Highlights ohne echte Detection | by-design (9.6.7) | Whisper-Pipeline |
| Builder Multi-Source-Concat fehlt | by-design (9.11) | Schema-Erweiterung + FFmpeg concat-demuxer |
| Alte Projekte ohne thumbUri zeigen schwarzen BG | by-design | Auto-Generate on-demand |
| Vivo V40 Lite HEVC mit 1 Decoder | env-dependent | Click-to-play implemented, beide Streams parallel laden — bei 2 HEVC könnte trotzdem trouble geben |
| Mobile-Cancel von laufendem Cloud-Render | by-design | Soft-Cancel (UI), Worker läuft bis MAX_DURATION_SEC |

---

## 🎯 8. Wichtige Designentscheidungen

- **16:9 Master-First** (Desktop) — Pipeline rendert IMMER 16:9 als Master pro Highlight, alles weitere (9:16, Builder-Concat) leitet davon ab
- **TikTok-Tab ≠ Builder** — TikTok = pro-Clip-Export mit Layout/Effects/Subs. Builder = Multi-Clip-Concat NUR für YouTube
- **Manual-Mode ohne AI** — Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local FFmpeg auf Mobile** (Phase 9.6) — wegen Patent-Risiko (MPEG LA) + Hardware-Constraints (Vivo OOM)
- **R2 statt Supabase Storage** — unlimited free egress vs. 2 GB/Monat
- **Click-to-play in Stacked-Preview** — vor User-Tap kein Video-Decoder aktiv
- **Mobile Files persistent** in documentDirectory (überlebt App-Restart)
- **safeStorage / SecureStore** für API-Keys — nie Klartext
- **Job Queue concurrency=1** (Desktop) — FFmpeg saturiert eh Hardware
- **Lazy-Load Native-Module** — alle expo-Module via try/catch + cached null. App boot auch ohne neuen Native-Build
- **Strict subtitle-flag-Checks** — `enabled === true` statt fallback-? um cross-effect Pollution zu vermeiden

---

## 💾 9. Storage / Folder / Git / Sync

### Speicherorte Mobile
```
expo-secure-store      — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute, Region-Defaults
AsyncStorage           — Projekte (fiano.projects), Notifications (fiano.notifications)
documentDirectory/imports/      — Source-Videos persistent
documentDirectory/thumbs/       — extrahierte Frame-Thumbnails
documentDirectory/voice-overs/  — TTS-MP3s
documentDirectory/exports/      — Cloud-Render-Results
cacheDirectory/        — Picker-Tempfiles (OS cleant)
```

### Speicherorte Desktop
```
userData/projects/{id}/exports/    — 16:9 Master-MP4s
userData/app-defaults.json         — facecam, gameplay, splitRatio
userData/api-key.enc + gemini-key.enc — safeStorage encrypted
```

### Cloud-Render Storage (R2)
```
fiano-renders/sources/{userId}/{projectId}/{kind}-{uuid}-{idx}.{ext}
  kinds: source.mp4, intro.mp4, music-0.mp3, voice-over-0.mp3, …
  Lifecycle: 1 Tag (auto-delete)

fiano-renders/outputs/{userId}/{projectId}/{jobId}.mp4
  Lifecycle: 7 Tage (User hat Zeit zum Download)
```

### Synchronisation Mobile ↔ Desktop
- **Geteilter Code**: `packages/shared/` — Änderungen wirken auf beide
- **Geteilte Auth**: Supabase, beide Plattformen sehen denselben User
- **Projekte sind LOKAL pro Plattform**: Cross-Sync wäre Phase 9.13
- **Settings nicht synced**: API-Keys, Capture-Regions, Export-Defaults sind PER-DEVICE

### Backups
- **Vor jeder Phase: git tag**. Aktuelle Tags (Auswahl): `pre-phase-9.5.1`, `pre-phase-9.5.2`, …, `pre-phase-9.6.1`
- **Rollback**: `git reset --hard <tag>` lokal
- **Worktree-Pattern**: Claude-Branches landen in `claude/<branch>/worktree`, User merged in main

---

## 🚀 10. Roadmap — Nächste Phasen

### Phase 9.6.7 — AI-Highlights via Whisper [HIGH]
- Server: neuer Endpoint `/v1/transcribe` mit OpenAI Whisper API
- Mobile: `lib/whisper.ts`, Project-Status-Workflow `analyzing → ready`
- Highlight-Algorithm: Audio-Spike-Detection (gaming) ODER LLM (podcast)
- Optional: client-side audio-extract via FFmpeg-on-Cloud-Run statt full source-upload

### Phase 9.6.6.1 — Intro Position Adjust [HIGH]
- DemoProject.intro: `{ scale, x, y }` analog Desktop's DEFAULT_INTRO_OVERLAY
- UI: Position-Picker im Add-Ons-Block (Top/Center/Bottom/Full + custom)
- FFmpeg overlay-filter `[main][introV]overlay=W*${x}:H*${y}:enable='between(t,0,${dur})'`

### Phase 9.11 — Multi-Clip Manual-Mode [HIGH]
- Project-Type-Erweiterung: `sourceUris: string[]` statt single
- BuilderTab unterstützt multi-source-concat (FFmpeg concat-demuxer)
- AddVideoProject „Import multiple clips"-Card aktivieren
- Drag-to-Reorder via `react-native-draggable-flatlist` (Native-Dep) — alternativ Up/Down-Buttons wie aktuell

### Phase 9.7 — Light-Theme [MEDIUM]
- Theme-Provider via Context oder Store
- Color-Tokens `lib/theme.ts` mit dark/light Maps
- Migration aller hardcoded `#0d0509`, `#f1f2f2`, `rgba(255,16,57,…)` zu Tokens
- Settings → Appearance: System/Dark/Light Switch
- BackgroundGlow-Variant für Light

### Phase 9.8 — Thumbnails-Page mit Gemini [MEDIUM]
- Sub-Tab oder Screen in ProjectDetail
- Game-Switcher (Fortnite/Warzone/Valorant/Custom)
- Prompt-Form + Reference-Image-Picker
- Gemini-API-Call mit `useAppStore.geminiKey`
- Auto-fetch models → Dropdown
- History-Gallerie pro Projekt

### Phase 9.9 — YouTube/Twitch-URL-Import [MEDIUM]
- Supabase Edge-Function `download-video` mit yt-dlp
- Mobile fetch'd Video als Stream → file://
- Status-Tracking während Download

### Phase 9.10 — Thumbnail-Generation on-demand [LOW]
- Library-/ProjectDetail-Mount: wenn alte Projekt-Daten ohne thumbUri
- Background `extractVideoThumbnail(sourceUri, 1000)` + `updateProject({ thumbUri })`

### Phase 9.12 — ExportSettings-Override-Modal [LOW]
- Vor Export-Click: Modal mit FPS/Resolution/Bitrate
- "Use settings defaults" vs "Custom this export"
- User pickt, dann start

### Phase 9.13 — Cross-Device-Sync [LOW]
- Supabase `projects`-Tabelle mit RLS
- Storage-Bucket für Source+Thumb
- Desktop pulls — und umgekehrt

### Phase 9.14 — Effects-System (Mobile) [LOW]
- `clip.effects: ClipEffects` analog Desktop
- TikTok-Tab + Builder-Tab Effects-Section
- FFmpeg-Filter `eq`, `colorbalance`, `unsharp`, `minterpolate`

### Phase 9.15 — Push-Token-Registrierung [LOW]
- Beim Login Expo-Push-Token holen
- In Supabase profile-Tabelle speichern
- Server-side Pushes via Edge-Functions

### Phase 9.16 — Auto-Update Mobile (EAS Update) [LOW]
- `eas update:configure` einrichten
- Setting → "Check for updates" Button
- Auto-Check-on-Start
- `eas update --channel production` bei jedem Release

---

**Letzter Stand (Stand: Phase 9.6.6 + UX-Fixes):**
- Worker-URL: `https://fiano-render-worker-491699066139.europe-west1.run.app`
- Branch: `claude/wizardly-merkle-27113a` (in main mergen)
- Cloud-Render End-to-End funktional (Stacked + Music + TTS + Subtitle + Intro)
- Live-Preview zeigt alle Add-Ons (Music/TTS hörbar, Intro sichtbar mit Restart-Replay)
- Bottom-Nav: Highlights/9:16/Builder öffnen direkt das zuletzt geöffnete Projekt
  via tabPress-Listener (preventDefault — kein Back-Button-Loop mehr)
- ExportSettings-Modal: Auflösung/FPS/Bitrate-Override vor jedem Export

**Aus alten Phasen 9.4.x noch offen:**
- 🟡 Google Sign-In (nur Email-Auth wired, OAuth über expo-auth-session fehlt)
- 🟡 Delete-Account-Flow (Stub-Alert — Supabase RPC noch nicht wired)
- 🟢 Onboarding-Tooltips (interaktive Spotlights — low priority)
- 🟡 Builder Multi-Source-Concat (im Add-Dialog "Multi-Clip" mit SOON-Badge) → Phase 9.11
- 🟡 Highlights AI-Detection (Whisper-Pipeline) → Phase 9.6.7
- 🟡 YouTube/Twitch URL-Import (Stub mit Coming-Soon-Alert) → Phase 9.9

**Erledigt in 9.5-9.6:**
✅ Stacked-Preview + Region-Crops + Aspect-Fix
✅ Audio-Mix (Music + TTS + Source) — Server + Mobile-Preview
✅ Subtitle-Burn-In via drawtext (Placeholder-Text bis Whisper, dann echte Cues)
✅ Intro-before-Mode (concat) — Preview mit Pre-Mount + Restart-Replay
✅ TTS-Modal mit OpenAI (Sprache/Gender/Voice/Text)
✅ Subtitle-Styling (30+ Properties, SVG-Gradient/Metallic/Glow/Shadow,
   ColorPicker-Popup mit Hex+RGB+Presets, 15+ Android-System-Fonts)
✅ Cloud-Render-Worker auf Cloud Run + Cloudflare R2 Storage
✅ ExportSettings-Modal vor Export (Resolution/FPS/Bitrate + "Save as default")
✅ Tab-Navigation: Bottom-Tabs öffnen direkt das letzte Projekt im richtigen Tab

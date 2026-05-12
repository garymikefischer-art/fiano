# 📋 PROJECT SUMMARY — fiano (Mobile + Desktop Hybrid)

> **Letzter Update: 2026-05-12** — Phase **9.5.7 / 9.5.8 / 9.6.7a-g / 9.8** abgeschlossen.
> Cloud-Render läuft, Whisper-AI-Highlights + Cue-Editor + Subtitle-Burn-In live,
> Multi-Clip-Import + YouTube/Twitch-URL-Download + Gemini-Thumbnails wired.
> **Pausiert vor:** Builder-Tab Add-Ons (Subtitles/TTS/Music/Intro persistent +
> Concat-Export). Plus Intro x/y Slider, Light-Theme, Effects, Auto-Update.

---

## 🏗 1. Architektur

### Monorepo-Struktur
```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                         ← Desktop (Electron 31 Main + Renderer)
│   ├── main/                    ← Electron Main (Node 22, CommonJS)
│   │   ├── core/pipeline/       ← FFmpeg, Whisper, Highlights, Audio-Energy
│   │   ├── ipc.ts               ← IPC-Handler (gemini, thumbnail, etc.)
│   ├── preload/                 ← Context-Bridge
│   └── renderer/                ← Vite + React + Tailwind UI (HashRouter)
│       └── pages/ThumbnailPage.tsx  ← Gemini Thumbnails (8 Genres, Comic/Realistic-Styles)
├── packages/
│   ├── shared/                  ← Plattform-neutral, automatisch geteilt
│   │   ├── src/types.ts         ← Project, Highlight, ClipSegment, …
│   │   ├── src/subtitles.ts     ← Cue-Parser
│   │   ├── src/i18n/            ← 9 Locales (de/en/it/ru/es/fr/pt/nl/pl)
│   │   └── src/ffmpegArgs.ts    ← Pure-TS FFmpeg-Arg-Builder
│   │                              buildTikTokExportArgs (9:16, multi-cue subs,
│   │                              audio-mix, intro, multi-source-concat,
│   │                              fullOffsetX)
│   └── mobile/                  ← Expo SDK 52 + React Native 0.76
│       ├── src/screens/         ← Home/Library/ProjectDetail/Export/
│       │                          AddVideoProject/Settings/ThumbnailGenerator
│       ├── src/components/      ← VideoPlayer, RegionCroppedVideoPlayer,
│       │                          StackedSplitPreview, FullModePreview,
│       │                          SubtitleSettingsModal, CueEditorModal,
│       │                          YouTubeLoginModal, LiquidGlassTabBar,
│       │                          VoiceOversSection, MultiAudioPicker
│       ├── src/stores/          ← Zustand: auth/app/projects/notifications/jobs
│       ├── src/lib/             ← supabase, whisper, gemini, youtube, tts,
│       │                          renderJob, thumbnails, sounds, haptics
│       ├── app.config.js        ← largeHeap=true Plugin (Vivo-Compat)
│       └── app.json             ← Expo Base + scheme=fiano (für OAuth)
└── services/
    └── render-worker/           ← Cloud Run FFmpeg-Worker (separates Deploy)
        ├── Dockerfile           ← Node 22 + apt FFmpeg + yt-dlp binary
        └── src/
            ├── index.ts         ← Express + /v1/upload-url + /v1/render +
            │                       /v1/download + /v1/transcribe
            ├── render.ts        ← FFmpeg-spawn mit Timeout + stderr-parser
            ├── transcribe.ts    ← Audio-Extract + Whisper API + highlight-detect
            ├── highlights.ts    ← SHORT+LONG-Profile mit ~190 Phrasen + Audio-Peaks
            ├── audioEnergy.ts   ← ffmpeg ebur128 → 1Hz LUFS-Buckets
            ├── youtube.ts       ← yt-dlp wrapper (Cookie-Support + Bot-Workaround)
            ├── auth.ts          ← Supabase JWT-Middleware
            └── r2.ts            ← Cloudflare R2 S3-Client
```

### Tech Stack

**Desktop (Electron):** Electron 31 + TypeScript-strict + React 18 + Tailwind + Zustand + react-router HashRouter, bundled FFmpeg per-arch, bundled yt-dlp, electron-updater, Supabase + Stripe + Resend SMTP. 9 Sprachen. **v0.2.0.**

**Mobile (Expo):** Expo SDK 52, React Native 0.76, React-Navigation v7, Zustand, expo-av, react-native-video v6, react-native-svg. expo-haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library. expo-web-browser + expo-linking (Google OAuth). react-native-webview + @react-native-cookies/cookies (YouTube In-App-Login). Supabase JS SDK.

**Cloud-Render (Google Cloud Run):** Express + Node 22 + apt FFmpeg + yt-dlp binary. Cloudflare R2 Storage (S3-API, unlimited free egress). Multi-Input-Pipeline mit Platzhalter `{SRC}` / `{SRC_N}` / `{INTRO}` / `{MUSIC_N}` / `{VO_N}` / `{DST}`. Endpoints: `/health`, `/v1/upload-url`, `/v1/render`, `/v1/download` (yt-dlp), `/v1/transcribe` (Whisper).

**Kostenmodell:** Cloud Run scale-to-zero (~0-15€/Monat MVP). R2 unlimited free egress. OpenAI Whisper + Gemini: User's API-Keys.

---

## ✅ 2. FERTIG (alles getestet, in main gemerged)

### Auth + i18n
- Email-Login/Signup via Supabase
- **Google OAuth** via expo-web-browser + Supabase signInWithOAuth (in-app-Browser, redirect via `scheme: 'fiano'`)
- **Delete-Account** via `/functions/v1/delete-account` Edge-Function
- 9-Sprachen i18n + Device-Locale-Detection
- Onboarding-Slides (kein Spotlight-Tour)

### Navigation + UI
- BottomTab-Liquid-Glass-Bar mit BlurView + 6 Tabs (Home/Projects/Highlights/9:16/Builder/**Thumbs**)
- Quick-Open-Listener: Clips/TikTok/Builder/Thumbs öffnen last-opened-Project mit korrektem initialTab
- Bottom-Nav dunkler Glass-Look (`rgba(15,15,18,0.42)`)
- Logo bündig mit Body-Title (paddingHorizontal=20, marginLeft=-9 für SVG-inner-padding)

### Project-Workflow
- AddVideoProject mit Modi: Quick 9:16 / Single File / YouTube/Twitch URL / Multi-Clip Import
- ProjectDetail mit 4 Tabs: Highlights / Manual / 9:16 / Builder
- Library: Grid mit Project-Cards inkl. **Re-Analyze ✨-Button**

### Phase 9.5.7 — YouTube/Twitch URL-Import ✅
- Cloud-Worker `/v1/download` mit yt-dlp binary
- Bot-Detection-Workaround: `--extractor-args player_client=tv_embedded,web` + Desktop-UA
- **Cookie-Support**: Manual-Paste in Settings → API-Keys ODER in-app `YouTubeLoginModal` (WebView + CookieManager → camelCase Cookie-Conversion → AsyncStorage). Cookies per Request mitgesendet + temp-File für yt-dlp.

### Phase 9.5.8 — Multi-Clip Import ✅
- `pickMultipleVideosFromGallery` + `pickMultipleVideosFromFiles` (Source-Auswahl)
- Schema: `DemoProject.sourceUris?: string[]`
- 9:16-Tab Clip-Selector oben mit Thumbnails (horizontal-scroll, tap = switch source)
- Server: `inputs.sources[]` → `{SRC_N}` Platzhalter
- ffmpegArgs: pre-scale + concat-Filter bei `opts.srcs.length >= 2`

### Phase 9.6.6 / 9.6.6.1-partial — 9:16-Layout ✅
- Layout-Modes: stacked / full / split
- **Full-Layout horizontaler Offset-Slider** (0..1) — Video shiftet links/rechts
- FullModePreview: Custom-Player mit Tap-Play, Controls außerhalb der transformed View
- TikTokTab Clip-Selector mit Thumbnails (auto-retry-extract bei mount)
- `seekToSec` prop in LayoutPreview → Highlight-Clip-Click springt zur Position
- Subtitle-Burn-In via drawtext (cues-array)
- Intro 'before'-Mode (concat) + 'overlay'-Mode (**nur top/center/bottom/full Position**)
- Audio-Mix: Music + TTS + Source (`amix duration=first` — Output kappt bei Source-Ende)

### Phase 9.6.7a — Whisper-Pipeline ✅
- Server `/v1/transcribe`: Audio-extract (mp3 mono 16kHz 64kbps) + OpenAI Whisper verbose_json
- Mobile `lib/whisper.ts`: upload + transcribe + cache transcript.json
- HighlightsTab "AI Analysis Box" mit Status / Progress / Re-Analyze
- **CueEditorModal**: editable Cards mit Time-Range + multiline TextInput + Delete
- Edit-Cues-Button im 9:16-Tab DIREKT (rot) + im SubtitleSettingsModal
- ExportScreen: cues → drawtext `enable=between(t,start,end)` Multi-Cue-Burn-In

### Phase 9.6.7b — Audio-Energy + Desktop-Phrase-Port ✅
- `audioEnergy.ts`: ffmpeg ebur128 → 1Hz LUFS-Buckets → Peak-Detection
- `highlights.ts`: ~130 KILL_PHRASES + ~60 REACTION_PHRASES (DE+EN, direkt aus Desktop)
- Score: text-density + kill×1.3 + reaction×1.2 + audio-peak×1.6

### Phase 9.6.7c — Library Re-Analyze ✅
- ProjectCard sparkles-Button → Confirm-Alert → Whisper+Highlight neu
- analyzingProjectId-Lock (eine project at-a-time)

### Phase 9.6.7d — SHORT/LONG-Profile-Splitting ✅
- `detectHighlights(cues, audioPeaks, mode)` mit `'gaming'|'podcast'|'auto'`
- SHORT (6-20s) Gaming, LONG (20-60s) Podcast, AUTO mergt+deduplexe
- `videoType` aus project.videoType (AddDialog setzt)

### Phase 9.6.7e — Custom Subtitle-Presets ✅
- `appStore.customSubtitlePresets[]` persistent (AsyncStorage)
- SubtitleSettingsModal Section "MY PRESETS" + "Save Current" mit Name-Modal
- Tap = apply (style übernehmen, cues + enabled bleiben)
- Long-Press = Delete-Confirm
- **Style-Preset-Click resetted alle Properties auf DEFAULT** (preserve nur enabled + cues)

### Phase 9.6.7f — Highlight-Click Seek + Full-Slider-Controls-Fix ✅
- LayoutPreview key inkludiert `effectiveTrimStart` → re-mount bei Clip-Wechsel
- FullModePreview + StackedSplitPreview seek-on-load auf clip.startSec
- Full-Slider verschiebt NUR Video, Controls bleiben fix

### Phase 9.6.7g — Glass-Effect + Subtitle-Chunking + Persistence ✅
- `chunkCueByWords()` in ExportScreen: cue split in N-Wort-Chunks (`maxWordsPerChunk`)
- Bei `useGradient`: `gradientFrom` als single fontColor (Approximation)
- `flushProjectsNow()` await nach Analyze → AsyncStorage-write garantiert vor App-Kill

### Phase 9.8 — Gemini Thumbnail Generator ✅
- Eigener Screen via Modal-Stack (`nav.navigate('ThumbnailGenerator')`)
- 8 Genres (**Custom als erstes**, Battle Royale, Modern Combat, Tactical, Competitive, Sandbox, Crime, MOBA)
- Custom-Mode: Style-Dropdown (Default / Comic / Realistic) mit hardcoded Fortnite/Warzone-References
- **Prompts 1:1 Desktop-Port** mit "Replace face with provided photo" + FACE & HAIR STRICT + FACE DETAILS + EYES + HANDS + BACKGROUND/EFFECTS/WEAPONS Sections
- 3 Prompt-Felder + Reference-Image-Picker (quality 0.5 = ~200-400 KB)
- Multi-Model-Try: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, `gemini-2.0-flash-preview-image-generation`, etc.
- 120s timeout (Mobile-Network-tolerant)
- Pass-2-Fallback ohne Ref bei `anyNoImage` (Safety-Block)
- History-Gallery (max 30) per Project, Save-to-Gallery via expo-media-library
- Thumbs-Tab in BottomNav als 6. Tab (quickOpenThumbs → ThumbnailGenerator)

---

## 🟡 3. TEILWEISE FERTIG

### Builder-Tab — UI vorhanden, Add-Ons local statt persistent, Export-Button = Alert
**Status:** State (tts, musicTracks, intro) ist **lokal**, geht bei Tab-Wechsel verloren.
**Fehlt:**
- Subtitle-Toggle + Modal + Edit-Cues (analog 9:16-Tab)
- VoiceOversSection statt simple Toggle (TTS-Modal mit OpenAI)
- State alles persistent auf `project.*`
- Echter Concat-Export: per-clip trim + concat + 16:9 1920x1080 Output
- `ffmpegArgs.ts`: neuer `buildBuilderExportArgs()` mit trim-Filter pro Clip + concat-Filter
- ExportScreen: detect builder-mode via `params.builderClips` → buildBuilderExportArgs

### Intro x/y Position (Phase 9.6.6.1)
**Status:** Aktuell nur 4 Presets (top / center / bottom / full).
**Fehlt:** Slider für x (0..1) + y (0..1) für pixel-genaue Position im overlay-mode.
- Schema: `ProjectIntro.x?: number, y?: number, scale?: number`
- TikTokTab + BuilderTab: 2 SimpleSliders bei overlay-mode
- ffmpegArgs: overlay-Filter mit `x=W*${x}:y=H*${y}`

### Subtitle Style ≠ Export-Style
**Status:** Preview zeigt Gradient/Glow/Shadow/Layered via SVG. Export drawtext kann nur Color + Stroke + Position.
**Fehlt:** libass + .ass-Subtitles für volle Style-Parität (Phase 9.6.7h, ~6-8h).

---

## 📋 4. Offene TODOs (priorisiert)

### 🔴 Hoch — direkter User-Wunsch
1. **Builder-Tab vollwertig** (Subtitles/TTS/Music/Intro persistent + Concat-Export 16:9)
2. **Intro x/y Slider** (Phase 9.6.6.1)
3. **Subtitle libass** für full Preview-Export-Parität (Phase 9.6.7h)

### 🟡 Mittel — Roadmap
4. **Phase 9.10** Thumbnail-on-demand für alte Library-Cards
5. **Phase 9.7** Light-Theme via Theme-Tokens (Settings → System/Dark/Light)
6. **Phase 9.14** Effects-System Mobile (`eq`, `colorbalance`, `unsharp`, `minterpolate`)
7. **Phase 9.13** Cross-Device-Sync (Supabase projects-table + Storage)

### 🟢 Niedrig — Pre-Launch
8. **Phase 9.16** Auto-Update Mobile (EAS Update JS-only-OTA)
9. **Phase 9.17** RevenueCat IAP (Apple/Google verlangen für digitale Subs)
10. **Phase 9.15** Push-Token-Registrierung beim Login

### 📌 Desktop-Feature-Audit (TODO)
Was fehlt noch auf Mobile vom Desktop?
- Color-Correction-UI
- Effects-Presets-Manager
- Multi-Camera-Sync
- Audio-Ducking (auto-leiser bei TTS)
- Watermark-Burn-In
- YouTube-Direct-Upload
- Custom-Subtitle-Style-Templates (über 5 Defaults hinaus)

---

## 📊 5. Datenmodell

### DemoProject (`packages/mobile/src/data/demoProjects.ts`)
```typescript
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  // Source
  sourceUri?, sourceUris?, sourceUrl?, thumbUri?, sourceType?,
  mode?: 'highlights'|'manual'|'tiktok'|'builder',
  videoType?: 'gaming'|'podcast'|'auto',
  trimStart?, trimEnd?, createdAt?,
  // Regions / Layout
  facecamRegion?: {x,y,w,h} | null,
  gameplayRegion?: {x,y,w,h},
  splitRatio?,
  tiktokLayout?: 'stacked'|'full'|'split',
  fullOffsetX?: number,
  clipOrder?: string[],
  // Add-Ons (persistent auf project)
  voiceOvers?: ProjectVoiceOver[],
  subtitles?: SubtitleSettings,
  musicTracks?: ProjectMusicTrack[],
  musicShuffle?: boolean,
  intro?: ProjectIntro,
  thumbnailHistory?: string[],   // Phase 9.8
  errorMessage?: string,
}

interface SubtitleSettings {
  enabled, style, position, customY,
  fontFamily, fontSize, letterSpacing, uppercase,
  textColor, highlightColor, useGradient, gradientFrom, gradientTo,
  strokeEnabled, strokeWidth, strokeColor,
  glowEnabled, glowBlur, glowStrength, glowColor,
  shadowEnabled, shadowOffsetX, shadowOffsetY, shadowColor, shadowBlur,
  metallic, maxWordsPerChunk, highlightWords,
  cues?: SubtitleCue[],          // Phase 9.6.7a — Whisper-Output
  // + 9 layered-specific properties
}

interface SubtitleCue { startSec, endSec, text }
interface ProjectIntro { path, filename?, mode?: 'before'|'overlay' }
// TODO Phase 9.6.6.1: + x?: number, y?: number, scale?: number
```

### appStore (`packages/mobile/src/stores/appStore.ts`)
```typescript
interface AppState {
  facecamRegion, gameplayRegion,
  openaiKey, geminiKey, youtubeCookies,
  customSubtitlePresets: CustomSubtitlePreset[],  // Phase 9.6.7e
  exportSettings: { fps, resolution, bitrate },
  lastOpenedProjectId,
}
```

### FFmpeg-Args (`packages/shared/src/ffmpegArgs.ts`)
```typescript
buildTikTokExportArgs(opts: TikTokExportOpts, platform): string[]
  - layout: 'stacked'|'full'|'split'
  - facecamRegion, gameplayRegion, splitRatio, fullOffsetX
  - srcs?: string[]               // multi-clip-concat
  - subtitle?: { cues?, ... }     // multi-cue burn-in
  - music, voiceOvers, intro
  - returns Array<string> mit Platzhaltern {SRC}, {SRC_N}, {DST}, ...
// TODO: buildBuilderExportArgs(opts) für 16:9 + per-clip-trim + concat
```

---

## 🐛 6. Bekannte Bugs / Limits

| Bug | Status | Fix-Path |
|---|---|---|
| Builder-Tab Add-Ons local statt persistent | offen | State auf `project.*` umstellen |
| Builder-Export = Alert-Stub | offen | `buildBuilderExportArgs` + ExportScreen-mode |
| Intro overlay nur 4 Presets | offen | x/y Slider Phase 9.6.6.1 |
| Subtitle Preview ≠ Export bei Gradient/Glow/Shadow | by-design | libass Phase 9.6.7h |
| Vivo HEVC 1 Decoder | hardware | beide Streams parallel sequenziell laden |
| Google in-app-WebView blockt oft "browser not secure" | platform | Manual-Paste-Cookie-Fallback |
| Thumbnail 503 (Google overloaded) | external | User: retry in 2-5min |

---

## 🎯 7. Wichtige Designentscheidungen

- **Server-Side Audio-Extract** für Whisper (Mobile hat kein FFmpeg)
- **User's API-Keys** statt Server-Side — User trägt Kosten
- **Cloud-Render statt Local FFmpeg auf Mobile** — Patent-Risiko (MPEG LA) + Hardware-OOM (Vivo)
- **R2 statt Supabase Storage** — unlimited free egress
- **TikTok-Tab ≠ Builder** — TikTok=pro-Clip-9:16, Builder=Multi-Clip-Concat-16:9
- **subtitles/voiceOvers/musicTracks/intro shared via project.*** — Tabs lesen denselben State
- **Strict `enabled === true`** für subtitle-flags vermeidet cross-effect Pollution
- **16:9 Master-First** (Desktop) — alles weitere leitet davon ab

---

## 🔄 8. Workflow — wie änderst du Code?

### Wann ändert man wo?

| Code-Bereich | Wirkt auf | Wann editieren |
|---|---|---|
| `packages/shared/src/` | Desktop **+** Mobile (auto) | Types, i18n, FFmpeg-Args, Subtitle-Parser |
| `src/` (Desktop) | NUR Desktop | Electron UI / IPC / Main-Process |
| `packages/mobile/src/` | NUR Mobile | RN Screens, Components, Stores, Lib |
| `services/render-worker/src/` | NUR Cloud-Worker | Express-Endpoints, FFmpeg-Wrapper |

### Mobile-Workflow

**JS-only-Änderung:**
```bash
cd packages/mobile
npm run start:clear        # Metro mit Cache-Reset
# Im Metro-Terminal: r → Reload auf Phone
```

**Native-Änderung (neue expo-* Dep ODER app.json-Plugin):**
```bash
cd packages/mobile
rm -rf .expo android
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
# 3-5 min beim ersten Mal
```

### Desktop-Workflow
```bash
npm run dev              # electron-vite dev
npm run build:mac        # DMG für Apple Silicon + Intel
npm run release:mac      # bauen + GitHub-Releases-Upload (triggert electron-updater)
```

### Cloud-Render-Worker-Workflow
```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . \
  --region europe-west1 --memory 2Gi --cpu 2 --timeout 600 \
  --max-instances 10 --min-instances 0
# Logs: gcloud run services logs read fiano-render-worker --region europe-west1 --limit 50
```

### Git-Workflow

**Claude arbeitet im Worktree-Branch** `claude/<id>` unter `.claude/worktrees/<id>/`. Branch wird zu origin gepusht.

**User merged manuell in main:**
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git checkout main
git fetch origin
git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
git push origin main
```

**Conflict-Prevention:** Bei uncommitted Work im Root-Repo: `git stash → merge → git stash pop`. Claude kann das automatisch — einfach sagen.

**Backup-Tags vor größeren Phasen:**
```bash
git tag pre-phase-9.X-backup
git push --tags
# Rollback: git reset --hard pre-phase-9.X-backup
```

**Letzte Backup-Tags:**
- `pre-phase-9.6.7-backup` (vor Whisper)
- `pre-phase-9.8-completed-backup` (vor Builder-Refactor, NEU 2026-05-12)

---

## 🚀 9. Auto-Update-Strategie

### Desktop (vollständig wired ✅)
```bash
git tag v0.2.X && git push --tags
npm run release:mac          # Build + GitHub-Releases-Upload
# Bestehende Installs prüfen via electron-updater + ziehen automatisch
```

### Mobile (NICHT wired, Phase 9.16 ❌)
**Aktuell:** Jede Mobile-Änderung erfordert `expo run:android` Re-Install bei Native-Deps; bei JS-only reicht `npm run start:clear` + Reload.

**Geplant (Phase 9.16):** EAS Update für JS-only-OTA.
```bash
eas update:configure                # einmalig
eas update --channel production     # pro Release
```
- **Native Code Changes** → MUSS App Store / Play Store (EAS umgeht das nicht)
- **JS-only Bugfixes** → EAS spart 1-3 Tage Apple/Google-Review
- **Cost:** $99/Monat (Production) oder 1000 free updates/Monat

### Cloud-Worker (manuell, immer nach Code-Changes)
```bash
cd services/render-worker
gcloud run deploy --source .
# Zero-Downtime-Rollout, env-vars bleiben
```

---

## 🎬 10. Quick-Reference (Stand 2026-05-12)

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Phone-Serial:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Mediatek, 256 MB heap, `largeHeap=true`)
- **Working Dir (IMMER):** `/Users/garyfischer/Downloads/fiano-monorepo/`
- **GitHub:** `garymikefischer-art/fiano`
- **Letzter merged-Stand:** Phase 9.8 + 9.5.7 + 9.5.8 + 9.6.7a-g (12+ Commits seit cedc8f8)
- **Letzter Backup-Tag:** `pre-phase-9.8-completed-backup`

**Empfohlener nächster Schritt:** Builder-Tab vollwertig (Subtitles/TTS/Music/Intro persistent + Concat-Export). Alle nötigen Bausteine vorhanden (TikTokTab-Pattern, shared/ffmpegArgs.ts erweitern).

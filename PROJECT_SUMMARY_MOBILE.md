# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-20** — Block A+B+C komplett (C1-C7 shipped, C8+C9 deferred). Mobile in sehr solidem Pre-Launch-Stand.
> Branch: `claude/sweet-ride-0781e6` (HEAD `39bf7c8`).
> Backup-Tags: `pre-context-handoff-20260520`, `pre-phase-c5c6c7-batch-backup`, `pre-phase-c4-backup`, `pre-phase-c1.b-backup`.

---

## 1. Architektur

### Tech-Stack

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, react-router HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase Auth+DB, Stripe, Resend SMTP. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, RN 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library/web-browser/linking, react-native-webview, @react-native-cookies/cookies, Supabase JS SDK, react-native-reanimated 3.16, react-native-draggable-flatlist 4.0.3. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp). Cloudflare R2 (S3-API). Worker rev `00034-kdv`. |

### Wichtige Systeme

- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range-Support + path-validation (A6.8)
- **Job Queue** (Desktop, `core/queue.ts`): serialisiert FFmpeg-Pipelines (concurrency=1)
- **IPC Layer**: typed Channels `IpcResponse<T>`
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT
- **Settings**: Desktop userData/*.json + safeStorage; Mobile expo-secure-store mit chunked-Adapter (B3.6 — 1.9 KB pro chunk) + AsyncStorage
- **Mobile File-Persistence**: `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails,watermarks}/`

### Cloud-Render-Pipeline

```
Mobile/Desktop          Google Cloud Run          Cloudflare R2
─────────────          ────────────────          ─────────────
POST /v1/upload-url  → pre-signed PUT (30/min)
PUT file             ────────────────────→ sources/{user}/...
POST /v1/render      → A6.4 typed RenderSpec — Worker baut args[] selber
                        ├ download from R2 ←
                        ├ ffmpeg ${args} (-threads 0 -filter_complex_threads 4)
                        ├ upload result   ──→ outputs/{user}/...
                        └ signed DL-URL
POST /v1/download    → yt-dlp (10/min)
POST /v1/transcribe  → Whisper word-timestamps
```

**Kosten**: Cloud Run scale-to-zero, R2 unlimited free egress.

---

## 2. Ordnerstruktur (Monorepo)

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                            ← Desktop (Electron Main + Renderer)
│   ├── main/                       ← Electron Main-Prozess
│   ├── preload/                    ← contextBridge
│   └── renderer/                   ← Vite + React + Tailwind (Desktop UI)
├── packages/
│   ├── shared/                     ← Geteilt Desktop+Mobile (Symlink-Monorepo)
│   │   └── src/
│   │       ├── types.ts            ← Project, Highlight, ClipEffects, SubtitleSettings
│   │       ├── ffmpegArgs.ts       ← Plattform-neutral; buildEffectsFilter() + buildTikTokExportArgs()
│   │       ├── assBuilder.ts       ← libass mit \t() Big-Word-Zoom (C7)
│   │       ├── subtitles.ts        ← SubtitleCue + Transcript-Parser
│   │       └── i18n/locales/       ← 9 Sprachen
│   └── mobile/                     ← Expo + React Native
│       ├── App.tsx                 ← Root: Auth/Tabs/Theme; LogBox + console-Patch
│       ├── babel.config.js         ← reanimated/plugin LAST
│       ├── metro.config.js         ← Workspaces + disableHierarchicalLookup
│       └── src/
│           ├── screens/            ← ProjectDetail (4 Tabs), Library, Home, Settings,
│           │                        Pricing, ThumbnailGenerator, Help, Legal, ExportScreen
│           ├── components/         ← VideoPlayer (+EffectsOverlay+WatermarkOverlay),
│           │                        ActionSheet, SubtitleSettingsModal, ExportSettingsModal,
│           │                        CueEditorModal, RegionPickerModal, MultiAudioPicker,
│           │                        ClipEffectsSection (+ColorWheelsBlock), TrimModal,
│           │                        VoiceOversSection (+Auto-Duck), TtsModal, SimpleSlider
│           ├── stores/             ← Zustand: app (themeMode!), auth (mit Plan-Counter),
│           │                        projects (mit watermark+effectsAll+chromakey)
│           ├── lib/                ← supabase (chunked!), features, theme (B3), renderJob,
│           │                        mediaPicker (Gallery+Files+pickImageForWatermark)
│           ├── navigation/         ← Root + MainTabs Param-Types
│           └── data/demoProjects.ts ← DemoProject, DemoClip, ClipEffects, ProjectWatermark
└── services/
│   └── render-worker/              ← Cloud Run FFmpeg-Worker
│       └── src/
│           ├── index.ts            ← Express + Endpoints + Rate-Limit + watermark upload
│           ├── auth.ts             ← Supabase JWT-Middleware
│           ├── r2.ts               ← Cloudflare R2 (S3 via @aws-sdk)
│           ├── render.ts           ← FFmpeg-spawn + Timeout + -threads 0 + -filter_complex_threads 4
│           ├── transcribe.ts       ← Whisper word-timestamps
│           ├── highlights.ts       ← Gaming + Podcast SHORT/LONG
│           ├── youtube.ts          ← yt-dlp wrapper
│           ├── renderSpec.ts       ← A6.4 typed Spec-Validator (mit effects+chromakey+watermark)
│           ├── ffmpegArgs.ts       ← ⚠️ Worker-Copy of shared (sync bei Updates!)
│           ├── planCheck.ts        ← A6.3 Plan-Quota-Enforcement (creator=30/pro=200)
│           └── assValidator.ts     ← A6.2 .ass content-validation
└── supabase/
    ├── config.toml
    ├── functions/                  ← stripe-checkout, stripe-portal, stripe-webhook, delete-account
    └── migrations/
        ├── 001_rls_baseline.sql
        ├── 002_render_quota.sql    ← render_usage table + check_and_increment_render_quota RPC
        └── 003_stripe_events_dedupe.sql
```

### Code-Propagation
- **`packages/shared/`** → wirkt auf BEIDE Plattformen automatisch (Symlink-Monorepo)
- **`src/`** → nur Desktop
- **`packages/mobile/`** → nur Mobile
- **`services/render-worker/`** → nur Cloud-Worker (separates Deploy)

**Bei Änderungen für BEIDE Plattformen:**
- Logik/Types/i18n → **packages/shared/src/**
- Desktop-spezifisches UI → **src/renderer/src/**
- Mobile-spezifisches UI → **packages/mobile/src/**

**⚠️ KRITISCH:** `services/render-worker/src/ffmpegArgs.ts` ist eine **eigene Kopie** von `packages/shared/src/ffmpegArgs.ts` (Worker hat keine @fiano/shared dep). Bei JEDER Änderung an shared ffmpegArgs muss man BEIDE Files syncen. Diff sollte nur TikTokLayout-Block-Wrapper sein.

---

## 3. Git-Workflow + Deploy

### Claude-Worktree-Pattern

Claude arbeitet in `claude/<branch-id>` unter `.claude/worktrees/<branch-id>/`.

**User merged in main:**
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git fetch origin
git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
git push origin main
```

Bei "divergent branches" Error: `git fetch + git merge --no-ff`, NICHT `git pull`.

Bei "Your local changes would be overwritten": `git restore --staged --worktree <files>` (unstaged + working-tree reset), dann merge.

### Backup-Strategie

```bash
# VOR jeder größeren Phase:
git tag pre-phase-X.Y-backup && git push origin pre-phase-X.Y-backup
# Rollback (nur eigener branch!):
git reset --hard pre-phase-X.Y-backup
```

**Aktuelle Backup-Tags:** `pre-context-handoff-20260520` (HEAD `39bf7c8`), `pre-phase-c5c6c7-batch-backup`, `pre-phase-c4-backup`, `pre-phase-c1.b-backup`.

### Auto-Update-Strategien

| Plattform | Mechanismus | Status |
|---|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater | ✅ wired |
| **Mobile** | EAS Update für JS-only-OTA | ❌ **Phase D2 (pending)** |
| **Cloud-Worker** | `gcloud run deploy` manuell | ✅ wired |

**Desktop Release:**
```bash
git tag v0.2.X && git push --tags
npm run release:mac
```

**Mobile Native-Rebuild** (nach neuer Dep oder app.json-Plugin):
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
```

**Worker Deploy:**
```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 900 --max-instances 10 --min-instances 0
```

**⚠️ CPU-Quota:** `CpuAllocPerProjectRegion allowed: 20000 mCPU` → `cpu=4 × instances=10 = 40000` sprengt Quota. Max: `cpu=2 × instances=10` ODER `cpu=4 × instances=5`.

**Wichtig:** Mobile vom **Main-Repo** starten (`cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile`), nicht aus worktree (keine node_modules).

---

## 4. Features die FERTIG sind

### Block A — Security (A1 + A6.1-A6.10 ✅)
RLS aktiv, Worker Rate-Limit per-userId (upload 30, render 5, transcribe 5, download 10/min), .ass-Validation, Plan-Check + monthly counter, A6.4 typed RenderSpec, Logs sanitisiert, Stripe-Webhook dedupe, yt-dlp gehärtet, Electron CSP, R2 path-regex, YT-Cookies SecureStore. 📄 `SECURITY_AUDIT_2026-05-16.md`.

### Block B — Quality-of-Life (B0-B5 ✅)
B0 Trim+Split-at-playhead, B1 Drag-Reorder Builder, B2 Drag-to-Seek, B3 Light/Dark/System-Theme komplett, B5 TrimModal mit Multi-Range.

### Block C — Effects + Watermark + Greenscreen (C1-C7 ✅)

**C1 — Effects-System (A+B+C)**
- ClipEffects: brightness/contrast/saturation/sharpen/motionBlur/colorWheels
- Mobile UI: ClipEffectsSection mit SliderBlock + Pro-Lock + ColorWheelsBlock (9 sliders R/G/B × Lift/Gamma/Gain)
- Worker FFmpeg: `eq=brightness/contrast/saturation` + `unsharp` + `minterpolate+tmix+fps` (Motion-Blur Optical-Flow) + `colorlevels` + `eq=gamma_r/g/b`
- Live-Preview via VideoPlayer-Overlay (brightness/contrast Approximation)

**C4 — Audio-Ducking**
- ProjectVoiceOver.autoDuck (default true), UI Toggle in VoiceOversSection
- Worker FFmpeg `asplit` + `apad=pad_dur=3600` + `sidechaincompress=threshold=0.05:ratio=8:attack=20:release=250`

**C5 — Watermark Overlay**
- ProjectWatermark { path, position(tl/tr/bl/br), opacity, scale }
- Mobile UI: WatermarkSection + pickImageForWatermark + 2×2 position-grid + opacity/scale slider
- Worker FFmpeg: `scale + colorchannelmixer=aa=opacity + overlay`
- Live-Preview: WatermarkOverlay Component (RN Image, parent-width onLayout → pixel-size)

**C5-Intro — Greenscreen (Chromakey)**
- ProjectIntro.chromakey { color, similarity, blend } (default green #00ff00 / 0.18 / 0.08)
- Mobile UI: Toggle nur in overlay-Mode + Tolerance-Slider (5-50%)
- Worker FFmpeg: `chromakey=COLOR:sim:blend` + `despill=type=green:mix=0.6` (kein grüner Saum)
- Intro-Audio im overlay-Mode jetzt mit `atrim=duration={overlayDur} + afade out 300ms`

**C6 — Color-Wheels (Lift/Gamma/Gain × R/G/B)**
- 9 Sliders, Pro-locked, in ClipEffectsSection
- Worker `colorlevels` mapping: lift>0 → romin, lift<0 → rimin, gain>1 → rimax=1/gain, gain<1 → romax
- `eq=gamma_r/g/b` für midtone-curve

**C7 — Layered Big-Word-Zoom**
- assBuilder.ts: jedes highlight-word bekommt `\t(0,120,\fscx110\fscy110)` → 80%→110% pop

### Add-Video + Multi-Source-Pipeline
- HighlightsTab "Add Video" Button (Gallery/Files ActionSheet)
- Neuer clip in project.clips + ans sourceUris[] + clipOrder + auto-select
- ClipDurationProbe Helper (hidden Video probe wenn Files-picker keine duration liefert)
- Sequential-Playback in Builder mit transitioningRef debounce gegen double-advance

### Highlights + Builder Clip-Delete
- HighlightsTab: Trash mit appAlert-Confirm
- BuilderTab: Direct-delete (kein Modal — vermeidet NestableDraggableFlatList-Konflikt)
- Clip bleibt in project.clips → Highlights zeigt ihn weiter

### Plan-Counter UI (Settings)
- Account-Card zeigt "X / Y Renders this month" mit Progress-Bar
- render_count aus `render_usage` table (Network-retry mit exponential backoff)
- monthly_limit aus plan derived (creator=30, pro=200, sonst 0)

### Subtitle Highlight-Words UI
- TextInput in SubtitleSettingsModal "LAYERED" section
- Comma-separated → `[{ text, big: true }]`

### B3-Audit (theme-aware Fixes Round 1-7)
- RootNavigator + ExportScreen + VoiceOversSection + TypeChip + SettingsScreen + ProjectDetail edit-icon + AnalyzeAI button + BrandButton secondary

### Gemini Thumbnails
- **Custom Game als ERSTE Option** in Genre-Chips ✅ (User-Wunsch — bereits in Code Line 67-69)
- Style-Picker (default/comic/realistic)
- API: gemini-2.5-flash-image-preview, History-Gallerie

### Intro Picker (Round-8 stable)
- pickIntro nutzt `pickVideoFromGallery` direkt (kein ActionSheet wegen NestableDraggableFlatList+Modal-Crash)
- .mov Format-Warning bei Pick (Hinweis auf Cloud-Export-Compat)

---

## 5. Features die TEILWEISE fertig sind

| Feature | Status | Notes |
|---|---|---|
| Subtitle Layered-Preset Mobile | 🟡 | User-report "funktioniert nicht gescheid" + "letter-spacing slider bricht preset". Mit SimpleSlider-onChangeRef-fix Round-5 vermutlich behoben, **bitte re-test**. |
| Highlight-Detection Gaming | 🟡 | A3.8 transient-detection + Warzone-phrases, aber Whisper-cue-density bei pure-game-audio limitiert |
| Subtitle Metallic-Effect | 🟡 | libass blend-Single-Color (echter Gradient nicht möglich) |
| Multi-URL Image-Upload Intro | ❌ | Worker-Side image-loop-to-video Pipeline fehlt |
| Greenscreen Live-Preview | ❌ | Chromakey ohne GL nicht renderbar in RN. Hint-Text "wirkt nur im Export". Skia-Lib (4-6h) als Phase wenn nötig. |

---

## 6. Offene TODOs (priorisiert)

### 🔴 Pending Bugs

| # | Bug | Aufwand | Notes |
|---|---|---|---|
| **B1** | Subtitle Layered-Preset Mobile (letter-spacing + insgesamt) | 1-2h | Tieferes Investigation nach Round-5-fix re-test |
| **B2** | Motion-Blur Performance (lange Clips Timeout) | Stretch | Cloud-CPU-Quota-Request bei Google ODER `cpu=4 instances=5` |
| **B3** | Greenscreen Live-Preview (chromakey rendering) | 4-6h | Skia-Lib + native rebuild |

### 🟡 Block D — Pre-Launch / Monetization

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **D1** | Push-Token-Registrierung | ~2h | Expo-Push-Token bei Login in Supabase profiles |
| **D2** | EAS Auto-Update Mobile | ~3h | `eas update:configure` + "Check for updates"-Button. **User-Wunsch wichtig.** |
| **D3** | RevenueCat IAP | 6-8h | Apple verlangt IAP für mobile Subs |
| **D4** | Supabase Auth Email-Redirect hosted Web-Page | ~3h | fiano.app Cross-Device-Bridge |
| **D5** | Desktop sandbox=true + nonce-based CSP | ~3h | A6.8 partial reverted |
| **D6** | npm audit fix --force vor Release | ~1h | Dev-deps CVEs |

### 🟡 Block E — Quality-of-Life Polish

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **E1** | Thumbnail-on-demand für alte Projekte | ~1h | Bei Library-Mount: extractVideoThumbnail() async |
| **E2** | Intro-Position direkt im Export-Modal | TBD | User-Wunsch — slider vor Export-Confirm |
| **E3** | R2 lifecycle rule für sources/* > 7d | 10m | Cloudflare R2 Dashboard config |
| **E4** | Multi-Cam-Sync (C8) | 4-6h | Audio-Cross-Correlation, gemerkt |
| **E5** | YT-Direct-Upload (C9) | 3-5h | OAuth + YouTube Data API v3, gemerkt |
| **E6** | Cross-Device-Sync | 6-8h | DEFERRED (User: Files sind lokal) |

### 🟢 Block F — Desktop-Feature-Parität für Mobile (Lücken)

Wenn du **Desktop features anschaust** die noch nicht in Mobile sind:
- Layered animated Big-Word (\t() jetzt teilweise da via C7) ✅
- Watermark (jetzt da via C5) ✅
- Color-Wheels (jetzt da via C6) ✅
- Cross-Device-Sync (E6)
- Direct-Upload-YouTube (E5/C9)
- Multi-Cam-Sync (E4/C8)

---

## 7. Datenmodell

```ts
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  // Source
  sourceUri?, sourceUris?, sourceUrl?, thumbUri?, videoType?, sourceType?,
  trimStart?, trimEnd?, createdAt?, mode?,
  // Regions / Layout
  facecamRegion?, gameplayRegion?, splitRatio?, fullOffsetX?, tiktokLayout?,
  clipOrder?,
  // Add-Ons
  voiceOvers?, subtitles?, musicTracks?, musicShuffle?, intro?, builderExtras?,
  // AI
  aiHighlights?: AIHighlight[],
  perClipDurations?: number[],
  // Effects + Watermark
  effectsAll?: ClipEffects,
  watermark?: ProjectWatermark,
  errorMessage?, thumbnailHistory?,
}

interface DemoClip {
  id, startSec, endSec, label, score, thumbUri?,
  sourceIdx?: number,
  kind?: 'source' | 'highlight',
  reason?: string,
  effects?: ClipEffects,
}

interface ClipEffects {
  brightness?: number;             // -1.0..1.0 (creator)
  contrast?: number;               //  0.5..2.0 (creator)
  saturation?: number;             //  0.0..2.0 (pro)
  sharpen?: number;                //  0.0..5.0 (pro)
  motionBlur?: 'off'|'low'|'medium'|'high'; // (pro) minterpolate+tmix+fps
  colorWheels?: {                  // C6 — Pro-locked
    liftR/G/B?: -0.3..0.3,
    gammaR/G/B?: 0.5..2,
    gainR/G/B?: 0.5..1.5,
  };
}

interface ProjectIntro {
  path, filename?, mode?: 'before'|'overlay',
  scale?, x?, y?, durationSec?,
  chromakey?: { color?, similarity?, blend? };  // C5-Intro Greenscreen
}

interface ProjectVoiceOver {
  path, startSec, volume, text?, voice?,
  autoDuck?: boolean;              // C4
}

interface ProjectWatermark {
  path, filename?,
  position: 'tl'|'tr'|'bl'|'br',
  opacity: number,
  scale: number,
}

interface AppState {
  initializing, onboardingCompleted,
  facecamRegion, gameplayRegion,
  openaiKey, geminiKey, youtubeCookies,
  customSubtitlePresets, exportSettings,
  lastOpenedProjectId,
  introDefaults: { mode, x, y, scale, durationSec } | null,
  themeMode: 'light' | 'dark' | 'system',
}

interface Subscription {
  plan: 'creator' | 'pro' | 'studio_lifetime' | null,
  status: string | null,
  lifetime: boolean,
  current_period_end: string | null,
  cancel_at_period_end: boolean,
  // Plan-Counter (derived):
  render_count?: number | null,    // aus render_usage.month_key=YYYY-MM
  monthly_limit?: number | null,   // derived: creator=30, pro=200, sonst 0
}
```

---

## 8. Bekannte Bugs / Limits

| Bug | Status | Notes |
|---|---|---|
| Whisper-Quality bei reinem Game-Audio | by-design | Background-game-sounds dominieren |
| Vivo HEVC 1-Decoder OOM-Risk | env-dependent | sequential thumb-queue + largeHeap=true |
| Intro Image-Upload | offen | Worker-Side image-loop-to-video Pipeline |
| Reanimated `measureLayout` Warning | mitigated | console patch + LogBox (harmlos) |
| Motion-Blur lange Clips | Cloud-CPU-quota | bei 30s+ clips ggf Timeout — `cpu=4 instances=5` workaround |
| Greenscreen Live-Preview | by-design | RN ohne GL kann chromakey nicht zeigen |
| .webm mit Alpha lokal kodieren | by-design | FFmpeg 8.1 macOS libvpx droppt alpha. Workaround: cloudconvert.com |
| Subtitle Layered-Preset | unbestätigt | User-report nach Round-5-Slider-fix; bitte re-test |
| Intro Picker ActionSheet | by-design | Gallery-only (Files-Option crashed App im NestableDraggableFlatList) |

---

## 9. Wichtige Designentscheidungen

- **16:9 Master-First**: Pipeline rendert 16:9, alles leitet ab
- **TikTok-Tab ≠ Builder-Tab**: TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9
- **Manual-Mode ohne AI**: Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local-FFmpeg auf Mobile**: MPEG-LA-Patent-Risk + HW-Constraints
- **R2 statt Supabase Storage**: unlimited free egress vs. 2 GB/Monat
- **Files lokal auf Mobile** (kein Cross-Device-Sync): User-Wunsch
- **Theme-Pattern (B3.9):** `useColors()` Hook + `useMemo(makeStyles(colors))` für jede Component mit styles
- **Helper-functions** außerhalb Components: colors als parameter (siehe phaseMeta in ExportScreen)
- **SimpleSlider** muss onChange via Ref-Pattern nutzen (PanResponder-basierte Sliders!)
- **B1 Drag-Handle ISOLIERT** (hamburger left)
- **RN-Modal in NestableDraggableFlatList** → measureLayout-Konflikt. Lösung: absolute-positioned View ODER direct-action ohne Modal
- **SecureStore-Chunked-Adapter** (B3.6): Supabase-Session > 2KB in 1.9KB-Chunks
- **A6.4 Typed RenderSpec**: NIE user-args[] akzeptieren
- **Worker ffmpegArgs.ts ist KOPIE** — bei jeder shared-ffmpegArgs-Änderung BEIDE files syncen
- **Custom Game als ERSTE Option** in Thumbnail-Generator ✅

---

## 10. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Worker-Rev:** `00034-kdv` (Round-7 deploy)
- **GitHub-Repo:** `garymikefischer-art/fiano`
- **Aktueller Branch:** `claude/sweet-ride-0781e6`
- **Letzter Commit:** `39bf7c8` (intro picker revert + fetchSubscription retry)
- **Backup-Tag:** `pre-context-handoff-20260520`
- **Phone:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Mediatek HEVC, 256 MB heap)

### Speicherorte

**Mobile:**
```
expo-secure-store  — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute,
                     Region-Defaults, exportSettings, introDefaults,
                     themeMode (B3), Supabase-Session via chunked-Adapter (B3.6)
AsyncStorage       — Projekte (fiano.projects), Notifications,
                     customSubtitlePresets
documentDirectory/imports/      — Source-Videos
documentDirectory/thumbs/       — Frame-Thumbnails
documentDirectory/voice-overs/  — TTS-MP3s
documentDirectory/exports/      — Cloud-Render-Results
documentDirectory/thumbnails/   — Gemini-generated thumbnails
documentDirectory/watermarks/   — Watermark-Images (C5)
```

**Cloud R2:**
```
fiano-renders/sources/{userId}/{projectId}/{kind}-{uuid}.{ext}
  kind: source | intro | music | voice-over | subtitle | watermark
  Lifecycle: 1 Tag (auto-delete)
fiano-renders/outputs/{userId}/{projectId}/{jobId}.mp4
  Lifecycle: 7 Tage
```

---

## 11. SYSTEM-PROMPT für neuen Chat (copy-paste)

```
Hi! Ich arbeite an "fiano" — Hybrid-Desktop+Mobile-Video-App mit Cloud-
Render-Backend. Block A+B+C komplett (C1-C7 shipped, C8+C9 deferred).
Bei Context-Limit pausiert.

Volle Doku in:
/Users/garyfischer/Downloads/fiano-monorepo/PROJECT_SUMMARY_MOBILE.md
PLUS: /Users/garyfischer/Downloads/fiano-monorepo/SECURITY_AUDIT_2026-05-16.md
PLUS: ~/.claude/projects/-Users-garyfischer-Downloads-fiano-monorepo/memory/future_features.md
Lies ALLE 3 zuerst.

Aktueller Branch: claude/sweet-ride-0781e6 (HEAD 39bf7c8)
Backup-Tag: pre-context-handoff-20260520
Worker rev 00034-kdv aktiv.

# Wichtige Gotchas die du beachten musst:

1. **Theme-Pattern (B3 KOMPLETT):**
   - Jede Component die `colors.X.Y` referenziert braucht eigene
     `const colors = useColors()` IM function body
   - StyleSheet.create: `function makeStyles(colors)` +
     `useMemo(()=>makeStyles(colors),[colors])` IN function body
   - Helper-functions außerhalb von Components → colors als parameter
   - NIE `colors.X` auf module-level const

2. **SimpleSlider onChange via Ref (kritisch!):**
   - SimpleSlider's PanResponder cached die onChange-Closure
   - Wird via onChangeRef + useEffect für alle Slider-Callbacks aktuell
     gehalten — siehe Round-5-Fix in components/SimpleSlider.tsx
   - Bei eigenen Pan-basierten Components dasselbe Pattern nutzen!

3. **Modals mit RN-<Modal> + Reanimated v3:**
   - In NestableScrollContainer/NestableDraggableFlatList parent →
     measureLayout-Conflict, App-Crash
   - Lösung: absolute-positioned View statt <Modal> (TrimModal B1.3,
     ExportSettingsModal B3.8) ODER direct-action ohne appAlert
     (BuilderTab clip-delete C5.4, IntroPicker C5.5)

4. **A6.4 Security:**
   - NEVER accept user-args[]. Mobile schickt typed ClientRenderSpec,
     Worker baut args[] selber via specToTikTokOpts() +
     buildTikTokExportArgs()

5. **Worker ffmpegArgs.ts ist KOPIE:**
   - services/render-worker/src/ffmpegArgs.ts ist eigene copy von
     packages/shared/src/ffmpegArgs.ts (Worker hat keine @fiano/shared)
   - Bei JEDER Änderung BEIDE Files syncen!
   - Diff sollte nur TikTokLayout-Block-Wrapper sein

6. **Worktree-Workflow:**
   - Mobile vom Main-Repo starten, NICHT aus worktree (keine node_modules)
   - Native-Rebuild bei neuer Dep: npx expo prebuild --clean
   - Worker deploy via gcloud run deploy --source . im worktree-dir OK
   - Cloud-Run-CPU-Quota: max 20000 mCPU regional → cpu=2×instances=10
     ODER cpu=4×instances=5

# Mein Vorschlag für ersten Schritt:

🔴 **B1 Subtitle Layered-Preset Bug-Fix (~1-2h)** — User-report nach
   Round-5 sollte mit SimpleSlider-Round-5-Fix bereits behoben sein,
   aber re-test + ggf tieferes Investigation der SubtitleSettingsModal.

ODER:

🟡 **D1 Push-Token-Registrierung (~2h)** — Expo-Push-Token bei Login in
   Supabase profiles. Einfacher Quick-Win.

ODER:

🟡 **D2 EAS Auto-Update Mobile (~3h)** — User-Wunsch aus Memory.
   eas update:configure + Settings → "Check for updates" Button +
   Auto-Check-on-Start. JS-only-OTA, kein Store-Review.

ODER:

🟡 **E1 Thumbnail-on-demand (~1h)** — Bei Library-Mount für Projects
   ohne thumbUri: extractVideoThumbnail() async (memory item 2).

Nicht vergessen vor Start: git tag pre-phase-X.Y-backup && git push --tags.
```

---

**Stand 2026-05-20** — Block A+B+C komplett (C8/C9 deferred).
Letzter Commit `39bf7c8`. Backup-Tag `pre-context-handoff-20260520`.

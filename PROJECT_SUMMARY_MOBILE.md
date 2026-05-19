# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-19** — Block A+B komplett, B3 Light-Mode fertig, C1.A Effects-UI shipped, C1.B (Worker Integration) offen.
> Branch: `claude/confident-williams-e9003f` (HEAD `169b8ea`).
> Backup-Tags: `pre-phase-c1-backup`, `pre-context-handoff-20260519`.

---

## 1. Architektur

### Tech-Stack

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, react-router HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase Auth+DB, Stripe, Resend SMTP. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, RN 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library/web-browser/linking, react-native-webview, @react-native-cookies/cookies, Supabase JS SDK, **react-native-reanimated 3.16, react-native-draggable-flatlist 4.0.3** (B1). |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp). Cloudflare R2 (S3-API). |

### Wichtige Systeme

- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range-Support + path-validation (A6.8)
- **Job Queue** (Desktop, `core/queue.ts`): serialisiert FFmpeg-Pipelines (concurrency=1)
- **IPC Layer**: typed Channels `IpcResponse<T>`
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT
- **Settings**: Desktop userData/*.json + safeStorage; Mobile **expo-secure-store mit chunked-Adapter** (B3.6 — 1.9 KB pro chunk, splittet Supabase-Session) + AsyncStorage
- **Mobile File-Persistence**: `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails}/`

### Cloud-Render-Pipeline

```
Mobile/Desktop          Google Cloud Run          Cloudflare R2
─────────────          ────────────────          ─────────────
POST /v1/upload-url  → pre-signed PUT (30/min)
PUT file             ────────────────────→ sources/{user}/...
POST /v1/render      → A6.4 typed RenderSpec — Worker baut args[] selber
                        ├ download from R2 ←
                        ├ ffmpeg ${args}
                        ├ upload result   ──→ outputs/{user}/...
                        └ signed DL-URL
POST /v1/download    → yt-dlp (rate-limit 10/min seit B3.10)
POST /v1/transcribe  → Whisper word-timestamps + audio-energy
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
│   │       ├── types.ts            ← Project, Highlight, ClipEffects
│   │       ├── ffmpegArgs.ts       ← Plattform-neutral; buildEffectsFilter() C1.A
│   │       ├── assBuilder.ts       ← SubtitleSettings → libass .ass-Datei
│   │       ├── subtitles.ts        ← SubtitleCue + Transcript-Parser
│   │       └── i18n/locales/       ← 9 Sprachen (de/en/es/fr/it/nl/pl/pt/ru)
│   └── mobile/                     ← Expo + React Native
│       ├── App.tsx                 ← Root: Auth/Tabs/Theme; LogBox + console-Patch
│       ├── babel.config.js         ← reanimated/plugin LAST (B1)
│       ├── metro.config.js         ← Workspaces + disableHierarchicalLookup
│       └── src/
│           ├── screens/            ← ProjectDetail (4 Tabs), Library, Home, Settings,
│           │                        Pricing, ThumbnailGenerator, Help, Legal, etc.
│           ├── components/         ← VideoPlayer, ActionSheet, SubtitleSettingsModal,
│           │                        ExportSettingsModal, CueEditorModal, RegionPickerModal,
│           │                        MultiAudioPicker, ClipEffectsSection (C1.A), TrimModal
│           ├── stores/             ← Zustand: app (themeMode!), auth, projects, etc.
│           ├── lib/                ← supabase (chunked!), features, theme (B3), renderJob
│           ├── navigation/         ← Root + MainTabs Param-Types
│           └── data/demoProjects.ts ← DemoProject, DemoClip, ClipEffects
└── services/
│   └── render-worker/              ← Cloud Run FFmpeg-Worker
│       └── src/
│           ├── index.ts            ← Express + Endpoints + Rate-Limit
│           ├── auth.ts             ← Supabase JWT-Middleware
│           ├── r2.ts               ← Cloudflare R2 (S3 via @aws-sdk)
│           ├── render.ts           ← FFmpeg-spawn + Timeout
│           ├── transcribe.ts       ← Whisper word-timestamps
│           ├── highlights.ts       ← Gaming + Podcast SHORT/LONG
│           ├── youtube.ts          ← yt-dlp wrapper
│           ├── renderSpec.ts       ← A6.4 typed Spec-Validator
│           └── assValidator.ts     ← A6.2 .ass content-validation
└── supabase/
    ├── config.toml
    ├── functions/                  ← stripe-checkout, stripe-portal, stripe-webhook, delete-account
    └── migrations/001_rls_baseline.sql
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

---

## 3. Git-Workflow + Auto-Update

### Claude-Worktree-Pattern

Claude arbeitet in `claude/<branch-id>` unter `.claude/worktrees/<branch-id>/`.

**User merged in main:**
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git fetch origin
git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
git push origin main
```

Bei Conflict: `git checkout --theirs <file>` nimmt Branch-Version.

### Backup-Strategie

```bash
# VOR jeder größeren Phase:
git tag pre-phase-X.Y-backup && git push origin pre-phase-X.Y-backup
# Rollback (nur eigener branch!):
git reset --hard pre-phase-X.Y-backup
```

**Aktuelle Backup-Tags:** `pre-context-handoff-20260519`, `pre-phase-c1-backup`, `pre-phase-b3-backup`, `pre-phase-b1-backup`.

### Auto-Update-Strategien

| Plattform | Mechanismus | Status |
|---|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater | ✅ wired |
| **Mobile** | EAS Update für JS-only-OTA | ❌ Phase D2 |
| **Cloud-Worker** | `gcloud run deploy` manuell | ✅ wired |

**Desktop Release:**
```bash
git tag v0.2.X && git push --tags
npm run release:mac
```

**Mobile Native-Rebuild** (nach neuer Dep oder app.json-Plugin):
```bash
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
```

**Worker Deploy:**
```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
```

**Wichtig:** Mobile vom **Main-Repo** starten (`cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile`), nicht aus worktree.

---

## 4. Features die FERTIG sind

### Auth + i18n + Onboarding
- Supabase Email-Login + Google OAuth, 9 Sprachen, Onboarding-Carousel

### Security (A1 + A6.1-A6.10 ✅)
- **A1**: RLS aktiv, explicit GRANTs
- **A6.1**: Rate Limiting Worker per-userId (upload 30, render 5, transcribe 5, download **10/min** — B3.10)
- **A6.2**: `.ass` Content-Validation + 64KB-Limit
- **A6.3**: Plan-Check + Monthly-Counter im Worker
- **A6.4**: **Typed RenderSpec** — args[] off-client (größter Audit-Fix!)
- **A6.5-A6.10**: Logs sanitisiert, Stripe-Webhook dedupe, yt-dlp gehärtet, Electron CSP, R2 path-regex, YT-Cookies SecureStore, npm audit

📄 **Volldoku:** `SECURITY_AUDIT_2026-05-16.md` (4 P0 / 8 P1 / 8 P2 / 14 P3 Findings).

### Navigation
- Liquid-Glass-BottomTab (B3.4 enhanced — iridescent rim, multi-shadow): Home / Projects / Highlights / 9:16 / Builder / Thumbs
- Sub-Screens: ProjectDetail (4 Tabs), Settings, Help, Legal (3-Tab: Impressum/Datenschutz/AGB), Pricing

### Project Detail mit 4 Tabs
- **Highlights**: AI-Clip-Liste, AI-Highlights-Section, Multi-Select
- **Manual**: Mark-In/Out, Source-Switcher, Clip-Liste
- **9:16**: Stacked/Split/Full Layout, Region-Cards, Multi-Clip-Export, Intro x/y/scale, **ClipEffectsSection** (C1.A)
- **Builder**: 16:9 YouTube-Cut, AI-Highlights Quick-Add, **Drag-Reorder via long-press auf Hamburger-Handle** (B1), Scissors-Trim+Split (B0+B5), Drag-to-Seek (B2), **ClipEffectsSection** (C1.A)

### Cloud-Render-Worker
- /health, /v1/upload-url, /v1/render (typed Spec!), /v1/download (yt-dlp 10/min), /v1/transcribe
- Rate-Limit per-userId, A6.4 RenderSpec, A6.2 .ass-validation

### Subtitle System
- Whisper word-timestamps + per-word chunking
- libass (.ass) Renderer mit full Style-Parität: Glow, Drop-Shadow, Layered, Metallic
- Cue-Editor mit per-clip Section-Header bei Multi-Clip
- 30+ Properties, 15+ Android-System-Fonts

### Multi-Clip-Pipeline (Phase A3 — alle Sub-Phases ✅)
- Multi-File-Import + Multi-URL-Import (+-Button)
- Multi-Clip-Whisper mit gemerged cues
- AI-Highlights als kind='highlight' clips + separate aiHighlights[]
- Player-Switch in Highlights+Manual+TikTok-Tab pro Source

### Mobile Feature-Lock-Parität (A5 + A6.3)
- 24 FeatureIDs (creator/pro hierarchy)
- FeatureLock / UpgradeModal (theme-aware seit B3.7) mit Pricing-Screen-Nav
- Lock-Stellen: Subtitle (Layered, Glow), Export (4K, >5M bitrate), ThumbnailGenerator, Project-Limit creator=25, **advanced_effects (C1.A)**

### Intro System (A4 ✅)
- before-Mode + overlay-Mode mit scale/x/y/duration
- A4.d ALWAYS contain (no cover flip)

### Region-Edit per Project (A4.c + B3.10 layout-fix)
- TikTok-Tab "Edit"-Button → RegionPickerModal
- Test-Upload: Gallery / Files / Image (3 Buttons jetzt flex:1 equal-width)

### Audio/Video Add-Ons
- Music Multi-Picker (Volume + drag-reorder + shuffle)
- TTS Voice-Over (OpenAI tts-1)
- Intro mit IntroOverlayControls
- Live-Preview im Hero-Player

### Cloud-Export End-to-End
- ExportSettingsModal (Resolution/FPS/Bitrate) — B3.8 Modal→absolute-View
- Local-Notification bei Done
- 9:16 ODER 16:9 auto

### Gemini Thumbnails (Phase 9.8)
- **Custom Game als ERSTE Option** in Genre-Chips ✅
- Style-Picker (default/comic/realistic)
- API: gemini-2.5-flash-image-preview
- History-Gallerie

### Builder-Tab (alle Phases + B0+B1+B2 ✅)
- TikTok-Parität, per-source-trim, Sequential Multi-Source-Preview
- 16:9 Export, Multi-Clip-Import, Cumulative Scrubber
- AI-Highlights Quick-Add
- **Long-press-Drag auf Hamburger-Handle** (B1)
- Scissors-Trim mit Split-at-Playhead (B0+B5)

### i18n × 9
- 9 Sprachen (de/en/it/ru/es/fr/pt/nl/pl)
- A3.x/B/C neue Keys nur in EN+DE explizit, andere Sprachen via inline-Fallback

### Light/Dark/System Theme (B3 KOMPLETT 2026-05-19)
- `lib/theme.ts` — ColorPalette + dark/light maps, `useColors()` + `useResolvedMode()`
- appStore.themeMode persist via SecureStore (chunked-Adapter!)
- Settings → Appearance: Light/Dark/System Segmented-Picker
- **Pattern für StyleSheet.create-Modals (B3.9):** `function makeStyles(colors)` + `useMemo()`
- **Gotcha:** module-level const styles dürfen NICHT `colors.X` referenzieren — bleibt hardcoded ODER inline-override
- **Gotcha:** Helper-functions die `colors.X` referenzieren brauchen JEDE ihren eigenen `const colors = useColors()` Hook
- Liquid-Glass Tab-Bar: dark-bg 0.10, light-bg 0.55 + iridescent gradient

### Drag-Reorder im Builder (B1 KOMPLETT)
- `react-native-draggable-flatlist` 4.0.3 + `react-native-reanimated` 3.16
- `NestableDraggableFlatList` (weil innerhalb ScrollView)
- Long-press 180ms → Drag, Hamburger-Handle separates Pressable
- onDragEnd persistiert clipOrder
- Selection rekonstruiert aus clipOrder beim Re-Open
- LogBox + console.warn/error-Patch für harmlose `measureLayout` Warning

### Effects-System UI (C1.A — 2026-05-19)
- `ClipEffectsSection.tsx`: Brightness/Contrast (creator) + Saturation/Sharpen/Motion-Blur (pro)
- Plan-Lock via `advanced_effects`
- Mounted in TikTokTab + BuilderTab
- State in `project.effectsAll`
- `buildEffectsFilter(effects)` helper (shared) — generiert FFmpeg `eq=...,unsharp=...,tmix=frames=N`
- ⚠️ **Export-Apply steht noch aus** (C1.B = Worker Integration)

### Legal-Content (B3.10)
- LegalScreen 3 Tabs (Impressum / Datenschutz / AGB)
- Inhalt 1:1 vom Desktop LegalPage übernommen (FIANO e.U., FN 640653 m, GLN, DSGVO-Rechte)
- Rechtsverbindlich für Österreich

---

## 5. Features die TEILWEISE fertig sind

| Feature | Status | Notes |
|---|---|---|
| **C1 Effects-System** | 🟡 UI-only | C1.A done (UI + state + plan-lock). C1.B Worker eq+unsharp+tmix Integration offen. |
| Highlight-Detection Gaming | 🟡 | A3.8 transient-detection + 50 Warzone-phrases, aber Whisper-cue-density bei pure-game-audio limitiert |
| Subtitle Metallic-Effect | 🟡 | libass blend-Single-Color (echter Gradient nicht möglich) |
| Layered Big-Word-Zoom-Animation | 🟡 | static im Mobile; Desktop hat `\t()` animation — C7 |
| Multi-URL Image-Upload Intro | ❌ | Heute nur Video. Image-Loop-to-Video-Pipeline fehlt (Worker-Side) |

---

## 6. Offene TODOs (priorisiert)

### 🔴 Block C — Video-Features Mobile (laufend)

| # | Phase | Aufwand | Status |
|---|---|---|---|
| **C1.A** | Effects UI + state + plan-lock + Motion-Blur | ~3h | ✅ shipped 169b8ea |
| **C1.B** | Worker FFmpeg-Integration (eq+unsharp+tmix) | 2-3h | 🔜 **NÄCHSTE PHASE** |
| **C1.C** | Live-Preview via VideoPlayer ColorMatrix | 1h | optional |
| C3 | Cross-Device-Sync | 6-8h | DEFERRED (User: Files sind lokal) |
| C4 | Audio-Ducking (Source-dimmen bei TTS) | 2-3h | FFmpeg `sidechaincompress` |
| C5 | Watermark Overlay | 1-2h | Logo/Text-Overlay |
| C6 | Color-Correction (lift/gamma/gain Wheels) | 2-3h | FFmpeg `colorlevels` |
| C7 | Layered Big-Word-Zoom-Animation Mobile | 2-4h | libass `\t()` in assBuilder.ts |
| C8 | Multi-Cam-Sync (Audio-Waveform-Alignment) | 4-6h | Stretch |
| C9 | YT-Direct-Upload | 3-5h | OAuth + YouTube Data API v3 |

### 🟢 Block D — Pre-Launch / Monetization

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **D1** | Push-Token-Registrierung | ~2h | Expo-Push-Token in Supabase profiles |
| **D2** | EAS Auto-Update Mobile | ~3h | JS-only-OTA + "Check for updates"-Button |
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
  // C1.A (NEW 2026-05-19)
  effectsAll?: ClipEffects,
  // Misc
  errorMessage?, thumbnailHistory?,
}

interface DemoClip {
  id, startSec, endSec, label, score, thumbUri?,
  sourceIdx?: number,
  kind?: 'source' | 'highlight',
  reason?: string,
  effects?: ClipEffects,           // C1.A — per-clip override (future)
}

interface ClipEffects {            // C1.A
  brightness?: number;             // -1.0..1.0 (creator)
  contrast?: number;               //  0.5..2.0 (creator)
  saturation?: number;             //  0.0..2.0 (pro)
  sharpen?: number;                //  0.0..5.0 (pro)
  motionBlur?: 'off'|'low'|'medium'|'high'; // (pro) tmix=frames=N
}

interface AppState {
  initializing, onboardingCompleted,
  facecamRegion, gameplayRegion,
  openaiKey, geminiKey, youtubeCookies,
  customSubtitlePresets, exportSettings,
  lastOpenedProjectId,
  introDefaults: { mode, x, y, scale, durationSec } | null,
  themeMode: 'light' | 'dark' | 'system',  // B3
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
| C1 Export-Apply | open | C1.B Worker Integration steht |
| Per-Clip effects override | future | clip.effects type da, UI fehlt |

---

## 9. Wichtige Designentscheidungen

- **16:9 Master-First**: Pipeline rendert 16:9, alles leitet ab
- **TikTok-Tab ≠ Builder-Tab**: TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9
- **Manual-Mode ohne AI**: Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local-FFmpeg auf Mobile**: MPEG-LA-Patent-Risk + HW-Constraints
- **R2 statt Supabase Storage**: unlimited free egress vs. 2 GB/Monat
- **Files lokal auf Mobile** (kein Cross-Device-Sync): User-Wunsch — Source-Files für Cloud-Render hochgeladen + nach 1 Tag gelöscht
- **Theme-Pattern (B3.9):** `useColors()` Hook + `useMemo(makeStyles(colors))` für jede Component mit styles
- **B1 Drag-Handle ISOLIERT** (hamburger left): vermeidet Pressable-bubble-conflict
- **TrimModal als absolute-View** statt RN-Modal (B1.3): umgeht Reanimated v3 measureLayout-Konflikt
- **ExportSettingsModal als absolute-View** (B3.8): selber Modal-Bug
- **SecureStore-Chunked-Adapter** (B3.6): Supabase-Session > 2KB in 1.9KB-Chunks

---

## 10. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Worker-Rev:** `00020-tqs` (Rate-Limit-Bump deploy steht noch aus für /v1/download 10/min)
- **GitHub-Repo:** `garymikefischer-art/fiano`
- **Aktueller Branch:** `claude/confident-williams-e9003f`
- **Letzter Commit:** `169b8ea` (C1.A.2 — AddVideo crash-fix + Motion-Blur UI)
- **Backup-Tags:** `pre-phase-c1-backup`, `pre-context-handoff-20260519`
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
```

**Cloud R2:**
```
fiano-renders/sources/{userId}/{projectId}/{kind}-{uuid}.{ext}
  Lifecycle: 1 Tag (auto-delete)
fiano-renders/outputs/{userId}/{projectId}/{jobId}.mp4
  Lifecycle: 7 Tage
```

---

## 11. SYSTEM-PROMPT für neuen Chat (copy-paste)

```
Hi! Ich arbeite an "fiano" — Hybrid-Desktop+Mobile-Video-App mit Cloud-
Render-Backend. Block A+B komplett, B3 Light-Mode fertig, C1.A
(Effects-UI) shipped, C1.B (Worker FFmpeg-Integration) als nächstes.
Bei Context-Limit pausiert.

Volle Doku in:
/Users/garyfischer/Downloads/fiano-monorepo/PROJECT_SUMMARY_MOBILE.md
PLUS: /Users/garyfischer/Downloads/fiano-monorepo/SECURITY_AUDIT_2026-05-16.md
PLUS: ~/.claude/projects/-Users-garyfischer-Downloads-fiano-monorepo/memory/future_features.md
Lies ALLE 3 zuerst.

# SYSTEM-PROMPT
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano":

**Stack:**
- Desktop: Electron 31 + TS + React 18 + Tailwind + Zustand + bundled FFmpeg/yt-dlp
- Mobile: Expo SDK 52 + RN 0.76 + Supabase JS SDK + react-native-video/svg +
  react-native-reanimated 3.16 + react-native-draggable-flatlist 4.0.3
- Cloud-Render: Google Cloud Run (Express + Node 22 + FFmpeg + yt-dlp) + Cloudflare R2
- Endpoints: /v1/upload-url, /v1/render (typed Spec seit A6.4!), /v1/download, /v1/transcribe

**Working Dir:** /Users/garyfischer/Downloads/fiano-monorepo/
**GitHub:** garymikefischer-art/fiano

**Monorepo:**
- src/ — Desktop
- packages/shared/ — geteilt (types, i18n, ffmpegArgs, assBuilder, subtitles)
- packages/mobile/ — Mobile
- services/render-worker/ — Cloud Run
- supabase/ — Edge Functions + migrations

**Arbeitsstil:** Deutsch, MVP-First, Plan zeigen → OK abwarten → implementieren.
i18n × 9 immer. Vor jeder größeren Phase: git tag pre-phase-X.Y-backup.

**Memory-Feedback (sehr wichtig):** Nach JEDEM Code-Ship einen
"🧪 Was du testen sollst"-Block mit Shell-Befehlen + Click-Path +
Expected-Outcomes. User-Wunsch.

**Theme-Pattern (B3 KOMPLETT — kritisch beachten):**
- Jede Component die `colors.X.Y` referenziert braucht eigene `const colors = useColors()`
- StyleSheet.create: `function makeStyles(colors)` + `useMemo(()=>makeStyles(colors),[colors])` IN function-body
- NIE `colors.X` auf module-level const (kein scope → App-Start-Crash!)

**Mobile-Wichtig:**
- Native-Module via lazy-load mit try/catch
- Source-Files via persistInDocuments() in documentDirectory
- Bei neuer Native-Dep ODER app.json-Plugin: `npx expo prebuild --clean`
- Worktrees haben KEINE node_modules — Mobile vom Main starten
- Modals mit RN-`<Modal>` + Reanimated in NestableScrollContainer parent
  → measureLayout-Conflict, App-Stuck. Lösung: absolute-positioned View
  (siehe TrimModal B1.3, ExportSettingsModal B3.8 pattern).

**Worker-Wichtig:**
- gcloud run deploy fiano-render-worker --source . --region europe-west1
  --memory 2Gi --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
- A6.4: NEVER accept user-args[]. Typed RenderSpec via specToTikTokOpts()
  + buildTikTokExportArgs(). Worker baut args[] selber.

**Git-Workflow:**
Claude in worktree-branch claude/<id>. User merged in main:
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git fetch origin
  git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
  git push origin main

---

# Nächste Phasen (Reihenfolge):

🔴 C1.B — Worker FFmpeg-Integration für Effects (eq + unsharp + tmix) ~2-3h
🔴 C1.C — Live-Preview via VideoPlayer ColorMatrix (optional) ~1h
🟡 D1 → D2 → D3 — Push-Token + EAS-Update + RevenueCat IAP (App-Store) ~12h
🟡 E1 — Thumbnail-on-demand für alte Projekte ~1h
🟢 D4-D6, E2-E3, C4-C9 — Polish, Watermark, Color-Correction, YT-Upload

---

# Quick-Reference
- Worker-URL: https://fiano-render-worker-491699066139.europe-west1.run.app
- Worker-Rev: 00020-tqs (Rate-Limit-Bump deploy steht noch aus!)
- Aktueller Branch: claude/confident-williams-e9003f
- Letzter Commit: 169b8ea
- Backup-Tags: pre-phase-c1-backup, pre-context-handoff-20260519

Bitte lies PROJECT_SUMMARY_MOBILE.md + SECURITY_AUDIT_2026-05-16.md +
future_features.md durch und sag dann was du als ersten Schritt empfiehlst.
Mein Vorschlag: C1.B Worker-Integration (2-3h).
Nicht vergessen vor Start: git tag pre-phase-X.Y-backup && git push --tags.
```

---

**Stand 2026-05-19** — Block A+B komplett, B3 Light-Mode komplett, C1.A shipped.
Letzter Commit `169b8ea`. Backup-Tags `pre-phase-c1-backup`, `pre-context-handoff-20260519`.

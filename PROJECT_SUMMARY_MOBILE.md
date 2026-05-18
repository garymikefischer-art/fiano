# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-18** — A1-A5 + A6.1 abgeschlossen, A6.2-A6.10 + B+C+D offen.
> Worker rev `00020-tqs` live. Letzter Backup-Tag: `pre-context-handoff-20260518`.
> Branch: `claude/modest-greider-5dd6e1` (HEAD `c69c8fd`).

---

## 1. Architektur

### Tech-Stack

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, react-router HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase Auth+DB, Stripe, Resend SMTP. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, React Native 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library/web-browser/linking, react-native-webview, @react-native-cookies/cookies, Supabase JS SDK. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp). Cloudflare R2 (S3-API). |

### Wichtige Systeme

- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range-Support
- **Job Queue** (Desktop, `core/queue.ts`): serialisiert FFmpeg-Pipelines (concurrency=1)
- **IPC Layer**: typed Channels `IpcResponse<T>`
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT
- **Settings**: Desktop userData/*.json + safeStorage; Mobile expo-secure-store + AsyncStorage
- **Mobile File-Persistence**: `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails}/`

### Cloud-Render-Pipeline

```
Mobile/Desktop          Google Cloud Run          Cloudflare R2
─────────────          ────────────────          ─────────────
POST /v1/upload-url  → pre-signed PUT
PUT file             ────────────────────→ sources/{user}/...
POST /v1/render      → ├ download from R2 ←
                        ├ ffmpeg ${args}
                        ├ upload result   ──→ outputs/{user}/...
                        └ signed DL-URL
```

**Args-Platzhalter**: `{SRC}`, `{SRC_N}`, `{INTRO}`, `{MUSIC_N}`, `{VO_N}`, `{ASS}`, `{DST}`

**Kosten**: Cloud Run scale-to-zero, R2 unlimited free egress.

---

## 2. Ordnerstruktur (Monorepo)

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                            ← Desktop (Electron Main + Renderer)
│   ├── main/                       ← Electron Main-Prozess (Node)
│   │   ├── index.ts                ← BrowserWindow, contextIsolation
│   │   ├── ipc.ts                  ← typed IPC-Channels
│   │   └── core/                   ← queue, pipeline, auth, settings
│   ├── preload/
│   └── renderer/                   ← Vite + React + Tailwind (Desktop UI)
│       ├── src/
│       │   ├── pages/              ← ProjectDetail, SettingsPage, PricingPage, ThumbnailPage
│       │   ├── components/         ← FeatureLock, UpgradeModal, TikTokTab, EditorTab
│       │   ├── stores/             ← Zustand: authStore, projectsStore, etc.
│       │   └── lib/                ← features.ts (FeatureId, plan-hierarchie), i18n/{lang}.ts
├── packages/
│   ├── shared/                     ← Geteilt Desktop+Mobile (Symlink-Monorepo)
│   │   ├── src/types.ts            ← Project, Highlight, ClipSegment
│   │   ├── src/subtitles.ts        ← SubtitleCue + Transcript-Parser
│   │   ├── src/ffmpegArgs.ts       ← Plattform-neutral (buildTikTokExportArgs)
│   │   ├── src/assBuilder.ts       ← SubtitleSettings → libass .ass-Datei
│   │   └── src/i18n/locales/       ← 9 Sprachen (de/en/es/fr/it/nl/pl/pt/ru)
│   └── mobile/                     ← Expo + React Native
│       ├── App.tsx                 ← Root: Auth/Tabs/Theme
│       ├── app.config.js           ← Inline-Plugin (largeHeap=true Android)
│       ├── app.json                ← Expo Base-Config
│       ├── metro.config.js         ← Workspaces + disableHierarchicalLookup
│       └── src/
│           ├── screens/            ← ProjectDetail (4 Tabs), Library, AddVideoProject,
│           │                        Export, Settings, Pricing, ThumbnailGenerator
│           ├── components/         ← VideoPlayer, FeatureLock, UpgradeModal, ActionSheet,
│           │                        SubtitleSettingsModal, ExportSettingsModal, CueEditorModal,
│           │                        RegionPickerModal, MultiAudioPicker, IntroOverlayControls
│           ├── stores/             ← Zustand: app, auth, projects, notifications, upgradeModal
│           ├── lib/                ← supabase, sounds, haptics, thumbnails, features.ts,
│           │                        whisper, tts, gemini, renderJob
│           ├── navigation/         ← Root + MainTabs Param-Types
│           └── data/demoProjects.ts ← DemoProject, DemoClip, AIHighlight, SubtitleSettings
└── services/
│   └── render-worker/              ← Cloud Run FFmpeg-Worker (separates Deploy)
│       ├── Dockerfile              ← Node 22 + apt-ffmpeg + yt-dlp
│       ├── src/
│       │   ├── index.ts            ← Express + Endpoints + Rate-Limit
│       │   ├── auth.ts             ← Supabase JWT-Middleware
│       │   ├── r2.ts               ← Cloudflare R2 (S3 via @aws-sdk)
│       │   ├── render.ts           ← FFmpeg-spawn + Timeout
│       │   ├── transcribe.ts       ← Whisper word-timestamps + Highlight
│       │   ├── audioEnergy.ts      ← ebur128 + astats fallback + transients
│       │   ├── highlights.ts       ← Gaming + Podcast SHORT/LONG profiles
│       │   └── youtube.ts          ← yt-dlp wrapper
└── supabase/
    ├── config.toml                 ← verify_jwt overrides
    ├── functions/                  ← stripe-checkout, stripe-portal, stripe-webhook, delete-account
    └── migrations/
        └── 001_rls_baseline.sql    ← A1: explicit GRANTs + RLS policies
```

### Code-Propagation
- **`packages/shared/`** → wirkt auf BEIDE Plattformen automatisch (Symlink-Monorepo)
- **`src/`** → nur Desktop
- **`packages/mobile/`** → nur Mobile
- **`services/render-worker/`** → nur Cloud-Worker (separates Deploy)

---

## 3. Git-Workflow + Auto-Update

### Claude-Worktree-Pattern

Claude arbeitet in `claude/<branch-id>` unter `.claude/worktrees/<branch-id>/`.
Branch wird zu `origin/garymikefischer-art/fiano` gepusht.

**User merged in main** vom Root-Repo:
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git stash
git fetch origin
git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
git push origin main
git stash pop
```

Bei Conflict: `git checkout --theirs PROJECT_SUMMARY_MOBILE.md` nimmt Branch-Version.

### Backup-Strategie

```bash
# VOR jeder größeren Phase:
git tag pre-phase-X.Y-backup && git push origin pre-phase-X.Y-backup
# Rollback (nur eigener branch!):
git reset --hard pre-phase-X.Y-backup
```

**Aktuelle Backup-Tags (auf GitHub):**
- `pre-context-handoff-20260518` ← **aktuell**
- `pre-phase-a3.11-a4-20260517`
- `pre-phase-a3.10-multiclip-final-20260517`
- `pre-phase-a3.8-highlights-20260517`
- `pre-phase-a5-feature-lock-20260516`
- `pre-phase-rls-setup-20260516`
- `pre-phase-builder-completed-20260513`

### Auto-Update-Strategien

| Plattform | Mechanismus | Status |
|---|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater pulls auf App-Start | ✅ wired |
| **Mobile** | EAS Update für JS-only-OTA (`eas update --channel production`) | ❌ Phase D2 |
| **Cloud-Worker** | `gcloud run deploy` manuell, Zero-Downtime-Rollout | ✅ wired |

**Desktop Release-Flow:**
```bash
git tag v0.2.X && git push --tags
npm run release:mac     # bauen + GitHub-Releases-Upload
# electron-updater pulls bei allen Installs automatisch beim nächsten Start
```

**Mobile Mobile-Workflow:**
```bash
# JS-only-Änderungen:
cd packages/mobile && npm run start:clear
# Metro: r → Reload

# Native-Änderungen (neue Dep oder app.json-Plugin):
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
```

**Worker Deploy-Flow:**
```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
# env-vars bleiben. Bei NEUEN: --set-env-vars KEY=VAL
```

**Mobile-Bundling-Hinweis:** Metro hat `disableHierarchicalLookup: true`. Bei
"Unable to resolve @babel/runtime" → `rm -rf packages/mobile/node_modules &&
npm install` vom Root. Worktrees haben KEINE eigenen node_modules — Mobile
muss vom Main-Repo gestartet werden ODER `npm install` im Worktree.

---

## 4. Features die FERTIG sind

### Auth + i18n + Onboarding
- Supabase Email-Login + Google OAuth, 9 Sprachen, Onboarding-Carousel

### Supabase Database / Security (A1 + A6.1)
- RLS aktiv: `profiles` + `subscriptions` mit `auth.uid()=user_id` Policies
- Explicit GRANTs (REVOKE anon, narrow authenticated) — Vorbereitung 30.10.2026
- Migration: `supabase/migrations/001_rls_baseline.sql`
- Worker Rate Limiting: per-userId nach authMiddleware (30/5/5/3 per min)

### Navigation
- Liquid-Glass-BottomTab: Home / Projects / Clips / TikTok / Builder / Thumbs
- Sub-Screens: ProjectDetail (4 Tabs), Settings, Help, Legal, Pricing

### Project Detail mit 4 Tabs
- **Highlights**: AI-Clip-Liste, AI-Highlights-Section (klickbar via ActionSheet), Multi-Select
- **Manual**: Mark-In/Out, Source-Switcher (Multi-Clip), Clip-Liste
- **9:16 (TikTok)**: Stacked/Split/Full Layout, Region-Cards, Per-Project Region-Edit,
  Single + Multi-Clip-Export ("Export all N clips"), Intro x/y/scale/auto-fit
- **Builder**: 16:9 YouTube-Cut, Highlights + Extras, AI-Highlights als Quick-Add Items

### Cloud-Render-Worker
- /health, /v1/upload-url (kinds: source/intro/music/voice-over/subtitle)
- /v1/render (Multi-Input clips[].src? trim+concat)
- /v1/download (yt-dlp YouTube/Twitch → R2)
- /v1/transcribe (Whisper word-timestamps + audio-energy + Highlight-Detection)
- **Rate-Limit (A6.1)** + **Transient-Detection für Gaming** (A3.8)
- **astats-Fallback** wenn ebur128 0 buckets liefert (A3.8.b)

### Subtitle System
- Whisper word-timestamps + per-word chunking
- libass (.ass) Renderer mit full Style-Parität: Glow, Drop-Shadow, Layered, Metallic
- Cue-Editor mit per-clip Section-Header bei Multi-Clip (A3.2)
- 30+ Properties, 15+ Android-System-Fonts

### Multi-Clip-Pipeline (Phase A3 — alle Sub-Phases ✅)
- Multi-File-Import + Multi-URL-Import (+-Button UX)
- `transcribeMultiSource()`: sequentielles Whisper über alle Clips, Cues mit Offset gemerged
- AI-Highlights als kind='highlight' clips in project.clips (mit sourceIdx) +
  separate aiHighlights[] für HighlightsTab-Section
- Player-Switch in Highlights+Manual+TikTok-Tab pro Source
- 9:16 Multi-Clip-Export via builderItemPlan in `mode='tiktok'`

### Mobile Feature-Lock-Parität (A5)
- `lib/features.ts` Port von Desktop (23 FeatureIDs, creator/pro/lifetime hierarchy)
- FeatureLock / FeatureLockInline / LockBadge (RN mit react-native-svg)
- UpgradeModal mit Pricing-Screen-Navigation
- Lock-Stellen: Subtitle (Layered, Glow, Shadow, Save-Preset), Export (4K, >5M bitrate),
  ThumbnailGenerator (full-lock), AddVideoProject (Project-Limit creator=25)
- ⚠️ **CLIENT-ONLY** — Server-Enforcement steht noch aus (A6.3 P0-2)

### Intro System (A4 + Sub-Phases ✅)
- **before-Mode**: scale + x/y + auto-fit (vorher hardcoded cover)
- **overlay-Mode**: scale 0.2..4.0 + x/y + duration
- **A4.d**: ALWAYS contain (no contain↔cover flip bei scale=1)
- IntroOverlayControls in BEIDEN Modi sichtbar
- Default scale=0.4 + y=1.0 (bottom-preset) wenn neue Intros gepickt
- UX-Hint bei scale=100% (X/Y wirken erst bei scale<100%)

### Region-Edit per Project (A4.c)
- TikTok-Tab "Edit"-Button öffnet RegionPickerModal
- Speichert nur project-spezifisch (NICHT global wie Settings)

### Audio/Video Add-Ons
- Music Multi-Picker (Volume 0..1.5)
- TTS Voice-Over (OpenAI tts-1)
- Intro: Pick + Mode + IntroOverlayControls + Auto-Fit
- Live-Preview: Tap-to-Play, Mute, Skip, Scrubber, Sequential Multi-Source

### Cloud-Export End-to-End
- ExportSettingsModal (Resolution, FPS, Bitrate)
- Local-Notification bei Done
- 9:16 (1080×1920) ODER 16:9 (1920×1080) auto

### Gemini Thumbnails (Phase 9.8)
- Custom Game als ERSTE Option in Genre-Chips ✅ (commit `ff098c7`)
- Style-Picker (default/comic/realistic)
- API: `gemini-2.5-flash-image-preview`
- History-Gallerie pro Projekt in `documentDirectory/thumbnails/{projectId}/`

### Builder-Tab (alle Phases 1-12 ✅)
- TikTok-Parität, per-source-trim Pipeline, Sequential Multi-Source-Preview
- 16:9 Export, Multi-Clip-Import, Cumulative Scrubber
- AI-Highlights Quick-Add-Section (Phase A3.9)

### i18n × 9 vollständig
- 9 Sprachen (de/en/it/ru/es/fr/pt/nl/pl)
- ⚠️ A3.6/A3.7/A3.8/A3.9 Keys nur in EN+DE explizit — andere Sprachen via inline-Fallback

---

## 5. Features die TEILWEISE fertig sind

| Feature | Status | Notes |
|---|---|---|
| Highlight-Detection Gaming | 🟡 | A3.8 mit transient-detection + 50 Warzone-phrases, aber Whisper-cue-density bei pure-game-audio ohne Speech bleibt limitierend |
| Subtitle Metallic-Effect | 🟡 | libass blend-Single-Color (echter Gradient nicht möglich) |
| Layered Big-Word-Zoom-Animation | 🟡 | static im Mobile; Desktop hat `\t()` animation |
| Multi-URL Image-Upload Intro | ❌ | Heute nur Video. Image-Loop-to-Video-Pipeline fehlt (Worker-Side) |

---

## 6. Offene TODOs (priorisiert)

### Aktueller Status

```
✅ A1 → ✅ A2 → ✅ A3 (+A3.1-A3.11) → ✅ A4 (+A4.b/c/d) → ✅ A5 → ✅ A6.1 →
🔜 A6.2 → A6.3 → A6.4 → A6.5..A6.10 → B1..B2 → C1..C4 → D1..D3
```

### 🔴 Block A6 — Security Audit Findings (~5-7 Tage verbleibend)

| # | Phase | Aufwand | Audit-Ref |
|---|---|---|---|
| ~~A6.1~~ | ~~Rate Limiting Worker~~ ✅ | ~1h | P0-1 |
| **A6.2** | **`.ass` Content-Validation + Size-Limit** | 2h | P0-4 |
| **A6.3** | **Plan-Check + Monthly-Counter Worker** | 1d | P0-2 + Server-Enforcement von A5 |
| **A6.4** | **Typed RenderSpec — args[] off-client** | 2-3d | P0-3 (größte Bedrohung — service_role-Key exfiltrierbar!) |
| A6.5 | Logs sanitisieren + /health env-dump weg + R2-Pfad-Regex | 30m | P1-1+P1-2 |
| A6.6 | Stripe-Webhook event-id dedupe + Edge-Function CORS-Whitelist | 1h | P1-3+P1-4 |
| A6.7 | yt-dlp Härten (regex + drop --no-check-certificates + Version pin) | 30m | P1-5 |
| A6.8 | Electron CSP + sandbox + media:// path-validation | 1h | P1-8+P2-7 |
| A6.9 | R2 body-size + YT-Cookies SecureStore + sourceKey-ext-check | 1.5h | P2-1+P2-4+P2-6 |
| A6.10 | `npm audit` + Updates auf moderate+ CVEs | 1h | P3-12 |

📄 **Volldoku:** `SECURITY_AUDIT_2026-05-16.md` (4 P0 / 8 P1 / 8 P2 / 14 P3 Findings)

### 🟡 Block B — UX-Polishing (~7-12h)

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **B1** | Phase 9.11 Multi-Clip Manual + Drag-Reorder | 2-3h | `react-native-draggable-flatlist` — Native-Rebuild |
| **B2** | Phase Builder-11 Drag-to-Seek + Item-Switch | 1-2h | Scrubber wirkt nur im current item (Doku §7) |
| **B3** | Phase 9.7 Light-Theme | 4-6h | `lib/theme.ts` + Settings → Appearance Switch |
| **B4** | Image-Upload als Intro | 2-3h | ImagePicker + Worker image-loop-to-video Pipeline (FFmpeg `-loop 1 -t duration`) |

### 🟡 Block C — Video-Features (~14-22h, Mobile-Lücken ggü. Desktop)

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **C1** | Phase 9.14 Effects-System Mobile | 3-4h | `clip.effects` + FFmpeg eq/colorbalance/unsharp/motionBlur |
| **C2** | Phase 9.9 YouTube/Twitch URL-Import (mehrere via +-Button schon ✅) | 0h | Done in A3.7 |
| **C3** | Phase 9.13 Cross-Device-Sync | 6-8h | Supabase + RLS-Erweiterung + Storage-Bucket. Braucht A1 ✅ |
| **C4** | Audio-Ducking (Source-dimmen bei TTS) | 2-3h | FFmpeg `sidechaincompress` |
| **C5** | Watermark Overlay | 1-2h | Logo/Text-Overlay |
| **C6** | Color-Correction (lift/gamma/gain) | 2-3h | FFmpeg `colorlevels` |
| **C7** | Layered Big-Word-Zoom-Animation | 2-4h | libass `\t()` in `assBuilder.ts` |
| **C8** | Multi-Cam-Sync (Audio-Waveform-Alignment) — Stretch | 4-6h | |
| **C9** | YT-Direct-Upload | 3-5h | OAuth + YouTube Data API v3 |

### 🟢 Block D — Pre-Launch / Monetization (~12-18h)

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **D1** | Phase 9.15 Push-Token-Registrierung | ~2h | Expo-Push-Token in Supabase profiles |
| **D2** | Phase 9.16 EAS Auto-Update Mobile | ~3h | JS-only-OTA + Settings "Check for updates" |
| **D3** | Phase 9.17 RevenueCat IAP | 6-8h | Subscription-Gateway |

---

## 7. Datenmodell

### Project (`packages/mobile/src/data/demoProjects.ts`)

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
  // AI (A3.5/A3.11)
  aiHighlights?: AIHighlight[],          // separates Feld für HighlightsTab-Section
  perClipDurations?: number[],           // für Cue-Zuordnung in CueEditor (A3.2)
  // Misc
  errorMessage?, thumbnailHistory?,
}

interface DemoClip {
  id, startSec, endSec, label, score, thumbUri?,
  sourceIdx?: number,                    // A3.10.3 — verweist auf sourceUris[i]
  kind?: 'source' | 'highlight',         // A3.11 — type-marker
  reason?: string,                       // A3.11 — AI-detected reason
}

interface AIHighlight {
  startSec, endSec, score, label, reason?,
}

interface ProjectIntro {
  path, filename?,
  mode?: 'before' | 'overlay',
  scale?: number,                        // 0.2..4.0 (A4 in beiden modi aktiv)
  x?, y?: number,                        // 0..1
  durationSec?: number,                  // 0.5..30s overlay-only
}

interface SubtitleCue {
  text, startSec, endSec,
  words?: { text, startSec, endSec }[],
  clipIndex?: number,                    // A3.2 — welcher source-clip
}

interface SubtitleSettings { /* 30+ Properties wie Desktop */ }
```

### App-Settings (Mobile)

```ts
interface AppState {
  initializing, onboardingCompleted,
  facecamRegion, gameplayRegion,
  openaiKey, geminiKey, youtubeCookies,
  customSubtitlePresets, exportSettings,
  lastOpenedProjectId,
  introDefaults: { mode, x, y, scale, durationSec } | null,
}
```

---

## 8. Bekannte Bugs / Limits

| Bug / Limit | Status | Notes |
|---|---|---|
| Whisper-Quality bei reinem Game-Audio ohne Voice | by-design | Background-game-sounds dominieren |
| Vivo HEVC 1-Decoder OOM-Risk | env-dependent | 2 HEVC parallel = crash, deshalb sequential thumb-queue |
| Intro Image-Upload | offen | Phase B4 |
| Multi-Clip-AI-Highlight cross-boundary | future | Phase A3.9b: highlight über 2 source-clips spannend |
| Server-side Plan-Enforcement | offen | A6.3 — heute nur Client-Lock (umgehbar via curl) |

---

## 9. Wichtige Designentscheidungen

- **16:9 Master-First** (Desktop): Pipeline rendert 16:9, alles leitet ab
- **TikTok-Tab ≠ Builder-Tab**: TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9
- **Manual-Mode ohne AI**: Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local-FFmpeg auf Mobile**: MPEG-LA-Patent-Risk + HW-Constraints
- **R2 statt Supabase Storage**: unlimited free egress vs. 2 GB/Monat
- **Lazy-Load Native-Module** (try/catch + cached null): Boot ohne Native-Build
- **Files persistent** in documentDirectory (überlebt App-Restart)
- **Job-Queue concurrency=1** (Desktop): FFmpeg saturiert Hardware
- **AI-Highlights als clip.kind='highlight'**: einheitliches data model, direkt in Selectors nutzbar
- **Intro contain-only** (A4.d): keine cover-Flip-Sprünge bei scale=1
- **Default scale=0.4 bei pickIntro** (A4.c): sliders sofort funktional sichtbar

---

## 10. Security Audit Quick-Reference

📄 **Full report:** `SECURITY_AUDIT_2026-05-16.md`

### Critical noch offen (P0)
- **P0-2** Plan-Check Worker (A6.3) — Free-User können via curl Pro-Features
- **P0-3** Typed RenderSpec (A6.4) — args[] könnte service_role-Key exfiltrieren via FFmpeg `-i /proc/self/environ`
- **P0-4** `.ass` Validation (A6.2) — libass-Attacks via crafted .ass-File

### Bereits gesichert ✅
- A1 RLS-Baseline (REVOKE anon + narrow GRANTs)
- A6.1 Rate Limiting (express-rate-limit per-userId)
- Stripe-Webhook-Signature-Verification
- JWT-Validation im Worker
- Mobile Session in expo-secure-store
- R2 pre-signed URLs short-lived
- Electron contextIsolation/nodeIntegration off
- YouTube/Twitch Host-Allow-List

---

## 11. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Worker-Rev:** `00020-tqs` (A3.8.b astats fallback deployed 2026-05-17)
- **GitHub-Repo:** `garymikefischer-art/fiano`
- **Aktueller Branch:** `claude/modest-greider-5dd6e1`
- **Letzter Commit:** `c69c8fd` (A4.d intro contain-only)
- **Backup-Tag:** `pre-context-handoff-20260518`
- **Phone-Serial:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Mediatek HEVC 1-Decoder, 256 MB heap)

### Speicherorte

**Mobile:**
```
expo-secure-store  — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute,
                     Region-Defaults, exportSettings, introDefaults
AsyncStorage       — Projekte (fiano.projects), Notifications, YT-Cookies,
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

## 12. SYSTEM-PROMPT für neuen Chat (copy-paste)

```
Hi! Ich arbeite an "fiano" — Hybrid-Desktop+Mobile-Video-App mit Cloud-
Render-Backend. Wir haben Block A (A1-A5 + A6.1) abgeschlossen + Intro-
Refinements (A4.d contain-only fix). Bei Context-Limit pausiert.

Volle Doku: /Users/garyfischer/Downloads/fiano-monorepo/PROJECT_SUMMARY_MOBILE.md
PLUS: SECURITY_AUDIT_2026-05-16.md (Security Findings)
Lies BEIDE zuerst.

# SYSTEM-PROMPT
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano":

**Stack:**
- Desktop: Electron 31 + TS + React 18 + Tailwind + Zustand + bundled FFmpeg/yt-dlp
- Mobile: Expo SDK 52 + RN 0.76 + Supabase JS SDK + react-native-video/svg
- Cloud-Render: Google Cloud Run (Express + Node 22 + FFmpeg + yt-dlp) + Cloudflare R2
- Endpoints: /v1/upload-url, /v1/render, /v1/download, /v1/transcribe
- Args-Platzhalter: {SRC}/{SRC_N}/{INTRO}/{MUSIC_N}/{VO_N}/{ASS}/{DST}

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
Expected-Outcomes. User-Wunsch vom 2026-05-12.

**Mobile-Wichtig:**
- Native-Module via lazy-load mit try/catch (sounds.ts pattern)
- Source-Files via persistInDocuments() in documentDirectory
- Bei neuer Native-Dep ODER app.json-Plugin: npx expo prebuild --clean
- JS-only: npm run start:clear (NICHT nur r bei Env-Var-Änderungen!)
- Vivo HEVC 1-Decoder → sequenzielle thumb-extraction, largeHeap=true
- Worktrees haben KEINE node_modules — Mobile vom Main starten ODER
  npm install im Worktree (~2 min, ~1.5 GB)

**Worker-Wichtig:**
- Bei Code-Änderung: cd services/render-worker && gcloud run deploy
  fiano-render-worker --source . --region europe-west1 --memory 2Gi
  --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
- env-vars bleiben. Bei neuen: --set-env-vars KEY=VAL
- Logs: gcloud run services logs read fiano-render-worker
  --region europe-west1 --limit 50

**Git-Workflow:**
Claude in worktree-branch claude/<id>. User merged in main:
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git stash; git fetch origin
  git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
  git push origin main; git stash pop

**Auto-Update:**
- Desktop (wired): git tag v0.2.X → npm run release:mac → electron-updater
- Mobile (Phase D2): EAS Update geplant
- Cloud-Worker (manuell): gcloud run deploy bei Code-Update

---

# Nächste Phasen (Reihenfolge):

🔴 A6.2 → A6.3 → A6.4 (Security P0-4/P0-2/P0-3 Fixes)
🟡 A6.5 → A6.6 → A6.7 → A6.8 → A6.9 → A6.10 (P1/P2/P3 Findings)
🟡 B1 (Drag-Reorder) → B2 (Drag-to-Seek) → B3 (Light-Theme) → B4 (Image-Intro)
🟢 C1-C9 (Effects, Cross-Sync, Audio-Ducking, Watermark, Color-Correction, etc.)
🟢 D1-D3 (Push, EAS, RevenueCat) — Pre-Launch

---

# Quick-Reference
- Worker-URL: https://fiano-render-worker-491699066139.europe-west1.run.app
- Worker-Rev: 00020-tqs
- Aktueller Branch: claude/modest-greider-5dd6e1
- Letzter Commit: c69c8fd (A4.d intro contain-only)
- Backup-Tag: pre-context-handoff-20260518

Bitte lies PROJECT_SUMMARY_MOBILE.md + SECURITY_AUDIT_2026-05-16.md
durch und sag dann was du als ersten Schritt empfiehlst.
Mein Vorschlag: A6.2 (.ass Validation, P0-4, 2h).
Nicht vergessen vor Start: git tag pre-phase-X.Y-backup && git push --tags.
```

---

**Stand 2026-05-18** — Block A abgeschlossen + Intro-Polish.
Letzter Commit `c69c8fd`. Backup-Tag `pre-context-handoff-20260518`.
Worker rev `00020-tqs` aktiv. Branch `claude/modest-greider-5dd6e1`.

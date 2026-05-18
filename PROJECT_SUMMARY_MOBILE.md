# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-19** — Block A komplett (A1-A6.10 inkl. alle P0/P1/P2 Audit-Fixes).
> Block B teilweise (B0+B2+B4 done, B1+B3 deferred). Stripe Mobile Checkout + Paywall-Gate funktional.
> Branch: `claude/relaxed-borg-6f90d1`. Backup-Tag: `pre-context-handoff-20260519`. Worker v0.3.0 live.

---

## 1. Architektur

### Tech-Stack

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, react-router HashRouter, **bundled FFmpeg + yt-dlp**, electron-updater, Supabase Auth+DB, Stripe, Resend SMTP. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52 + RN 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library/web-browser/linking, Supabase JS SDK, Stripe Checkout via WebBrowser. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp **pinned 2025.01.15**). Cloudflare R2 (S3-API). v0.3.0. |

### Wichtige Systeme

- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range-Support + **Path-Allow-List** (A6.8: userData/videos/documents/downloads/desktop/pictures/home/temp)
- **Job Queue** (Desktop, `core/queue.ts`): serialisiert FFmpeg-Pipelines
- **IPC Layer**: typed Channels `IpcResponse<T>` (contextBridge)
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT + **typed RenderSpec** (A6.4)
- **Settings**: Desktop userData/*.json + safeStorage; Mobile expo-secure-store + AsyncStorage
- **Mobile File-Persistence**: `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails}/`
- **App-Paywall-Gate** (Mobile, A6.3.2): User ohne aktive Creator/Pro Sub kommt nicht in die App
- **Stripe Checkout via WebBrowser** (Mobile, A6.3.5): `fiano://stripe-success` deep-link + polling für webhook race (A6.3.6)
- **AppAlert** (Mobile, A6.3.7): drop-in für Alert.alert mit fiano-Design statt OS-Native
- **TrimModal** (Mobile, B5): Scissors-Trim auf jedem Clip in 9:16-Tab + Builder (B0) + Split-at-Playhead
- **AssValidator** (3 Plattformen, A6.2): libass-DoS-Protection vor Render

### Cloud-Render-Pipeline (mit A6.4 typed spec)

```
Mobile/Desktop          Google Cloud Run          Cloudflare R2
─────────────          ────────────────          ─────────────
POST /v1/upload-url  → pre-signed PUT
PUT file             ────────────────────→ sources/{user}/...
POST /v1/render      → ├ download from R2 ←
  spec: typed JSON     ├ validate spec (allow-list, range-checks)
                       ├ check+increment quota (plan-limits)
                       ├ buildTikTokExportArgs SERVER-side
                       ├ ffmpeg ${args}  (kein client-controlled flag!)
                       ├ upload result   ──→ outputs/{user}/...
                       └ signed DL-URL
```

**A6.4 BREAKING**: Mobile sendet `spec: ClientRenderSpec` statt `args[]`. Worker baut args server-side → **keine FFmpeg-Argument-Injection mehr möglich** (war kritischste P0-Bedrohung).

---

## 2. Ordnerstruktur (Monorepo)

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                            ← Desktop (Electron Main + Renderer)
│   ├── main/                       ← Electron Main (Node)
│   │   ├── index.ts                ← BrowserWindow, CSP (Prod only), media://, sandbox=false
│   │   ├── ipc.ts                  ← typed IPC-Channels
│   │   └── core/                   ← queue, pipeline, auth, settings, ffmpeg
│   ├── preload/                    ← contextBridge
│   └── renderer/                   ← Vite + React + Tailwind
│       └── src/
│           ├── pages/              ← ProjectDetail, SettingsPage, PricingPage, ThumbnailPage
│           ├── components/         ← FeatureLock, UpgradeModal, TikTokTab, EditorTab
│           ├── stores/             ← authStore, projectsStore
│           └── lib/                ← features.ts, i18n/{lang}.ts
├── packages/
│   ├── shared/                     ← Desktop + Mobile (Symlink-Monorepo)
│   │   ├── src/types.ts            ← Project, Highlight, ClipSegment, SubtitleSettings, TikTokLayout
│   │   ├── src/subtitles.ts        ← SubtitleCue + Parser
│   │   ├── src/ffmpegArgs.ts       ← buildTikTokExportArgs (Worker hat eigene Kopie!)
│   │   ├── src/assBuilder.ts       ← SubtitleSettings → libass .ass-Datei
│   │   ├── src/assValidator.ts     ← A6.2 ASS Content-Validation
│   │   └── src/i18n/locales/       ← 9 Sprachen (de/en/es/fr/it/nl/pl/pt/ru)
│   └── mobile/                     ← Expo + React Native
│       ├── App.tsx                 ← Root: Auth + deep-link handler + AppAlertHost
│       ├── app.config.js           ← Inline-Plugin (largeHeap=true Android)
│       ├── app.json                ← Expo Base-Config (scheme=fiano)
│       ├── metro.config.js         ← Workspaces + disableHierarchicalLookup
│       └── src/
│           ├── screens/            ← ProjectDetail (4 Tabs), Library, AddVideoProject,
│           │                        Export, Settings, Pricing, ThumbnailGenerator
│           ├── components/         ← VideoPlayer, FeatureLock, UpgradeModal, ActionSheet,
│           │                        SubtitleSettingsModal, ExportSettingsModal, CueEditorModal,
│           │                        RegionPickerModal (B4: image upload), MultiAudioPicker,
│           │                        IntroOverlayControls, TrimModal (B5), AppAlert (A6.3.7)
│           ├── stores/             ← Zustand: app, auth, projects, notifications, upgradeModal
│           ├── lib/                ← supabase, sounds, haptics, thumbnails, features.ts,
│           │                        whisper, tts, gemini, renderJob (ClientRenderSpec)
│           ├── navigation/         ← Root + MainTabs Param-Types (PaywallMode)
│           └── data/demoProjects.ts ← DemoProject, DemoClip, AIHighlight
└── services/
│   └── render-worker/              ← Cloud Run FFmpeg-Worker (separates Deploy)
│       ├── Dockerfile              ← Node 22 + apt-ffmpeg + yt-dlp pinned 2025.01.15
│       ├── src/
│       │   ├── index.ts            ← Express + Endpoints + Rate-Limit + Plan-Check
│       │   ├── auth.ts             ← Supabase JWT-Middleware
│       │   ├── planCheck.ts        ← A6.3 Quota + RPC-Call (creator=30, pro=200)
│       │   ├── renderSpec.ts       ← A6.4 ClientRenderSpec validator + spec-to-opts
│       │   ├── ffmpegArgs.ts       ← !! COPY of shared/src/ffmpegArgs.ts (sync needed!)
│       │   ├── assValidator.ts     ← !! COPY of shared/src/assValidator.ts (sync needed!)
│       │   ├── r2.ts               ← Cloudflare R2 (S3 via @aws-sdk) + MAX_UPLOAD_BYTES
│       │   ├── render.ts           ← FFmpeg-spawn + Timeout
│       │   ├── transcribe.ts       ← Whisper + Highlight-Detection
│       │   ├── audioEnergy.ts      ← ebur128 + astats fallback
│       │   ├── highlights.ts       ← Gaming + Podcast profiles
│       │   └── youtube.ts          ← yt-dlp (pinned + ALLOWED_PATH_RX)
└── supabase/
    ├── config.toml                 ← verify_jwt overrides
    ├── functions/                  ← stripe-checkout, stripe-portal, stripe-webhook,
    │                                 delete-account (alle CORS-Whitelist A6.6)
    └── migrations/
        ├── 001_rls_baseline.sql    ← A1 RLS + GRANTs
        ├── 002_render_quota.sql    ← A6.3 render_usage table + RPC quota
        └── 003_stripe_events_dedupe.sql ← A6.6 webhook idempotency
```

### Code-Propagation Rules

- **`packages/shared/`** wirkt auf BEIDE Plattformen (Symlink) — Desktop + Mobile
- **`src/`** nur Desktop
- **`packages/mobile/`** nur Mobile
- **`services/render-worker/`** nur Cloud-Worker (separates Deploy)
- **⚠️ Worker hat eigene Kopien** von `ffmpegArgs.ts` + `assValidator.ts` (kein @fiano/shared dep) → bei Updates BEIDE Files syncen!

---

## 3. Wie Code-Änderungen funktionieren

### Symlinked Shared-Code (automatisch)

Änderungen in `packages/shared/src/*` greifen direkt auf Desktop + Mobile.
**ABER:** Worker hat eigene Kopien — manuell syncen wenn ffmpegArgs.ts oder assValidator.ts geändert werden.

### Mobile-only Änderungen

```bash
# JS-only (UI/Logic):
cd packages/mobile && npm run start:clear     # Metro reload (r-Taste)

# Native-Module/app.json/build.gradle:
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android   # 3-5 min
```

### Desktop-only Änderungen

```bash
# Dev mit HMR:
npm run dev

# Production-Test-Build (kein Upload):
npm run build:mac      # arm64 + x64 DMG
npm run build:win      # NSIS x64 (von Windows-PC)

# Release mit Auto-Update zu GitHub Releases:
npm run release:mac    # bundled FFmpeg + signed + GitHub-upload
npm run release:win
```

### Worker-only Änderungen

```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
# Health:
curl https://fiano-render-worker-491699066139.europe-west1.run.app/health
# Logs:
gcloud run services logs read fiano-render-worker --region europe-west1 --limit 50
```

### Supabase-Änderungen

```bash
# Migration:
# - SQL Editor im Dashboard (https://supabase.com/dashboard/project/zibzcaknqzxgwootfjxc)
# - ODER: supabase db push (CLI)

# Edge-Functions:
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy delete-account
```

---

## 4. Git-Workflow + Auto-Update

### Claude-Worktree-Pattern

Claude arbeitet in `claude/<branch-id>` unter `.claude/worktrees/<branch-id>/`.
Branch wird zu `origin/garymikefischer-art/fiano` gepusht.

**User merged in main:**
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

**Vor jeder größeren Phase:**
```bash
git tag pre-phase-X.Y-backup && git push origin pre-phase-X.Y-backup
```
Rollback (nur eigener Worktree-Branch):
```bash
git reset --hard pre-phase-X.Y-backup
```

**Aktuelle wichtige Backup-Tags:**
- `pre-context-handoff-20260519` ← **aktuell**
- `pre-phase-b-bundle-20260518`
- `pre-phase-a6.4-typed-renderspec-20260518`
- `pre-phase-a6.3-plan-check-20260518`
- `pre-phase-a6.2-ass-validation-20260518`

### Auto-Update

| Plattform | Mechanismus | Status |
|---|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater pulls beim App-Start | ✅ wired |
| **Mobile** | EAS Update für JS-only-OTA (`eas update --channel production`) | ❌ Phase D2 |
| **Cloud-Worker** | `gcloud run deploy` manuell, Zero-Downtime | ✅ wired |
| **Edge Functions** | `supabase functions deploy <name>` manuell | ✅ wired |

---

## 5. ✅ Features die FERTIG sind

### Auth + i18n + Onboarding
- Supabase Email-Login + Google OAuth + Email-Confirm-Redirect (A6.3.3 fiano://auth-callback)
- 9 Sprachen, Onboarding-Carousel, custom Back-Button in SignupScreen (A6.3.4)
- **App-Paywall-Gate (A6.3.2):** User ohne Creator/Pro Sub kommt nicht in App
- **AppAlert (A6.3.7):** alle 49 Native-Alerts in fiano-Design

### Subscription / Monetization
- Stripe Mobile Checkout via WebBrowser (A6.3.5) + Webhook-Race-Poll (A6.3.6) + Refresh-Button-Fallback
- Pricing-Screen Mobile: Creator 17,99 €/Mon + Pro 29,99 €/Mon (Lifetime nur Desktop)
- Plan-Check Server-side (A6.3): inactive=0, creator=30, pro=200 Renders/Monat
- Subscription-Status in `subscriptions`-Table via Stripe-Webhook

### Security (Block A6 — alle P0/P1/P2 Audit-Findings)
- **A1** RLS-Baseline: profiles + subscriptions, explicit GRANTs
- **A6.1** Rate Limiting Worker (per-userId, 30/5/5/3 per min)
- **A6.2** .ass Content-Validation (3 Plattformen: Mobile + Worker + Desktop)
- **A6.3 + .1 + .2** Plan-Check + Paywall-Gate + Lifetime entfernt aus Mobile
- **A6.4** Typed RenderSpec — args[] off-client (KRITISCHSTE Fix, P0-3)
- **A6.5** Worker logs sanitize + R2 path-traversal regex
- **A6.6** Stripe webhook dedupe + Edge-Fn CORS Whitelist
- **A6.7** yt-dlp hardening (--no-check-certs entfernt, version pinned, path-regex)
- **A6.8** Electron CSP (Prod only) + media:// path-allow-list (sandbox=false reverted A6.8.1)
- **A6.9** R2 body-size + sourceKey ext-check + YT cookies in SecureStore
- **A6.10** npm audit dokumentiert (dev-deps only, --force pre-release)

### Project Detail (Mobile, 4 Tabs)
- **Highlights**: AI-Clip-Liste, AI-Highlights-Section, Multi-Select
- **Manual**: Mark-In/Out, Source-Switcher, Clip-Liste
- **9:16 (TikTok)**: Stacked/Split/Full, Region-Cards, Per-Project Region-Edit, Single + Multi-Clip-Export (B6 Multi-Select-Checkbox), Intro x/y/scale, **Scissors-Trim auf jedem Clip (B5 TrimModal)**, Split-at-Playhead
- **Builder**: 16:9 YouTube-Cut, **Scissors-Trim auf Highlight-Clips (B0)**, **Drag-to-Seek (B2)**, ExtraTrimEditor

### Cloud-Render-Worker (v0.3.0 live)
- /health (A6.5: minimal, kein env-fingerprint)
- /v1/upload-url (kinds: source/intro/music/voice-over/subtitle)
- /v1/render (spec-flow A6.4 oder legacy args)
- /v1/download (yt-dlp YouTube/Twitch → R2, A6.7 hardened)
- /v1/transcribe (Whisper word-timestamps + audio-energy + Highlight)
- Plan-Check + monthly quota
- ASS-Validator (A6.2): vor libass-Pipe

### Subtitle System
- Whisper word-timestamps + per-word chunking
- libass (.ass) Renderer mit Style-Parität: Glow, Drop-Shadow, Layered, Metallic
- Cue-Editor mit per-clip Section-Header (Multi-Clip)
- A6.2 ASS-Validator: size-limit + drawing-mode-block + override-caps
- Multi-Source-Subtitle-Mapping (B6.1 + B6.3): clipIndex + perClipDurations korrekt

### Intro System (alle A4 + B-Updates)
- **before-Mode**: scale + x/y, FFmpeg `pad x/y` Expressions (video-bounds-based, A4.f)
- **overlay-Mode**: scale (0.2..1.0 Mobile-cap), x/y, duration, contain rendering
- IntroOverlayControls (4 Presets + 4 Slider + UX-Hint bei scale=100%)
- **Y-Slider edge-to-edge** unabhängig von Aspect (A4.f)
- A6.4 Worker pipeline: `scale=W*scale:-2` + `overlay=(W-w)*X:(H-h)*Y`

### Region-Edit (Mobile B4)
- RegionPickerModal: 3 Upload-Optionen — Gallery video / Files video / **Image** (B4)
- Image-Mode: Screenshot statt Video als Background für Region-Calibration
- Drei equal-width Buttons in einer Reihe (B4.1 fix)

### Audio/Video Add-Ons
- Music Multi-Picker (Volume 0..1.5, shuffle)
- TTS Voice-Over (OpenAI tts-1)
- Intro: Pick + Mode-Chips + IntroOverlayControls
- Live-Preview: Tap-to-Play, Mute, Skip, Scrubber, **Drag-to-Seek über Cumulative-Timeline (B2)**

### Cloud-Export End-to-End
- ExportSettingsModal (Resolution, FPS, Bitrate)
- 9:16 (1080×1920) ODER 16:9 (1920×1080) auto
- **Multi-Clip-Select-Export (B6)** mit user-gewählten clips
- Clip-Trim + Split-at-Playhead (B5)
- Plan-Check 4K only for Pro+ (A6.3)

### Gemini Thumbnails
- **Custom Game als ERSTE Option** in Genre-Chips ✅ (commit `ff098c7`, verified)
- Style-Picker (default/comic/realistic)
- API: `gemini-2.5-flash-image-preview`
- History-Gallerie pro Projekt in `documentDirectory/thumbnails/{projectId}/`

### i18n × 9
- 9 Sprachen (de/en/it/ru/es/fr/pt/nl/pl)
- ⚠️ A6+ und B-phase Keys nur in EN+DE explizit — andere Sprachen via inline-Fallback

---

## 6. 🟡 Features die TEILWEISE fertig sind

| Feature | Status | Notes |
|---|---|---|
| Highlight-Detection Gaming | 🟡 | Whisper-cue-density bei pure-game-audio bleibt limitierend |
| Subtitle Metallic-Effect | 🟡 | libass blend-Single-Color (echter Gradient nicht möglich) |
| Layered Big-Word-Zoom-Animation | 🟡 | static im Mobile; Desktop hat `\t()` animation |

---

## 7. 🔜 OFFENE TODOs

```
✅ A1-A6.10 → ✅ B0+B2+B4 → 🔜 B1+B3 → 🔜 C1..C10 → 🔜 D1..D3
```

### 🟡 Block B verbleibend — UX-Polish (User wartet)

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **B1** | Multi-Clip Drag-Reorder | 2-3h | `react-native-draggable-flatlist` + `react-native-reanimated` — **Native-Rebuild** |
| **B3** | Light-Theme | 4-6h | `lib/theme.ts` + Settings → Appearance Switch + ~30 Screen-Migrationen |

### 🟢 Block C — Video-Features (Mobile-Lücken ggü. Desktop)

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **C1** | Effects-System Mobile | 3-4h | `clip.effects` + FFmpeg eq/colorbalance/unsharp |
| **C3** | Cross-Device-Sync | 6-8h | Supabase + RLS-Erweiterung + Storage-Bucket |
| **C4** | Audio-Ducking | 2-3h | FFmpeg `sidechaincompress` (TTS senkt Source) |
| **C5** | Watermark Overlay | 1-2h | Logo/Text-Overlay |
| **C6** | Color-Correction | 2-3h | FFmpeg `colorlevels` |
| **C7** | Layered Big-Word-Zoom-Animation | 2-4h | libass `\t()` in `assBuilder.ts` |
| **C8** | Multi-Cam-Sync (Stretch) | 4-6h | Audio-Waveform-Alignment |
| **C9** | YT-Direct-Upload | 3-5h | OAuth + YouTube Data API v3 |
| **C10** | Image-Upload als Intro | 2-3h | Worker image-loop-to-video Pipeline |

### 🟢 Block D — Pre-Launch / Monetization

| # | Phase | Aufwand | Notes |
|---|---|---|---|
| **D1** | Push-Token-Registrierung | ~2h | Expo-Push-Token in Supabase profiles |
| **D2** | EAS Auto-Update Mobile | ~3h | JS-only-OTA + Settings "Check for updates" |
| **D3** | RevenueCat IAP | 6-8h | Google Play Billing + Apple IAP (**Play-Store-Submission-Blocker!**) |

### 🔴 Memory-tracked Future-Features (`future_features.md`)

- npm audit fix --force vor Production-Release (dev-deps, ~30min)
- R2 lifecycle rule für sources/* > 7d (Dashboard-Task)
- Desktop sandbox=true re-enablen (preload refactor needed)
- Desktop CSP härten: nonce-based scripts statt unsafe-inline/unsafe-eval
- SecureStore 2KB Chunking für Supabase-Session
- Hosted Web-Page für Auth-Email-Redirect (Cross-Device, Domain kaufen)

### 🔴 1 KNOWN ISSUE zu verifizieren

**Desktop Intro-Position Parität zu Mobile A4.f:** Mobile baut typed spec → Worker. Desktop nutzt local FFmpeg via `src/main/core/ffmpeg.ts` — separate Pipeline. Sollte mit shared/ffmpegArgs.ts erneut verifiziert werden — Desktop muss möglicherweise auch auf `scale=W*scale:-2` + `overlay=(W-w)*X:(H-h)*Y` upgraden für identische Intro-Y-Slider-Math.

---

## 8. Datenmodell

```ts
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  sourceUri?, sourceUris?, sourceUrl?, thumbUri?, videoType?, sourceType?,
  trimStart?, trimEnd?, createdAt?, mode?,
  facecamRegion?, gameplayRegion?, splitRatio?, fullOffsetX?, tiktokLayout?,
  clipOrder?,
  voiceOvers?, subtitles?, musicTracks?, musicShuffle?, intro?, builderExtras?,
  aiHighlights?: AIHighlight[],
  perClipDurations?: number[],     // für Cue-Zuordnung Multi-Source
  errorMessage?, thumbnailHistory?,
}

interface DemoClip {
  id, startSec, endSec, label, score, thumbUri?,
  sourceIdx?: number,              // A3.10.3 — sourceUris[i] index
  kind?: 'source' | 'highlight',   // A3.11 — type-marker
  reason?: string,                  // A3.11 — AI-detected reason
}

interface ProjectIntro {
  path, filename?,
  mode?: 'before' | 'overlay',
  scale?: number,                  // 0.2..1.0 (Mobile-cap A4.e)
  x?, y?: number,                  // 0..1
  durationSec?: number,
}

interface SubtitleCue {
  text, startSec, endSec,
  words?: { text, startSec, endSec }[],
  clipIndex?: number,              // A3.2 — multi-source mapping
}

// A6.4 NEW — Mobile → Worker:
interface ClientRenderSpec {
  width, height, fps, bitrate, encoder,
  layout: 'stacked' | 'split' | 'full',
  facecamRegion, gameplayRegion, splitRatio?, fullOffsetX?,
  trimStart?, trimEnd?,
  sourceAudioVolume?,
  music?: { volume }[],            // path implicit aus upload-order
  voiceOvers?: { startSec, volume }[],
  subtitle?: { useAss, text?, cues?, fontSize?, color?, ... },
  intro?: { mode, scale?, x?, y?, durationSec? },
  clips?: { src?, startSec, endSec }[],
}
```

### Plan-Limits (Worker + SQL synced)

```
inactive/no-sub:  0 renders     → 402 subscription_required
creator:          30 renders/M  max 1080p (kein 4K)
pro:              200 renders/M 4K OK
(Lifetime: Desktop-only, kein Mobile-Cloud-Render)
```

---

## 9. ⚠️ Bekannte Bugs / Limits

| Bug / Limit | Status | Notes |
|---|---|---|
| Whisper-Quality bei reinem Game-Audio | by-design | Background-sounds dominieren |
| Vivo HEVC 1-Decoder OOM-Risk | env-dependent | 2 HEVC parallel = crash, deshalb sequential thumb-queue |
| Image-Upload **als Intro** (nicht test-image) | offen | Phase C10 |
| Multi-Clip-AI-Highlight cross-boundary | future | |
| Desktop Intro A4.f-Parität | unverified | Desktop separate FFmpeg-Pipeline |
| SecureStore 2KB Warning | low-prio | Supabase-Session ~3KB, future Expo könnte fail'n |

---

## 10. Wichtige Designentscheidungen

- **16:9 Master-First** (Desktop): Pipeline rendert 16:9, alles leitet ab
- **TikTok-Tab ≠ Builder-Tab**: TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9
- **Manual-Mode ohne AI**: Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local-FFmpeg auf Mobile**: MPEG-LA-Patent-Risk + HW-Constraints
- **R2 statt Supabase Storage**: unlimited free egress vs. 2 GB/Monat
- **Lazy-Load Native-Module** (try/catch + cached null): Boot ohne Native-Build
- **Files persistent** in documentDirectory (überlebt App-Restart)
- **AI-Highlights als clip.kind='highlight'**: einheitliches data model
- **A4.f Intro video-bounds-based**: Y-Slider edge-to-edge unabhängig von aspect
- **A6.4 Typed RenderSpec**: Mobile sendet typed JSON, Worker baut args server-side
- **App-Paywall-Gate**: kein App-Zugang ohne aktive Creator/Pro Sub (Mobile)
- **Worker = Mobile only**: Desktop nutzt local FFmpeg, A6.4 security ist Mobile-only

---

## 11. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Worker-Rev:** v0.3.0
- **GitHub-Repo:** `garymikefischer-art/fiano`
- **Aktueller Branch:** `claude/relaxed-borg-6f90d1`
- **Backup-Tag:** `pre-context-handoff-20260519`
- **Phone-Serial:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Mediatek HEVC 1-Decoder, 256 MB heap)

### Speicherorte

**Mobile:**
```
expo-secure-store  — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute,
                     Region-Defaults, exportSettings, introDefaults,
                     YT-Cookies (A6.9 migrated)
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
  Lifecycle: 7 Tage (TODO: in R2-Dashboard konfigurieren)
fiano-renders/outputs/{userId}/{projectId}/{jobId}.mp4
  Lifecycle: 7 Tage
```

### Supabase

- **Project:** `zibzcaknqzxgwootfjxc`
- **Site URL** (Auth): `http://127.0.0.1:51999/auth-callback` (Desktop-Loopback, vor Live-Gang `https://fiano.app/auth-callback` mit hosted Bridge-Page)
- **Redirect URLs Whitelist:** `fiano://`, `exp://**/auth-callback`, `https://*.expo.dev/**`, `http://127.0.0.1:51999/**`
- **Email-Confirm:** AKTIVIERT (Mobile passt `emailRedirectTo` mit fiano://auth-callback)

---

## 12. SYSTEM-PROMPT für neuen Chat (copy-paste)

```
Hi! Ich arbeite an "fiano" — Hybrid-Desktop+Mobile-Video-App mit Cloud-
Render-Backend. Block A komplett (A1-A6.10 inkl. alle P0-P2 Security-
Audit Fixes), Block B teilweise (B0+B2+B4 done, B1+B3 deferred), Stripe
Mobile Checkout + Paywall-Gate funktional. Bei Context-Limit pausiert.

Volle Doku in:
/Users/garyfischer/Downloads/fiano-monorepo/PROJECT_SUMMARY_MOBILE.md
PLUS: /Users/garyfischer/Downloads/fiano-monorepo/SECURITY_AUDIT_2026-05-16.md
PLUS: ~/.claude/projects/-Users-garyfischer-Downloads-fiano-monorepo/memory/future_features.md
Lies ALLE 3 zuerst.

# SYSTEM-PROMPT
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano":

Stack:
- Desktop: Electron 31 + TS + React 18 + Tailwind + Zustand + bundled FFmpeg/yt-dlp
  + electron-updater + Supabase + Stripe. 9 Sprachen. v0.2.0.
- Mobile: Expo SDK 52 + RN 0.76 + Supabase JS SDK + react-native-video v6 +
  Stripe Checkout via WebBrowser + custom AppAlert + Paywall-Gate
- Cloud-Render: Google Cloud Run v0.3.0 (Express + Node 22 + apt-ffmpeg + yt-dlp
  pinned 2025.01.15) + Cloudflare R2. Endpoints: /v1/upload-url, /v1/render
  (typed spec!), /v1/download, /v1/transcribe
- Plan-Quota: inactive=0, creator=30/Mon, pro=200/Mon, 4K only Pro+

Working Dir: /Users/garyfischer/Downloads/fiano-monorepo/
GitHub: garymikefischer-art/fiano

Monorepo:
- src/ — Desktop
- packages/shared/ — Symlinked geteilt (types, i18n×9, ffmpegArgs, assBuilder,
  assValidator, subtitles)
- packages/mobile/ — Expo + React Native
- services/render-worker/ — Cloud Run (HAT eigene Kopien von ffmpegArgs.ts +
  assValidator.ts — bei Updates BEIDE syncen!)
- supabase/ — Edge Functions (4) + migrations (001+002+003)

Arbeitsstil: Deutsch, MVP-First, Plan zeigen → OK abwarten → implementieren.
i18n × 9 immer. Vor jeder größeren Phase: git tag pre-phase-X.Y-backup.

Memory-Feedback (sehr wichtig): Nach JEDEM Code-Ship einen
"🧪 Was du testen sollst"-Block mit Shell-Befehlen + Click-Path +
Expected-Outcomes.

Mobile-Wichtig:
- App-Paywall-Gate: User ohne aktive Creator/Pro Sub kommt nicht in App
- Native-Module via lazy-load (try/catch, sounds.ts pattern)
- Source-Files via persistInDocuments() in documentDirectory
- Native-Rebuild: npx expo prebuild --clean && npx expo run:android (3-5 min)
- JS-only: cd packages/mobile && npm run start:clear (Metro: r reload)
- Vivo HEVC 1-Decoder → sequenzielle thumb-extraction, largeHeap=true
- Worktrees haben KEINE node_modules — Mobile vom Main starten
- Use custom appAlert() from '../components/AppAlert' statt Alert.alert
- typed RenderSpec ist canonical API für /v1/render (legacy args optional)

Worker-Wichtig:
- Bei Code: cd services/render-worker && gcloud run deploy
  fiano-render-worker --source . --region europe-west1 --memory 2Gi
  --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
- ffmpegArgs.ts + assValidator.ts: WORKER hat eigene Kopien
  (kein @fiano/shared dep) — bei Updates BEIDE Files syncen
- env-vars bleiben. Bei neuen: --set-env-vars KEY=VAL
- Logs: gcloud run services logs read fiano-render-worker
  --region europe-west1 --limit 50

Desktop-Wichtig:
- sandbox=false (sandbox=true brach preload — future TODO)
- CSP nur in Production (Dev braucht unsafe-eval für Vite HMR)
- media:// allow-list: userData/videos/documents/downloads/desktop/pictures/home/temp
- Dev: npm run dev
- Production: npm run build:mac / build:win (Test, kein upload)
- Release+Auto-Update: npm run release:mac / release:win (GitHub Releases)

Git-Workflow:
Claude in worktree-branch claude/<id>. User merged in main:
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git stash; git fetch origin
  git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
  git push origin main; git stash pop

Supabase:
- Project: zibzcaknqzxgwootfjxc
- Site URL: http://127.0.0.1:51999/auth-callback (vor live-gang fiano.app!)
- Edge Functions: 4 deployed (stripe-{checkout,portal,webhook}, delete-account)
- Migrations: 001 RLS, 002 quota, 003 stripe-events-dedupe

Auto-Update:
- Desktop (wired): git tag v0.2.X → npm run release:mac → electron-updater
- Mobile (Phase D2 NICHT wired): EAS Update geplant
- Cloud-Worker (manuell): gcloud run deploy

---

# Nächste Phasen (Reihenfolge):

🟡 Sofort (User-Wunsch):
- B1 Multi-Clip Drag-Reorder (2-3h, npm install + Native-Rebuild)
- B3 Light-Theme (4-6h, ~30 Screen-Migrationen)

🟢 Pre-Launch (für Play-Store-Submission):
- D2 EAS Auto-Update Mobile (3h)
- D1 Push-Token Registrierung (2h)
- D3 RevenueCat IAP (6-8h) — BLOCKER für Play Store
- Desktop Intro-Parität checken (A4.f auf Desktop verifizieren)

🟢 Feature-Erweiterung (optional):
- C1 Effects, C3 Cross-Sync, C4 Audio-Ducking, C5 Watermark,
  C6 Color-Correction, C7 Layered Zoom, C8 Multi-Cam-Sync, C9 YT-Direct-Upload,
  C10 Image-as-Intro

🔴 Memory-tracked TODOs (future_features.md):
- npm audit fix --force pre-release
- R2 lifecycle rule (Dashboard task)
- Desktop sandbox=true (preload refactor)
- SecureStore chunking für Supabase-Session
- Hosted web-page für auth-redirect

---

# Quick-Reference
- Worker-URL: https://fiano-render-worker-491699066139.europe-west1.run.app
- Worker-Rev: v0.3.0
- Aktueller Branch: claude/relaxed-borg-6f90d1
- Backup-Tag: pre-context-handoff-20260519
- Phone-Serial: ANDROID_SERIAL=10AF7Y16R70010X

Bitte lies PROJECT_SUMMARY_MOBILE.md + SECURITY_AUDIT_2026-05-16.md +
future_features.md durch und sag dann was du als ersten Schritt
empfiehlst.

Mein Vorschlag: B1 Drag-Reorder (User-Wunsch direkt) ODER D2 EAS-Update
(Pre-Launch quick-win).
Nicht vergessen vor Start: git tag pre-phase-X.Y-backup && git push --tags.
```

---

**Stand 2026-05-19** — Block A komplett (P0+P1+P2 Security alle gefixt).
Block B: B0+B2+B4 done, B1+B3 deferred (eigene Sessions).
Backup-Tag `pre-context-handoff-20260519`. Branch `claude/relaxed-borg-6f90d1`.
Worker v0.3.0 live mit typed RenderSpec + plan-check + log-sanitize.

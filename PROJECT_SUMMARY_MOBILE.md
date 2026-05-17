# 📋 PROJECT SUMMARY — fiano (Mobile + Desktop Hybrid)

> **Stand: 2026-05-16** — Builder Phase 1–10 + A1 RLS-Baseline abgeschlossen.
> Worker rev `00017-9rh` live. Letzter Backup-Tag: `pre-phase-rls-setup-20260516`.

---

## 1. Architektur

### Tech-Stack

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CommonJS Main, Vite-Renderer), TypeScript strict, React 18 + Tailwind + Zustand, react-router HashRouter, bundled FFmpeg (`resources/bin/${os}-${arch}/`), bundled yt-dlp, electron-updater, Supabase Auth+DB, Stripe, Resend SMTP. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, React Native 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/file-system/media-library/web-browser/linking, react-native-webview, @react-native-cookies/cookies, expo-navigation-bar. Supabase JS SDK. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp). Cloudflare R2 (S3-API). |

### Monorepo-Struktur (ABSOLUT KRITISCH — Pfade einprägen!)

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                          ← Desktop (Electron Main + Renderer)
│   ├── main/                     ← Electron Main-Prozess (Node)
│   ├── preload/
│   └── renderer/                 ← Vite + React + Tailwind Desktop UI
├── packages/
│   ├── shared/                   ← Geteilt Desktop+Mobile (Symlink-Monorepo)
│   │   ├── src/types.ts          ← Project, Highlight, ClipSegment, SubtitleSettings…
│   │   ├── src/subtitles.ts      ← SubtitleCue + Transcript-Parser
│   │   ├── src/ffmpegArgs.ts     ← Plattform-neutral (buildTikTokExportArgs)
│   │   ├── src/assBuilder.ts     ← SubtitleSettings → libass .ass-Datei
│   │   ├── src/i18n/             ← 9 Locales (de/en/it/ru/es/fr/pt/nl/pl)
│   │   └── src/index.ts          ← Barrel-Export
│   └── mobile/                   ← Expo + React Native
│       ├── App.tsx               ← Root: Auth/Tabs/Theme
│       ├── app.config.js         ← Inline-Plugin für largeHeap (Android)
│       ├── app.json              ← Expo Base-Config
│       ├── src/screens/          ← ProjectDetail, Export, AddVideoProject, Library, etc.
│       ├── src/components/       ← VideoPlayer, RegionCroppedVideoPlayer,
│       │                          SubtitleSettingsModal/Overlay, MultiAudioPicker,
│       │                          MusicPreviewPlayer, VoiceOverPreviewPlayer,
│       │                          SimpleSlider, CueEditorModal, ExportSettingsModal
│       ├── src/stores/           ← Zustand: app/auth/projects/notifications/jobs
│       ├── src/lib/              ← supabase, sounds, haptics, thumbnails,
│       │                          pushNotifications, tts, whisper, renderJob
│       └── src/navigation/       ← Root + MainTabs Param-Types
└── services/
    └── render-worker/            ← Cloud Run FFmpeg-Worker (separates Deploy)
        ├── Dockerfile            ← Node 22 + apt-ffmpeg + yt-dlp
        ├── src/index.ts          ← Express + Endpoints
        ├── src/auth.ts           ← Supabase JWT-Middleware
        ├── src/r2.ts             ← Cloudflare R2 (S3 via @aws-sdk)
        ├── src/render.ts         ← FFmpeg-spawn + Timeout + Progress
        ├── src/transcribe.ts     ← Whisper API word-timestamps + Highlight
        ├── src/audioEnergy.ts    ← ebur128 audio-peak detection
        ├── src/highlights.ts     ← Phrase + audio-energy heuristics
        └── src/youtube.ts        ← yt-dlp wrapper
```

### Wichtige Systeme

- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range-Support
- **Job Queue** (Desktop, `core/queue.ts`): serialisiert FFmpeg-Pipelines (concurrency=1)
- **IPC Layer**: typed Channels `IpcResponse<T>`
- **Cloud-Render API** (Mobile, `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT-zu-R2
- **Settings persistent**: Desktop `userData/*.json` + safeStorage; Mobile expo-secure-store + AsyncStorage
- **Mobile File-Persistence** in `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails}/`

### Cloud-Render-Pipeline

```
Mobile (Expo)              Google Cloud Run         Cloudflare R2
─────────────              ────────────────         ─────────────
POST /v1/upload-url    →   pre-signed PUT-URL  
PUT file               ─────────────────────→       sources/{user}/...
POST /v1/render        →   ├ download from R2 ←     (parallel files)
   { inputs:                ├ ffmpeg ${args}
     {source/sources,        ├ upload result   ──→  outputs/{user}/...
      intro?, music?[],      └ signed DL-URL
      voiceOvers?[],
      subtitle?(.ass)},
     args[], projectId }
GET signed-URL         ←   signed-DL-URL                 outputs/...
```

**Args-Platzhalter** (Server ersetzt mit tmp-Pfaden — Anti-Injection):
`{SRC}`, `{SRC_N}`, `{INTRO}`, `{MUSIC_N}`, `{VO_N}`, `{ASS}`, `{DST}`

**Kostenmodell:** Cloud Run scale-to-zero, R2 unlimited free egress, Free-Tier ≈ 10k Renders/Monat.

---

## 2. Features die FERTIG sind

### Auth + i18n + Onboarding
- Supabase Email-Login, Geräte-Locale-Detection (9 Sprachen)
- Settings: Sign-out, Language-Picker, Replay-Onboarding
- 4-Slide Carousel beim Erststart, persistent

### Supabase Database / Security (Phase A1 abgeschlossen 2026-05-16)
- **Tabellen**: `profiles` (id, email, full_name, avatar_url) + `subscriptions`
  (user_id, stripe_*, plan, status, current_period_end, lifetime, cancel_at_period_end)
- **RLS aktiv** auf beiden Tabellen
- **Policies**:
  - `profiles` — SELECT/UPDATE: `auth.uid() = id` (own only)
  - `subscriptions` — SELECT: `auth.uid() = user_id` (own only)
- **GRANTs explizit gesetzt** (Vorbereitung auf 30.10.2026 Supabase-Default-Change):
  - `anon` — nichts (REVOKE ALL)
  - `authenticated` — `profiles`: SELECT+UPDATE / `subscriptions`: SELECT
  - `service_role` — ALL (für Edge Functions/Stripe-Webhook)
- **Trigger** `on_auth_user_created` → `handle_new_user()` legt Profile-Row beim Sign-up an
- **Schreib-Operationen**:
  - `profiles` INSERT via Trigger (SECURITY DEFINER)
  - `profiles` UPDATE via Mobile/Desktop authStore (own row)
  - `profiles` DELETE via `delete-account` Edge Function (service_role)
  - `subscriptions` INSERT/UPDATE/DELETE ausschliesslich via `stripe-webhook` Edge Function (service_role)
- Migration-File: `supabase/migrations/001_rls_baseline.sql` (idempotent + Rollback-SQL drin)
- Cross-Account-Test verifiziert: anon kann nichts, authenticated nur eigene Rows

### Navigation
- Liquid-Glass-BottomTab: Home / Projects / Clips / TikTok / Builder / Thumbs
- Modals: AddVideoProject, Search, RegionPicker, LanguagePicker, Notifications, Pricing
- Sub-Screens: ProjectDetail (4 Tabs), Settings, Help, Legal, Onboarding, Export

### Project Detail mit 4 Tabs
- **Highlights**: AI-Clip-Liste, Multi-Select, Re-Analyze, „Build YouTube video" → Builder
- **Manual**: Mark-In/Out, Clip-Liste
- **9:16 (TikTok)**: Stacked/Split/Full Layout, Region-Cards, Subs/Music/TTS/Intro/Export
- **Builder**: 16:9 YouTube-Cut mit Highlights + Extra-Videos, Per-Clip-Trim, Concat-Export

### Cloud-Render-Worker
- /health, /v1/upload-url (kinds: source/intro/music/voice-over/subtitle)
- /v1/render (Multi-Input-Pipeline mit unified clips[].src? trim+concat)
- /v1/download (yt-dlp YouTube/Twitch → R2)
- /v1/transcribe (Whisper word-level + audio-energy + Highlight-Detection)
- Worker rev `00017-9rh` deployed

### FFmpeg-Args (`shared/ffmpegArgs.ts`)
- `buildTikTokExportArgs` mit:
  - `layout='full' | 'stacked' | 'split'`, `splitRatio`, `fullOffsetX`
  - Audio: `sourceAudioVolume`, `music[]`, `voiceOvers[]`
  - `subtitle`: entweder `assPath` (libass) ODER `cues[]` (drawtext-legacy)
  - `intro`: mode `before|overlay`, scale 0.2..4.0, x/y, durationSec, **Auto-Fit-Mode**
    (contain ≤1.0, cover >1.0)
  - `clips[].src?`-Index (per-source-trim mit unique sources[])
  - `srcs[]` (multi-source-concat ohne trim)

### Subtitle System (Phase 9.6.7a-h + Builder-4 + Builder-8)
- **Whisper word-timestamps** (`granularities=word`) → cue.words[]
- **Chunking** via word-array (echtes Per-Word-Timing, kein proportional mehr)
- **Cue-Mapping**: 9:16 trim-shift, Builder Multi-Clip an primarySource gebunden
- **libass (.ass) Renderer** mit full Style-Parität:
  - Glow (\blur+\bord+\3c), Drop-Shadow (\xshad/\yshad+\4c+blur)
  - Layered (per-word \fs+\1c-Switching mit highlightFontScale, highlightDropShadow, highlightGlow)
  - Metallic: Silver-blend approximation (blend gradientFrom↔gradientTo, gewichtet 0.4)
  - **Position-Stability** (Phase Builder-8): pro-cue `{\pos(cx,cy)\an5}` middle-center →
    1-Zeile + 2-Zeilen-Cue gleicher vertikaler Mitte
- **Cue-Editor** (Modal): text-only editing pro cue
- **30+ Properties** wie Desktop, **15+ Android-System-Fonts**
- **SVG-basierter Preview** (RN/react-native-svg) für Gradient/Metallic/Glow/Shadow

### Audio/Video Add-Ons
- **Music** Multi-Picker mit per-Track Volume (0..1.5 UI; clamp 0..1 preview, 0..1.5 export)
- **TTS Voice-Over** (OpenAI tts-1, voices alloy/echo/fable/nova/onyx/shimmer)
- **Intro**: Pick + Mode-Toggle (before/overlay) + IntroOverlayControls
  - 4 Quick-Presets (Top/Center/Bottom/Full)
  - 4 Slider: X/Y/Scale 0.2..4.0/Duration 0.5..30s
  - **Save-as-default-Preset** (appStore.introDefaults) → nächster Intro-Pick übernimmt
  - **Auto-Fit-Mode**: scale ≤1 contain, scale >1 cover
- **Live-Preview** (`FullModePreview` + `StackedSplitPreview`):
  - Alle Add-Ons sichtbar/hörbar
  - Tap-to-Play, Mute, Skip ±5s, Replay, Scrubber mit Tap+Drag, Auto-Hide nach 2.5s
  - **Cumulative Scrubber** für Builder-Sequenz (Phase Builder-7+8): probed durations
    via hidden 1×1 Video, total = Σ aller items, Scrubber-thumb cumulative
  - **Sequential Multi-Source-Playback**: alle items (Highlights+Extras) hintereinander mit auto-advance

### Cloud-Export End-to-End
- ExportSettingsModal vor Export (Resolution 720p/1080p/4k, FPS 24/30/60, Bitrate 5M..80M)
- `runRenderJob`: Multi-File-Upload + Render + Save-to-Camera-Roll
- Local-Notification bei Done
- Phase + Cancel-Button im ExportScreen
- 9:16 (1080×1920) ODER 16:9 (1920×1080) auto

### Builder-Tab (Phase 1–10 abgeschlossen)
- **TikTok-Parität**: alle Add-Ons persistent auf `project.*`
- **Extra-Videos**: pick + Trim-Editor pro Extra (probed duration via hidden Video)
- **Per-Source-Trim Pipeline** (`clips[].src?`-index): Highlights + Extras gemischt mit
  unique `sourceUris[]`, ffmpeg `split=N` pro source + trim+setpts+concat
- **Sequential Preview**: alle items hintereinander mit cumulative-Scrubber
- **16:9 Export** mit layout='full' + named-args crop-Filter (single-quotes für `min(iw,...)`)
- **Multi-Clip-Import-Support**: `endSec=0` (DocumentPicker liefert keine Duration) → `-1`-sentinel
  → BIG_TRIM_END im ffmpeg trim
- **Cumulative Scrubber + Total-Length-Display**

### Gemini Thumbnails (Phase 9.8)
- ThumbnailGeneratorScreen mit Genre-Chips (**Custom first** seit heute)
- Style-Picker (default/comic/realistic)
- Prompt-Form + Reference-Image-Picker
- API: `gemini-2.5-flash-image-preview`, camelCase inlineData
- Auto-fetch Models + History-Gallerie pro Projekt
- Persistent in `documentDirectory/thumbnails/{projectId}/`

### i18n × 9 vollständig
- Alle Builder + TikTok + Intro-Position + Export-Strings in 9 Locales
- ~65 neue Keys pro File (Phase Builder-2)

---

## 3. Features die TEILWEISE fertig sind

### Highlight-Detection (Whisper-Pipeline)
- ✅ Server-side word-timestamps + segment-cues
- ✅ Audio-Energy via ebur128 (1 Hz peaks)
- ✅ SHORT (gaming, 6-20s) + LONG (podcast, 20-60s) Profile
- 🟡 Quality bei Fortnite-Audio teilweise schwach (background-game-sounds dominieren → wenige Cues)
- 🟡 Multi-Clip-Import: Whisper analysiert nur `sourceUri` (= sourceUris[0]), nicht andere clips

### Subtitle-Styling
- ✅ Drawtext (color + stroke + position + uppercase + chunking) — legacy fallback
- ✅ libass mit Glow/Drop-Shadow/Layered/Metallic-Approximation
- 🟡 Metallic im Export = blend-Single-Color (libass kann keine echten Gradients)
- 🟡 Layered Big-Word-Zoom-Animation (Desktop hat \t() zoom) — Mobile static

### Intro Overlay
- ✅ Position x/y/scale (0.2..4.0) + Duration (0.5..30s) + Save-as-default Preset
- ✅ Auto-Fit-Mode (contain/cover je nach scale)
- 🟡 Letterbox bei intro-File mit eigenen black bars (workaround: scale > 1.0)

### Audio-Volume Range
- ✅ Music/VO UI 0..1.5
- ✅ Export 0..1.5 (FFmpeg amix)
- ✅ Preview clamp 0..1 (expo-av-Limit)

---

## 4. Offene TODOs (priorisiert)

### 🔴 HOCH

| # | Task | Aufwand | Notes |
|---|---|---|---|
| ~~A1~~ | ~~**Supabase RLS-Setup**~~ ✅ | ~~1-2h~~ | **Done 2026-05-16** — `supabase/migrations/001_rls_baseline.sql`. Siehe §2 "Supabase Database / Security". |
| ~~A2~~ | ~~**Phase 9.10 Thumbnail-on-demand**~~ ✅ | ~~~1h~~ | **Done 2026-05-17** — `lib/thumbnails.ts` mit sequentieller Queue (Vivo HEVC 1-Decoder Constraint, 150ms pause). `initThumbnailBackfill()` in App.tsx useEffect. Self-dedup via `inProgress`/`failed`/`queue.includes` Sets. Subscribed an projectsStore → neue Projects auto-enqueue. |
| ~~A3~~ | ~~**Multi-Clip-Import + Whisper**~~ ✅ | ~~1-2h~~ | **Done 2026-05-17** — `transcribeMultiSource()` in `whisper.ts` (sequenziell, cues + highlights mit time-offsets gemerged). Neuer "All N"-Button im ProjectDetail Action-Row (sichtbar nur bei `sourceUris.length > 1`). Confirm-Alert vor Start (Cost-Hinweis), Multi-Progress-State "Clip {n}/{total} · {phase}". Opt-in (User triggert manuell). SubtitleCue Mobile-Type erweitert um `words?`. i18n × 9. |
| A4 | **Phase Builder-12 Intro `before`-Mode mit scale/x/y/auto-fit** | 1.5-2h | `before` ignoriert heute scale + x/y. UI-Controls auch im `before` zeigen. |
| A6 | **Security-Audit Findings (Phase A6, ~6-8d gesamt)** | siehe Sub | Audit 2026-05-16, 4 P0 / 8 P1 / 8 P2 / 14 P3 — **Volldoku: `SECURITY_AUDIT_2026-05-16.md`** |
| ~~A6.1~~ | ~~**Rate Limiting Worker**~~ ✅ (P0-1) | ~~1h~~ | **Done 2026-05-16** — Worker rev `00018-bwh`. `express-rate-limit@7.5.1` per-userId nach authMiddleware. /upload-url 30/min, /render 5/min, /transcribe 5/min, /download 3/min. Cloud Run `trust proxy: 1`. 429 mit `retryAfterSec` + `[ratelimit:NAME]` log-warning. |
| A6.2 | **`.ass` Content-Validation + Size-Limit** (P0-4) | 2h | Worker: max 64KB, reject `[Fonts]`/`[Graphics]`, cap `\bord`/`\blur`/`\fs`. Bessere Long-Term-Lösung in A6.4 |
| A6.3 | **Plan-Check + Monthly-Counter im Worker** (P0-2, + Backend-Teil von A5) | 1d | `requirePaidPlan` middleware. Supabase RPC `check_render_quota(user_id)`. Free-Tier-Quota-Definition nötig. |
| A6.4 | **Typed RenderSpec — args[] off-client** (P0-3, größte Bedrohung) | 2-3d | Mobile sendet typed JSON `{layout, regions, music, intro, …}`, Worker baut args via shared `ffmpegArgs.ts`. Backward-compat zu legacy `args` parallel mit Allow-List-Filter, dann deprecate. |
| A6.5 | **Logs sanitisieren + `/health` env-dump weg + R2-Pfad-Regex** (P1-1, P1-2) | 30m | |
| A6.6 | **Stripe-Webhook event-id dedupe + Edge-Function CORS-Whitelist** (P1-3, P1-4) | 1h | `stripe_events_processed` table, origin-whitelist statt `*`. |
| A6.7 | **yt-dlp Härten** (P1-5) | 30m | drop `--no-check-certificates`, engere URL-regex, yt-dlp Version pinnen. |
| A6.8 | **Electron CSP + sandbox + media:// path-validation** (P1-8, P2-7) | 1h | CSP-Meta-Tag, `sandbox:true`, `path.resolve` allow-list für media://. |
| A6.9 | **R2 body-size-limit + YouTube-Cookies SecureStore + sourceKey-ext-check** (P2-1, P2-4, P2-6) | 1.5h | |
| A6.10 | **`npm audit` + Updates auf moderate+ CVEs** (P3-12) | 1h | Root, packages/mobile, services/render-worker. |
| ~~A5~~ | ~~**Mobile Feature-Lock-Parität (Schloss-Sperren wie Desktop)**~~ ✅ | ~~4-6h~~ | **Done 2026-05-16** — Port von Desktop `features.ts` + `FeatureLock`/`UpgradeModal` (RN-Variante mit react-native-svg). Lock-Stellen: SubtitleSettingsModal (layered style + glow + drop-shadow + save preset), ExportSettingsModal (4k + bitrate >5M), ThumbnailGeneratorScreen (full-lock-screen für free/creator), AddVideoProjectScreen (project-limit creator=25). i18n × 9 nutzt existing shared `features.*` + `upgradeModal.*` keys. ⚠️ **Client-only — Server-Enforcement noch in A6.3.** |
| B1 | **Phase 9.11 Multi-Clip Manual + Drag-Reorder** | 2-3h | `react-native-draggable-flatlist`. Native-Rebuild nötig. |
| B2 | **Phase Builder-11 Drag-to-Seek + Item-Switch** | 1-2h | Scrubber wirkt heute nur in current item. Item-Switch via Drag. |

### 🟡 MITTEL

| # | Task | Aufwand | Notes |
|---|---|---|---|
| C1 | **Phase 9.7 Light-Theme** | 4-6h | `lib/theme.ts` + Settings → Appearance Switch |
| C2 | **Phase 9.14 Effects-System Mobile** | 3-4h | `clip.effects`, FFmpeg eq/colorbalance/unsharp |
| C3 | **Phase 9.13 Cross-Device-Sync** | 6-8h | Supabase + RLS (!), Storage-Bucket, Pull-Sync |
| C4 | **Phase 9.9 YouTube/Twitch URL-Import Mobile** | 2-3h | Worker `/v1/download` existiert, Mobile-UI fehlt |

### 🟢 PRE-LAUNCH

| # | Task | Aufwand | Notes |
|---|---|---|---|
| D1 | **Phase 9.15 Push-Token-Registrierung** | ~2h | Expo-Push-Token bei Login in Supabase profiles |
| D2 | **Phase 9.16 EAS Auto-Update** | ~3h | JS-only-OTA, kein Store-Review |
| D3 | **Phase 9.17 RevenueCat IAP** | 6-8h | Subscription-Gateway |

### 📌 Desktop-Feature-Audit (Mobile-Lücken)

| Feature | Status Mobile |
|---|---|
| Color-Correction (lift/gamma/gain) | ❌ fehlt |
| Effects-Manager (eq/colorbalance/unsharp/motionBlur) | ❌ Phase 9.14 |
| Multi-Cam-Sync (Audio-Waveform-Alignment) | ❌ fehlt |
| Audio-Ducking (Source dimmen bei TTS) | ❌ fehlt |
| Watermark Overlay | ❌ fehlt |
| YT-Direct-Upload (OAuth + YouTube Data API v3) | ❌ fehlt |
| Custom-Subtitle-Templates (Style-Presets Bibliothek) | ✅ via `customSubtitlePresets` |
| Layered big-word Zoom-Animation | 🟡 static da, \t() animation fehlt |
| Color-Picker mit Eyedropper | ✅ via ColorPickerModal |
| Drag-Reorder im Builder | 🟡 nur Up/Down-Buttons, kein DragDrop |
| Cross-Device-Sync | ❌ Phase 9.13 |
| Push-Notifications | ❌ Phase 9.15 |
| Subscription / Pricing | ❌ Phase 9.17 |
| Auto-Updates | ❌ Phase 9.16 |

---

## 5. Datenmodell

### Project (`packages/mobile/src/data/demoProjects.ts` + `packages/shared/src/types.ts`)

```ts
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  // Source
  sourceUri?, sourceUris?, sourceUrl?, thumbUri?, videoType?, sourceType?,
  trimStart?, trimEnd?, createdAt?, mode?,
  // Regions / Layout
  facecamRegion?: Region | null,
  gameplayRegion?: Region,
  splitRatio?: number,         // 0.2..0.8 default 0.4
  fullOffsetX?: number,        // 0..1
  tiktokLayout?: 'stacked' | 'full' | 'split',
  clipOrder?: string[],        // clip-IDs + extra-IDs gemischt
  // Add-Ons
  voiceOvers?: ProjectVoiceOver[],
  subtitles?: SubtitleSettings,
  musicTracks?: ProjectMusicTrack[],
  musicShuffle?: boolean,
  intro?: ProjectIntro,
  builderExtras?: ProjectExtraVideo[],
  // Misc
  errorMessage?: string,
  thumbnails?: GeneratedThumb[],
}

interface DemoClip { id, startSec, endSec, label, score, thumbUri? }

interface ProjectIntro {
  path, filename?,
  mode?: 'before' | 'overlay',
  scale?: number,        // 0.2..4.0
  x?, y?: number,        // 0..1
  durationSec?: number,  // 0.5..30s overlay-only
}

interface ProjectExtraVideo {
  id, path, filename?,
  durationSec?, trimStart?, trimEnd?: number,
}

interface SubtitleCue {
  text, startSec, endSec,
  words?: { text, startSec, endSec }[],  // Phase Builder-4 word-timestamps
}

interface SubtitleSettings {
  enabled, style: 'default'|'bold'|'gaming'|'fiano'|'layered',
  position?, customY?, fontFamily?, fontSize?, letterSpacing?, uppercase?,
  textColor?, highlightColor?, useGradient?, gradientFrom?, gradientTo?,
  strokeEnabled?, strokeWidth?, strokeColor?,
  glowEnabled?, glowBlur?, glowStrength?, glowColor?,
  shadowEnabled?, shadowOffsetX?, shadowOffsetY?, shadowColor?, shadowBlur?,
  metallic?, maxWordsPerChunk?,
  highlightWords?, cues?,
  // Layered-specific:
  highlightUseGradient?, highlightGradientFrom?, highlightGradientTo?,
  highlightFontScale?, highlightDropShadow?, highlightMetallic?,
  highlightGlow?, highlightGlowColor?, highlightGlowStrength?,
}
```

### App-Settings

```ts
interface AppState {
  initializing, onboardingCompleted,
  facecamRegion: Region | null,
  gameplayRegion: Region,
  openaiKey, geminiKey, youtubeCookies,
  customSubtitlePresets, exportSettings,
  lastOpenedProjectId,
  introDefaults: { mode, x, y, scale, durationSec } | null,  // Phase Builder-5
}
```

### Nav-Types

```ts
Export: {
  sourceUri, trimStart, trimEnd, sourceDuration,
  mode?: 'highlights'|'manual'|'tiktok'|'builder',
  projectId?, exportSettings?,
  builderItemPlan?: { sourceUri, trimStart, trimEnd }[]  // Phase Builder-3
}
```

---

## 6. Bekannte Bugs / Limits

| Bug / Limit | Status | Notes |
|---|---|---|
| Whisper-Quality bei Fortnite-Audio | by-design | Background-game-sounds dominieren |
| Multi-Clip-Import Whisper nur sourceUri[0] | by-design | Eigene Pipeline nötig |
| Intro Letterbox bei intro-File mit eigenen black bars | Workaround | scale > 1.0 cropt eigene bars weg |
| Layered Big-Word-Zoom-Animation fehlt | Phase 9.6.7i (post-MVP) | libass kann \t() animation |
| Mobile-Cancel von laufendem Cloud-Render | by-design | Soft-Cancel, Worker läuft bis MAX_DURATION_SEC |
| Vivo HEVC 1-Decoder | env-dependent | 2 HEVC parallel = OOM-Risk |
| Drag-to-Seek in Builder-Scrubber wirkt nur in current item | Phase Builder-11 (TODO) | Item-Switch via Drag nicht impl |

---

## 7. Wichtige Designentscheidungen

- **16:9 Master-First** (Desktop): Pipeline rendert IMMER 16:9 als Master, alles weitere leitet davon ab
- **TikTok-Tab ≠ Builder-Tab**: TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9
- **Manual-Mode ohne AI**: Quick-9:16 + Multi-Clip-Import bypass'd Whisper
- **Cloud-Render statt Local-FFmpeg auf Mobile**: MPEG-LA-Patent-Risiko + Hardware-Constraints
- **R2 statt Supabase Storage**: unlimited free egress vs. 2 GB/Monat
- **Click-to-play in Stacked-Preview**: vor User-Tap kein Video-Decoder
- **Lazy-Load Native-Module** (`try/catch + cached null`): Boot ohne Native-Build
- **Files persistent** in documentDirectory (überlebt App-Restart)
- **safeStorage / SecureStore** für API-Keys
- **Job-Queue concurrency=1** (Desktop): FFmpeg saturiert Hardware
- **Strict subtitle-flag-Checks** (`enabled === true`): cross-effect-Pollution-Schutz
- **Per-Source-Trim Pipeline** (Phase Builder-3): unified `builderItemPlan[]` deckt
  single-source-with-clips, multi-source-without-trim, mixed-extras-with-trim ab
- **libass für Subtitle-Style-Parität** (Phase 9.6.7h): drawtext nur Fallback
- **introDefaults-Preset** (Phase Builder-5): einmal einstellen, beim nächsten Pick automatisch

---

## 8. Workflow-Referenz

### Code-Propagation Desktop ↔ Mobile

- **`packages/shared/`** → wirkt auf BEIDE Plattformen automatisch (Symlink-Monorepo)
- **`src/`** → nur Desktop
- **`packages/mobile/`** → nur Mobile
- **`services/render-worker/`** → nur Cloud-Worker (separates Deploy nötig)

### Mobile-Workflow

```bash
# JS-only-Änderungen (Stores, Components, Screens, FFmpeg-Args, Subtitle-Style):
cd packages/mobile && npm run start:clear   # Metro mit Cache-Reset
# Im Metro-Terminal: r → Reload auf Phone

# Native-Änderungen (neue native deps ODER app.json plugin-Änderungen):
ANDROID_SERIAL=10AF7Y16R70010X npx expo prebuild --clean
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
# 3–5 min beim ersten Mal, danach inkrementell

# Phone-Serial: ANDROID_SERIAL=10AF7Y16R70010X (Vivo V40 Lite, Mediatek)
```

### Desktop-Workflow

```bash
npm run dev          # electron-vite dev
npm run build:mac    # production DMG für Apple Silicon + Intel
npm run release:mac  # build + GitHub-Releases-Upload
                     # → triggert electron-updater bei allen Installationen
```

### Cloud-Render-Worker-Workflow

```bash
cd services/render-worker
npm run dev   # lokal auf localhost:8080

# Production deploy:
gcloud run deploy fiano-render-worker \
  --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 600 \
  --max-instances 10 --min-instances 0
# env-vars bleiben vom letzten Deploy. Bei NEUEN: --set-env-vars KEY=VAL

# Logs:
gcloud run services logs read fiano-render-worker --region europe-west1 --limit 50

# Health:
curl https://fiano-render-worker-491699066139.europe-west1.run.app/health
```

---

## 9. Git-Workflow

### Claude-Worktree-Pattern

- Claude arbeitet in `claude/<branch-id>` unter `.claude/worktrees/<branch-id>/`
- Branch wird zu `origin/garymikefischer-art/fiano` gepusht
- **User merged in main** vom Root-Repo:

```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git stash       # falls uncommitted Sachen (App.tsx etc.) liegen
git fetch origin
git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
git push origin main
git stash pop
```

### Backup-Strategie

```bash
# Vor jeder größeren Phase:
git tag pre-phase-X.Y-backup && git push origin pre-phase-X.Y-backup

# Rollback (nur eigenen branch!):
git reset --hard pre-phase-X.Y-backup
```

**Aktuelle Backup-Tags (auf GitHub):**
- `pre-phase-rls-setup-20260516` ← **aktuell**
- `pre-phase-builder-completed-20260513`
- `pre-phase-builder-v2-20260512`
- `pre-phase-builder-20260512`
- `pre-phase-9.8-completed-backup`

### Auto-Update-Strategien

| Plattform | Mechanismus | Status |
|---|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater pulls auto on app-start | ✅ wired |
| **Mobile** | EAS Update für JS-only-OTA (`eas update --channel production`) | ❌ Phase 9.16 |
| **Cloud-Worker** | `gcloud run deploy` manuell, Zero-Downtime-Rollout | ✅ wired |

**Desktop Release-Flow:**
```bash
# Code-Änderungen committen + in main mergen
git tag v0.2.X && git push --tags
npm run release:mac     # bauen + GitHub-Releases-Upload
# electron-updater pulls bei allen Installs automatisch beim nächsten Start
```

**Worker Deploy-Flow** (manuell bei Code-Änderungen in services/render-worker/):
```bash
cd services/render-worker
gcloud run deploy fiano-render-worker --source . --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 600 --max-instances 10 --min-instances 0
```

---

## 10. Quick-Reference

- **Worker-URL**: `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **Worker-Rev**: `00018-bwh` (A6.1 Rate Limiting deployed 2026-05-16)
- **GitHub-Repo**: `garymikefischer-art/fiano`
- **Aktueller Branch zum Mergen**: `claude/modest-greider-5dd6e1`
- **Letzter Commit**: A3 Multi-Clip-Whisper (pending)
- **Backup-Tag**: `pre-phase-a3-multiwhisper-20260517`
- **Letzte Phase**: A3 Multi-Clip-Import + Whisper-Pipeline (opt-in via "All N"-Button)

### Speicherorte

#### Mobile
```
expo-secure-store      — API-Keys, Onboarding-Flag, Sprache, Sounds-Mute,
                         Region-Defaults, exportSettings, lastOpenedProject,
                         introDefaults
AsyncStorage           — Projekte (fiano.projects), Notifications,
                         YouTube-Cookies, customSubtitlePresets
documentDirectory/imports/      — Source-Videos
documentDirectory/thumbs/       — extrahierte Frame-Thumbnails
documentDirectory/voice-overs/  — TTS-MP3s
documentDirectory/exports/      — Cloud-Render-Results
documentDirectory/thumbnails/   — Gemini-generated thumbnails
cacheDirectory/        — Picker-Tempfiles (OS cleant), .ass-tmp
```

#### Desktop
```
userData/projects/{id}/exports/    — 16:9 Master-MP4s
userData/app-defaults.json         — facecam, gameplay, splitRatio, etc.
userData/api-key.enc + gemini-key.enc — safeStorage encrypted
```

#### Cloud R2
```
fiano-renders/sources/{userId}/{projectId}/{kind}-{uuid}-{idx}.{ext}
  kinds: source.mp4, intro.mp4, music-N.mp3, voice-over-N.mp3, subtitle.ass
  Lifecycle: 1 Tag (auto-delete)

fiano-renders/outputs/{userId}/{projectId}/{jobId}.mp4
  Lifecycle: 7 Tage
```

---

## 11. SYSTEM-PROMPT für nächsten Chat (copy-paste)

```
Hi! Ich arbeite an "fiano" — einer Hybrid-Desktop+Mobile-Video-App mit Cloud-
Render-Backend. Wir haben gerade Builder-Tab Phase 1–10 abgeschlossen (TikTok-
Parität + per-source-trim + libass + Intro x/y/scale + Sequential-Preview +
word-sync Subtitles). Volle Doku in:
/Users/garyfischer/Downloads/fiano-monorepo/PROJECT_SUMMARY_MOBILE.md
(~500 Zeilen — lies sie zuerst).

# SYSTEM-PROMPT
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano" —
einer Hybrid-Desktop+Mobile-Video-App mit Cloud-Render-Backend.

**Stack:**
- Desktop: Electron 31 + TypeScript + React 18 + Tailwind + Zustand +
  bundled FFmpeg + bundled yt-dlp + Supabase + Stripe + electron-updater.
  9 Sprachen. v0.2.0.
- Mobile: Expo SDK 52 + React Native 0.76 + react-native-video v6 +
  react-native-svg + expo-av/secure-store/document-picker etc. Zustand.
- Cloud-Render: Google Cloud Run (Express + Node 22 + apt-ffmpeg + yt-dlp)
  + Cloudflare R2 (S3-API). Endpoints: /v1/upload-url, /v1/render,
  /v1/download, /v1/transcribe (Whisper word-timestamps).
  Args-Platzhalter: {SRC}/{SRC_N}/{INTRO}/{MUSIC_N}/{VO_N}/{ASS}/{DST}.

**Working Dir (IMMER hier arbeiten):**
/Users/garyfischer/Downloads/fiano-monorepo/

**GitHub:** garymikefischer-art/fiano

**Monorepo-Struktur:**
- src/ — Desktop (Electron Main + Renderer)
- packages/shared/ — geteilt (types.ts, ffmpegArgs.ts, assBuilder.ts, subtitles.ts, i18n/)
- packages/mobile/ — Expo + React Native
- services/render-worker/ — Cloud Run FFmpeg-Worker (separates Deploy)

**Arbeitsstil:** Deutsch, MVP-First, Plan zeigen → OK abwarten → implementieren.
i18n × 9 immer. Vor jeder größeren Phase: git tag pre-phase-X.Y-backup && git push --tags.
PROJECT_SUMMARY_MOBILE.md im Repo-Root hat alle Details — lies sie zuerst.

**Memory-Feedback (sehr wichtig):** Nach JEDEM Code-Ship schreibe einen
"🧪 Was du testen sollst"-Block mit Shell-Befehlen + Click-Path + Expected-
Outcomes. User-Wunsch vom 2026-05-12.

**WICHTIG für Mobile:**
- Native-Module via lazy-load mit try/catch (sounds.ts/haptics.ts pattern)
- Source-Files via persistInDocuments() in documentDirectory speichern
- Settings via expo-secure-store (encrypted) ODER AsyncStorage (große Daten)
- Bei neuer Native-Dep ODER app.json-plugin-Änderung:
  npx expo prebuild --clean && npx expo run:android (3-5 min)
- JS-only-Änderungen: npm run start:clear (NICHT nur r bei Env-Var-Änderungen!)
- Phone-Serial: ANDROID_SERIAL=10AF7Y16R70010X (Vivo V40 Lite, Mediatek,
  256 MB default heap, braucht largeHeap=true via app.config.js)

**WICHTIG für Cloud-Worker:**
- Bei Code-Änderungen in services/render-worker/: redeploy via
  cd services/render-worker && gcloud run deploy fiano-render-worker
  --source . --region europe-west1 --memory 2Gi --cpu 2 --timeout 600
  --max-instances 10 --min-instances 0
- env-vars bleiben vom letzten Deploy. Bei neuen: --set-env-vars dazu.
- Logs: gcloud run services logs read fiano-render-worker --region europe-west1 --limit 50
- Health: curl https://fiano-render-worker-491699066139.europe-west1.run.app/health

**Git-Workflow:**
Claude arbeitet in Worktree-Branch claude/<id> unter .claude/worktrees/<id>/.
Branch wird zu origin gepusht. User merged in main von Root-Repo:
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git stash; git fetch origin
  git merge --no-ff origin/claude/<branch-name> -m "merge: <description>"
  git push origin main; git stash pop

**Auto-Update-Strategie:**
- Desktop (wired): git tag v0.2.X → npm run release:mac → electron-updater pulls
- Mobile (Phase 9.16, NICHT wired): EAS Update geplant
- Cloud-Worker (manuell): gcloud run deploy bei jedem Code-Update

---

# Nächste Phasen (priorisiert)

🔴 HOCH:
1. **Supabase RLS-Setup** (1-2h) — Pflicht vor Cross-Device-Sync
2. **Phase 9.10 Thumbnail-on-demand** (~1h) — alte Library-Cards ohne thumbUri
3. **Phase 9.11 Multi-Clip Manual + Drag-Reorder** (2-3h) — react-native-draggable-flatlist
4. **Multi-Clip-Import + Whisper** (1-2h) — sources[1..N] analysieren ODER warn-Hint

🟡 MITTEL:
5. **Phase 9.7 Light-Theme** (4-6h)
6. **Phase 9.14 Effects-System Mobile** (3-4h)
7. **Phase 9.13 Cross-Device-Sync** (6-8h, mit RLS!)
8. **Phase 9.9 YouTube/Twitch URL-Import Mobile** (2-3h)

🟢 PRE-LAUNCH:
9. **Phase 9.15 Push-Token** (~2h)
10. **Phase 9.16 EAS Auto-Update** (~3h)
11. **Phase 9.17 RevenueCat IAP** (6-8h)

📌 Desktop-Feature-Audit (Mobile-Lücken):
- Color-Correction, Effects-Manager, Multi-Cam-Sync, Audio-Ducking,
  Watermark, YT-Direct-Upload, Layered-Big-Word-Animation

---

# Quick-Reference
- Worker-URL: https://fiano-render-worker-491699066139.europe-west1.run.app
- Worker-Rev: 00017-9rh
- Aktueller Branch: claude/exciting-yalow-924ed7
- Letzter Commit: ff098c7 (Thumbnail Custom-Game first)
- Backup-Tag: pre-phase-builder-completed-20260513

Bitte lies PROJECT_SUMMARY_MOBILE.md durch und sag dann was du als ersten
Schritt empfiehlst. Vor Start: git tag pre-phase-X.Y-backup && git push --tags.
```

---

**Stand 2026-05-13** — Builder-Tab Phase 1–10 abgeschlossen.
Commit `ff098c7` + Backup-Tag `pre-phase-builder-completed-20260513`.
Worker rev `00017-9rh` aktiv.

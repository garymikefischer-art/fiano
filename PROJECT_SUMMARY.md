# 🎯 fiano Video App — Project Summary (für neuen Chat)

═══════════════════════════════════════════════════════════

## 🤖 SYSTEM PROMPT (für jeden neuen Chat verwenden)

```
Du bist Senior-Software-Engineer und arbeitest mit dem User an "fiano" — einer Hybrid-Desktop-Video-App mit Auth + Subscription System. Stack: Electron 31 (CommonJS Main, Vite Renderer) + TypeScript strict + React 18 + Tailwind + Zustand + react-router-dom HashRouter + BUNDLED FFmpeg (per-arch: mac-arm64 native via osxexperts, mac-x64 evermeet, win-x64 BtbN GPL — libass+drawtext+freetype+videotoolbox) + bundled yt-dlp + OpenAI Whisper/TTS (BYO-Key) + Gemini Thumbnails (BYO-Key) + ONNX SAM 1 lokal + Supabase Auth/Postgres/Realtime + Stripe Subscriptions + Resend SMTP + electron-updater + Geist Font.
Working Dir: /Users/garyfischer/Downloads/Video App V2/
Supabase Projekt: zibzcaknqzxgwootfjxc (Frankfurt, Free Tier).
Stripe: Test Mode aktiv.
GitHub: garymikefischer-art/fiano (public).
Aktuelle Version: 0.1.9 (Phase 8.7 = bundled binaries + arm64-native + StatusBar export progress).
Branding strict: #ff1039 rot, #f1f2f2 weiß, #090b0c schwarz. Glass + Liquid + Apple-like UI, dark primary. 9 Sprachen (DE/EN/IT/RU/ES/FR/PT/NL/PL).
3 Plans: Creator 17,99€/mo, Pro 29,99€/mo, Studio Lifetime 299€ einmalig. Kein Free, kein Trial. Login + Plan-Auswahl Pflicht. Lifetime = Pro identisch + alle Future-Updates.
Arbeitsstil: deutsche Sprache, MVP-First, kein Overengineering, gezielte Fixes statt Rewrites. Plan zeigen → "OK" abwarten → implementieren → Test-Anweisung. Phasen-basiert. Bei großen Brocken splitten. i18n-Pflicht: bei neuen User-facing Strings IMMER alle 9 Locales updaten. Backup-Tag pre-phase-X.Y nach jeder Phase im Git. Bestehende funktionierende Systeme nicht anfassen. Worktree-Pattern: User merged in main per `git merge claude/<branch-name>`.
```

═══════════════════════════════════════════════════════════

## 1. ARCHITEKTUR

**Process-Modell**:
```
Renderer (React) ←→ Preload (contextBridge) ←→ Main (Node)
                                               ├── child_process.spawn (BUNDLED ffmpeg/ffprobe/yt-dlp)
                                               ├── fetch (OpenAI/Gemini/Supabase)
                                               ├── safeStorage (Keys + Auth-Sessions)
                                               └── HTTP loopback (127.0.0.1:51999) für OAuth/Stripe-Returns
```

**Wichtige Systeme**:
- `media://` Custom Protocol (Range-Support) für lokale Video-Streams
- `fiano://` Custom-Protocol als Production-Fallback für OAuth
- Auth-Loopback HTTP-Server (port 51999) — OAuth + Email-Confirmation + Stripe-Returns
- Job Queue concurrency=1
- IPC Layer typed `IpcResponse<T>`
- Pipeline: download → transcribe → highlights → renderClips
- RightRailContext (Editor/TikTok-Sidebar via Portal)
- Editor-State autosave debounced 300ms
- AI Models lokal in `userData/ai-models/`
- TTS-Cache: `userData/tts/`
- Auth-Session encrypted in `userData/auth-session.enc` (safeStorage Keychain/DPAPI)
- Supabase Realtime auf `subscriptions`-Table (User-spezifischer Channel)
- Stripe Edge Functions (Backend, Deno)
- Custom Window-Controls (Win/Linux frameless, Mac Traffic-Lights)
- Auto-Updates via electron-updater (GitHub Releases, unsigned → manual fallback)
- **NEU Phase 8**: Bundled FFmpeg/yt-dlp via `extraResources: from: resources/bin/${os}-${arch}` → kein Homebrew/Choco mehr
- **NEU Phase 8.x**: StatusBar zeigt Live-Progress für 9:16 + Builder Export

**Files**:
```
src/main/
├── index.ts          (Custom-Protocol fiano://, Single-Instance, Auto-Updater, Window-Controls IPC)
├── ipc.ts            (~1300 Zeilen — inkl. shell.exportClip + shell.buildVideo mit broadcast-progress)
└── core/
    ├── bin.ts        (PHASE 8: Bundled-First Resolution, per-arch Pfade, macOS xattr -d, yt-dlp userData copy)
    ├── ffmpeg.ts     (~1700 Zeilen — videoEncoder() fast/quality, setShellBroadcastStep, runFfmpeg progress)
    ├── events.ts     (broadcast() für Renderer-IPC-Events)
    ├── auth.ts, authLoopback.ts, queue.ts, settings.ts, projects.ts, transcode.ts
    └── pipeline/     (runner, download, transcribe, highlights, highlightsPodcast, renderClips, subtitles)

src/renderer/src/
├── App.tsx          (AuthGate: login/pricing/app states + Splash + Onboarding + LegalPage public route)
├── pages/           (HomePage, LibraryPage, ProjectDetailPage, ThumbnailPage, SettingsPage,
│                     HelpPage, LoginPage, SignupPage, PricingPage, ResetPasswordPage, LegalPage)
├── components/      (Sidebar, EditorTab, TikTokTab, BuilderTab, ClipsTab, WindowControls,
│                     UpdateToast, TopBarActions, StatusBar, UpgradeModal, FeatureLock, LegalFooter, ...)
├── lib/             (supabase.ts, stripe.ts, features.ts, i18n/, lutWebgl, subtitleCanvas, ...)
├── stores/          (appStore.ts, authStore.ts, upgradeModalStore.ts)
└── lib/i18n/{de,en,it,ru,es,fr,pt,nl,pl}.ts (~520 Keys × 9)

resources/bin/        (Phase 8: GITIGNORED außer LICENSE-BUNDLED.txt)
├── mac-arm64/        ffmpeg, ffprobe, yt-dlp (arm64 native)
├── mac-x64/          ffmpeg, ffprobe, yt-dlp (x86_64)
├── win-x64/          ffmpeg.exe, ffprobe.exe, yt-dlp.exe
└── LICENSE-BUNDLED.txt

scripts/
├── download-binaries.js   (Phase 8: HTML-scrape osxexperts, BtbN, GH releases)
├── test-bundled.js        (Phase 8: verify libass/drawtext/encoder/yt-dlp)
└── render-icon.js

supabase/
├── config.toml       (verify_jwt=false NUR für stripe-webhook)
└── functions/
    ├── stripe-webhook/, stripe-checkout/, stripe-portal/, delete-account/

build/                (icon.png, icon.svg, entitlements.mac.plist)
electron-builder.yml  (extraResources: ${os}-${arch}, publish: github)
.env                  (gitignored — VITE_SUPABASE_URL/ANON_KEY, VITE_STRIPE_*)
```

═══════════════════════════════════════════════════════════

## 2. ✅ FERTIG funktionierende Features

**Phase 1-5 (Video-App-Core)**: Foundation, i18n × 9, Library, ProjectDetail (5 Tabs), Highlights (Gaming/Podcast/Auto), TikTok-Tab (5 Subtitle-Styles inkl. layered, Glow, Custom-Presets, Cue-Editor, PNG-Pre-Render), Builder-Tab (Drag-Reorder, Inter-Clips, Intro/Music/VoiceOver, Quality-Dialog), Editor-Tab (~5500 Zeilen: 7 Asset-Kategorien, Multi-Track, 5 Inspector-Tabs, 16 Blend-Modes, Effects-Multi-Stack, TTS, AI-Mask SAM 1, LUT WebGL2, vidstab, Motion-Blur, Layered-Title), Quality-System, Subtitle-System, Thumbnails (7 Genres + Custom-Game-Mode + Comic/Realistic-Style), LUT Live-Preview WebGL2.

**Phase 6.1 Auth**: Supabase Auth (Email + Google OAuth), safeStorage Session-Encryption, LoginPage/SignupPage Liquid-Glass, Password-Strength (5 Regeln), Reset-Password, Resend-Confirmation 60s Cooldown, Auth-Error-Humanization, Routing-Gate, Avatar-Menu, 2 Test-Admin-Accounts.

**Phase 6.2 Pay-System**: 3 Stripe Plans, PricingPage Apple-Liquid-Glass, Current-Plan Badge, Stripe Checkout via Edge Function (PKCE), Customer Portal, Realtime Subscription-Sync, Polling-Fallback, Webhook, Cancel-at-period-end, Account-Settings-Section, Sidebar Plan-Card, Pro→Lifetime Upgrade, Delete-Account-Flow, Custom Email-Templates (Resend SMTP), Auth-Loopback persistent.

**Phase 6.3 Feature Gating**: `lib/features.ts` (FeatureId-Map, useFeature-Hook), UpgradeModal + FeatureLock (zwei Varianten), 14 Locks platziert (Sidebar Thumbnails, ImportDialog Podcast, TikTok Layered+CustomPresets+Glow+Shadow, Editor AI-Mask+Stabilizer+LUT-Upload, Settings 4K+High-Bitrate+QualityMode, Build/9:16 Quality-Dialog), Project-Limit-Enforcement (Creator 25), Library-Header-Counter mit Limit-Hint, Sidebar `guardCreate()`, ProPlanCard mit X/25 Bar, neue FeatureID `subtitle_advanced_effects` (Glow+Shadow), i18n × 9 (~32 Keys/Locale).

**Phase 6.4 Legal/Compliance**: 4 Sub-Pages (Imprint/Privacy/Terms/Licenses) unter `/legal/{doc}`, public-zugänglich (DSGVO-Pflicht), DE rechtsverbindlich + EN service-translation toggle, GDPR Art. 20 Datenexport (Settings → Account), LegalFooter auf Login/Signup/Pricing, Sidebar NavItem unter Settings, Trademark-Cleanup (TikTok→9:16, Shorts entfernt, Spielnamen → generische Genres + Custom-Game-Mode), i18n × 9 (~270 Strings).

**Phase 7 Distribution**: Auto-Updates via GitHub Releases, "Check for updates" Button mit Status-States (checking/up-to-date/available/downloading/ready/error), Update-Progress in UpdateToast + Bell, Help-Page Updates-Section, Mac-Fallback bei Code-Sig-Error → manual DMG-Install, Custom Window-Controls.

**Phase 8 Bundled Binaries** (NEU):
- `scripts/download-binaries.js` — pure Node, lädt FFmpeg+FFprobe+yt-dlp pro Arch
- `scripts/test-bundled.js` — verifiziert libass/drawtext/freetype/encoder/yt-dlp
- `bin.ts` Bundled-First Priority (Override → Bundled → System)
- macOS xattr -d Quarantine-Strip für bundled binaries
- yt-dlp Copy-to-userData für Self-Update via `-U`
- Settings → FFmpeg-Diagnose: BUNDLED-Pill Badge auf aktiver Card
- `extraResources: from: resources/bin/${os}-${arch}` → per-arch bundle
- LICENSE-BUNDLED.txt mit-distributed
- postinstall-Hook lädt host-arch automatisch

**Phase 8.x Export Progress**:
- `runFfmpeg()` broadcasted progress wenn `setShellBroadcastStep(...)` aktiv
- `shell.exportClip` wrapped mit `'shell-export'` step
- `shell.buildVideo` wrapped mit `'shell-build'` step
- StatusBar zeigt "Exportiere 9:16 · X%" / "Erstelle Video · X%" mit live progress-bar
- appStore.exportClip + buildVideo: setzt currentJob start (immediate UI feedback) + cleart in finally

**Phase 8.7 arm64-native FFmpeg**: per-arch resources/bin/, mac-arm64 = osxexperts (statisch arm64, h264_videotoolbox HW-encoder funktioniert native), HTML-scrape für version-robuste URLs, mac-x64 bleibt evermeet.

**Bitrate-Erhöhung (in Phase 8.7)**: 9:16-Default 20M → 30M (= Master-Bitrate, kein Generation-Loss).

**yt-dlp FFmpeg-Location-Fix (in Phase 8.x)**: yt-dlp bekommt `--ffmpeg-location` mit, damit Multi-Stream-Merge mit bundled FFmpeg funktioniert.

**Auth-Init Race-Fix (in Phase 8.x)**: `authStore.init()` wartet max 2s auf fetchSubscription bevor `initializing=false` → kein /pricing-Flash beim App-Start mehr.

═══════════════════════════════════════════════════════════

## 3. 🟡 TEILWEISE fertig

- Editor TextStyleDialog Layered-Preview Edge-Cases
- AI Mask Per-Frame: ✓ aber Edge-Halo + Tracking-Drift
- Light Mode ~80%
- Editor Rotation: Schema da, FFmpeg skipped
- EditorTab Detail-Strings i18n: Top-Level done, Effect-Names/Slider-Labels noch EN

═══════════════════════════════════════════════════════════

## 4. 📋 OFFENE TASKS — User-Wünsche für nächsten Chat (in Reihenfolge)

### ⚡ ALS ERSTES: Backup vor allem!
```bash
cd /Users/garyfischer/Downloads/Video\ App\ V2/.claude/worktrees/pensive-golick-e2895c
git tag pre-phase-9
```

### 🎯 PHASE 9.1 — Render-Cancel-Funktion
**Aktuell**: User kann laufenden Render NICHT abbrechen (Spinner ohne Cancel-Button).
**Gewünscht**: Cancel-Button in StatusBar + im Export-Dialog. Bricht aktiven FFmpeg-spawn via `AbortController.abort()`, cleared partial files.
**Files**: `src/main/core/ffmpeg.ts` (runFfmpeg signal-Handling vorhanden), `src/main/ipc.ts` (shell.exportClip/buildVideo brauchen abort-IPC), `src/renderer/src/components/StatusBar.tsx` (X-Button neben Progress), `appStore.ts`.

### 🎯 PHASE 9.2 — Export-Settings für 9:16 + Builder
**Aktuell**: Builder + 9:16 nutzen Quality-Modal mit nur fast/quality. Bitrate, Auflösung, FPS sind hardcoded.
**Gewünscht**: GLEICHE Auswahl wie Edit-Tab (Resolution-Picker, FPS, Bitrate-Slider) im Build-/9:16-Export-Dialog.
**Files**: `src/renderer/src/components/BuilderTab.tsx` (BuildQualityDialog erweitern um Resolution/FPS/Bitrate), `src/renderer/src/components/TikTokTab.tsx` (gleicher Dialog wird genutzt), `src/main/ipc.ts` shell.exportClip/buildVideo (exportQuality-Param schon da, muss propagiert werden), ggf. neue `tiktokExport` defaults in Settings.

### 🎯 PHASE 9.3 — Edit-Tab Hardware-Encoder + Encoder-Naming-Refactor
**Aktuell**: Edit-Tab ExportDialog nutzt nur libx264 (Software). Quality-Mode-Bezeichnungen sind "Fast (Hardware)" / "Best Quality".
**Gewünscht**:
- Edit-Tab ExportDialog: Encoder-Picker hinzufügen (Hardware = h264_videotoolbox / Software = libx264)
- Umbenennung: "Fast" → "Hardware", "Best Quality" → "Software" überall (Settings, BuildDialog, EditDialog)
- BEIDE Encoder bei ALLEN Plänen verfügbar (war: quality-mode locked für Pro)
- Aber in Settings → Export bleibt Plan-Lock NUR für: 4K-Resolution (Pro), Bitrate >5M (Pro)
- Creator: max 5M Bitrate, max 1080p Auflösung (sowohl in Edit-Tab als auch 9:16 + Builder)
**Files**: `src/main/core/ffmpeg.ts` videoEncoder()/setQualityMode → encoder/setEncoder, `src/renderer/src/components/EditorTab.tsx` ExportDialog, `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/lib/features.ts` (quality_render_mode entfernen oder umbenennen), i18n × 9.

### 🎯 PHASE 9.4 — Mobile-Variante (LANGFRISTIG)
Architektur-Entscheidung steht noch aus. Empfehlung: **Capacitor + pnpm-Monorepo** (packages/core + packages/desktop + packages/mobile). MVP-Scope: TikTok-Output-Use-Case (Highlight-Selection + 9:16-Format + Subtitles + Export). Cloud-Render-Backend optional bei Performance-Bedarf.

═══════════════════════════════════════════════════════════

## 5. 📊 DATENMODELL

```typescript
// src/shared/types.ts
export type VideoType = 'gaming' | 'podcast' | 'auto';
export type SubtitleStyle = 'default' | 'bold' | 'gaming' | 'fiano' | 'layered';

interface Project {
  id, name, mode: 'auto'|'manual', source?, status, highlights[],
  errorMessage?, createdAt, updatedAt?, videoType?,
  music?, musicTracks?, activeMusicIndex?, intro?, voiceOvers?,
}

interface Highlight {
  start, end, score, reason, clipPath?,
  origin?: 'auto'|'manual', trimStart?, trimEnd?,
  segments?, layout?, facecam?, gameplay?, splitRatio?,
  subtitles?: SubtitleSettings, subtitleEdits?, effects?,
}

interface TimelineClip { /* ~30 Felder */ }

type EffectId = 'glitch'|'shake'|'glow'|'zoom-pulse'|'rgb-split'
              | 'combo-montage'|'combo-hype'|'combo-clean'
              | 'aura-purple'|'light-burst'|'speed-lines'|'energy-trail'
              | 'motion-blur-low'|'motion-blur-medium'|'motion-blur-high';

export type AppEvent =
  | { type: 'job.progress'; projectId: string; step: string; percent: number }   // step jetzt auch 'shell-export'/'shell-build'
  | { type: 'job.log', ... } | { type: 'project.updated', ... }
  | { type: 'update.checking' } | { type: 'update.available', version }
  | { type: 'update.not-available', currentVersion } | { type: 'update.progress', percent, ... }
  | { type: 'update.downloaded', version } | { type: 'update.error', message };

// authStore.ts
type Plan = 'creator' | 'pro' | 'studio_lifetime';
type SubStatus = 'active'|'trialing'|'past_due'|'canceled'|'incomplete'|'incomplete_expired'|'unpaid'|'paused';
interface Subscription {
  plan: Plan;
  status: SubStatus | string;
  lifetime: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

// features.ts (Phase 6.3)
type FeatureId =
  | 'auto_highlights' | 'manual_highlights' | 'tiktok_tab' | 'builder' | 'multi_track_editor'
  | 'subtitle_studio_4styles' | 'music_intro_upload' | 'basic_effects' | 'export_1080p'
  | 'podcast_highlights' | 'thumbnail_generator' | 'ai_subject_mask' | 'stabilizer'
  | 'lut_filters' | 'subtitle_layered_style' | 'subtitle_advanced_effects'
  | 'custom_subtitle_presets' | 'export_4k' | 'export_high_bitrate' | 'quality_render_mode'
  | 'priority_queue' | 'early_access' | 'unlimited_projects';
const FEATURE_MIN_PLAN: Record<FeatureId, Plan>;  // Pro für die meisten, Creator für basics
const PROJECT_LIMIT: Record<Plan, number>;        // Creator 25, Pro/Lifetime ∞

// Supabase Tables:
//   profiles { id, email, full_name, avatar_url, created_at }
//   subscriptions { user_id (unique), stripe_customer_id, stripe_subscription_id,
//                   plan, status, current_period_end, lifetime, cancel_at_period_end, updated_at }
//   RLS, Realtime Publication, handle_new_user trigger
```

═══════════════════════════════════════════════════════════

## 6. 🐛 BEKANNTE BUGS

- AI Mask: Edge-Halo bei Greenscreen, Tracking-Drift
- File-paths: 404 für media:// wenn Source verschoben
- Audio-Sync drift bei langem Playback (Editor)
- Effects mit crop/zoompan global (FFmpeg-Limitation)
- Mac Auto-Install scheitert (unsigned, Squirrel.Mac fordert Code-Sig) → Manual-Download-Fallback
- TikTokPreview/TikTokTab Type-Errors (4 Stück, Pre-existing — NICHT ANFASSEN, blockt nicht den Build)
- `index.js` 184KB-stray-file kann beim TypeCheck entstehen (in .gitignore-blacklist aufnehmen falls wieder)

═══════════════════════════════════════════════════════════

## 7. 🎯 DESIGNENTSCHEIDUNGEN

**Frühe Phasen**: 16:9 Master-First · TikTok ≠ Builder ≠ Editor (separate Workflows) · Manual Mode bypass'd AI · safeStorage für Keys · media:// Range-Support · Job-Queue concurrency=1 · RightRail-Portal · Editor autosave 300ms · ONNX WASM · Track-Order reversed · Effects als Clip-Type · TtsModal createPortal · i18n Custom Mini-Lib · PNG-Pre-Render · Encoder fast/quality · Lanczos · DevTools blocked · Onboarding-Modal first launch.

**Phase 6 + 7**: Email/Password + Google OAuth (kein Apple) · 3 Plans kein Trial · safeStorage encrypted Sessions · Supabase Realtime + Polling-Fallback · Persistent Loopback statt Custom-Protocol · Stripe-Webhook verify_jwt=false · Custom-SMTP via Resend · PKCE-Flow · Win/Linux frameless-Window · Auto-Updates GitHub Releases · Unsigned-Builds · Plan-Hierarchie creator(1)<pro(2)<lifetime(3).

**Phase 8 NEU**: Bundled-First > System-PATH · per-arch resources/bin/${os}-${arch} · macOS xattr-Strip für bundled · yt-dlp userData-Copy für Self-Update · LICENSE-BUNDLED.txt sidecar · GPL FFmpeg-Builds (kommerziell distribution-erlaubt) · evermeet.cx (x86_64) + osxexperts.net (arm64) + BtbN (win) · HTML-scrape für robuste arm64-URLs · postinstall-Hook lädt host-arch.

**Phase 8.x NEU**: shell-export progress via module-level setShellBroadcastStep (Job-Queue concurrency=1 → safe) · projectId='shell' für non-pipeline jobs · 9:16-Default-Bitrate 20M → 30M · yt-dlp `--ffmpeg-location` für stream-merge · 2s Auth-Init-Wait für /pricing-Flash-Fix.

═══════════════════════════════════════════════════════════

## 8. 🏷️ GIT-BACKUP-TAGS (alle vorhanden)

```
v0.1.1 ... v0.1.8        — Release-Tags
pre-phase-6 / 6.2 / 6.3   — Auth, Pricing, Feature-Gating
pre-phase-6.4-prep        — Legal
pre-phase-7               — Auto-Updates
pre-phase-8-bundled-binaries  — vor Bundled-FFmpeg
pre-v0.1.9                — vor v0.1.9 Release (HEUTE)
```
Wiederherstellung: `git reset --hard <tag-name>`.

═══════════════════════════════════════════════════════════

## 9. 🚀 START — Vorschlag für nächste Session

**User-Wünsche in Reihenfolge** (siehe §4):
1. **Phase 9.1** — Render-Cancel-Funktion (Cancel-Button in StatusBar + Export-Dialog, AbortController durchreichen)
2. **Phase 9.2** — Export-Settings für 9:16 + Builder (Bitrate/Auflösung/FPS analog Edit-Tab)
3. **Phase 9.3** — Edit-Tab Hardware-Encoder + Encoder-Naming-Refactor:
   - Encoder-Picker im Edit-Tab ExportDialog
   - "Fast/Best Quality" → "Hardware/Software" überall
   - Beide Encoder ALLE Plänen
   - Plan-Lock NUR auf 4K-Resolution + High-Bitrate (>5M = Pro), Creator max 5M + 1080p
4. **Phase 9.4** — Mobile-Variante (Capacitor-Monorepo-Empfehlung)

**Vor jeder Phase**: `git tag pre-phase-9.X` setzen.

═══════════════════════════════════════════════════════════

## 📌 Wichtige Werte

- **Supabase URL**: `https://zibzcaknqzxgwootfjxc.supabase.co`
- **GitHub Repo**: `garymikefischer-art/fiano` (public)
- **Stripe Mode**: Test (live umstellen wenn Production)
- **Test-Admins**: `admin1@fiano.test`, `admin2@fiano.test` (Lifetime)
- **Loopback-Port**: `127.0.0.1:51999`
- **Resend SMTP**: konfiguriert
- **GitHub Token (für Release-Publish)**: NICHT in env — Release manuell auf GitHub Web UI
- **Aktuelle Version**: 0.1.9 (Mac+Win Installer in `.claude/worktrees/pensive-golick-e2895c/dist/`)

═══════════════════════════════════════════════════════════

## 🚨 CRITICAL: Worktree-Setup

**User entwickelt im Hauptverzeichnis** `/Users/garyfischer/Downloads/Video App V2/`.
**Claude arbeitet in Worktree** `/Users/garyfischer/Downloads/Video App V2/.claude/worktrees/pensive-golick-e2895c/` (Branch: `claude/pensive-golick-e2895c`).

**Workflow für jeden Commit**:
1. Claude commited im Worktree
2. User merged: `git merge claude/pensive-golick-e2895c` im Hauptverzeichnis
3. Bei `package-lock.json`-Konflikt: `git checkout -- package-lock.json` und merge nochmal
4. `npm install` falls Dependencies geändert
5. `npm run dev` für Test

**`.env` ist im Hauptverzeichnis** aber nicht im Worktree. Wenn ich (Claude) DMGs im Worktree baue, kopiere ich erst `.env` rüber:
```bash
cp "/Users/garyfischer/Downloads/Video App V2/.env" "/Users/garyfischer/Downloads/Video App V2/.claude/worktrees/pensive-golick-e2895c/.env"
```
Sonst sind die Supabase-Keys leer im Build → schwarzer Screen.

# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-20** — Block A+B+C komplett (C1-C7, C8/C9 deferred) + Round-9-Bugfixes + D2 EAS-Update geshippt.
> Branch: `claude/pedantic-gould-4f5a4c` (HEAD `9dceaf0`).
> Backup-Tags: `pre-handoff-round9-20260520` (HEAD), `pre-round-9-bugfix`, `pre-context-handoff-20260520`.
> Worker-Rev: `00035-nwf` (⚠️ Dockerfile-Font-Änntg `1f024c7` noch NICHT deployed).

---

## 1. Architektur

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase, Stripe. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, RN 0.76, React-Navigation v7, Zustand, react-native-video v6, react-native-svg, expo-av/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/web-browser/linking/**updates**/**navigation-bar**, Supabase JS, reanimated 3.16, draggable-flatlist 4.0.3. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp). Cloudflare R2 (S3-API). |

**Wichtige Systeme:**
- **media:// Custom-Protocol** (Desktop): lokale Video/Audio mit Range + path-validation.
- **Job Queue** (Desktop `core/queue.ts`): serialisiert FFmpeg, concurrency=1.
- **IPC Layer** (Desktop): typed `IpcResponse<T>`.
- **Cloud-Render API** (Mobile `lib/renderJob.ts`): Multi-File-Upload + signed-URL-PUT.
- **A6.4 Typed RenderSpec**: Mobile schickt typed JSON, Worker baut `args[]` selbst — NIE user-args[].
- **Settings**: Mobile expo-secure-store mit chunked-Adapter (1.9 KB/chunk) + AsyncStorage.

**Cloud-Render-Pipeline:** `POST /v1/upload-url` → `PUT file` → R2 `sources/` → `POST /v1/render` (typed Spec) → ffmpeg → R2 `outputs/` → signed DL-URL. Plus `/v1/download` (yt-dlp), `/v1/transcribe` (Whisper).

---

## 2. Ordnerstruktur + Code-Propagation

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                          ← Desktop (Electron Main+Preload+Renderer)
│   └── renderer/src/lib/subtitleCanvas.ts  ← Desktop layered-Subtitle (PNG-Canvas!)
├── packages/
│   ├── shared/src/               ← GETEILT Desktop+Mobile
│   │   ├── types.ts              ← Project, SubtitleSettings, ClipEffects
│   │   ├── ffmpegArgs.ts         ← buildEffectsFilter + buildTikTokExportArgs
│   │   ├── assBuilder.ts         ← .ass-Builder (libass) — NUR Mobile nutzt das
│   │   ├── subtitleLayout.ts     ← NEU: resolveSubtitleFontPx + LAYERED_* Konstanten
│   │   ├── subtitles.ts          ← Cue-Parser
│   │   └── i18n/locales/         ← 9 Sprachen
│   └── mobile/                   ← Expo + RN
│       ├── App.tsx               ← Root: Auth/Theme/Deep-Links/WebBrowser
│       └── src/{screens,components,stores,lib,navigation,data}/
└── services/render-worker/       ← Cloud Worker (separates Deploy)
    ├── Dockerfile                ← apt-ffmpeg + yt-dlp + fonts-liberation
    └── src/{index,render,renderSpec,ffmpegArgs,transcribe,...}.ts
```

**Wo ändern:**
- Logik/Types/i18n für BEIDE Plattformen → `packages/shared/src/`
- Desktop-UI → `src/renderer/src/`
- Mobile-UI → `packages/mobile/src/`
- Worker → `services/render-worker/src/` (separates Deploy)

⚠️ **`services/render-worker/src/ffmpegArgs.ts` ist eine KOPIE** von `packages/shared/src/ffmpegArgs.ts` (Worker hat keine @fiano/shared dep). Bei JEDER Änderung BEIDE Files syncen — Diff nur TikTokLayout-Block.

⚠️ **`assBuilder.ts` ist NUR Mobile** — Mobile baut die `.ass`-Datei, lädt sie zu R2, Worker rendert sie via libass. Desktop hat einen EIGENEN layered-Renderer (`subtitleCanvas.ts`, PNG-Canvas) → Desktop und Mobile-Export sind UNTERSCHIEDLICHE Render-Engines.

---

## 3. Git-Workflow + Deploy + Auto-Updates

**Claude-Worktree-Pattern:** Claude arbeitet in `.claude/worktrees/<branch-id>/`.
⚠️ **IMMER die Worktree-Pfade editieren**, NICHT die Main-Repo-Pfade — sonst landen Änderungen am falschen Ort.

**User merged in main:**
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo
git fetch origin
git merge --no-ff claude/<branch> -m "merge: <desc>"
git push origin main
```
Bei "divergent branches": `git fetch + git merge --no-ff`, NICHT `git pull`.

**Backup vor jeder Phase:** `git tag pre-phase-X.Y && git push origin pre-phase-X.Y`

**Mobile starten** (vom MAIN-Repo, nicht worktree — keine node_modules):
```bash
cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile
ANDROID_SERIAL=10AF7Y16R70010X npx expo run:android
```
Native-Rebuild bei neuer Dep/app.json-Plugin: `npx expo prebuild --clean`.

**Auto-Updates:**
| Plattform | Mechanismus |
|---|---|
| Desktop | `git tag v0.2.X` → `npm run release:mac` → electron-updater |
| **Mobile (D2 ✅)** | **EAS Update** — `cd packages/mobile && eas update --branch preview` → JS-only OTA, kein Store-Review. EAS-Projekt `27f6d175-...`. Native-Änderungen → `eas build --profile preview --platform android`. |
| Worker | `cd services/render-worker && gcloud run deploy fiano-render-worker --source . --region europe-west1 --memory 2Gi --cpu 2 --timeout 900 --max-instances 10` |

⚠️ Cloud-Run CPU-Quota: max 20000 mCPU regional → `cpu=2×instances=10` ODER `cpu=4×instances=5`.

---

## 4. Features die FERTIG sind

**Block A — Security (A1, A6.1-A6.10):** RLS, Worker Rate-Limit per-userId, .ass-Validation, Plan-Check + monthly counter, A6.4 typed RenderSpec, Logs sanitisiert, Stripe-Webhook dedupe, yt-dlp gehärtet, R2 path-regex. 📄 `SECURITY_AUDIT_2026-05-16.md`.

**Block B — QoL (B0-B5):** Trim+Split-at-playhead, Drag-Reorder Builder, Drag-to-Seek, Light/Dark/System-Theme, TrimModal Multi-Range.

**Block C — Effects/Watermark/Greenscreen (C1-C7):** ClipEffects (brightness/contrast/saturation/sharpen/motionBlur/colorWheels), Audio-Ducking, Watermark-Overlay, Greenscreen-Chromakey, Color-Wheels, Layered Big-Word-Zoom.

**Round-9 Bugfixes + Polish (diese Session):**
- Intro Files-Button + Greenscreen-Toggle marginBottom-Fix.
- Builder Subtitle-Modal-Crash → `SubtitleSettingsModal` `isInline`-Prop (absolute-View statt RN-Modal im BuilderTab).
- Layered-Subtitle KOMPLETT überarbeitet: `subtitleLayout.ts` (shared Geometrie-Konstanten), container-relative fontSize-Skalierung, deterministisches `LayeredText` (absolute-Positionierung), 2-Event-überlappendes ASS-Layout, `\t()`-Zoom ruht bei 100%, doppelter Glow entfernt.
- Android Bottom-Nav: solide Bar (Option B), dunkle Farbe `#070509`.
- White-Mode: LoginScreen-Inputs + PricingScreen-Feature-Text theme-aware.
- **First-Launch Dark-Mode** (Default `'dark'`).
- **Google-Sign-in** Fix (`WebBrowser.maybeCompleteAuthSession()`) — ✅ funktioniert.
- **D2 EAS Auto-Update** — `lib/updates.ts` + Settings "Check for updates" + EAS-Config. OTA-Test: Update wird angezeigt + heruntergeladen ✅.

---

## 5. Features die TEILWEISE fertig sind

| Feature | Status |
|---|---|
| Layered-Subtitle | 🟡 Preview/Export-Geometrie stimmt, ABER Glow ist verbuggt (siehe Open Bug #5) |
| Sub-Page Safe-Area | 🟡 `flex:1`+`edges` gesetzt — erzeugte aber den schwarzen Balken (Open Bug #1) |
| Stripe-Subscription-Flow | 🟡 Checkout läuft, aber kein Redirect nach Kauf (Open Bug #3) |
| D2 EAS-Update | 🟡 Download ok, aber White-Screen beim Apply (Open Bug #2) |
| Worker-Font (Export) | 🟡 `fonts-liberation` im Dockerfile — Worker-Redeploy ausstehend |

---

## 6. 🔴 OPEN BUGS — Round-10 (ERSTE Priorität im neuen Chat)

**Bug 1 — Safe-Area "schwarzer Balken" (Sub-Pages, Android).**
Unten auf Sub-Pages (ProjectDetailScreen) ist ein schwarzer Balken zwischen Content und System-Nav-Bar. Ursache: `edges={['top','bottom']}` am Root-`SafeAreaView` (ProjectDetailScreen.tsx ~Z.189) → die Bottom-Inset-Padding-Zone zeigt `colors.bg.primary` (#0d0509) OHNE den BackgroundGlow-Gradient.
→ **Fix:** zurück auf `edges={['top']}` damit der Gradient/BackgroundGlow edge-to-edge bis ganz unten läuft. TrimModal.tsx `edges={[]}` → zurück auf `edges={['top','bottom']}`. User will: Gradient durchgehend bis zur System-Nav, Content über der Nav-Bar, nur die OS-Nav-Bar selbst schwarz/weiß.

**Bug 2 — White-Screen beim OTA-Update-Apply.**
EAS-Update lädt korrekt, aber Tap auf "Neustart/Apply" (`Updates.reloadAsync()` in `lib/updates.ts`) → weißer Screen. App force-close + neu öffnen → funktioniert dann. → `applyOtaUpdate()` untersuchen; evtl. muss `fetchUpdateAsync()` vollständig abgeschlossen sein vor `reloadAsync()`, oder SDK-52-reloadAsync-Quirk.

**Bug 3 — Stripe-Subscription bleibt "pending" / kein Redirect nach Kauf.**
Nach Plan-Kauf bleibt die App auf dem Pricing-Screen. User wartete 2+ Min, tippte "Refresh subscription status" — bleibt pending. NUR App-Neustart wirkt → also KEIN Webhook-Timing (2 Min reichen). Echter Bug. → `fetchSubscription` (`authStore.ts` ~Z.155-223, schluckt Fehler still), den Refresh-Button (`PricingScreen.tsx`), und ob `hasActiveMobileSub` (`RootNavigator.tsx` Z.51-54) reagiert. Verdacht: Session nach Rückkehr vom externen Stripe-Checkout kaputt ("Invalid Refresh Token" Error) → `fetchSubscription` kann die Row nicht lesen; Neustart re-established die Session via `init()`. CHECK: tritt der "Invalid Refresh Token"-Error auf dem echten Gerät nach dem Kauf auf?

**Bug 4 — Login-Screen-Card-Design falsch.**
LoginScreen-Card sieht "falsch" aus (solide), SignupScreen-Card sieht "richtig" aus (glasig). Ursache: White-Mode-Fix änderte LoginScreen-Card-bg von `rgba(255,255,255,0.045)` (glas) auf `colors.bg.card` (opak #13161a). → **Fix:** `colors.bg.elevated` nutzen (theme-aware translucent, glasig — funktioniert in beiden Modi). Border ggf. auch.

**Bug 5 — Layered-Subtitle Glow.**
User-Erkenntnis: der Export-Layered-Text sah komisch aus weil der Glow VIEL zu groß eingestellt war. Grundursache: die LIVE-PREVIEW zeigt den Glow des BIG/hinteren Wortes NICHT an → User konnte die Glow-Stärke nicht beurteilen und stellte sie zu hoch. → **Fix:** `SubtitleOverlay.tsx` `LayeredText` muss den big-word-Glow tatsächlich rendern (damit der User ihn sieht). Danach Glow-Skalierung in `assBuilder.ts buildLayeredEvents` gegenchecken.

---

## 7. Offene TODOs (Block D + E)

### 🟡 Block D — Pre-Launch / Monetization
| # | Phase | Aufwand | Notes |
|---|---|---|---|
| D1 | Push-Token-Registrierung | ~2h | Expo-Push-Token bei Login in Supabase `profiles` |
| D2 | EAS Auto-Update | ✅ FERTIG | (nur Bug 2 noch) |
| D3 | RevenueCat IAP | ~6-8h | Apple verlangt IAP für mobile Subs |
| D4 | Auth Email-Redirect hosted Web-Page | ~3h | `fiano.app/auth-callback` Cross-Device-Bridge |
| D5 | Desktop sandbox=true + nonce-CSP | ~3h | A6.8 partial reverted |
| D6 | `npm audit fix --force` vor Release | ~1h | Dev-deps CVEs (root + mobile) |

### 🟡 Block E — Quality-of-Life
| # | Phase | Aufwand | Notes |
|---|---|---|---|
| E1 | Thumbnail-on-demand alte Projekte | ~1h | Library-Mount: `extractVideoThumbnail()` async backfill |
| E2 | Intro-Position direkt im Export-Modal | TBD | User-Wunsch — Slider vor Export-Confirm |
| E3 | R2 lifecycle rule `sources/* > 7d` | 10m | Cloudflare R2 Dashboard |
| — | Worker-Font deployen | 10m | `gcloud run deploy` für `fonts-liberation` (Layered-Export) |
| — | Thumbnails: "Custom Game" als ERSTE Genre-Chip-Option | check | War lt. alter Doku schon erledigt — verifizieren dass es nicht regressed ist |

### 🟢 Desktop→Mobile Feature-Lücken (deferred)
- Cross-Device-Sync (Supabase projects-Tabelle + Storage) — E6.
- YT-Direct-Upload (OAuth + YouTube Data API) — C9, übersprungen.
- Multi-Cam-Sync (Audio-Cross-Correlation) — C8, übersprungen.

### Aktion außerhalb vom Code
- `fiano://auth-callback` in Supabase → Auth → URL Configuration → Redirect URLs whitelisten (für Google-Login Production).

---

## 8. Datenmodell

```ts
interface DemoProject {
  id, title, subtitle, durationSec, status, thumbHue, clips,
  sourceUri?, sourceUris?, sourceUrl?, thumbUri?, videoType?, sourceType?,
  trimStart?, trimEnd?, createdAt?, mode?,
  facecamRegion?, gameplayRegion?, splitRatio?, fullOffsetX?, tiktokLayout?, clipOrder?,
  voiceOvers?, subtitles?, musicTracks?, musicShuffle?, intro?, builderExtras?,
  aiHighlights?: AIHighlight[], perClipDurations?: number[],
  effectsAll?: ClipEffects, watermark?: ProjectWatermark,
  errorMessage?, thumbnailHistory?,
}

interface DemoClip { id, startSec, endSec, label, score, thumbUri?,
  sourceIdx?, kind?: 'source'|'highlight', reason?, effects?: ClipEffects }

interface ClipEffects {
  brightness?: -1..1; contrast?: 0.5..2; saturation?: 0..2; sharpen?: 0..5;
  motionBlur?: 'off'|'low'|'medium'|'high';
  colorWheels?: { liftR/G/B?: -0.3..0.3, gammaR/G/B?: 0.5..2, gainR/G/B?: 0.5..1.5 };
}

interface SubtitleSettings {  // Key-Felder
  style: 'default'|'bold'|'gaming'|'fiano'|'layered';
  enabled, cues?, fontFamily?, fontSize?(UI-Token ~26), letterSpacing?, uppercase?,
  textColor?, highlightColor?, highlightWords?: {text,big}[],
  highlightFontScale?(default 1.8), highlightGlow?, highlightGlowColor?, highlightGlowStrength?,
  highlightDropShadow?, highlightUseGradient?, highlightGradientFrom/To?, highlightMetallic?,
  glowEnabled?, glowColor?, glowBlur?, glowStrength?,
  shadowEnabled?, shadowColor?, shadowOffsetX/Y?, shadowBlur?,
  strokeEnabled?, strokeColor?, strokeWidth?, useGradient?, gradientFrom/To?, metallic?,
  position?, customY?, maxWordsPerChunk?,
}

interface ProjectIntro { path, filename?, mode?:'before'|'overlay', scale?, x?, y?,
  durationSec?, chromakey?: {color?,similarity?,blend?} }
interface ProjectVoiceOver { path, startSec, volume, text?, voice?, autoDuck? }
interface ProjectWatermark { path, filename?, position:'tl'|'tr'|'bl'|'br', opacity, scale }

interface Subscription { plan:'creator'|'pro'|'studio_lifetime'|null, status, lifetime,
  current_period_end, cancel_at_period_end, render_count?, monthly_limit? }

interface AppState { initializing, onboardingCompleted, facecamRegion, gameplayRegion,
  openaiKey, geminiKey, youtubeCookies, customSubtitlePresets, exportSettings,
  lastOpenedProjectId, introDefaults, themeMode:'light'|'dark'|'system' }
```

**`packages/shared/src/subtitleLayout.ts`** (NEU): `resolveSubtitleFontPx(uiFontSize, frameHeight)` = `(uiFontSize/26)*(frameHeight*0.06)` — geteilt Preview+Export. `LAYERED_SMALL_SCALE = 0.7`, `LAYERED_SMALL_OFFSET = 0.32`.

---

## 9. Bekannte Bugs / Limits (by-design / env)

| Bug | Status |
|---|---|
| Whisper-Quality bei reinem Game-Audio | by-design |
| Vivo HEVC 1-Decoder OOM-Risk | env — sequential thumb-queue + largeHeap |
| Greenscreen Live-Preview | by-design — RN ohne GL kann chromakey nicht zeigen |
| Layered Export ≠ Preview pixelgenau | by-design — libass (Linux) ≠ RN (Android), andere Render-Engine + Fonts |
| `Invalid Refresh Token` auf Emulator | harmlos bei frischer Installation ohne Session — ABER siehe Open Bug 3 |
| Motion-Blur lange Clips | Cloud-CPU-quota — ggf `cpu=4 instances=5` |

---

## 10. Wichtige Designentscheidungen + Gotchas

- **16:9 Master-First** — Pipeline rendert 16:9, alles leitet ab.
- **TikTok-Tab ≠ Builder-Tab** — TikTok = pro-Clip 9:16; Builder = Multi-Clip 16:9.
- **Cloud-Render statt Local-FFmpeg auf Mobile** — MPEG-LA-Patent + HW.
- **Theme-Pattern (B3):** Jede Component mit `colors.X.Y` braucht eigenes `const colors = useColors()` im function body. `StyleSheet.create` → `function makeStyles(colors)` + `useMemo(()=>makeStyles(colors),[colors])`. Helper außerhalb Components → `colors` als Parameter. NIE `colors.X` auf module-level const.
- **SimpleSlider onChange via Ref** — PanResponder cached die Closure → `onChangeRef`+`useEffect`-Pattern.
- **RN-`<Modal>` + Reanimated v3 in NestableDraggableFlatList** → measureLayout-Crash. `animationType=fade` reicht NICHT. Lösung: absolute-positioned View (TrimModal-B1.3, SubtitleSettingsModal `isInline`) ODER direct-action ohne Modal.
- **A6.4 Security:** NIE user-`args[]` akzeptieren — typed RenderSpec, Worker baut args.
- **Worker `ffmpegArgs.ts` ist KOPIE** — bei jeder shared-Änderung BEIDE syncen.
- **FFmpeg minterpolate me-modes:** NUR esa/tss/tdls/ntss/fss/ds/hexbs/epzs/umh. `me=dia` existiert NICHT.
- **WICHTIG für Claude:** IMMER die Worktree-Pfade editieren (`.claude/worktrees/<id>/...`), NICHT die Main-Repo-Pfade.

---

## 11. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app`
- **GitHub:** `garymikefischer-art/fiano`
- **EAS-Projekt:** `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` (`fiano-mobile`)
- **Branch:** `claude/pedantic-gould-4f5a4c` · HEAD `9dceaf0` · Backup `pre-handoff-round9-20260520`
- **Phone:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Mediatek HEVC, 256 MB heap)

**Mobile Speicherorte:** expo-secure-store (API-Keys, themeMode, Supabase-Session chunked), AsyncStorage (Projekte `fiano.projects`), `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails,watermarks}/`.
**R2:** `fiano-renders/sources/{userId}/{projectId}/...` (1d lifecycle), `outputs/...` (7d).

---

**Stand 2026-05-20** — Block A+B+C + Round-9 + D2. HEAD `9dceaf0`, Backup `pre-handoff-round9-20260520`. Nächster Chat: zuerst die 5 Open Bugs (Section 6).

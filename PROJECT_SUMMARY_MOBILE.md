# 📋 PROJECT SUMMARY — Fisora (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-06-01** — Multi-Font ✅ + Multi-Weight-Picker ✅ + E4 Render-Sync ✅ + Creator-Limit 50 ✅ + Fisora-Rebrand ✅ + i18n Help/Legal ✅ + Icon-Shrink ✅
> **Branch: `claude/edge-to-edge` HEAD `81994e4`** — NOCH NICHT in `main` gemerged. User merged via `git merge --no-ff`.
> **Worker-Rev:** `fiano-render-worker-00051-hf2` (E4 Iter 9 deployed — alle Effekt-Skalierungen sync zur Preview, BT.709 Color, single-layer Glow, gradient-fallback).
> **App-Version:** Mobile `0.0.2`. Desktop `v0.2.0`.
> **Backup-Tags:** `pre-handoff-fisora-context-limit-20260601` (HEAD), `pre-fisora-rename-20260526`, `pre-handoff-context-limit-20260525`.

> 🔴 **SOFORT-NÄCHSTER SCHRITT (User-Action):**
> 1. Google Play Console: **Datensicherheit-Form ausfüllen** (CSV-Template-Antworten in dieser Doku §7c)
> 2. Google Play Console: **App-Icon hochgeladen** (assets/icon.png oder selbst gerendert), Listing-Texte einfügen (§7d)
> 3. Supabase: Migration 003 (`creator_limit_50.sql`) ausführen + Edge Functions deployen (stripe-portal, stripe-checkout, delete-account)
> 4. Resend: DKIM-DNS für `fisora.app` verifizieren
> 5. **Multi-Font + Subtitle-Test on-device** (alle 20 Schriften + 5 Weights wechseln + Gradient/Stroke vergleichen Preview ↔ Export)

---

## 1. Architektur

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase, Stripe. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, RN 0.76 (New Arch), React-Navigation v7, Zustand, react-native-video v6, react-native-svg ~15.10, react-native-edge-to-edge, expo-av/font/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/web-browser/linking/updates/navigation-bar, Supabase JS, reanimated 3.16, draggable-flatlist 4.0.3. Package: `app.fisora.video`. Scheme: `fisora://`. App-Name: `Fisora`. Slug: `fisora-mobile`. runtimeVersion-Policy `appVersion`. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp + fonts-liberation + @napi-rs/canvas + 60 Font-Familys: 20 Display + 10 Sans-Serif × 5 Weights). Cloudflare R2 (S3-API). GCP-Projekt `fiano-render-2026`. Service-Name `fiano-render-worker` (intern, nicht renamed). |

**Wichtige Systeme:**
- **`media://` Custom-Protocol** (Desktop): lokale Video/Audio mit Range + path-validation.
- **Job-Queue** (Desktop `core/queue.ts`): serialisiert FFmpeg, concurrency=1.
- **IPC** (Desktop): typed `IpcResponse<T>`.
- **Cloud-Render-API** (Mobile `lib/renderJob.ts`): Multi-File-Upload zu R2 (signed PUT) → typed RenderSpec → Worker.
- **A6.4 Typed RenderSpec**: Mobile schickt typed JSON, Worker baut `args[]` selbst — NIE user-args[]. Neue Felder server-side allow-list-validieren (`renderSpec.ts`).
- **Settings**: Mobile expo-secure-store, chunked-Adapter (1.9 KB/chunk) für Supabase-Session.

**Cloud-Render-Pipeline:** `POST /v1/upload-url` → `PUT file` → R2 `sources/` → `POST /v1/render` (typed Spec) → **Pass 1** ffmpeg (Layout/Effekte/Audio) → **Pass 2** ffmpeg (PNG-Untertitel-Overlay via `@napi-rs/canvas`) → R2 `outputs/` → signed DL-URL. Plus `/v1/download` (yt-dlp), `/v1/transcribe` (Whisper).

**Color-Pipeline (E4-Phase, 2026-05-26):**
- Effekt-Skalierung: shared `resolveSubtitleEffectScale(canvasH) = canvasH / 720` synchron in Worker + Preview-Pfad → Stroke/Shadow/Glow proportional zur Schrift.
- BT.709 Color-Metadata in beiden FFmpeg-Pässen (`-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`).
- Preset `medium` statt `veryfast` für Subtitle-Encode.
- Glow Single-Layer mit `fill = glowColor + alpha-hex` (statt 4-Pass-Multi-Layer) — matched Preview SVG.
- Gradient-Range über 1.2 × fontSize (≈ glyph-bbox / Preview-SVG-objectBoundingBox).
- Gradient/Shadow/Glow Fallback-Defaults exakt wie Preview (shadowBlur=4, offsetY=2, glowBlur=8, gradientFrom=textColor, gradientTo=#ff8c00) — Worker rendert auch wenn User nur enable-Toggle umlegt.

---

## 2. Ordnerstruktur + WO ändern (Desktop ↔ Mobile)

```
/Users/garyfischer/Downloads/fiano-monorepo/
├── src/                          ← DESKTOP (Electron)
│   ├── main/                     ← Main-Prozess (core/ffmpeg.ts, core/queue.ts, ipc.ts)
│   └── renderer/src/             ← Renderer (React UI)
│       ├── pages/                ← Desktop-Seiten (Home, Library, ProjectDetail, …)
│       └── lib/subtitleCanvas.ts ← Desktop layered-Subtitle (PNG-Canvas)
├── packages/
│   ├── shared/src/               ← GETEILT Desktop+Mobile (via @fiano/shared)
│   │   ├── types.ts              ← Project, SubtitleSettings, ClipEffects
│   │   ├── ffmpegArgs.ts         ← buildEffectsFilter + buildTikTokExportArgs
│   │   ├── assBuilder.ts         ← .ass-Builder — NUR Mobile-Fallback
│   │   ├── subtitleLayout.ts     ← resolveSubtitleFontPx + resolveSubtitleEffectScale + LAYERED_*
│   │   ├── subtitles.ts          ← Cue-Parser
│   │   └── i18n/locales/         ← 9 Sprachen (de/en/es/fr/it/nl/pl/pt/ru). Plus helpScreen.* + legalScreen.* keys.
│   └── mobile/                   ← EXPO + RN
│       ├── App.tsx               ← Root: Auth/Theme/Deep-Links/SystemBars/NavBar
│       ├── app.json              ← Expo-Config (Plugins, edge-to-edge, expo-font mit 60 .ttf, googleServicesFile)
│       ├── app.config.js         ← largeHeap-Plugin
│       ├── google-services.json  ← Firebase FCM — beide Android-Clients (alt fiano + neu fisora)
│       ├── assets/fonts/         ← 60 .ttf (20 base + 4 Weights × 10 Sans-Serifs = 40 Weights)
│       ├── assets/fisora-logo.svg  ← Source-SVG des Fisora-Wortmarks
│       └── src/{screens,components,stores,lib,navigation,data}/
└── services/render-worker/       ← CLOUD WORKER (separates Deploy)
    ├── Dockerfile                ← apt-ffmpeg + yt-dlp + fonts-liberation + COPY assets ./assets
    ├── assets/fonts/             ← 60 .ttf (Kopie, im Docker-Image)
    └── src/{index,render,renderSpec,ffmpegArgs,subtitleCanvas,assValidator,planCheck,…}.ts
```

**WO ÄNDERN für beide Plattformen:**
- **Logik/Types/i18n für BEIDE** → `packages/shared/src/`. Wird via `@fiano/shared` von Desktop + Mobile importiert.
- **Desktop-UI** → `src/renderer/src/pages/`. **Desktop-Render-Logik** → `src/main/core/`.
- **Mobile-UI/Logik** → `packages/mobile/src/`.
- **Worker** → `services/render-worker/src/` (separates Deploy).
- **Fonts (Multi-Font + Multi-Weight)** → BEIDE: `packages/mobile/assets/fonts/` UND `services/render-worker/assets/fonts/`. Bei neuer Font: `lib/fonts.ts` (Mobile) + `subtitleCanvas.ts` (Worker `SUBTITLE_FONT_FILES`) + `app.json` (expo-font-Plugin-Liste) — drei Stellen.

⚠️ **KOPIEN-FILES (BEIDE syncen bei Änderung):**
- `services/render-worker/src/ffmpegArgs.ts` ↔ `packages/shared/src/ffmpegArgs.ts` (Worker hat keine `@fiano/shared`-Dep).
- `services/render-worker/src/subtitleCanvas.ts` ↔ `src/renderer/src/lib/subtitleCanvas.ts` (Desktop vs Worker).
- Font-Files: `packages/mobile/assets/fonts/` ↔ `services/render-worker/assets/fonts/` (gleicher Dateiname, gleicher Inhalt).
- `resolveSubtitleFontPx` + `resolveSubtitleEffectScale` in `packages/shared/src/subtitleLayout.ts` UND als Inline-Kopie im Worker.

---

## 3. Git-Workflow + Deploy + Auto-Updates + Push

### Git
- **Claude arbeitet auf Branch `claude/<name>`** direkt im Main-Repo. Edits gehen in `packages/`, `src/`, `services/`, `supabase/` — NICHT in `.claude/worktrees/` (stale, ignorieren).
- **Backup vor großen Phasen:** `git tag pre-<phase>-YYYYMMDD && git push origin pre-<phase>-YYYYMMDD`.
- **User merged in main:**
  ```bash
  cd /Users/garyfischer/Downloads/fiano-monorepo
  git checkout main
  git merge --no-ff claude/edge-to-edge -m "merge: <desc>"
  git push origin main
  git checkout claude/edge-to-edge   # zum Weiterarbeiten
  ```
- Bei „divergent branches": `git fetch + git merge --no-ff`, NICHT `git pull`.

### Deploy

| Plattform | Mechanismus |
|---|---|
| **Desktop** | `git tag v0.2.X` → `npm run release:mac` → electron-updater. |
| **Mobile — OTA (JS-only)** | `cd packages/mobile && eas update --branch preview`. Schickt nur den JS-Bundle. Greift NUR bei Apps mit gleicher `runtimeVersion` (= app.json `version`) UND gleichem Native-Code. |
| **Mobile — Native Build** | `cd packages/mobile && eas build --profile preview --platform android`. Nötig bei: neuer nativer Dep, app.json-Plugin-Änderung (z.B. expo-font-Plugin oder googleServicesFile), geänderter `version`, geändertes Package. AAB/APK via Internal Distribution. Vor native-Änderung: `version` in app.json bumpen. |
| **Mobile — Lokaler Dev-Build** (immer angeben!) | `cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile && npx expo prebuild --clean && ANDROID_HOME=/Users/garyfischer/Library/Android/sdk ANDROID_SERIAL=10AF7Y16R70010X npm run android`. `prebuild --clean` nur nach app.json/Plugin/Package-Änderung; sonst `npm run android` reicht. **Nach `prebuild --clean`** muss `android/local.properties` manuell mit `sdk.dir=/Users/garyfischer/Library/Android/sdk` wiederhergestellt werden — wird sonst Gradle-„SDK location not found"-Fehler. **Bevorzugter Test-Pfad** (User-Memory): `__DEV__=true` → Paywall via Bypass aus. |
| **Worker** | `cd services/render-worker && gcloud run deploy fiano-render-worker --source . --region europe-west1 --memory 2Gi --cpu 2 --timeout 900 --max-instances 10 --quiet`. Cloud Build baut Docker neu. |
| **Supabase Edge Function** | `supabase functions deploy <name>` (CLI gelinkt; project-ref `zibzcaknqzxgwootfjxc`). |
| **Supabase Migration** | `supabase db push` ODER SQL im Dashboard-Editor. Migrations in `supabase/migrations/`. |

⚠️ **OTA vs. Build:** OTA kann NIEMALS native Änderungen ausliefern. Bei nativen Änderungen (`expo-font`-Plugin-Liste, neue Dep, googleServicesFile, Package-Name, …) IMMER `eas build` + `version` bumpen.

### Auto-Updates (Mobile, D2 erledigt)
- `lib/updates.ts` — `checkForOtaUpdate()` (manueller Settings-Button).
- Auto-Check beim App-Start: `app.json` `updates.checkAutomatically: ON_LOAD` (Default).
- ⚠️ `Updates.reloadAsync()` BEWUSST entfernt (white-screen auf SDK 52 + New Arch). Update wird beim **nächsten Kaltstart** übernommen.

### Push (origin)
- `git push origin claude/edge-to-edge` — Branch hochladen.
- `git push origin <tag>` — Backup-Tag.
- `git push origin main` — User nach Merge.

---

## 4. Features FERTIG ✅

**Block A — Security (A1, A6.1–A6.10):** RLS, Worker Rate-Limit per-userId, .ass-Validation, Plan-Check + monthly counter, A6.4 typed RenderSpec, Logs sanitisiert, Stripe-Webhook dedupe, yt-dlp gehärtet, R2 path-regex. 📄 `SECURITY_AUDIT_2026-05-16.md`.

**Block B — QoL (B0–B5):** Trim+Split-at-playhead, Drag-Reorder Builder (NestableDraggableFlatList), Drag-to-Seek, Light/Dark/System-Theme (B3), TrimModal Multi-Range.

**Block C — Effects/Watermark/Greenscreen (C1–C7):** ClipEffects, Audio-Ducking, Watermark-Overlay, Greenscreen-Chromakey, Color-Wheels, Layered Big-Word-Zoom. *(C8 Multi-Cam-Sync + C9 YT-Direct-Upload bewusst übersprungen.)*

**Round-9:** Intro-Fixes, Builder-Subtitle-Modal `isInline`-Pattern, Layered-Subtitle-Geometrie, First-Launch-Dark-Mode, Google-Sign-in-Fix.

**Round-10 (alle 5 Bugs):** Edge-to-edge, OTA-White-Screen-Fix, Stripe-Webhook frische Subscription-Reads, Paywall-Gate ohne period_end-Check, Login + Passwort-Reset SMTP, Untertitel-Export-Schriftgröße via `resolveSubtitleFontPx`.

**D1 — Push-Token-Registrierung ✅** (on-device verifiziert): `004_push_token.sql`, `getExpoPushToken()`, `authStore.syncPushToken`, FCM-Wiring (`google-services.json` + Firebase `fiano-2bf11`).

**D2 — EAS Auto-Update ✅:** Settings-Check-Button + `checkAutomatically: ON_LOAD`.

**Custom Game = Thumbnail-Default ✅:** Commit `83a154e` (Round-10) — `custom`-Chip ist erstes Element der Genre-Leiste UND Default-Genre.

**Multi-Font (20 Schriften, Phase D-Fonts) ✅:** Root-Cause-Fix Commit `3dfbfeb` (2026-05-26):
- Bug-Wurzel: RN-Android ReactFontManager `EXTENSIONS=['','_bold',...]` mit `fontWeight: '700'` sucht `<family>_bold.ttf` — fehlte → silent Fallback auf System-Roboto-Bold für alle 20 Schriften.
- Fix: SubtitleOverlay nutzt `resolveWeightedFamily` statt hardcoded fontWeight=700. Weight steckt jetzt im Family-Namen (z.B. `InterBlack` lädt InterBlack.ttf direkt).
- 20 Display- + Sans-Serif-Fonts in `assets/fonts/` (Montserrat, Inter, Poppins, Outfit, Sora, BebasNeue, Anton, Oswald, Teko, BarlowCondensed, FjallaOne, ArchivoBlack, Bungee, TitanOne, LuckiestGuy, Bangers, RussoOne, Orbitron, ChakraPetch, PermanentMarker).

**Multi-Weight-Picker (5 Stufen, Phase D-Weight) ✅:** Commit `3dfbfeb`:
- `SubtitleFontWeight = 'light' | 'regular' | 'medium' | 'bold' | 'black'`.
- 10 Sans-Serif-Fonts haben echte Weight-Varianten (Statics für Poppins/BarlowCondensed/ChakraPetch direkt aus google/fonts; Variable-Fonts Montserrat/Inter/Outfit/Sora/Oswald/Teko/Orbitron via `fonttools instantiateVariableFont` instantiiert).
- Oswald/Teko Max-Weight 700 → Black=Bold-Cap. Sora Max=800. ChakraPetch hat kein Black → Bold-Copy.
- Display-Fonts (10) ignorieren Weight visuell, Modal zeigt Hinweis „X is single-weight".

**E4 Worker↔Preview Render-Sync ✅:** Commit `3dfbfeb` (Iter 1-9):
- `effectScale = canvasH/720` ersetzt `baseScale = canvasW/540` für Stroke/Shadow/Glow.
- Stroke × effectScale × 2 (paint-order match Preview SVG).
- Gradient-Range über 1.2 × fontSize (= glyph-bbox approximation).
- BT.709 Color-Metadata + `-preset medium` in Pass 1 + Pass 2.
- Glow Single-Layer mit `fill = glowColor + alpha-hex` (statt 4-Pass).
- Gradient/Shadow/Glow Fallback-Defaults synchron zu Preview.
- Shared `resolveSubtitleEffectScale` Utility in `subtitleLayout.ts`.

**Creator-Plan-Limit 30 → 50 ✅:** Commit `3dfbfeb`. `authStore.ts` + `planCheck.ts` doc + `003_creator_limit_50.sql` (CREATE OR REPLACE der zwei RPCs). **⚠️ SQL Migration MUSS noch ausgeführt werden** (`supabase db push`).

**Fisora Rebrand ✅:** Commit `a600bb4` (2026-05-26):
- App-Name `fiano` → `Fisora`, Slug `fisora-mobile`, Scheme `fisora://`, Package `app.fisora.video`.
- Logo: `FianoLogo.tsx` → `FisoraLogo.tsx` (Mobile + Desktop) mit Fisora-SVG aus `assets/fisora-logo.svg`. ViewBox 1.75-aspect-ratio preserved (538-tall mit Padding) damit Größen-Konsistenz zu altem fiano-Wordmark. `marginLeft=-9` aus HomeScreen + LibraryScreen entfernt (neues Logo hat kein SVG-Whitespace).
- Impressum: „Fisora / Eine App der / Werbeagentur FIANO e.U." als Anbieter. Firmenname FIANO + Domain `fiano.at` + Social-Handles unverändert.
- Support-Email: `support@fisora.app`.
- Domain-Allow-Lists in 3 Supabase Edge Functions (`stripe-portal`, `stripe-checkout`, `delete-account`) auf `fisora.app` umgestellt.
- Style-Label „Fiano" → „Brand" (interne Style-ID `'fiano'` bleibt für Backward-Compat).
- DEFAULT_SUBTITLES.fontFamily auf undefined (war Legacy `'helvetica'` → fallback auf Inter, daher Style-Switch zeigte keinen Font-Wechsel). Plus SubtitleOverlay validiert gegen SUBTITLE_FONT_IDS, ungültige Werte → `defaultFontFor(style)`.
- google-services.json: parallele Android-Client-Section mit `app.fisora.video` (alte fiano-Section bleibt für Backward-Compat).
- 9 i18n-Locales: User-facing „fiano" → „Fisora" (Domains `fiano.at`/`fiano.app` bleiben).

**i18n HelpScreen + LegalScreen ✅:** Commit `ca3d8da` (2026-05-26):
- HelpScreen: 19 `helpScreen.*` keys in allen 9 Locales.
- LegalScreen: 5 `legalScreen.*` keys (Header, 3 Tabs, lastUpdated, deOnlyNotice). Body bleibt deutsch (rechtsverbindlich, Anbieter-Sitz Österreich); bei non-DE Locales erscheint Hinweis-Banner.

**Icon-Shrink ✅:** Commit `81994e4` (2026-06-01):
- `icon.png` + `adaptive-icon.png` + `splash.png`: Pfeil-Symbol auf 85 % verkleinert (~53 % der Bildhöhe statt vorher 62 %). Entspricht Android-Adaptive-Icon Safe-Zone-Konvention.

---

## 5. Features TEILWEISE / mit OFFENEM Bug

**Subtitle Multi-Font + Multi-Weight on-device Verifizierung:** Code committed + Worker deployed (Rev 00051-hf2), aber User hat **noch nicht final auf Phone getestet** ob:
- Alle 20 Fonts + 5 Weights wechseln sichtbar in Preview UND Export.
- Gradient (z.B. `#ff1039 → #ff8c00` rot→orange) sieht in Worker proportional gleich aus wie in Preview.
- Stroke + Glow proportional matched.

Letzte User-Beobachtung Iter 7: bei `gradient #e5e5e5 → #a1a1aa` (weiß→grau) noch subtil unterschiedlich. Iter 9 (Glow-Single-Layer + Saturation-Filter raus) ist deployed aber von User noch nicht in Vergleichs-Render gegen-gecheckt.

**Stripe-Subscription-Flow:** Mobile-Stripe-Checkout-Web ist Stopgap (Apple/Google verlangen IAP). Wird in D3 durch RevenueCat ersetzt. Webhook + `subscriptions`-Tabelle bleiben (Desktop nutzt Stripe weiter).

---

## 6. Aktueller Branch-Stand (seit letztem Handoff)

Branch `claude/edge-to-edge` über `main` (`d423032`):
```
81994e4  fix:  App-Icon / Adaptive-Icon / Splash — Pfeil-Symbol auf 85 % verkleinert
ca3d8da  feat: i18n HelpScreen + LegalScreen (9 Sprachen)
a600bb4  feat: Rebrand fiano → Fisora (Marken-Rename, komplettes Repo)
3dfbfeb  feat: Multi-Font Preview-Bug Fix + 5-Weight-Picker + E4 Worker-Sync
aa4db9c  docs: handoff update — Multi-Font WIP, D1 done, D3 setup pending
c92ecce  wip:  Multi-Font — build-time-Embedding (Preview-Bug offen)  ← gefixt durch 3dfbfeb
93417a7  feat: Multi-Font — 20 caption/gaming Google Fonts (Preview + Export)
3881426  chore: D1 — FCM-Wiring für Android-Push
3129ea0  feat: D1 — Expo-Push-Token bei Login in profiles registrieren
49cc4bf  fix:  Bug 2 — Update-Popup-Text (kein Auto-Restart)
4220e60  fix:  Bug 3b — Paywall-Gate ohne current_period_end-Check + signOut robust
b697ec4  fix:  Bug 3 — Webhook liest Subscription-Status frisch von Stripe
f5a51c2  fix:  Bug 5 — Untertitel-Export-Schriftgröße = Preview
83a154e  feat: Thumbnail-Generator — Custom Game als Default-Genre
```

---

## 7. Offene TODOs (nach Priorität)

### 🔴 1. Google Play Console Setup (User-Action, BEVOR Code-Wiring D3)

Aktueller Schritt (User-blockiert): **Datensicherheit-Form** muss ausgefüllt werden. Antworten siehe §7c.

Davor abgeschlossen:
- ✅ App angelegt (Package `app.fisora.video`)
- ✅ Standardsprache: English (US)
- ✅ Kostenlos
- ✅ Altersgruppen: 16-17 + 18+
- ✅ Kategorie: Videoplayer & Editoren
- ✅ Reviewer-Access-Anleitung
- ✅ App-Name + Listing-Texte vorbereitet (siehe §7d für Marketing-Copy)

Danach (User-Action für RevenueCat D3-Voraussetzung):
1. **Play Console Abo-Produkte erstellen:**
   - Monetarisierung → Produkte → Abos → 2 Abos
   - `creator_monthly` · „Creator" · monatlich · 17,99 €
   - `pro_monthly` · „Pro" · monatlich · 29,99 €
2. **Lizenztests** mit Test-Gmail-Adresse.
3. **Google Cloud Service-Account-JSON** für RevenueCat-Server-Validation.
4. **RevenueCat (app.revenuecat.com):**
   - Project „Fisora" + App mit Package `app.fisora.video` + JSON hochladen.
   - Entitlements: `creator`, `pro`.
   - Products: `creator_monthly` → `creator`, `pro_monthly` → `pro`.
   - Offering `default` mit 2 Packages.
   - **API-Key `goog_…`** kopieren + zu Claude schicken → dann D3-Code-Wiring.

⚠️ **D3 Testen geht NICHT mit `npm run android`** — nur signed Play-Build via internem Test-Track.

### 🔴 2. Subtitle Multi-Font + E4 Final-Verify on-device (User-Action)
- Phone-Test: alle 20 Schriften + 5 Weights wechseln sichtbar in Preview UND Export-Render.
- Vergleichs-Render mit kontrastreichem Gradient (`#ff1039 → #ff8c00`) — Iter-9-Glow-Fix verifizieren.

### 🟡 Block D — Pre-Launch / Monetization (Rest)
| # | Phase | Aufwand | Status |
|---|---|---|---|
| D3 | RevenueCat IAP (Android) | ~3-4h Code | wartet auf User: goog-Key |
| D4 | Hosted Auth-Web-Page `fisora.app/auth-callback` | ~3h | Cross-Device-Bridge für Email-Confirm + Passwort-Reset; aktuell führt Email-Link zu 404 weil `https://fisora.app/auth-callback` noch nicht gehostet |
| D5 | Desktop `sandbox=true` + nonce-CSP | ~3h | A6.8 partial reverted (P1-8/P2-7) |
| D6 | `npm audit fix` (root + mobile + worker) | ~1h | Pre-Release-Hygiene |

### 🟡 Block E — Quality-of-Life
| # | Phase | Aufwand | Status |
|---|---|---|---|
| E1 | Thumbnail-on-demand backfill | ~1h | Beim Library-/ProjectDetail-Mount `extractVideoThumbnail()` async für alte Projekte ohne `thumbUri`. |
| E2 | Intro-Position-Slider im Export-Modal | TBD | Aktuell nur in ProjectDetail via `IntroOverlayControls`. Desktop-Export-UI als Vorlage. User-Wunsch. |
| E3 | R2-Lifecycle-Rule `sources/* > 7d` | 10m | Cloudflare R2 Dashboard. |
| E4 | ✅ Worker↔Preview Render-Sync | erledigt | Commit 3dfbfeb (Iter 1-9). Final-Verify offen. |
| E5 | i18n DE-Strings für `pricing.checkoutPendingTitle/Body`, `stillPendingTitle/Body`, `subStatusLabel`, `refreshSub` | 30m | Mit D3-Refactor erledigen. |

### 🟢 Deferred (Desktop-Mobile-Feature-Lücken)
| # | Feature | Aufwand | Status |
|---|---|---|---|
| — | **Cross-Device-Sync** (Supabase `projects`-Tabelle + Storage, Desktop↔Mobile Pull-Sync) | ~6-8h | Größtes deferred Feature. |
| — | **C8 Multi-Cam-Sync** | — | Bewusst übersprungen. |
| — | **C9 YT-Direct-Upload** | — | Bewusst übersprungen. |

### Aktionen außerhalb vom Code (User, Status)
- ✅ `fisora://auth-callback` ist in Supabase-Auth-Redirect-URLs whitelisted.
- ✅ Supabase Site URL: `https://fisora.app`.
- ✅ Supabase SMTP umgestellt: Sender `support@fisora.app`, Name "fisora".
- ✅ Firebase: parallele Android-App `app.fisora.video` registriert + google-services.json im Repo.
- ✅ Play Console: App angelegt mit `app.fisora.video`.
- ⏳ **Resend Domain `fisora.app` DKIM-DNS-Records** verifizieren (für SMTP-Sender).
- ⏳ **Supabase Migration 003** ausführen (Creator-Limit 50): `supabase db push`.
- ⏳ **Supabase Edge Functions** redeployen (CORS-Whitelists für fisora.app): `supabase functions deploy stripe-portal stripe-checkout delete-account`.
- ⏳ **`fisora.app` Webpage** hosten: `/privacy`, `/terms`, `/auth-callback` (D4-Phase).
- ⏳ Google-Play-Developer-Account + Identity-Verify — läuft.
- ⏳ EAS Project: Display-Name geändert; Slug folgt automatisch beim nächsten Build.

---

## 7a. Stripe (Desktop) + Google IAP (Mobile) — Rechtliche Klarheit

User-Frage: Wenn Desktop Stripe nutzt und Mobile Google IAP, bekommt Google nichts von Stripe-Zahlungen. Rechtlich OK?

**Kurzantwort: JA, ist OK.** Industry-Standard, z.B. Spotify, Netflix, Disney+ machen das genau so:

- **Google Play Policy 2024+:** Apps DÜRFEN auf externe Payment-Routes hinweisen (User-Choice-Billing in EU verpflichtend nach DMA). Subscription, die User AUSSERHALB der mobile App schließt (z.B. über fisora.app-Web oder Desktop-App), läuft komplett am Google-IAP-Anteil vorbei.
- **Voraussetzung:** Innerhalb der Mobile-App MUSS Google IAP angeboten werden, wenn man dort Subs verkauft. Was OFF-APP (Desktop / Web) passiert, ist Google egal.
- **fiano-Modell:**
  - Desktop-User → Stripe-Subscription über die Desktop-App.
  - Mobile-User → Google IAP über die Mobile-App.
  - Beide haben denselben Supabase-Account → derselbe Subscription-Status synchronisiert.
- **Cross-Device:** Wenn ein User Desktop-Stripe-Abo hat und Mobile login öffnet, sieht er das Abo (= keine Mobile-Paywall). Google bekommt darauf nichts. Komplett legitim.
- **Aktuelles Risiko:** Wenn Mobile-User auf der MOBILE-App auf `/billing` getoggt wird mit Stripe-Web-Checkout (aktueller Stopgap aus pre-D3-Zeit), könnte Google das als Policy-Bruch werten. Daher D3 RevenueCat-Wiring nötig BEVOR Public-Release: Mobile-App ZEIGT NUR Google IAP-Flow, Stripe nur off-app.

→ Solange Mobile-App AUSSCHLIESSLICH Google IAP verwendet für In-App-Subs, ist alles regelkonform. Stripe auf Desktop ist Googles Anliegen NICHT.

---

## 7b. Data Safety CSV — Antworten

Die Datei `/Users/garyfischer/Downloads/data_safety_export.csv` ist Template — User füllt Spalte „Response value" mit `YES`/`NO`/`true`/`false` aus + lädt re-import. Hier die Antworten:

**Datenerhebung allgemein:**
- `PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA` → `YES` (Email, Name optional, User-ID, Subscription-Status)
- `PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT` → `YES` (TLS für Supabase/R2/Stripe APIs)

**Kontoerstellung (Multiple Choice):**
- `PSL_ACM_USER_ID_PASSWORD` → `YES`
- `PSL_ACM_OAUTH` → `YES` (Google Sign-in)
- Andere → leer

**Datenlöschung:**
- `DATA_DELETION_YES` → `YES` (Edge Function `delete-account` löscht User komplett)
- `PSL_DATA_DELETION_URL` → `https://fisora.app/account-deletion`

**Datentypen (Multiple Choice — nur die zutreffenden mit YES):**
- `PSL_NAME` → YES (Anzeigename optional)
- `PSL_EMAIL` → YES (Auth)
- `PSL_USER_ACCOUNT` → YES (User-ID, JWT-Token)
- `PSL_PURCHASE_HISTORY` → YES (Stripe-Subscription-Status, Plan, period_end)
- `PSL_PHOTOS` → NO (Videos stay on device)
- `PSL_VIDEOS` → YES (Cloud-Render lädt Video temporär nach R2, auto-delete 7d)
- `PSL_FILES_AND_DOCS` → YES (gleiches Video-Material)
- `PSL_CRASH_LOGS` → YES (Supabase + EAS-Update collecten Build-Crashes)
- `PSL_PERFORMANCE_DIAGNOSTICS` → YES (Console-Logs ohne PII)
- Alle anderen → NO (kein Standort, kein Kontakt, keine SMS, keine Gesundheit, keine Audio, kein Krypto, kein Browser-Verlauf)

**Datennutzung — pro Datentyp folgende Combos:**
- Email/User-ID/Name → `Funktionen der App` + `Kontoverwaltung`. Erhoben = YES, geteilt = NO. User-Kontrolle = Erforderlich.
- Bisherige Käufe → `Funktionen der App` + `Kontoverwaltung`. Erhoben = YES, geteilt = NO (Stripe ist Processor, kein „Geteilt" iSv Play-Policy).
- Videos / Files → `Funktionen der App`. Erhoben = YES (Cloud-Render-Upload), geteilt = NO. **Sitzungsspezifisch = YES** (R2 auto-delete nach 7d für `sources/`, 7d für `outputs/`).
- Crash-Logs / Performance → `Analyse` + `Betrugsprävention, Sicherheit und Compliance`. Erhoben = YES.

**Optional Logos:**
- `PSL_INDEPENDENTLY_VALIDATED` (MASA-Audit) → NO (kein Audit gemacht)
- `PSL_UPI_BADGE_OPT_IN` → NO (Indien-spezifisch, nicht relevant)

---

## 7c. Play Store Listing — Texte (siehe Chat-History für full)

App-Name (max 30, 27 chars): `Fisora - Gaming Clip Editor`
Short Description (max 80, 76 chars): `AI clip editor for streamers. Find highlights + auto-captions + 9:16 export.`
Full Description: siehe Streamer-Fokus-Version aus Chat-History. Made in Austria, Werbeagentur FIANO e.U. Footer.

App-Symbol (512×512): aus `packages/mobile/assets/icon.png` (bereits geshrinkt).

Vorstellungsgrafik (1024×500): User-Action (Figma/Canva).

Screenshots Phone (2-8, ideal 4-6): User-Action via `adb -s 10AF7Y16R70010X exec-out screencap -p > screen.png` von Home/9:16/Highlights/Subtitle-Modal/Builder/Export.

Tablet 7"+10": optional, skipbar.

Video: optional aber empfohlen.

**App-Icon nachträglich änderbar:** Ja, jederzeit in Play Console „Hauptlisting" → „Grafiken" → App-Symbol. Bei Update wird Icon innerhalb 1-2h für alle Listings ausgespielt.

---

## 7d. Was kommt NACH Datensicherheit (Play-Console-Roadmap)

1. **App-Inhalte → „Werbung enthalten?"** → NO (du hast keine Ads).
2. **Zielgruppe** → 16-17 + 18+ (siehe Chat).
3. **Inhaltliche Bewertung** (IARC-Fragebogen) → bei Editor durchweg NO zu Gewalt/Sex/Drogen → PEGI 3 oder PEGI 7.
4. **Hauptlisting** (Texte + Grafiken aus §7c) ausfüllen.
5. **Internal Testing Track**: erste AAB hochladen via `eas build --profile preview --platform android` + Internal-Distribution-Link an dich + License-Tester-Gmail eintragen → ich Test-Render mit echtem Google-IAP-Flow.
6. **Pre-Launch Report** abwarten — Google scannt automatisch auf Crashes / Policy-Violations.
7. **Production Track** — Public Release.

---

## 8. Datenmodell (gekürzt — Volltext in `packages/shared/src/types.ts`)

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
  colorWheels?: { liftR/G/B?, gammaR/G/B?, gainR/G/B? };
}

interface SubtitleSettings {
  style: 'default'|'bold'|'gaming'|'fiano'|'layered';
  enabled, cues?, fontFamily?: string, fontWeight?: 'light'|'regular'|'medium'|'bold'|'black',
  fontSize?(UI-Token ~26), letterSpacing?, uppercase?,
  textColor?, highlightColor?, highlightWords?: {text,big}[],
  highlightFontScale?(default 1.8), highlightGlow?, highlightGlowColor?, highlightGlowStrength?,
  highlightDropShadow?, highlightUseGradient?, highlightGradientFrom/To?, highlightMetallic?,
  glowEnabled?, glowColor?, glowBlur?, glowStrength?,
  shadowEnabled?, shadowColor?, shadowOffsetX/Y?, shadowBlur?,
  strokeEnabled?, strokeColor?, strokeWidth?, useGradient?, gradientFrom/To?, metallic?,
  position?, customY?, maxWordsPerChunk?,
}

interface Subscription { plan:'creator'|'pro'|'studio_lifetime'|null, status, lifetime,
  current_period_end, cancel_at_period_end, render_count?, monthly_limit? }
```

**`SubtitleFontFamily` = `string`** (Multi-Font-Library: 20 base + 40 weight-varianten = 60 IDs in `lib/fonts.ts` `SUBTITLE_FONTS` + Worker `SUBTITLE_FONT_FILES`).

**RenderSpec (`renderSpec.ts`):** Mobile→Worker. `subtitlePng: { settings: SubtitleRenderSettings, highlightWords?, cues }`. `settings.fontFamily` allow-list-validiert gegen `SUBTITLE_FONT_IDS`. Mobile sendet fully-resolved Family-Namen (z.B. `InterBlack`) statt `Inter` + separate weight.

---

## 9. Bekannte Bugs / Limits

| Bug / Limit | Status |
|---|---|
| Multi-Font Preview wechselt nicht | ✅ gefixt (Commit 3dfbfeb) |
| Gradient blasser im Export | ✅ gefixt (E4 Iter 1-9) — User-Final-Verify offen |
| Glow im Export zu stark | ✅ gefixt (E4 Iter 9 Single-Layer) |
| Stroke andere Stärke | ✅ gefixt (E4 Iter 5: × effectScale × 2) |
| Whisper-Quality bei reinem Game-Audio | by-design |
| Vivo HEVC 1-Decoder OOM-Risk | env — sequential thumb-queue + largeHeap |
| Greenscreen Live-Preview | by-design — RN ohne GL |
| `Invalid Refresh Token` Emulator | harmlos bei frischer Installation |
| HelpScreen / LegalScreen DE-only | ✅ gefixt (i18n Commit ca3d8da) |
| App-Icon Pfeil zu groß | ✅ gefixt (Commit 81994e4) |

---

## 10. Wichtige Designentscheidungen + Gotchas

- **16:9 Master-First** — Pipeline rendert 16:9, alles leitet ab.
- **Cloud-Render statt Local-FFmpeg auf Mobile** — MPEG-LA-Patent + Hardware.
- **Theme-Pattern (B3):** Jede Component mit `colors.X.Y` braucht eigenes `const colors = useColors()` im function body. NIE module-level.
- **A6.4 Security:** NIE user-`args[]` — typed RenderSpec, Worker baut args. Neue Client-Felder server-side allow-list-validieren.
- **Worker `ffmpegArgs.ts` ist KOPIE** von `packages/shared` — bei Filter-Änderung BEIDE syncen.
- **`subtitleCanvas.ts` existiert 2×** (Desktop Browser-Canvas + Worker `@napi-rs/canvas`) — Render-Logik bewusst identisch halten.
- **Multi-Font + Multi-Weight:** dieselbe `.ttf`-Datei + derselbe Dateiname in `packages/mobile/assets/fonts/` UND `services/render-worker/assets/fonts/`. Family-Name = Dateiname ohne `.ttf`. Weight-Suffix-Convention: `Inter` (Regular), `InterLight`, `InterMedium`, `InterBold`, `InterBlack`. Mobile baut Family-Name aus `resolveWeightedFamily(baseId, weight)`. Worker hat 60 Entries in `SUBTITLE_FONT_FILES`.
- **`expo-updates reloadAsync()`** white-screen-t auf SDK 52 + New Arch → NICHT nutzen. Update kommt beim nächsten Kaltstart.
- **Edge-to-edge:** `react-native-edge-to-edge` (`SystemBars` für Bar-Icon-Style) + `expo-navigation-bar` (nur für Nav-Bar-Hintergrundfarbe).
- **Test-Befehl IMMER inkl. `npm run android`** (Memory-Feedback): `cd packages/mobile && ANDROID_HOME=/Users/garyfischer/Library/Android/sdk ANDROID_SERIAL=10AF7Y16R70010X npm run android`. Lokaler Dev-Build hat `__DEV__=true` → Paywall-Bypass.
- **Bei Bugs ZUERST den echten verantwortlichen Code lesen + an der Wurzel fixen** — keine spekulativen Style-Patches.
- **`.claude/worktrees/`** sind STALE — ignorieren, im Main-Repo arbeiten.
- **expo prebuild --clean** löscht `android/local.properties` → muss mit `sdk.dir=/Users/garyfischer/Library/Android/sdk` wiederhergestellt werden.
- **Stripe (Desktop) + IAP (Mobile) parallel** — rechtlich sauber (DMA / Spotify-Modell).

---

## 11. Security — Stand

**Erledigt (A6.x):** A6.1 Rate-Limit, A6.2 .ass-Validation, A6.3 Plan-Check + Monthly-Counter, A6.4 typed RenderSpec, A6.5 Log-Sanitize + R2-Path-Regex, A6.6 Stripe-Webhook-Dedup + Edge-Function-CORS-Whitelist (jetzt fisora.app), A6.7 yt-dlp gehärtet, A6.9 R2-Body-Limit + SourceKey-Ext-Check, A6.10 (partial).

**Round-10-Addendum (`SECURITY_AUDIT_2026-05-16.md`):**
- Stripe-Webhook gehärtet.
- `subtitlePng` allow-list-validiert (Numbers geclampt, Colors 6-hex-regex, Enums, fontFamily seit Multi-Font in der Allow-List).
- `__DEV__`-Paywall-Bypass nur in Dev-Builds (Release/Preview = `__DEV__=false`).

**Noch offen aus dem Audit:**
- **D5** Electron `sandbox=true` + nonce-CSP — A6.8 partial reverted (P1-8/P2-7).
- **D6** `npm audit fix` (root + mobile + worker) — P3-12.
- **E3** R2-Lifecycle `sources/* > 7d` — P2-1.

---

## 12. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app` · Rev `00051-hf2` · GCP `fiano-render-2026`.
- **GitHub:** `garymikefischer-art/fiano` (Repo-Rename optional, noch nicht durchgeführt).
- **EAS-Projekt:** `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` (Display-Name auf „fisora-mobile" geändert). User: `garyfischer`.
- **Supabase-Projekt:** `zibzcaknqzxgwootfjxc` (CLI gelinkt). Site URL `https://fisora.app`. Auth Redirect URLs whitelist enthält `fisora://auth-callback`.
- **Firebase:** `fiano-2bf11` (intern unverändert), zwei Android-Apps (alt `app.fiano.video` + neu `app.fisora.video`).
- **Branch:** `claude/edge-to-edge` · HEAD `81994e4`.
- **Backups:** `pre-handoff-fisora-context-limit-20260601` (HEAD), `pre-fisora-rename-20260526`, `pre-handoff-context-limit-20260525`, `pre-d3-fonts-20260520`, `pre-handoff-round10-20260520`.
- **Phone:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Android 15, MediaTek HEVC `c2.mtk.hevc.decoder`, 256 MB Default-Heap).
- **Mobile-Speicher:** expo-secure-store (API-Keys, themeMode, Supabase-Session chunked), AsyncStorage (`fiano.projects`, `fiano.notifications` — Storage-Keys BLEIBEN „fiano.*" um User-Daten nicht zu zerstören!), `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails,watermarks}/`.
- **R2:** `fiano-renders/sources/{userId}/{projectId}/...` (7d lifecycle TODO), `outputs/...` (7d).
- **Marketing-Assets:** `~/Downloads/fiano-marketing/` (logo.png, logo-adaptive.png, output/).
- **Fisora-Marketing:** `https://fisora.app` (Domain hosten noch User-Action).
- **Support:** `support@fisora.app`.

---

*Stand 2026-06-01. Nächster Chat: Datensicherheit-Form ausfüllen (§7b), dann Listing-Texte + Screenshots hochladen (§7c-d), dann Pre-Launch-Track Build via EAS, dann D3 RevenueCat-Wiring sobald `goog_…`-Key da.*

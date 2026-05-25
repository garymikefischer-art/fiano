# 📋 PROJECT SUMMARY — fiano (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-05-25** — Round-10 + D1 (Push-Token) + D2 (EAS-Update) + Multi-Font (Preview-Bug offen)
> **Branch: `claude/edge-to-edge` HEAD `c92ecce`** — 9 Commits über `main` (`d423032`), NOCH NICHT gemerged.
> **Worker-Rev:** `fiano-render-worker-00041-tdz` (deployed, 20 Fonts im Image).
> **App-Version:** `0.0.2` (Mobile). Desktop `v0.2.0`.
> **Backup-Tags:** `pre-handoff-context-limit-20260525` (HEAD), `pre-d3-fonts-20260520`, `pre-handoff-round10-20260520`, `pre-png-subtitles`, `pre-round-10`.

> 🔴 **SOFORT-NÄCHSTER SCHRITT:**
> 1. **Multi-Font Preview-Bug fixen** — Picker zeigt 20 Schriften, Preview wechselt aber die Schrift nicht; Fonts sind nachweislich im APK. Per `adb screencap`/`input tap` direkt am Gerät beobachten (§7a).
> 2. **D3 RevenueCat-Code** — sobald der User Google-Identity-Verification durch hat + Play-Produkte + RevenueCat-Setup + `goog_…`-Key liefert (§7b).
> 3. **Merge** `claude/edge-to-edge` → `main` (User-Action, siehe §3).

---

## 1. Architektur

| Plattform | Stack |
|---|---|
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), TS strict, React 18 + Tailwind + Zustand, HashRouter, bundled FFmpeg/yt-dlp, electron-updater, Supabase, Stripe. 9 Sprachen. v0.2.0. |
| **Mobile** | Expo SDK 52, RN 0.76 (New Arch), React-Navigation v7, Zustand, react-native-video v6, react-native-svg ~15.10, react-native-edge-to-edge, expo-av/font/haptics/localization/secure-store/document-picker/image-picker/video-thumbnails/notifications/blur/web-browser/linking/updates/navigation-bar, Supabase JS, reanimated 3.16, draggable-flatlist 4.0.3. App-Version 0.0.2, runtimeVersion-Policy `appVersion`. |
| **Cloud-Render** | Google Cloud Run (Node 22 + Express + apt-ffmpeg + yt-dlp + fonts-liberation + @napi-rs/canvas + 20 Caption-Fonts). Cloudflare R2 (S3-API). GCP-Projekt `fiano-render-2026`. |

**Wichtige Systeme:**
- **`media://` Custom-Protocol** (Desktop): lokale Video/Audio mit Range + path-validation.
- **Job-Queue** (Desktop `core/queue.ts`): serialisiert FFmpeg, concurrency=1.
- **IPC** (Desktop): typed `IpcResponse<T>`.
- **Cloud-Render-API** (Mobile `lib/renderJob.ts`): Multi-File-Upload zu R2 (signed PUT) → typed RenderSpec → Worker.
- **A6.4 Typed RenderSpec**: Mobile schickt typed JSON, Worker baut `args[]` selbst — NIE user-args[]. Neue Felder server-side allow-list-validieren (`renderSpec.ts`).
- **Settings**: Mobile expo-secure-store, chunked-Adapter (1.9 KB/chunk) für Supabase-Session.

**Cloud-Render-Pipeline:** `POST /v1/upload-url` → `PUT file` → R2 `sources/` → `POST /v1/render` (typed Spec) → **Pass 1** ffmpeg (Layout/Effekte/Audio) → **Pass 2** ffmpeg (PNG-Untertitel-Overlay via `@napi-rs/canvas`) → R2 `outputs/` → signed DL-URL. Plus `/v1/download` (yt-dlp), `/v1/transcribe` (Whisper).

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
│   │   ├── assBuilder.ts         ← .ass-Builder — NUR Mobile-Fallback (heute durch PNG-Pfad ersetzt)
│   │   ├── subtitleLayout.ts     ← resolveSubtitleFontPx + LAYERED_*-Konstanten (geteilt mit Worker)
│   │   ├── subtitles.ts          ← Cue-Parser
│   │   └── i18n/locales/         ← 9 Sprachen
│   └── mobile/                   ← EXPO + RN
│       ├── App.tsx               ← Root: Auth/Theme/Deep-Links/SystemBars/NavBar
│       ├── app.json              ← Expo-Config (Plugins, edge-to-edge, expo-font mit 20 .ttf, googleServicesFile)
│       ├── app.config.js         ← largeHeap-Plugin
│       ├── google-services.json  ← Firebase (FCM) — Client-Config, committed
│       ├── assets/fonts/         ← 20 .ttf (Multi-Font, build-time eingebettet via expo-font-Plugin)
│       └── src/{screens,components,stores,lib,navigation,data}/
└── services/render-worker/       ← CLOUD WORKER (separates Deploy)
    ├── Dockerfile                ← apt-ffmpeg + yt-dlp + fonts-liberation + COPY assets ./assets
    ├── assets/fonts/             ← 20 .ttf (Kopie, im Docker-Image)
    └── src/{index,render,renderSpec,ffmpegArgs,subtitleCanvas,assValidator,…}.ts
```

**WO ÄNDERN für beide Plattformen:**
- **Logik/Types/i18n für BEIDE** → `packages/shared/src/`. Wird via `@fiano/shared` von Desktop + Mobile importiert → eine Änderung wirkt überall.
- **Desktop-UI** → `src/renderer/src/pages/`. **Desktop-Render-Logik** → `src/main/core/`.
- **Mobile-UI/Logik** → `packages/mobile/src/`.
- **Worker** → `services/render-worker/src/` (separates Deploy).
- **Fonts (Multi-Font)** → BEIDE: `packages/mobile/assets/fonts/` UND `services/render-worker/assets/fonts/` (gleiche `.ttf`, gleicher Dateiname). Bei neuer/geänderter Font: in beide Ordner legen + `subtitleCanvas.ts` (Worker) + `lib/fonts.ts` (Mobile) eintragen + `app.json` (expo-font-Plugin-Liste).

⚠️ **`services/render-worker/src/ffmpegArgs.ts` ist KOPIE** von `packages/shared/src/ffmpegArgs.ts` (Worker hat keine `@fiano/shared`-Dep). Bei JEDER Änderung an Filter-Logik BEIDE syncen — Diff nur im TikTokLayout-Block.

⚠️ **`subtitleCanvas.ts` existiert 2×** (Desktop `src/renderer/src/lib/` + Worker `services/render-worker/src/`). Render-Logik (Gradient, Metallic, Glow, Layered) bewusst identisch halten. Font-Sizing weicht heute BEWUSST ab: der Worker nutzt `resolveSubtitleFontPx` (Bug-5-Fix für Mobile-Pipeline); der Desktop noch nicht — Desktop-Preview-vs-Export-Gleichheit ungetestet.

⚠️ **`subtitleCanvas.ts` (Worker) exportiert `SUBTITLE_FONT_IDS`** — `renderSpec.ts` importiert das für die `fontFamily`-Allow-List-Validation. Bei neuer Font: Liste an BEIDEN Stellen (Mobile `lib/fonts.ts` + Worker `subtitleCanvas.ts` `SUBTITLE_FONT_FILES`) syncen.

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
| **Mobile — OTA (JS-only)** | `cd packages/mobile && eas update --branch preview`. Schickt nur den JS-Bundle. Greift NUR bei Apps mit gleicher `runtimeVersion` (= app.json `version`) UND gleichem Native-Code. Kein Store-Review. |
| **Mobile — Native Build** | `cd packages/mobile && eas build --profile preview --platform android`. Nötig bei: neuer nativer Dep, app.json-Plugin-Änderung (z.B. `expo-font`-Plugin oder googleServicesFile), geänderter `version`. AAB/APK via Internal Distribution. Vor native-Änderung: `version` in app.json bumpen! |
| **Mobile — Lokaler Dev-Build** (immer angeben!) | `cd /Users/garyfischer/Downloads/fiano-monorepo/packages/mobile && npx expo prebuild --clean && ANDROID_SERIAL=10AF7Y16R70010X npm run android`. `prebuild --clean` nur nach app.json/Plugin-Änderung; sonst `npm run android` reicht. **Bevorzugter Test-Pfad** (User-Wunsch in Memory): `__DEV__=true` → Paywall via Bypass aus. |
| **Worker** | `cd services/render-worker && gcloud run deploy fiano-render-worker --source . --region europe-west1 --memory 2Gi --cpu 2 --timeout 900 --max-instances 10 --quiet`. Cloud Build baut Docker neu. |
| **Supabase Edge Function** | `supabase functions deploy <name>` (CLI bereits gelinkt; project-ref `zibzcaknqzxgwootfjxc`). |
| **Supabase Migration** | `supabase db push` ODER SQL im Dashboard-Editor. Migrations in `supabase/migrations/`. |

⚠️ **OTA vs. Build:** OTA kann NIEMALS native Änderungen ausliefern und erreicht nur dieselbe runtimeVersion. Bei nativen Änderungen (`expo-font`-Plugin-Liste, neue Dep, googleServicesFile, …) IMMER `eas build` + `version` bumpen, sonst OTA-Konflikt mit falscher nativer Basis.

### Auto-Updates (Mobile, D2 erledigt)
- `lib/updates.ts` — `checkForOtaUpdate()` (manueller Settings-Button).
- Auto-Check beim App-Start: `app.json` `updates.checkAutomatically: ON_LOAD` (Default).
- ⚠️ `Updates.reloadAsync()` BEWUSST entfernt (white-screen-t auf SDK 52 + New Arch). Update wird beim **nächsten Kaltstart** übernommen; Popup-Text sagt „App schließen + neu öffnen". String `settings.updateReadyBody` (de.ts/en.ts) korrigiert (Round-10 Bug 2).

### Push (origin)
- `git push origin claude/edge-to-edge` — Branch hochladen (vor User-Merge / als Backup).
- `git push origin <tag>` — Backup-Tag hochladen.
- `git push origin main` — User nach Merge.
- Auth via macOS Keychain / gh; war diese Session funktional.

---

## 4. Features FERTIG ✅

**Block A — Security (A1, A6.1–A6.10):** RLS, Worker Rate-Limit per-userId, .ass-Validation, Plan-Check + monthly counter, A6.4 typed RenderSpec, Logs sanitisiert, Stripe-Webhook dedupe, yt-dlp gehärtet, R2 path-regex. 📄 `SECURITY_AUDIT_2026-05-16.md`.

**Block B — QoL (B0–B5):** Trim+Split-at-playhead, Drag-Reorder Builder (NestableDraggableFlatList), Drag-to-Seek, Light/Dark/System-Theme (B3), TrimModal Multi-Range.

**Block C — Effects/Watermark/Greenscreen (C1–C7):** ClipEffects (brightness/contrast/saturation/sharpen/motionBlur/colorWheels), Audio-Ducking, Watermark-Overlay, Greenscreen-Chromakey, Color-Wheels, Layered Big-Word-Zoom. *(C8 Multi-Cam-Sync + C9 YT-Direct-Upload bewusst übersprungen.)*

**Round-9:** Intro-Fixes, Builder-Subtitle-Modal `isInline`-Pattern, Layered-Subtitle-Geometrie, First-Launch-Dark-Mode, Google-Sign-in-Fix.

**Round-10 (alle 5 Bugs, on-device verifiziert):**
- **Bug 1** — Gradient/Tab-Bar/Nav-Bar via `react-native-edge-to-edge` + `expo-navigation-bar`, BackgroundGlow-onLayout-Fix.
- **Bug 2** — OTA-White-Screen: `reloadAsync()` entfernt; Popup-Text in de.ts/en.ts korrigiert (kein Auto-Restart-Versprechen mehr).
- **Bug 3** — Stripe-Webhook: liest Subscription jetzt frisch von Stripe (`syncSubscriptionById`) statt Event-Snapshot → kein Race mehr durch `customer.subscription.created` (status=incomplete) der `customer.subscription.updated` (active) überschreibt. Upsert-Fehler → 500 (Retry) statt still 200. Dedup-Row wird bei Handler-Fehler entfernt.
- **Bug 3b** — Paywall-Gate (`RootNavigator`): `current_period_end > now`-Check entfernt (sperrte zahlende User aus bei veraltetem period_end). Gate nur noch auf `status` + `plan`. `signOut` leert die lokale Session jetzt auch bei Remote-Fehler.
- **Bug 4** — Login + Passwort-Reset (SMTP + Redirect-URL `fiano://auth-callback` im Supabase-Dashboard erforderlich).
- **Bug 5** — Untertitel-Export-Schriftgröße: Worker nutzt jetzt `resolveSubtitleFontPx` statt `canvasW/540`; Preview = Export.

**D1 — Push-Token-Registrierung ✅** (on-device verifiziert):
- `004_push_token.sql` (Migration: `expo_push_token`-Spalte in `profiles`, RLS bereits gedeckt).
- `getExpoPushToken()` (`pushNotifications.ts`).
- `authStore.syncPushToken` bei `onAuthStateChange` (einmal pro Session, Dedup-Flag).
- FCM-Wiring: `google-services.json` ins Repo + `app.json` `android.googleServicesFile` (Firebase-Projekt `fiano-2bf11`). Funktioniert.
- ⏳ **Optional offen für später:** FCM-V1-Service-Account-Key in EAS hochladen (für Push-**Senden**). Für reines Token-Sammeln (D1) nicht nötig.

**D2 — EAS Auto-Update ✅:** Settings-Check-Button + `checkAutomatically: ON_LOAD`. Round-10 Bug 2 finalisiert (Popup-Text + kein Auto-Restart).

**Custom Game = Thumbnail-Default ✅:** Commit `83a154e` (Round-10) — `custom`-Chip ist bereits an erster Stelle der Genre-Leiste UND ist Default-Genre beim Öffnen.

---

## 5. Features TEILWEISE / mit OFFENEM Bug

**Multi-Font — 20 Google Fonts (Preview + Export) — code-complete, Preview-Bug offen:**
- 20 OFL/Apache-Fonts in `packages/mobile/assets/fonts/` + `services/render-worker/assets/fonts/` (Montserrat, Poppins, Inter, Outfit, Sora, BebasNeue, Anton, Oswald, Teko, BarlowCondensed, FjallaOne, ArchivoBlack, Bungee, TitanOne, LuckiestGuy, Bangers, RussoOne, Orbitron, ChakraPetch, PermanentMarker).
- Mobile: `lib/fonts.ts` (Registry, `SUBTITLE_FONTS`, `SUBTITLE_FONT_IDS`, `defaultSubtitleFont`). Build-time-Einbettung via **`expo-font` Config-Plugin** in `app.json`. `SubtitleOverlay.mapFontFamily` + `defaultFontFor` + `SubtitleSettingsModal` (`FONT_OPTIONS = SUBTITLE_FONTS`, Custom-Field entfernt).
- Worker: `subtitleCanvas.ts` registriert die 20 via `registerFromPath`; `resolveWorkerFont` + `defaultWorkerFont`. `renderSpec.ts` lässt `fontFamily` allow-list-validiert durch.
- Worker deployed ✅ (Rev `00041-tdz`).
- 🔴 **Bug:** Font-Picker zeigt 20 Schriften, Klick aktualisiert `local.fontFamily` korrekt, `SubtitleOverlay` re-rendert — **aber die gerenderte Schrift wechselt NICHT** (weder Modal-Preview noch 9:16-Live-Preview). Siehe §7a.

**Glow im Export zu stark (User-Feedback nach Bug-5):** Schriftgröße stimmt, aber Glow im Worker ist kräftiger als in der Mobile-Preview. Effekt-Skalierung Worker (`baseScale = canvasW/540`) ≠ Preview (rohe Pixel). Beim Bug-5-Fix bewusst nicht mitangefasst. → siehe future_features-Memory.

**Stripe-Subscription-Flow:** Mobile-Stripe-Checkout-Web ist Stopgap (Apple/Google verlangen IAP). Wird in D3 durch RevenueCat ersetzt. Webhook + `subscriptions`-Tabelle bleiben (Desktop nutzt Stripe weiter).

---

## 6. Aktueller Branch-Stand (seit letztem Handoff)

Branch `claude/edge-to-edge` über `main` (`d423032`):
```
c92ecce  wip: Multi-Font — build-time-Embedding (Preview-Bug offen)
93417a7  feat: Multi-Font — 20 caption/gaming Google Fonts (Preview + Export)
3881426  chore: D1 — FCM-Wiring für Android-Push
3129ea0  feat: D1 — Expo-Push-Token bei Login in profiles registrieren
49cc4bf  fix:  Bug 2 — Update-Popup-Text (kein Auto-Restart)
4220e60  fix:  Bug 3b — Paywall-Gate ohne current_period_end-Check + signOut robust
b697ec4  fix:  Bug 3 — Webhook liest Subscription-Status frisch von Stripe
f5a51c2  fix:  Bug 5 — Untertitel-Export-Schriftgröße = Preview
83a154e  feat: Thumbnail-Generator — Custom Game als Default-Genre  (= main-Ziel von Round-10)
```

---

## 7. Offene TODOs (nach Priorität)

### 🔴 1. Multi-Font Preview-Bug (siehe §7a)

### 🔴 2. D3 — RevenueCat (Android-only, iOS deferred). User-Setup-Schritte §7b. Code-Wiring (~3-4h) sobald `goog_…`-Key da.

### 🟡 Block D — Pre-Launch / Monetization (Rest)
| # | Phase | Aufwand | Status |
|---|---|---|---|
| D3 | RevenueCat IAP (Android) | ~3-4h Code | warten auf User: Google-Identity-Verify + Play-Produkte + RevenueCat-Setup |
| D4 | Hosted Auth-Web-Page `fiano.app/auth-callback` | ~3h | Cross-Device-Bridge für Email-Confirm + Passwort-Reset |
| D5 | Desktop `sandbox=true` + nonce-CSP | ~3h | A6.8 partial reverted — siehe SECURITY_AUDIT P1-8/P2-7 |
| D6 | `npm audit fix` (root + mobile + worker) | ~1h | Vor Release |

### 🟡 Block E — Quality-of-Life
| # | Phase | Aufwand | Status |
|---|---|---|---|
| E1 | Thumbnail-on-demand backfill | ~1h | Beim Library-/ProjectDetail-Mount `extractVideoThumbnail()` async für alte Projekte ohne `thumbUri`. |
| E2 | Intro-Position-Slider im Export-Modal | TBD | Aktuell nur in ProjectDetail via `IntroOverlayControls`. Desktop-Export-UI als Vorlage. User-Wunsch. |
| E3 | R2-Lifecycle-Rule `sources/* > 7d` | 10m | Cloudflare R2 Dashboard. |
| E4 | Glow-Skalierung Worker↔Preview angleichen | ~1h | User-Feedback nach Bug-5 — Glow im Export zu stark. |
| E5 | i18n: deutsche Strings für `pricing.checkoutPendingTitle/Body`, `stillPendingTitle/Body`, `subStatusLabel`, `refreshSub` | 30m | Aktuell EN-Fallback im PricingScreen. Mit D3-Refactor erledigen. |

### 🟢 Deferred (Desktop-Mobile-Feature-Lücken)
| # | Feature | Aufwand | Status |
|---|---|---|---|
| — | **Cross-Device-Sync** (Supabase `projects`-Tabelle + Storage, Desktop↔Mobile Pull-Sync) | ~6-8h | Größtes Feature, offen. |
| — | **YT-Direct-Upload (C9)** | — | Bewusst übersprungen. |
| — | **Multi-Cam-Sync (C8)** | — | Bewusst übersprungen. |

### Aktionen außerhalb vom Code (User)
- `fiano://auth-callback` ist in Supabase-Auth-Redirect-URLs whitelisted ✅ (bestätigt).
- Supabase SMTP ist konfiguriert (Resend, `noreply@garyfischer.at`) ✅.
- Firebase-Projekt `fiano-2bf11` + `google-services.json` im Repo ✅.
- FCM-V1-Service-Account-Key in EAS hochladen — **offen** (für Push-Senden, nicht für D1-Token).
- Google-Play-Developer-Account + Identity-Verify — **läuft** (Google-seitige Verzögerung).

---

## 7a. Multi-Font Preview-Bug — Diagnose-Stand

**Symptom:** Picker zeigt alle 20 Fonts, Klick aktualisiert `local.fontFamily` + Picker-Highlight (= `patch` + `onChange` + Re-Render funktioniert). Aber: weder Modal-`SubtitlePreviewCard` noch 9:16-Live-`StackedSplitPreview` rendern die gewählte Schrift sichtbar. Alle 20 sehen gleich aus.

**Was ausgeschlossen ist:**
- **Embedding ✅:** `find android/ -iname '*.ttf'` zeigt 20 Fonts in `android/app/src/main/assets/fonts/` UND `android/app/build/intermediates/.../mergeDebugAssets/fonts/` (= im APK).
- **Wiring ✅:** `SubtitleSettingsModal` `local = settings` (Single-Source-of-Truth, Zeile 106). `patch(p) => onChange({...local, ...p})` (108). `<SubtitlePreviewCard settings={local} />` (165). Preview re-rendert (andere Settings wie Farbe/Größe ändern es).
- **`mapFontFamily` ✅:** Liefert die korrekte Font-ID zurück (`SUBTITLE_FONT_IDS.has(f)` → return `f`).
- **react-native-svg-Code (`TSpanView.java` 1142–1184) ✅:** Versucht `Typeface.Builder(assets, "fonts/<name>.otf")`, dann `.ttf`, dann `ReactFontManager.getInstance().getTypeface(fontFamily, style, assets)` als Fallback. ALLE Pfade resolven `assets/fonts/<id>.ttf`.
- **Erste Theorie „useFonts() all-or-nothing failt":** Logcat zeigt keinen `expo-font`-Ladefehler. War vor dem Build-Time-Embed-Switch.
- **Zweite Theorie „react-native-svg findet Runtime-Fonts nicht":** Mit Build-Time-Embed via Config-Plugin sollten beide Pfade fündig werden — tut's aber nicht.

**Versucht (alles ohne Erfolg):**
1. `useFonts(FONT_ASSETS)` Runtime-Loading in App.tsx (Commit `93417a7`).
2. `expo-font`-Config-Plugin Build-Time-Embed (Commit `c92ecce`, aktueller HEAD) — Fonts beweisbar im APK.

**Nächster Schritt — direkt am Gerät via `adb` beobachten (nicht raten):**
```bash
# User: Handy aufwecken + entsperren, fiano öffnen → Projekt → Untertitel-Einstellungen.
# Dann am Mac:
adb exec-out screencap -p > /tmp/fiano-1.png    # Modal in Ausgangszustand
# User-Tap auf ein Font-Chip (z.B. Bangers, sehr distinktive Comic-Schrift)
adb exec-out screencap -p > /tmp/fiano-2.png    # Modal nach Pick
# Bilder vergleichen: hat sich das Preview-Glyph verändert?
```
Alternativ Claude per `adb shell input tap X Y` selbst durch die Chips tappen (Coordinates aus Screencap ablesen). **Erstes konkretes Diagnose-Ziel: Style auf `Standard`, `useGradient` OFF, dann Font wechseln** → das ist der reine RN-Core-`<Text>`-Pfad. Wenn der NICHT wechselt, ist es kein react-native-svg-spezifisches Problem, sondern fundamentaler. Wenn DOCH wechselt, ist der Bug auf den Gradient/Metallic-Pfad (SVG) eingegrenzt.

**Relevante Files für den Fix:**
- `packages/mobile/src/components/SubtitleOverlay.tsx` (`mapFontFamily`, `defaultFontFor`, der `<Text>`/`SvgGradientText`/`LayeredText`-Switch).
- `packages/mobile/src/lib/fonts.ts` (Registry).
- `packages/mobile/app.json` (`expo-font`-Plugin-Liste).
- `services/render-worker/src/subtitleCanvas.ts` (Worker — Export-Seite, schon mit Fonts deployed).
- `node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/TSpanView.java` (zum Nachlesen).

---

## 7b. D3 — Google Play Setup (User-Action, BEVOR Code-Wiring)

### 1. Google Play Console — `play.google.com/console`
*(Play-Developer-Account, einmalig $25.)*
- App **„fiano"** erstellen falls nicht da. Mind. einmal als AAB im internen Test-Track hochladen (Code liefert Claude später).
- **Monetarisierung → Produkte → Abos** → zwei Abos:
  - Produkt-ID `creator_monthly` · „Creator" · monatlich · **17,99 €** — aktivieren.
  - Produkt-ID `pro_monthly` · „Pro" · monatlich · **29,99 €** — aktivieren.
- **Einstellungen → Lizenztests** → Test-Gmail-Adresse eintragen (Test-Käufe kostenlos).

### 2. Google Cloud — Service-Account-JSON
- Play Console → **Einstellungen → API-Zugriff** → verknüpftem Cloud-Projekt folgen → Service-Account erstellen → JSON-Schlüssel herunterladen → diesem Account in der Play Console **Bestellungen-/Finanzdaten-Leserechte** geben.
- Tipp: RevenueCat zeigt beim „Add app"-Schritt unten eine klickbare Anleitung — folgen.

### 3. RevenueCat — `app.revenuecat.com`
- Account → Projekt **„fiano"** anlegen.
- **App hinzufügen** → Google Play → Package `app.fiano.video` → JSON aus Schritt 2 hochladen.
- **Entitlements:** `creator` und `pro`.
- **Products:** die beiden Play-Produkte importieren (`creator_monthly`, `pro_monthly`).
- Zuordnen: `creator_monthly` → `creator`; `pro_monthly` → `pro`.
- **Offering** namens `default` → 2 Packages (Creator, Pro).
- **API Keys** → den **Android/Google Public SDK Key** (`goog_…`) kopieren.

### 4. An Claude schicken
`goog_…`-Key + Bestätigung der Entitlement-/Offering-Namen → Claude verdrahtet D3-Code (`react-native-purchases` SDK, `PricingScreen` Purchase-Flow, Entitlement-Gating).

### 5. ⚠️ Testen geht NICHT mit `npm run android`
Play-Billing greift nur bei Play-installierten, signierten Builds. Nach Code: `eas build` → AAB in den internen Test-Track laden → über Test-Link installieren → als Lizenz-Tester kaufen.

**iOS:** Bewusst deferred. Apple braucht parallel App Store Connect + StoreKit. Später eigene Phase.

---

## 8. Desktop-Feature-Audit (was auf Mobile noch fehlt)

| Desktop-Page | Mobile-Screen | Status |
|---|---|---|
| HomePage | HomeScreen | ✅ |
| LibraryPage | LibraryScreen | ✅ |
| ProjectDetailPage | ProjectDetailScreen + TikTokScreen + BuilderScreen + ClipsScreen + ExportScreen | ✅ (auf Mobile aufgeteilt, reicher) |
| LoginPage / SignupPage / ResetPasswordPage | Login/Signup/ResetPassword | ✅ |
| PricingPage | PricingScreen | ✅ (Stripe-Mobile-Stopgap → D3 RevenueCat) |
| SettingsPage | SettingsScreen | ✅ |
| HelpPage / LegalPage | Help/Legal | ✅ |
| ThumbnailPage | ThumbnailGeneratorScreen | ✅ |
| — | AddVideoProject / Onboarding / Splash / LanguagePicker / SearchModal / Notifications | Mobile-only Extras |

**Mobile hat MEHR Screens als Desktop, keine sichtbare Lücke.** Wirklich offen sind nur die Cross-Device-Features:
- **Cross-Device-Sync**: Supabase-`projects`-Tabelle + Storage-Bucket, Desktop↔Mobile Pull-Sync. Größtes deferred Feature.
- **C8 Multi-Cam-Sync** und **C9 YT-Direct-Upload**: bewusst übersprungen.

Bei Bedarf frischen Feature-Audit machen: `diff <(ls src/renderer/src/pages/) <(ls packages/mobile/src/screens/)`.

---

## 9. Datenmodell (gekürzt — Volltext in `packages/shared/src/types.ts`)

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
  enabled, cues?, fontFamily?: string, fontSize?(UI-Token ~26), letterSpacing?, uppercase?,
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
interface ProjectWatermark { path, filename?, position:'tl'|'tr'|'bl'|'br', opacity, scale }
interface Subscription { plan:'creator'|'pro'|'studio_lifetime'|null, status, lifetime,
  current_period_end, cancel_at_period_end, render_count?, monthly_limit? }
```

**`SubtitleFontFamily` = `string`** (kein Union). Gültige Werte sind die 20 IDs aus `lib/fonts.ts` `SUBTITLE_FONTS`.

**RenderSpec (`renderSpec.ts`):** Mobile→Worker. `subtitlePng: { settings: SubtitleRenderSettings, highlightWords?, cues }`. `settings.fontFamily` wird allow-list-validiert gegen `SUBTITLE_FONT_IDS` (exportiert aus `subtitleCanvas.ts`).

**`subtitleLayout.ts`:** `resolveSubtitleFontPx(uiFontSize, frameHeight) = (uiFontSize/26) * frameHeight * 0.06`. `LAYERED_SMALL_SCALE = 0.7`, `LAYERED_SMALL_OFFSET = 0.32`.

---

## 10. Bekannte Bugs / Limits

| Bug / Limit | Status |
|---|---|
| **Multi-Font Preview wechselt nicht** | 🔴 offen — siehe §7a |
| Glow im Export stärker als in Preview | 🟡 später (Effekt-Skalierung Worker vs Preview angleichen) |
| Whisper-Quality bei reinem Game-Audio | by-design |
| Vivo HEVC 1-Decoder OOM-Risk | env — sequential thumb-queue + largeHeap |
| Greenscreen Live-Preview | by-design — RN ohne GL |
| `Invalid Refresh Token` Emulator | harmlos bei frischer Installation |
| Untertitel-Font-Typeface Export ≠ Preview (vor Multi-Font) | obsolet — Multi-Font löst das wenn der Picker-Bug weg ist |

---

## 11. Wichtige Designentscheidungen + Gotchas

- **16:9 Master-First** — Pipeline rendert 16:9, alles leitet ab. TikTok-Tab ≠ Builder-Tab (TikTok = pro-Clip 9:16, Builder = Multi-Clip 16:9).
- **Cloud-Render statt Local-FFmpeg auf Mobile** — MPEG-LA-Patent + Hardware.
- **Theme-Pattern (B3):** Jede Component mit `colors.X.Y` braucht eigenes `const colors = useColors()` im function body. `StyleSheet.create` → `function makeStyles(colors)` + `useMemo`. NIE `colors.X` auf module-level.
- **A6.4 Security:** NIE user-`args[]` — typed RenderSpec, Worker baut args. Neue Client-Felder server-side allow-list-validieren.
- **Worker `ffmpegArgs.ts` ist KOPIE** von `packages/shared` — bei Filter-Änderung BEIDE syncen.
- **`subtitleCanvas.ts` existiert 2×** (Desktop Browser-Canvas + Worker `@napi-rs/canvas`) — Render-Logik bewusst identisch halten; Font-Sizing weicht heute ab (Worker = Mobile-kalibriert via `resolveSubtitleFontPx`; Desktop noch nicht).
- **Multi-Font:** dieselbe `.ttf`-Datei + derselbe Dateiname in `packages/mobile/assets/fonts/` UND `services/render-worker/assets/fonts/`. ID = Dateiname ohne `.ttf`. Liste in `lib/fonts.ts` + `subtitleCanvas.ts` (`SUBTITLE_FONT_FILES`) + `app.json` `expo-font`-Plugin.
- **RN `<Modal>` + Reanimated v3 in NestableDraggableFlatList** → measureLayout-Crash. Lösung: absolute-positioned View (`isInline`-Pattern).
- **`react-native-svg <Svg height="100%">`** rendert unzuverlässig (zu kurz) → Container via `onLayout` messen, Svg mit Pixel-Maßen rendern.
- **`expo-updates reloadAsync()`** white-screen-t auf SDK 52 + New Arch → NICHT nutzen. Update kommt beim nächsten Kaltstart.
- **Edge-to-edge:** `react-native-edge-to-edge` (`SystemBars` für Bar-Icon-Style) + `expo-navigation-bar` (nur für Nav-Bar-Hintergrundfarbe).
- **Test-Befehl IMMER inkl. `npm run android`** (Memory-Feedback): `cd packages/mobile && ANDROID_SERIAL=10AF7Y16R70010X npm run android`. Lokaler Dev-Build hat `__DEV__=true` → Paywall-Bypass → bequemster Test-Pfad.
- **Bei Bugs ZUERST den echten verantwortlichen Code lesen + an der Wurzel fixen** — keine spekulativen Style-Patches. Bei plattformübergreifenden Bugs auch Server/Infra prüfen.
- **`.claude/worktrees/`** sind STALE — ignorieren, im Main-Repo arbeiten.

---

## 12. Security — Stand

**Erledigt (A6.x):** A6.1 Rate-Limit, A6.2 .ass-Validation, A6.3 Plan-Check + Monthly-Counter, A6.4 typed RenderSpec, A6.5 Log-Sanitize + R2-Path-Regex, A6.6 Stripe-Webhook-Dedup + Edge-Function-CORS-Whitelist, A6.7 yt-dlp gehärtet, A6.9 R2-Body-Limit + SourceKey-Ext-Check, A6.10 (partial).

**Round-10-Addendum (`SECURITY_AUDIT_2026-05-16.md`):**
- Stripe-Webhook gehärtet (`resolveUserId` + jetzt frischer `retrieve` in Bug-3-Fix).
- `subtitlePng` allow-list-validiert (Numbers geclampt, Colors 6-hex-regex, Enums, fontFamily seit Multi-Font in der Allow-List).
- `__DEV__`-Paywall-Bypass nur in Dev-Builds (Release/Preview = `__DEV__=false`).

**Noch offen aus dem Audit:**
- **D5** Electron `sandbox=true` + nonce-CSP — A6.8 partial reverted (P1-8/P2-7).
- **D6** `npm audit fix` (root + mobile + worker) — P3-12.
- **E3** R2-Lifecycle `sources/* > 7d` — P2-1.

---

## 13. Quick-Reference

- **Worker-URL:** `https://fiano-render-worker-491699066139.europe-west1.run.app` · Rev `00041-tdz` · GCP `fiano-render-2026`.
- **GitHub:** `garymikefischer-art/fiano`.
- **EAS-Projekt:** `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` (`fiano-mobile`). User: `garyfischer`.
- **Supabase-Projekt:** `zibzcaknqzxgwootfjxc` (CLI gelinkt).
- **Firebase:** `fiano-2bf11`, Android-App-ID `1:886349796984:android:6faaf7f89baef843ab7f8d`.
- **Branch:** `claude/edge-to-edge` · HEAD `c92ecce`.
- **Backups:** `pre-handoff-context-limit-20260525` (HEAD), `pre-d3-fonts-20260520`, `pre-handoff-round10-20260520`, `pre-png-subtitles`, `pre-round-10`.
- **Phone:** `ANDROID_SERIAL=10AF7Y16R70010X` (Vivo V40 Lite, Android 15, Mediatek HEVC `c2.mtk.hevc.decoder`, 256 MB Default-Heap).
- **Mobile-Speicher:** expo-secure-store (API-Keys, themeMode, Supabase-Session chunked), AsyncStorage (`fiano.projects`, `fiano.notifications`), `documentDirectory/{imports,thumbs,voice-overs,exports,thumbnails,watermarks}/`.
- **R2:** `fiano-renders/sources/{userId}/{projectId}/...` (1d lifecycle), `outputs/...` (7d).
- **Marketing-Assets:** `~/Downloads/fiano-marketing/` (logo.png, logo-adaptive.png, output/) — getrennter Chat für Banana-Skill-Image-Generierung.

---

*Stand 2026-05-25. Nächster Chat: §7a (Multi-Font Preview-Bug per `adb` observieren). Danach §7b (D3-Code wenn `goog_…`-Key da).*

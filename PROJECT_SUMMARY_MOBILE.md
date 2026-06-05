# 📋 PROJECT SUMMARY — Fisora (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-06-05** — M5 RevenueCat-IAP komplett LIVE ✅ + Security-Audit (H+M gefixt) ✅ + Website-Legal-Fixes ✅ + L1/L2 DSGVO-Docs ✅ + Google-Kostenschutz (€50-Kill-Switch) ✅ + Paywall/Kündigen-Fixes (OTA) ✅
> **Branch: `claude/edge-to-edge` · HEAD `61a78d2`** — NICHT in `main` gemerged. User merged via `git merge --no-ff`.
> **Worker-Rev (live):** `fiano-render-worker-00053-gnt` (H-1 args-Pfad entfernt + H-3 Abo-Gate + M-3 Upload-Limits).
> **Mobile:** Build 14 (versionCode 14, v0.0.3) im Closed Test + OTA-Update `872a32d4` (Paywall/Kündigen-Fix) auf Channel `production`.
> **Desktop:** v0.2.0 in dist/ (M-4 yt-dlp-Fix + Pro-100 noch NICHT gebaut → Build v0.2.1 fällig).

> 🔴 **ERSTE PHASE IM NEUEN CHAT — TRIM-BUG (AI-Highlight-Export):**
> User-Report: AI erkennt z.B. ein 5-Sekunden-Highlight. User schneidet es in 9:16 zurecht (Anzeige „5 Sekunden"). **Beim Export sind es aber 12 Sekunden (= volle Original-Clip-Länge)** — der Trim wird NICHT auf den Export angewendet.
> **Verdacht/Untersuchungspfad:** Der Highlight-Clip hat `startSec`/`endSec` (Trim). Beim Cloud-Render muss die `RenderSpec` den Trim enthalten (`-ss`/`-t` bzw. trim-Filter). Wahrscheinlich wird `startSec/endSec` (oder `trimStart/trimEnd`) NICHT in die Spec geschrieben ODER der Worker ignoriert ihn ODER das 9:16-Layout nimmt die volle Source-Dauer.
> **Dateien lesen:** `packages/mobile/src/screens/ExportScreen.tsx` (wie wird der Export-Spec gebaut?), `packages/mobile/src/lib/renderJob.ts` (Spec-Aufbau), `packages/shared/src/ffmpegArgs.ts` `buildTikTokExportArgs` (wird trim/duration angewendet?), `services/render-worker/src/renderSpec.ts` + `ffmpegArgs.ts` (Worker-Kopie — Trim-Handling). `types.ts`: `DemoClip {startSec,endSec}`, `AIHighlight {start,end}`. → Root-Cause finden + an der Wurzel fixen (User-Constraint), dann **JS-only? → eas update** oder Native? → Build 15.

---

## 1. STACK
| Plattform | Stack |
|---|---|
| **Mobile** | Expo SDK 52, RN 0.76 (New Arch), React-Navigation v7, Zustand, react-native-video v6, react-native-svg ~15.10, react-native-purchases **v10.2.0** (M5), edge-to-edge, reanimated 3.16. Package `app.fisora.video`, Scheme `fisora://`, Slug `fiano-mobile`, runtimeVersion-Policy `appVersion` (=version). EAS-Projekt `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` (User `garyfischer`). |
| **Desktop** | Electron 31 (CJS Main + Vite Renderer), React 18 + Tailwind + Zustand, bundled FFmpeg/yt-dlp/libass, electron-updater, Stripe. appId `app.fiano.video`, productName Fisora. v0.2.0. |
| **Cloud-Render** | Google Cloud Run `fiano-render-worker` (Node 22 + Express + ffmpeg + yt-dlp + @napi-rs/canvas + 60 Fonts). GCP-Projekt `fiano-render-2026`. Cloudflare R2 (S3-API). |
| **Backend** | Supabase `zibzcaknqzxgwootfjxc` (Site URL https://fisora.app). 5 Edge Functions, 9 Migrationen, RLS. |
| **Zahlung** | Desktop=Stripe (LIVE). Mobile=**RevenueCat → Google Play IAP (LIVE, M5 fertig)**. RC-Projekt „Fisora Real". |
| **Push** | Firebase FCM (Android only, Projekt `fiano-2bf11`). |
| **Webseite** | world4you Apache, https://www.fisora.app. Source: `/Users/garyfischer/Downloads/claude-webseite-neu` (KEIN git → Backup als `claude-webseite-neu.bak-20260605`). |

- Worker-URL: `https://fiano-render-worker-491699066139.europe-west1.run.app`
- Repo: `/Users/garyfischer/Downloads/fiano-monorepo` (GitHub `garymikefischer-art/fiano`)
- Phone: Vivo V40 Lite, Android 15, `ANDROID_SERIAL=10AF7Y16R70010X`, MediaTek HEVC, 256MB heap
- Support: support@fisora.app

---

## 2. ORDNERSTRUKTUR + WO ÄNDERN
```
fiano-monorepo/
├── src/                          ← DESKTOP (Electron)
│   ├── main/                     ← index.ts, ipc.ts, core/{ffmpeg,queue,projects,settings,auth,bin}
│   │   └── core/pipeline/download.ts  ← yt-dlp (M-4: jetzt URL-Allow-List)
│   └── renderer/src/{pages,components,stores,lib}/
├── packages/
│   ├── shared/src/               ← GETEILT (via @fiano/shared, Import in Desktop+Mobile)
│   │   ├── types.ts              ← Project, DemoClip, AIHighlight, SubtitleSettings, ClipEffects, Subscription
│   │   ├── ffmpegArgs.ts         ← buildEffectsFilter + buildTikTokExportArgs  ⚠️ KOPIE im Worker
│   │   ├── subtitleLayout.ts     ← resolveSubtitleFontPx + resolveSubtitleEffectScale  ⚠️ Inline-Kopie im Worker
│   │   ├── subtitles.ts, assBuilder.ts
│   │   └── i18n/locales/         ← 9 Sprachen (de/en/es/fr/it/nl/pl/pt/ru)
│   └── mobile/                   ← EXPO + RN
│       ├── App.tsx               ← Root. M5: configurePurchases() beim Start
│       ├── app.json              ← versionCode 14 (nächster Native-Build → 15). BILLING-Permission drin.
│       ├── .env                  ← gitignored. EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_wVPNxQSXBedWuHttLcODnVRLGqk
│       └── src/
│           ├── lib/iap.ts        ← NEU (M5): RevenueCat-Wrapper (configure/login/purchase/restore/getManagementUrl)
│           ├── stores/authStore.ts  ← M5: logIn/logOut, monthlyLimitFor (Creator50/Pro100), applyIapCustomerInfo
│           ├── screens/PricingScreen.tsx  ← M5: Offerings + purchasePackage + restore (statt Stripe-Web)
│           ├── screens/SettingsScreen.tsx ← NEU: „Kündigen/bei Google Play verwalten"-Button
│           └── navigation/{RootNavigator,types}.tsx ← Paywall-Gate: Route „Paywall" (NICHT „Pricing"!)
├── services/render-worker/       ← CLOUD WORKER (separates Deploy via gcloud)
│   ├── Dockerfile, assets/fonts/ (60 .ttf KOPIE)
│   └── src/{index,render,renderSpec,ffmpegArgs,subtitleCanvas,assValidator,planCheck,r2,youtube,transcribe}.ts
├── supabase/
│   ├── migrations/               ← 001..009 (006=pro100, 007=revenuecat-col, 008=quota-atomic, 009=constraint+rc-dedupe)
│   └── functions/                ← delete-account, revenuecat-webhook (NEU M5), stripe-checkout/webhook/portal
├── legal/                        ← NEU: L1_DPA_Tracker.md + L2_ROPA.md (DSGVO-Pflichtdocs)
├── .claude/projects/.../memory/  ← Auto-Memory (test_phone, revenuecat_setup, cost_protection, …)
└── PROJECT_SUMMARY_MOBILE.md     ← DIESE Doku

claude-webseite-neu/              ← world4you Hosting (SEPARAT, kein git)
├── index.html, agb.html, datenschutz.html, impressum.html, account-deletion.html, auth-callback.html
├── i18n-data.js (9 Sprachen), i18n-apply.js, consent.js, styles.css, legal.css, .htaccess
└── config.js (gitignored)
```
**WO ÄNDERN:** Logik/Types/i18n für BEIDE → `packages/shared/`. Mobile-only → `packages/mobile/src/`. Desktop-only → `src/`. Worker → `services/render-worker/src/`.
**⚠️ KOPIEN syncen:** `ffmpegArgs.ts` (shared ↔ worker), `subtitleCanvas.ts` (desktop ↔ worker), `resolveSubtitleFontPx/EffectScale` (shared ↔ worker-inline), Fonts (mobile ↔ worker).

---

## 3. UPDATE-WORKFLOW — wie Änderungen auf Desktop+Mobile landen
| Änderung in… | Was tun |
|---|---|
| `packages/shared/*` | Auto in Mobile+Desktop (TS-Import). ⚠️ Worker hat eigene KOPIE von ffmpegArgs → manuell syncen + Worker redeploy. |
| `packages/mobile/src/*` **JS-only** | `cd packages/mobile && eas update --branch production` → OTA, kein Store-Review. Greift bei gleichem `runtimeVersion` (=version 0.0.3). ⚠️ `Updates.reloadAsync()` BEWUSST NICHT genutzt (white-screen SDK52+NewArch) → User sieht Update beim nächsten **Kaltstart**. |
| `packages/mobile` **Native** (Dep/Plugin/Package/app.json/versionCode) | `cd packages/mobile && eas build --profile production --platform android` → AAB → Play Console Closed/Prod Track. **versionCode in app.json hochbumpen!** |
| `src/*` (Desktop) | `npm run build:mac` (macOS) / `build:win`. Bei version-bump in package.json → GitHub Release → electron-updater. |
| `services/render-worker/*` | `cd services/render-worker && gcloud run deploy fiano-render-worker --source . --region europe-west1 --memory 2Gi --cpu 2 --timeout 900 --max-instances 10 --quiet` (Cloud Build, ~4-6min). |
| `supabase/migrations/*` | `supabase db push` (im Repo-Root, fragt [Y/n]). |
| `supabase/functions/*` | `supabase functions deploy <name> [--no-verify-jwt für Webhooks]`. |

### AUTO-UPDATES
- **Mobile OTA:** `eas update --branch production` → Channel `production` (Build 14 hängt dran). App `lib/updates.ts` auto-checkt on-launch + Settings-Button. Update beim Kaltstart aktiv.
  - ⚠️ **OTA-ENV-GOTCHA (2026-06-05, hart gelernt):** `eas update` inlinet `EXPO_PUBLIC_*` aus dem **lokalen `.env`** (packages/mobile/.env, gitignored). Das `.env` MUSS den echten `goog_wVPNxQSXBedWuHttLcODnVRLGqk` enthalten (NICHT `goog_xxx`!). UND: **Metro cached das transformierte env.ts-Modul** → bei Key-/Env-Änderung IMMER `--clear-cache`, sonst landet der alte (Placeholder-)Key im Bundle → RevenueCat `InvalidCredentialsError`, „products still loading". Sichere Form: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_wVPNxQSXBedWuHttLcODnVRLGqk eas update --branch production --clear-cache --message "…"`. Verifizieren via `adb logcat | grep InvalidCredentials` (muss 0 sein).
- **Desktop:** `git tag v0.X.Y` → `npm run release:mac` (braucht `GH_TOKEN` env, PAT mit 'repo'-scope) → GitHub Release → electron-updater zeigt „Update available". Ohne Token manuell: `gh release create v0.X.Y --repo garymikefischer-art/fiano --target claude/edge-to-edge --title "Fisora 0.X.Y" --notes "…" dist/*.dmg dist/*.dmg.blockmap dist/*.zip dist/*.zip.blockmap dist/latest-mac.yml`.
- **Worker:** kein Auto-Update, jeder Deploy ersetzt die Revision.

### GIT-WORKFLOW (User-Constraint)
- Claude arbeitet auf `claude/edge-to-edge` im MAIN-Repo (NICHT `.claude/worktrees/`, die sind STALE).
- Commits beenden mit `Co-Authored-By: Claude…`. Nur committen/pushen wenn User es sagt.
- Vor großen Phasen: `git tag pre-<phase>-YYYYMMDD`.
- User merged selbst: `git checkout main && git merge --no-ff claude/edge-to-edge && git push origin main && git checkout claude/edge-to-edge`.
- Bei „divergent branches": `git fetch + git merge --no-ff` (NICHT `git pull`).
- **Webseite-Upload:** Die 7 geänderten Files in `claude-webseite-neu/` lädt der User per world4you/FTP hoch (kein git/deploy-Automatismus).

---

## 4. WAS DIESE SESSION (2026-06-05) ERLEDIGT WURDE
- **M5 RevenueCat-IAP komplett LIVE** (Commits b5fc496→c468b0c): `lib/iap.ts`, PricingScreen auf purchasePackage, authStore logIn/logOut+Sync, `revenuecat-webhook` Edge Function (Secret-Auth, Event→Plan/Status, upsert subscriptions). RC-Dashboard „Fisora Real" voll konfiguriert (App+JSON, Entitlements creator/pro, Products creator_monthly/pro_monthly, Offering `default` current). goog-Key in EAS prod env + .env. Webhook-Secret in Supabase `REVENUECAT_WEBHOOK_AUTH`. **Echter Test-Kauf durchgelaufen** (richtiger Preis, Plan grün, Row geschrieben).
- **Pro-Limit 200 → 100** (Migration 006 + i18n 9 Sprachen + AGB). Creator bleibt 50.
- **Play Console:** beide Abos `creator_monthly`/`pro_monthly` mit aktiven Base-Plans angelegt; Service-Account `revenuecat-iap-validator` berechtigt (Finanzdaten + Abos verwalten); androidpublisher-API aktiv; License-Tester-Liste „Fisora Tester".
- **Security-Audit (3 Agents) + Fixes:** HOCH H-1 (args[]-Pfad → service_role-Leak ENTFERNT), H-2 (Quota-Race → atomarer pg_advisory_xact_lock, Migration 008), H-3 (transcribe/download Abo-Gate). MITTEL M-1 (subscriptions UNIQUE-Constraint Migration 009), M-2 (RC-Webhook Replay-Dedupe `rc_events_processed`), M-3 (Upload-Limits + Stream-to-disk), M-4 (Desktop yt-dlp URL-Allow-List), M-5 (Webhook timing-safe compare). Alle live (Worker 00053, Migrationen, Webhook). Commits 49727b3 + 86fa500.
- **Website-Legal (13 Edits):** AGB Pro 200→100, Impressum Kleinunternehmer-Satz (§6 UStG, keine UID), Datenschutz §8.9 Resend + §8.10 Drittland-Transfer + iOS-Erwähnungen raus (kein iOS), `user-scalable=no` entfernt (Zoom/WCAG) in allen 6 HTML, Footer-Email. **NOCH HOCHZULADEN.**
- **L1/L2 DSGVO-Docs** in `legal/` (DPA-Tracker + ROPA).
- **Google-Kostenschutz LIVE:** €50-Budget (id 6c668c90) + Email-Alerts 50/90/100% + Pub/Sub-Topic + **Cloud Function `fisora-billing-killswitch`** (setzt bei >€50 `max-instances=0` auf den Worker, reversibel mit `--max-instances=10`). Getestet (unter-Budget-Guard). Siehe Memory `cost_protection`.
- **Paywall+Kündigen-Fixes (OTA `872a32d4`):** Paywall-Gate-Screen „Pricing"→„Paywall" umbenannt (verschwand nach Kauf sonst erst nach Neustart); SettingsScreen „Kündigen/bei Google Play verwalten"-Button (Google-Play-Abos nur im Play Store kündbar). Commit 61a78d2.

---

## 5. 🔴 OFFENE LISTE (NÄCHSTE SCHRITTE)

### PHASE 1 — Trim-Bug fixen (siehe Kopf der Doku) — Code-Bug, höchste Prio
AI-Highlight-Trim wird beim Export nicht angewendet (5s erkannt → 12s exportiert).

### USER-ACTIONS (kein Code, parallel)
1. **7 Website-Files hochladen** (world4you): index.html, agb.html, datenschutz.html, impressum.html, account-deletion.html, auth-callback.html, i18n-data.js
2. **Supabase Spend-Cap** an (Dashboard → Org → Billing → Cost Control)
3. **DPAs akzeptieren** (legal/L1_DPA_Tracker.md abarbeiten) + **Cloudflare R2 Lifecycle-Rule `sources/*>7d`** setzen
4. **Google Closed-Test-Review** abwarten → ggf. weitere Test-Käufe
5. **M6** Listing-Übersetzungen fertig eintragen (9 Sprachen, App-Name+Kurz+Voll — Texte wurden in der Session geliefert) → **M7 Production Track Release**
6. **Build 15** (Native) wenn bereit für Production: bringt Paywall/Kündigen-Fix + M-4 ins Binary (Google-Policy-Review will Kündigungs-Pfad im Binary). versionCode 14→15.
7. **Desktop v0.2.1** GitHub-Release (M-4 yt-dlp-Fix + Pro-100 sind committed, aber nicht gebaut)

### 🟡 KLEINE UI-FIXES (User-Wunsch 2026-06-05, offen)
- **Kündigen-Button verschieben:** Aktuell als großer Button in SettingsScreen. User will ihn auf der „Abrechnung verwalten"-Seite (= PricingScreen, das „manageBilling" öffnet) + in Settings kleiner/weg. → Cancel-Link in PricingScreen (Import `Linking` + `getManagementUrl` aus iap.ts), Block aus SettingsScreen entfernen.
- **Update-Popup:** „Check for updates" (lib/updates.ts) soll ein Popup zeigen wenn ein Update verfügbar/geladen ist (z.B. „Update verfügbar — beim nächsten Start aktiv"). Aktuell lädt es still. ⚠️ `Updates.reloadAsync()` bleibt aus (white-screen SDK52) — also Popup = nur Hinweis, kein Auto-Reload.

### 🟡 POLISH / QoL (post-launch)
- **Phase 9.11** Multi-Clip Manual-Mode + Drag-Reorder (~2-3h) — AddVideoProject hat noch SOON-Badge, react-native-draggable-flatlist einbauen
- **Phase 9.7** Light-Theme (~4-6h) — lib/theme.ts dark/light-Tokens, Settings → Appearance Switch
- **Phase 9.14** Effects-System Mobile (~3-4h) — clip.effects analog Desktop
- **Phase 9.13** Cross-Device-Sync Desktop↔Mobile (~6-8h) — Supabase projects-Tabelle + Storage
- npm audit Mobile/Root (6 Build-Toolchain-CVEs, build-time-only, beim SDK-Upgrade)
- Vorstellungsgrafik fiano→Fisora (zeigt noch altes Logo; vor Production ändern; Play-Grafiken jederzeit änderbar)

### ✅ AUS ALTER PHASEN-LISTE BEREITS ERLEDIGT
- Phase 9.10 Thumbnail-on-demand = E1 ✅ · Phase 9.15 Push-Token = D1 ✅ · Phase 9.16 Auto-Update Mobile = D2 ✅ · **Phase 9.17 RevenueCat IAP = M5 ✅ (diese Session)**

---

## 6. SECURITY-STAND
ERLEDIGT: A6.1-A6.10 (Vor-Audit) + **diese Session H-1/H-2/H-3 + M-1..M-5** (alle live). Worker-Endpoints: authMiddleware + Rate-Limit (render 5/min) + typed RenderSpec Allow-List (NIE roh args[]) + isOwnedSafeKey + Abo-Gate. RLS auf allen Tabellen. Stripe+RC-Webhooks signatur/secret + replay-geprüft. Kostendeckel: Pro 100/User + Abo-Gate + max-instances 10 + **€50-Kill-Switch**.
OFFEN (NIEDRIG, nicht launch-blocking): N-1..N-5 (kosmetisch), R2-Lifecycle-Rule (Cloudflare-Dashboard), npm audit Mobile.

---

## 7. USER-CONSTRAINTS (VERBINDLICH)
- Auf `claude/edge-to-edge` im MAIN-Repo. User merged via `git merge --no-ff`. `.claude/worktrees/` STALE.
- Theme: jede Component mit `colors.X` braucht eigenes `const colors = useColors()` IM function body. NIE module-level.
- Worker `ffmpegArgs.ts`/`subtitleCanvas.ts` sind KOPIEN von shared/desktop — bei Änderung BEIDE syncen.
- A6.4: NIE user-`args[]` — typed RenderSpec, neue Client-Felder server-side allow-list-validieren.
- Bei Bugs ZUERST den echten Code lesen + an der Wurzel fixen — keine spekulativen Style-Patches.
- Bei jedem Ship-Block: konkrete Shell-Befehle + Click-Path + Expected-Outcomes.
- Storage-Keys (`fiano.projects`, `fiano.api.openai`) BLEIBEN `fiano.*` (Migration zerstört User-Daten).
- Tailwind `fiano-red/black/white` + EAS-Slug `fiano-mobile` + Firma „Werbeagentur FIANO e.U."/fiano.at BLEIBEN (Produkt=Fisora, Firma=FIANO).
- Antworte Deutsch, Code-Kommentare/Logs Deutsch, Variablen Englisch. Knapp, technisch.

---

## 8. QUICK-REFERENCE (Secrets/IDs)
- Worker: `https://fiano-render-worker-491699066139.europe-west1.run.app` · GCP `fiano-render-2026` · Billing `0163D0-FEB608-399413`
- Supabase: `zibzcaknqzxgwootfjxc` · Secrets gesetzt: STRIPE_*, REVENUECAT_WEBHOOK_AUTH
- RevenueCat: Projekt „Fisora Real" (id 011d02d7), Android-goog-Key `goog_wVPNxQSXBedWuHttLcODnVRLGqk` (public, in EAS prod env + .env)
- EAS: `garyfischer/fiano-mobile` · Projekt `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` · Build 14 · OTA-Channel `production`
- Firebase `fiano-2bf11` · Play Developer-Konto-ID `6703219868415568447` · App-ID `4974515670189856538` · Package `app.fisora.video`
- Backup-Tags: `pre-handoff-security-iap-20260605` (HEAD), `pre-security-mediums-legal-20260605`, `pre-handoff-stripe-live-20260602`
- Memory-Files: test_phone, revenuecat_setup, cost_protection, feedback_test_instructions, feedback_root_cause, expo_prebuild_local_properties

*Stand 2026-06-05. Nächster Chat: ZUERST diese Doku lesen, dann PHASE 1 (Trim-Bug) untersuchen+fixen. User-Actions (Website-Upload, Spend-Cap, DPAs, M6/M7) laufen parallel.*

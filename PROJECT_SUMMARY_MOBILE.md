# 📋 PROJECT SUMMARY — Fisora (Hybrid Desktop + Mobile + Cloud-Render)

> **Stand: 2026-06-07** — 🎉 **Mobile Build 16 bei Google Play PRODUCTION eingereicht (weltweit, in Review).** Trim-Bug ✅ · Update-Popup ✅ · Kündigen→Pricing ✅ · Thumbnail-Prompts markenfrei ✅ · Builder „16:9" statt „YouTube" ✅ (alle per OTA live) · Desktop v0.2.3 (Mac+Win) auf GitHub ✅ · Cost-Cap verifiziert ✅ · DPAs angestoßen (Supabase signiert, Cloudflare-PDFs, R2-Lifecycle, 3 Mails gesendet).
> **Branch: `claude/edge-to-edge` · HEAD `3b77554`** — NICHT in `main` gemerged. User merged via `git merge --no-ff`. (Diese Session viele neue Commits: Trim-Fix, UX, Thumbnail/Builder-De-Branding, versionCode 16, Desktop 0.2.2/0.2.3.)
> **Worker-Rev (live):** `fiano-render-worker-00053-gnt` (unverändert).
> **Mobile:** **Build 16 (versionCode 16, v0.0.3)** → Production-Track **eingereicht, in Google-Review** (Erst-Release: paar Tage–2 Wochen). OTA-Channel `production` (runtime 0.0.3) trägt alle JS-Fixes. Closed-Test Alpha-2 parallel.
> **Desktop:** **v0.2.3** (Mac arm64+x64 + Windows) GitHub-Release live (mit Thumbnail/Builder-De-Branding im Binary).

> 🟢 **STATUS: WARTEN AUF GOOGLE-PRODUCTION-REVIEW.** Phase 1 (Trim-Bug) ist gefixt + live — KEIN offener Code-Blocker mehr. Offene Punkte siehe §5 (Website-Buttons NACH Live, 3 DPA-Mail-Antworten, 16-KB-Rebuild künftig).
> ⚠️ **16-KB-Page-Size (Android 15):** Build 16 hat's per „Trotzdem fortfahren" bypassed (nicht blockierend). Nächste Updates: 16-KB-aligned Rebuild einplanen → Memory `android_16kb_pagesize`.

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

## 4. WAS SESSION 2026-06-07 ERLEDIGT (LAUNCH-SPRINT)
- **PHASE 1 Trim-Bug GEFIXT (Root-Cause):** `clips[0]` = voller „Imported clip" (0..durationSec, von AddVideoProjectScreen) war Default-`selectedClip` im 9:16-Tab → Export rendert volle Source statt Highlight. Fix: `selectedClipIdx` defaultet jetzt auf ersten `kind==='highlight'`-Clip (ProjectDetailScreen.tsx, Lazy-Init, greift beim TikTokTab-Mount). Worker (`-ss`/`-t`) + ActionSheet-Path-A waren korrekt. OTA live.
- **2 UX-Fixes (OTA):** (a) `lib/updates.ts` `useOtaDownloadedPrompt` + `<OtaUpdateWatcher>` in App.tsx → einmaliges „Update bereit"-Popup beim ON_LOAD-Auto-Check (kein Auto-Reload, white-screen). (b) Kündigen-Block aus SettingsScreen RAUS → dezenter „Kündigen/verwalten"-Link in PricingScreen (nur bei aktivem Abo).
- **Thumbnail-Prompts MARKENFREI** (Desktop `ThumbnailPage.tsx` + Mobile `ThumbnailGeneratorScreen.tsx` + i18n 9 Spr.): Fortnite / „Call of Duty: Warzone (Verdansk)" / „Siren skin" / „Painted Palms" / „Verdansk Dam" ENTFERNT. Game-Name + Background = **Pflichtfelder**, neues **„Skin / Character Look"-Feld** (Comic-Style), generische brand-freie Defaults, Guardrail „no logos/HUD/exact copyrighted characters — original design". Backup-Tag `pre-thumbnail-neutralize-20260606`.
- **Builder de-YouTubed:** „16:9 Video" statt „YouTube Video" (i18n: builder.title/buildBtn/clipsTab.buildYouTube/emptyBody/feat3Title/pricing.f.builder/clipCard.exportYouTube/step5, 9 Spr. + Mobile-Fallbacks). „YouTube/Twitch-URL"-Import-Strings BLEIBEN (nominativ/beschreibend).
- **Mobile Build 15 → Build 16** (versionCode 16): alle Fixes ins Binary. **Bei Google Play PRODUCTION eingereicht (weltweit „176 Länder + Rest der Welt", in Review).** 16-KB-Fehler per „Trotzdem fortfahren" bypassed.
- **Desktop v0.2.1→0.2.2→0.2.3** (Mac arm64+x64 + **Windows via Wine**) als GitHub-Releases. v0.2.3 hat das De-Branding im Binary. Mac unsigned (`identity: null`). Wine: `/Volumes/PortableSSD/Programme/Wine Stable.app/Contents/Resources/wine/bin` (einmal `xattr -dr com.apple.quarantine` nötig).
- **Cost-Cap verifiziert** (gcloud): €50-Budget + Killswitch ACTIVE + Worker max-instances 10.
- **DPAs angestoßen:** Supabase via PandaDoc **signiert** (FIANO e.U., Gary Fischer/Inhaber, None bei Special Categories); Cloudflare-PDFs (ISO 27001/27701, EU Cloud CoC, TIA-USA, +C5/SOC2) in `~/Downloads/DPA Fisora`; **R2-Lifecycle `sources/*>7d` gesetzt**; Supabase Spend-Cap = Free locked-on. **3 Mails (Expo/RevenueCat/Resend) gesendet — Antworten AUSSTÄNDIG.** WKO-Thumbnail-Mail nicht mehr nötig (De-Branding löst es).
- **Website fisora.app verifiziert:** alle Legal-Pages live, Branding durchgehend „Fisora". **Privacy-URL fürs Play-Listing: `https://www.fisora.app/datenschutz.html`.** Store-Listing (M6) eingetragen.

### Frühere Session (2026-06-05)
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

### 🟢 WARTEN AUF GOOGLE-PRODUCTION-REVIEW (Build 16 weltweit eingereicht 2026-06-07)
Status sehen: Play Console → Veröffentlichungen-Übersicht / Dashboard / Produktion-Track + Glocke/Email. Erst-Release: paar Tage–2 Wochen. Falls Ablehnung (z.B. 12-Tester-/14-Tage-Regel oder 16-KB-Hard-Requirement) → hier dokumentieren + angehen.

### OFFEN — nach Go-Live / parallel (User + Claude)
1. **Website-Download-Buttons** verknüpfen — **erst NACH Play-Store-Live**: in `claude-webseite-neu/` die Download-Buttons auf **Desktop v0.2.3 GitHub-Release** + **Play-Store-Badge/Link** setzen. Diff baut Claude, User lädt per world4you hoch.
2. **3 DPA-Mail-Antworten** (Expo/RevenueCat/Resend) abwarten → gegengezeichnete Kopien in `~/Downloads/DPA Fisora`. **Claude trackt das (Erinnerung).**
3. **16-KB-Page-Size Rebuild** (Android 15) bei einem der nächsten Updates — Build 16 ist bypassed. Memory `android_16kb_pagesize`.
4. **Vorstellungsgrafik** fiano→Fisora (Play-Grafik, evtl. noch altes Logo) — jederzeit änderbar.

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
- EAS: `garyfischer/fiano-mobile` · Projekt `27f6d175-b3fd-4d87-bff9-f7d4642fae1a` · **Build 16 (versionCode 16) bei PRODUCTION in Review** · OTA-Channel `production` (runtime 0.0.3)
- Desktop GitHub-Releases: v0.2.2 + **v0.2.3** (Mac arm64+x64 dmg/zip + Win Setup.exe) auf `garymikefischer-art/fiano`
- Firebase `fiano-2bf11` · Play Developer-Konto-ID `6703219868415568447` · App-ID `4974515670189856538` · Package `app.fisora.video`
- Backup-Tags: `pre-thumbnail-neutralize-20260606`, `pre-handoff-security-iap-20260605`, `pre-security-mediums-legal-20260605`, `pre-handoff-stripe-live-20260602`
- Memory-Files: test_phone, revenuecat_setup, cost_protection, eas_update_command, **android_16kb_pagesize**, feedback_test_instructions, feedback_root_cause, expo_prebuild_local_properties

*Stand 2026-06-07. Mobile Build 16 bei Google PRODUCTION in Review (weltweit). Phase 1 (Trim-Bug) erledigt + live. Nächster Chat: ZUERST diese Doku lesen. Offene Punkte siehe §5 — v.a. Website-Download-Buttons NACH Go-Live, 3 DPA-Mail-Antworten (Erinnerung!), 16-KB-Rebuild künftig.*

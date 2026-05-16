# 🔒 fiano Security Audit — 2026-05-16

> **Auditor:** Claude (general-purpose agent, ~30 min scan)
> **Repo State:** `claude/modest-greider-5dd6e1` @ `d9c2c69` (post A1 RLS-baseline)
> **Methodik:** File-Reads + Grep, kein Live-Pentest. Cross-Reference mit Worker-Endpoints, Edge Functions, Mobile-Bibliotheken, Electron-Main.

---

## Executive Summary

Das fiano-Fundament ist solide (Supabase RLS gerade gehärtet, encrypted at-rest auf beiden Clients, Stripe-Signature-Verification, ownership-based R2-Key-Scoping). Aber: **der Cloud-Worker hat KEIN Rate Limiting**, mehrere Endpunkte reflektieren PII in Logs, und FFmpeg-args+ASS-Pfade vertrauen Client-Strings tief genug für mehrere ernste Angriffe (financial DoS, libass-arbitrary-file-read, R2-storage-exhaustion).

### Top 3 Risiken

1. **P0** — Unauthenticated DoS / quota burn auf `/v1/render`, `/v1/transcribe`, `/v1/download`, `/v1/upload-url`. Jeder Free-Tier-User kann unbegrenzt callen.
2. **P0** — Server-side FFmpeg/libass-Argument-Injection via client-supplied `args[]` + `assPath`. Mit kombiniertem Exploit: **service_role-Key aus `/proc/self/environ` lesbar → kompletter Supabase-Takeover**.
3. **P0** — Kein Server-side Subscription-Enforcement. `authMiddleware` checkt JWT, aber kein Plan/Quota — `check_render_quota` ist nur `TODO`-Kommentar.

### Sofortmaßnahmen (in Reihenfolge)
1. `express-rate-limit` auf Worker (1h) → **A6.1**
2. Plan-Check in `authMiddleware` (1 Tag) → **A6.3**
3. Typed RenderSpec statt Client-`args[]` (2-3 Tage) → **A6.4**
4. ASS-Content-Validation (1/2 Tag) → **A6.2**

---

## Critical (P0)

### P0-1 — Kein Rate Limiting auf Worker-Endpunkten

- **Location:** `services/render-worker/src/index.ts:49-50, 89, 126, 300, 358`
- **Description:** Nur `express.json({ limit: '256kb' })` als Request-Shaping. Kein `express-rate-limit`, kein `cors()`, kein IP-Throttle, kein Cloud Armor.
- **Risk:** Triviale finanzielle DoS von Cloud Run + R2 Egress. Python-Loop mit Free-Supabase-Signup brennt das Monats-Budget in Stunden durch.
- **Fix:** `express-rate-limit` keyed auf `req.userId` nach `authMiddleware`:
  - `/v1/upload-url`: 30/min
  - `/v1/render`: 5/min
  - `/v1/transcribe`: 5/min
  - `/v1/download`: 3/min
  - Daily-Hard-Cap via Supabase Counter-Table (A6.3)

### P0-2 — Kein Server-side Subscription-Enforcement

- **Location:** `services/render-worker/src/auth.ts:36-38`
- **Description:** `TODO Phase 9.6.2 — Quota-Check` ist nur ein Kommentar, nie implementiert. Endpunkte prüfen `req.userId`, aber kein Plan. Mobile-Paywall ist die einzige Sperre — `ExportScreen` callt `runRenderJob()` mit User-JWT, Worker akzeptiert jeden authenticated User.
- **Risk:** Revenue-Loss. Free-User kann unlimited 4K-Renders + Whisper via curl callen.
- **Fix:** `subscriptions`-Lookup in `authMiddleware` (oder split in `authMiddleware` + `requirePaidPlan`). Bei Free: 402 zurück. Monthly-Counter pro user_id (Supabase RPC `increment_render_count(user_id)`).

### P0-3 — Client-controlled FFmpeg `args[]` mit schwacher Validierung

- **Location:** `services/render-worker/src/index.ts:132-263`
- **Description:** `args: string[]` aus JSON-Body, nur Check ist `Array.isArray(args) && args.length <= 400`. Nach Token-Substitution direkt an `spawn('ffmpeg', finalArgs)` in `render.ts:25`.
- **Attacks:** `spawn` mit Array verhindert *shell*-Injection. Aber FFmpeg hat genug gefährliche Flags:
  - `-i /etc/passwd` oder `-i pipe:0` zum Host-File-Read
  - `-loglevel debug -f data -i /proc/self/environ` → service-role-Key in Output/Log
  - `concat:` Protocol mit `file://` URLs
  - Filter-Pseudo-Codecs `lavfi -i amovie=/...` umgeht `-i`-Validation
  - Resource: `-stream_loop -1`, `-loop 999999`
- **Risk:** **service_role-Key aus `/proc/self/environ` lesbar → kompletter Supabase-Takeover**. Attacker liest dann ALLE subscriptions, ALLE profile, kann sich selbst pro-plan setzen.
- **Fix:** Don't accept `args` from client. `packages/shared/src/ffmpegArgs.ts` baut sie bereits — Mobile soll typed Request `{ layout, regions, music, intro, … }` schicken, Worker baut args serverseitig. **Kurzfristig:** Allow-List für args:
  - **Allow:** `-i`, `-ss`, `-t`, `-c:v`, `-vf`, `-filter_complex`, `-map`, `-y`, `-c:a`, `-b:v`, `-b:a`, `-preset`, `-pix_fmt`, `-movflags`, `-allow_sw`, `-realtime`, replacement-tokens, output-path-token
  - **Block:** `-f`, `-loglevel`, `-protocol_whitelist`, `-stream_loop`, `-loop`, `-progress`, `-passlogfile`, `-fpre`/`-vpre`/`-apre`
  - **Block-Protocols:** `concat:`, `subfile:`, `async:`, `crypto:`, `file:`, `pipe:`, `tcp:`, `udp:`, `http:`, `https:` als Input-Pfade

### P0-4 — Server FFmpeg vertraut `args` ohne Ownership-Re-Check; ASS-Path → libass-Local-Read

- **Location:** `packages/shared/src/ffmpegArgs.ts:483` (`[vmain]ass=${sub.assPath}:original_size=...`) + Worker subtitle-upload `index.ts:231-238` + `renderJob.ts:155-165`
- **Description:** `.ass`-File-Content kommt vom User-Upload. libass `Dialogue:`-Zeilen können Fonts via `\fnFontName` referenzieren, `\p` Drawing-Primitive, embedded Font-Lookups → libass+fontconfig hits Host-Filesystem.
- **Risk:** Mit `\bord1000 \blur1000` Style-Attacks → CPU-Exhaustion im 300s-Window. Kombiniert mit P0-3: full container env read.
- **Fix:**
  - Reject `.ass` > 64 KB
  - Strip `\fn`/`\fnPath` overrides, cap `\bord`/`\blur`/`\fs` Werte
  - Allow only ASCII-printable + standard whitespace in `Dialogue:`-Text
  - Reject `[Fonts]` / `[Graphics]` Sections (embedded Font/Image-Data)
  - Reject `Style: ` Lines deren Fontname mit `/` startet oder `..` enthält
  - **Empfohlen:** Server-side `.ass` rebuild via existing `packages/shared/src/assBuilder.ts` (Mobile schickt cues + settings, nicht File)

---

## High (P1)

| # | Title | Location | Risk | Fix |
|---|---|---|---|---|
| **P1-1** | R2-Ownership-Check ist prefix-only → path-traversal `sources/<id>/../<other>/foo.mp4` matcht | `services/render-worker/src/index.ts:173-177` | Cross-Tenant-Reads falls R2 jemals Keys normalisiert | Regex: `^sources/<userId>/[A-Za-z0-9._/-]+$`, reject `..`, `//`, `\\` |
| **P1-2** | `console.log` leaks PII / opaque Secrets → Cloud Logging | `worker/src/index.ts:259, 317, 60-65` + `youtube.ts:62, 93, 157` | GDPR-Concern; `/health` exposes env-fingerprint | `/health` nur `{ok,version}`; drop URL aus download-log; finalArgs-log raus |
| **P1-3** | Stripe-Webhook merkt sich keine processed event_ids → Replay innerhalb 5min signature-TTL möglich | `supabase/functions/stripe-webhook/index.ts:43-54` | Replay kann gecancelte Subscription reaktivieren | `stripe_events_processed (event_id text PK)` Tabelle + dedupe |
| **P1-4** | Edge-Function CORS = `*` (insb. `delete-account`!) | `supabase/functions/{stripe-checkout,stripe-portal,delete-account}/index.ts` | CSRF-Amplification mit gestohlenem JWT | Origin-Whitelist: `app://`, `fiano://`, `https://*.expo.dev`, Desktop-Origin |
| **P1-5** | `yt-dlp --no-check-certificates` + arbitrary path innerhalb YouTube/Twitch hosts | `services/render-worker/src/youtube.ts:79-91, 84` | MITM-Window, hostile yt-dlp-Plugin-Update | Drop `--no-check-certificates`; engere Regex `/watch?v=|/shorts/|/videos/|/clip/`; yt-dlp Version pinnen |
| **P1-6** | OpenAI-Key transitiert durch Worker bei jedem Transcribe-Call | `mobile/src/lib/whisper.ts:99-103` + `worker/src/index.ts:358-405` + `transcribe.ts:198-218` | Worker-Compromise → ALLE aktiven OpenAI-Keys leaked | Long-term: fiano-owned OpenAI-Key + Metering. Short-term: User-Hinweis "Key transitiert durch Server" |
| **P1-7** | Mobile TTS + Gemini callen direkt API (Gemini key in URL-query!) | `mobile/src/lib/tts.ts:43-65` + `mobile/src/lib/gemini.ts:142-189` | Stolen device + dekrypteed SecureStore → keys lesbar. Gemini-key in URL = proxy/CDN-log-expose | Proxy via Worker (mit Quota). Short-term: Disclosure auf Settings-Screen. Gemini-key via Header statt URL |
| **P1-8** | Electron Renderer hat keine explizite CSP / `sandbox: false` | `src/main/index.ts:212-231` | Defense-in-depth-Lücke; Renderer-XSS könnte stored Supabase-Tokens exfiltrieren | `sandbox: true`, `webSecurity: true`, CSP-Meta-Tag mit strict `default-src 'self'; connect-src ...` |

---

## Medium (P2)

| # | Title | Location | Risk | Fix |
|---|---|---|---|---|
| **P2-1** | Kein Body-Size-Limit auf R2 PUT (R2-default 5GB) | `mobile/.../runRenderJob` + Worker `/v1/upload-url` | User uploaded 4GB-Sources, R2 storage cost balloons | `ContentLengthRange` in signed URL + R2 lifecycle-rule auto-delete sources>7d |
| **P2-2** | `args` Token-Replacement ist substring-basiert → token-collision möglich | `worker/src/index.ts:247-257` | Future code change reorders insertion → silent corruption | Single-pass Regex `/\{(SRC|SRC_\d+|INTRO|MUSIC_\d+|VO_\d+|ASS|DST)\}/g` |
| **P2-3** | Worker exposed Stack-Traces in 500-Responses (insb. FFmpeg-stderr mit tmp-Pfaden) | `worker/src/index.ts:285-287, 408-411` | Info-Leak (paths, internal jobId) | Return `{ok:false, jobId, error:'render failed'}`; stderr nur in `console.error` |
| **P2-4** | `/v1/transcribe` checkt SourceKey-Extension/MIME nicht | `worker/src/index.ts:358-405` | User upload zip-bomb als `.ass`, dann `/transcribe sourceKey=` → DoS | sourceKey muss enden auf `.mp4|.mov|.mkv|.webm|.m4a|.mp3|.wav` |
| **P2-5** | `delete-account` Stripe-Cancel ist best-effort, keine Transaction | `supabase/functions/delete-account/index.ts:62-85` | Orphaned subscription nach delete = continued billing → GDPR | Reverse order (Stripe last) ODER pending_delete-Tabelle + retry-worker |
| **P2-6** | Mobile session in SecureStore, `youtubeCookies` aber in AsyncStorage (plaintext) | `packages/mobile/src/stores/appStore.ts:25-28` | Rooted device → YouTube-Session-Token extrahierbar (full Google session) | Move zu chunked SecureStore (2KB chunks) ODER warn User explicit |
| **P2-7** | `media://` Desktop-Protocol liest beliebige local files | `src/main/index.ts:107-171` | Renderer-XSS könnte `media://local/etc/passwd` craften → FFmpeg-format-bounded read | `path.resolve` + allow-list (`userData/`, Movies-folder) |
| **P2-8** | Renderer kann `shell.openExternal` mit beliebiger `https?://` URL | `src/main/ipc.ts:1305-1311` | Phishing-Redirect-Pivot | Domain-Whitelist: stripe, supabase, fiano-app, github |

---

## Low / Informational (P3) — 14 Findings

| # | Item | Note |
|---|---|---|
| P3-1 | TTS endpoint length-limit 4096 hardcoded twice | OK, nicht exploitable |
| P3-2 | yt-dlp title truncated to 200 chars | OK |
| P3-3 | Worker hat kein `helmet()` HTTP-Headers | Add für HSTS, X-Frame-Options |
| P3-4 | `cors` Middleware nicht installed (Browser kann eh nicht callen) | OK, sollte explizit dokumentiert sein |
| P3-5 | `assBuilder.ts` escaped `\ { }` korrekt, aber `assPath` nicht für `:` separator | macOS dev path könnte `:` haben, dort filter brechen — document oder escape |
| P3-6 | `auth.getUser(token)` macht Supabase-roundtrip per request | Switch zu local JWT-Verify mit `jose` lib — schneller + cheaper |
| P3-7 | `/health` env-dump fingerprint | Move behind admin-header |
| P3-8 | `core/queue.ts` single in-process FIFO | OK, kein race observed |
| P3-9 | Renderer DevTools blocked best-effort | OK in packaged builds |
| P3-10 | `app.config.js` largeHeap=true | Memory-only, kein sec issue |
| P3-11 | OAuth-callback HTML `setTimeout window.close` | Benign |
| P3-12 | **`npm audit` nicht ausgeführt** | Run in root, packages/mobile, services/render-worker |
| P3-13 | `delete-account` invalidates active sessions nicht (JWTs valid bis expiry) | Document |
| P3-14 | `expo-secure-store` 2KB key-limit silent overflow | OK heute (~1.5KB), Future Supabase-Change könnte brechen |

---

## ✅ Bereits Sicher

| Bereich | Begründung |
|---|---|
| Supabase RLS baseline | A1 just-done — explicit REVOKE + narrow GRANTs |
| Stripe-Webhook-Signature-Verification | `constructEventAsync` mit `STRIPE_WEBHOOK_SECRET` korrekt |
| `verify_jwt=false` für stripe-webhook | Bewusst und dokumentiert in `config.toml` |
| Service-Role-Key + Supabase-URL in env vars | Nicht committed; nur `.env.example` mit placeholders |
| Mobile-Session in expo-secure-store | iOS Keychain / Android EncryptedSharedPreferences |
| Desktop API-Keys + Session in safeStorage | OS-Keychain, fail-closed wenn unavailable |
| R2-Keys server-determined | Mobile kann keinen arbitrary key wählen |
| Electron contextIsolation + nodeIntegration off | Korrekt konfiguriert, contextBridge nutzt exposeInMainWorld |
| External-Link-Handler `setWindowOpenHandler` | Denies new-window opens, routes via `shell.openExternal` |
| Production DevTools disabled | `devTools: !isProd` + hard-close on `devtools-opened` |
| Auto-updater Signature via electron-updater | electron-updater enforces code-signing default |
| YouTube/Twitch Host-Allow-List | Solid regex, prevents direct SSRF zu localhost/GCP-metadata |
| yt-dlp `--max-filesize 500M` + `maxDurationSec` hard-kill | Bounds resource use |
| `spawn(... args)` statt `exec` | Prevents shell-metachar injection (immer noch flag-injection vuln, P0-3) |
| JWT verified via Supabase admin client | Proper validation, rejects on error |
| Subtitle cue text escaping in `escapeDrawText`/`escapeAss` | `\ ' { } \n` korrekt handled |
| R2 pre-signed URLs short-lived | Upload 1h, Download 24h |
| safeStorage fail-closed bei unavailable encryption | Throws statt plaintext-storage |

---

## Recommended Next Steps (Action-Plan → Phase A6)

| # | Action | Effort | Schließt |
|---|---|---|---|
| **A6.1** | `express-rate-limit` auf Worker (per-userId nach authMiddleware) | **1h** | **P0-1** |
| **A6.2** | `.ass`-Content-Validation + Size-Limit | **2h** | **P0-4** |
| **A6.3** | Plan-Check in `authMiddleware` + monthly counter | **1d** | **P0-2** |
| **A6.4** | Typed RenderSpec — Mobile schickt typed JSON, Worker baut `args[]` selbst | **2-3d** | **P0-3** (größte Bedrohung) |
| **A6.5** | `/health` Env-Dump entfernen + Logs sanitisieren (P1-2) + R2-Pfad-Regex (P1-1) | 30m | P1-1, P1-2 |
| **A6.6** | Stripe-Webhook event-id dedupe + Edge-Function CORS-Whitelist | 1h | P1-3, P1-4 |
| **A6.7** | yt-dlp Härten (regex + drop --no-check-certificates + pinnen) | 30m | P1-5 |
| **A6.8** | Electron Renderer CSP + `sandbox:true` + `media://` path-validation | 1h | P1-8, P2-7 |
| **A6.9** | YouTube-Cookies in SecureStore + body-size R2-limit + sourceKey-ext-check | 1.5h | P2-1, P2-4, P2-6 |
| **A6.10** | `npm audit` + Updates auf moderate+ CVEs in alle 3 subprojects | 1h | P3-12 |

**Empfohlene Sprint-Reihenfolge:** A6.1 (heute) → A6.5+A6.6+A6.7+A6.8 (1-Tag-Sprint Quick-Wins P1) → A6.3+A5 (Plan-Enforcement + Mobile-Lock zusammen, 1-2 Tage) → A6.4 (großes Refactoring, 2-3 Tage) → A6.2 (mit A6.4 zusammen, weil server-side rebuild eh sauberer) → A6.9 + A6.10.

**Total A6:** ~6-8 Arbeitstage.

---

*Stand 2026-05-16, Branch `claude/modest-greider-5dd6e1`, Audit-ID `aa73faa7cda53cda7`.*

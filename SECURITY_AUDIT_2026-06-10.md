# 🔒 Pre-Launch Security-, Kosten- & Infrastruktur-Audit — Fisora/fiano

**Datum:** 2026-06-10 · **Scope:** Mobile (Expo/RN), Desktop (Electron), Cloud-Worker (Cloud Run), Supabase (DB+Edge Functions), Stripe, RevenueCat, R2, Website. Methodik: echter Code gelesen (5 parallele Spezial-Audits), nichts geraten, Belege als `Datei:Zeile`.

---

## EXECUTIVE SUMMARY

**Die Daten-, Auth- und Zahlungssicherheit ist solide gebaut. Das einzige ernste Problemfeld ist der Cloud-Kosten-/Missbrauchsschutz (Denial-of-Wallet) — genau das Risiko „hohe Cloud-Rechnungen".**

**Was bereits dicht ist (verifiziert):**
- **Abo-Bypass: unmöglich.** `subscriptions` ist für User read-only (RLS), `plan`/`status` schreiben nur signatur-/secret-verifizierte Webhooks via `service_role`.
- **Quota-Bypass: unmöglich.** `render_usage` read-only, Counter nur über `service_role`-only SECURITY-DEFINER-RPC, atomar (advisory lock), userId aus verifiziertem JWT.
- **Cloud-Compute-Bypass: unmöglich.** Jeder kostenrelevante Endpoint (`/render`, `/transcribe`, `/download`) prüft server-seitig gegen die DB — ein gefälschter Client/rooted Device schaltet höchstens UI frei, nicht den teuren Pfad.
- **Keine echten Secret-Leaks.** anon-/goog-/pk-Keys sind public-by-design; service_role + Stripe-Secrets + R2-Keys liegen ausschließlich server-side; Gemini/OpenAI sind **User-eigene** Keys in Keychain/SecureStore.
- **Electron vorbildlich:** `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, DevTools in Prod aus, Preload minimal.
- **Stripe-Preis server-fest**, FFmpeg-Arg-Injection geschlossen, SSRF-Allowlist, Path-Traversal-Schutz.

**Das Kernproblem:** Die einzige harte Kostengrenze ist die **Per-User-Monatsquota**. Davor liegen aber vier Lücken, die ein einzelner Angreifer oder ein Trial-Farming-Bot ausnutzen kann, um die ganze Render-Fleet zu belegen und Compute-Kosten zu verbrennen — der **€50-Killswitch greift reaktiv mit Stunden-Latenz und deckelt real NICHT auf €50**.

---

## SCORECARDS

### 🛡️ Security Scorecard: **72 / 100**
| Teilbereich | Score | Begründung |
|---|---|---|
| Datenzugriff / RLS | 95 | Lückenlos, Least-Privilege, kein horizontaler Zugriff |
| Payment-Integrität | 90 | Server-enforced, Webhook-Signaturen, kein Preis-Manipulation |
| Secrets-Management | 90 | Keine echten Leaks, saubere public/secret-Trennung |
| Auth / Session | 82 | Keychain/SecureStore, JWT ok; offen: OAuth-state-Nonce, MFA, Passwort-Policy |
| App-Härtung (Electron/Mobile) | 80 | Electron top; IPC-Pfad-Gap, unsigned Updates, Binary-Pinning |
| **Kosten-/Abuse-Schutz** | **40** | **Denial-of-Wallet möglich — zieht den Gesamtscore** |
| Monitoring / Alerting | 45 | Nur reaktiver Killswitch (Stunden-Latenz), keine Anomalie-/Abuse-Detection |

### 🚀 Launch-Readiness: **65 / 100 — „Launch-fähig mit Auflagen"**
Datenschutz/Auth/Payment sind launch-reif. Aber **vor einem öffentlichen Launch** (jeder kann Accounts anlegen) müssen die 4 kritischen Cloud-Kosten-Findings adressiert werden, sonst ist ein finanzieller Angriff trivial. Geschlossener/kleiner Launch (wenige bekannte Tester): ok. Öffentlicher Play-Store-Launch ohne die Fixes: riskant.

### 💸 Kostenrisiko-Scorecard: **35 / 100 (HOCH) — ohne Fixes**
Worst-Case heute: **~€169/Tag / ~€5.060/Monat** physische Obergrenze (Fleet 100% gesättigt), Killswitch deckelt real auf **€50 + Latenzschaden (€50–200+)**, nicht auf €50. Mit den empfohlenen Fixes (Concurrency-Limit + zentrales Rate-Limit + `max-instances`-Kalibrierung + Trial-Gating) steigt der Score auf **~80/100**.

---

## 🔴 KRITISCH — sofort beheben (alle im Denial-of-Wallet-Cluster)

### K-1 — Rate-Limiting ist In-Memory pro Instanz → über `max-instances=10` faktisch ×10 umgehbar
**Datei:** `services/render-worker/src/index.ts:92-124` (`express-rate-limit` ohne `store:`)
**Risiko/Angriffsweg:** Der MemoryStore zählt pro Instanz. Bei `concurrency=1` + `max-instances=10` skaliert Cloud Run unter Last auf 10 Instanzen, jede mit eigenem Counter → das `render 5/min`-Limit wird real zu **bis zu 50/min**. Zusätzlich nullt jeder Cold-Start/Deploy den Counter. Der als „financial-DoS-Schutz" dokumentierte Limiter ist faktisch wirkungslos, sobald >1 Instanz läuft.
**Wahrscheinlichkeit:** HOCH (trivial: `for i in {1..50}; do curl … & done`). **Auswirkung:** hebt den Render-Durchsatz aufs Fleet-Maximum.
**Lösung:** Zentralen Store erzwingen — entweder Redis (`rate-limit-redis` gegen Upstash/Memorystore) oder das Limit in dieselbe atomare Postgres-Quota-RPC verlagern (zentraler Zähler). `keyGenerator` per `userId` ist schon korrekt, aber wertlos ohne geteilten Store.
```ts
import RedisStore from 'rate-limit-redis';
rateLimit({ windowMs, max, store: new RedisStore({ sendCommand:(...a)=>redis.call(...a) }), keyGenerator:r=>r.userId??r.ip });
```

### K-2 — Multi-Account-/Trial-Farming: jeder Gratis-Trial = volle Render-Quota ohne Zahlung; keine Email-Verifizierung, kein Per-IP/Device-Limit
**Datei:** `revenuecat-webhook/index.ts:154-161` + `planCheck.ts:108-110` + `migrations/010_quota_no_periodend.sql:56`
**Risiko/Angriffsweg:** Die einzige Kostengrenze ist `user_id`-basiert. Ein Free-Trial setzt `status='active'` → **100 volle 4K-Cloud-Renders pro Wegwerf-Account**. Email-Verifizierung wird **nicht** erzwungen (grep `email_confirmed` = leer), kein Per-IP/Device-Limit (grep `x-forwarded-for/deviceId` = leer). Skript: Signup mit Wegwerf-Email → Trial → bis Quota rendern → Account wegwerfen → wiederholen.
**Wahrscheinlichkeit:** MITTEL–HOCH (Standard-Abuse). **Auswirkung:** bis ~€16 Compute pro Wegwerf-Account (100 × bis €0.16/Render), N Accounts = N×.
**Lösung:** (1) Trial vom teuren Cloud-Gate trennen — `trialing` für Render ausschließen oder Trial-Quota drastisch senken (z.B. 3). (2) Email-Verifizierung als Render-Vorbedingung in `auth.ts`:
```ts
if (!data.user.email_confirmed_at) return res.status(403).json({ ok:false, error:'email_unverified' });
```
(3) Sekundäres Per-IP-Tageslimit (zentral, mit K-1-Store).

### K-3 — Kein per-User-Concurrency-Limit → ein User belegt die ganze Fleet (Denial-of-Wallet + Service-DoS)
**Datei:** `index.ts:205` (`/render` hat nur `limitRender`, keinen In-Flight-Zähler; grep `semaphore/inFlight/p-limit` = leer)
**Risiko/Angriffsweg:** Die Quota zählt Gesamt-Anzahl, nicht **gleichzeitige** Renders. Mit `concurrency=1` blockiert jeder Render eine ganze Instanz bis 900s. 10 parallele Renders **eines** Users belegen die komplette Fleet → alle anderen bekommen 429/Cold-Start-Stau, und die Brennrate ist maximal.
**Wahrscheinlichkeit:** HOCH (ein einziger Account genügt). **Auswirkung:** €169/Tag-Brennrate + Service-DoS für alle.
**Lösung:** Hartes per-User-Concurrency-Limit (1–2) in derselben atomaren RPC (advisory lock ist da): bei `render_start` „in-progress"-Zähler inkrementieren, bei done/fail dekrementieren, bei >N → 429.

### K-4 — Quota begrenzt Anzahl, nicht Compute-Kosten: 4K × motionBlur × fps120 × lange Dauer ungated
**Datei:** `renderSpec.ts:255` (4K), `:261` (fps 120), `index.ts:51` (`MAX_DURATION_SEC=600`, aber pro Render bis ~2×600s via 2 Pässe), `:545` (Pass-2 `preset medium`)
**Risiko/Angriffsweg:** 100 Renders sind „legales" Quota-Verhalten — aber jeder darf 4K + `motionBlur=high` (minterpolate, ~5–10× CPU) + fps120 + 2 FFmpeg-Pässe kombinieren. Reale Stückkosten dadurch **bis ~€0.16/Render** statt der angenommenen €0.015 (**10× Unterschätzung**) → bricht die Kernannahme „Cloud-Kosten < Subscription-Revenue".
**Wahrscheinlichkeit:** MITTEL. **Auswirkung:** 100 Renders/User ≈ €16 statt €1.50; bei 1.000 Usern systematisch → bis €16.000/Monat.
**Lösung:** (1) `MAX_DURATION_SEC` ≤ 300, Pass-1+2 gemeinsames Zeitbudget. (2) `motionBlur=high`/`fps>60` an Plan binden (4K ist schon plan-gated). (3) Teure Kombis (4K×minterpolate) ablehnen oder als 2 Quota-Einheiten zählen. (4) Output-Dauer-Cap senken (aktuell `clampPositive(...,86400)` = 24h, viel zu hoch).

---

## 🟠 HOCH — vor Launch beheben

### H-1 — €50-Killswitch ist reaktiv mit Stunden-Latenz; `max-instances=10` ist KEIN €-Limit
**Datei:** Cloud-Config (`PROJECT_SUMMARY_MOBILE.md:5,83,121`) — Killswitch via GCP-Budget→Pub/Sub→Function
**Risiko:** GCP-Budget-Daten haben dokumentiert **mehrere Stunden Latenz**. `max-instances=10` ist eine Skalierungs-, keine Kostengrenze: 10 × 8 vCPU × 8 GiB = **$0.764/h/Instanz = $7.64/h Fleet = ~€169/Tag = ~€5.060/Monat** bei Dauer-Sättigung. Der Killswitch feuert erst **bei** €50, bis die Function greift sind real **€50 + €20–200** verbrannt.
**Lösung:** (1) `max-instances` als echtes €-Limit kalibrieren — bei €50-Budget eher **`max-instances=2`** (Render-Speed leidet, Kostenobergrenze wird real). (2) Zusätzlich Cloud-Monitoring-Alert auf `container/billable_instance_time` (Minuten- statt Stunden-Latenz). (3) K-1/K-3 als **präventive** Limits, da der Killswitch prinzipbedingt reaktiv ist.

### H-2 — `/v1/upload-url` hat KEIN Abo-Gate → R2 von unbezahlten Accounts füllbar
**Datei:** `index.ts:168` (`authMiddleware` + 30/min, **kein** `hasActiveSubscription`), `r2.ts:46-52,59`
**Risiko:** Jeder eingeloggte (auch unbezahlte, unverifizierte) User bekommt 30 Presigned-PUT-URLs/min. Der Size-Cap wird erst beim Worker-Download geprüft, **nicht** an der signierten URL → ein direkter PUT akzeptiert bis 5 GB. Gemildert durch R2-Lifecycle `sources/*>7d`, aber bis dahin TB-Akkumulation möglich.
**Lösung:** (1) `hasActiveSubscription`-Gate auf `/upload-url`. (2) Presigned-POST mit `Conditions:[['content-length-range',0,MAX]]` → R2 lehnt Oversize an der Quelle ab. (3) Lifecycle auf 24–48h.

### H-3 — `/v1/download` + `/v1/transcribe`: großzügige Size/Duration-Caps belegen Worker-CPU
**Datei:** `youtube.ts:87` (500 MB Download, 480s), `index.ts:711` (transcribe lädt bis 500 MB Source), `transcribe.ts:104-105` (Extract läuft auch ohne gültigen OpenAI-Key)
**Risiko:** Abo-gated (gut), aber via Trial-Bypass (K-2) nutzbar. Jeder Call belegt eine 8-vCPU-Instanz bis 480s/300s. SSRF ist sauber blockiert (Host+Pfad-Allowlist). Whisper zahlt der User selbst (eigener Key) — aber der teure Audio-Extract läuft Fisora-seitig **vor** der Key-Prüfung.
**Lösung:** `--max-filesize` auf ~200M, `maxDurationSec` auf ~300; transcribe-Source-Cap auf ~150 MB (Audio braucht kein 500-MB-Video); beide in das per-User-Concurrency-Limit (K-3) einschließen; OpenAI-Key-Format vorab prüfen.

---

## 🟡 MITTEL — kurzfristig beheben

- **M-1 — Electron-IPC-Handler mit ungefiltertem Pfad-Input** (`ipc.ts:497` `file.readAsBase64`, `:426` `thumbnail.delete`, `:673` `fs.exists`): arbitrary file read/delete **bei Renderer-Compromise** (XSS/böse Dependency). Durch `sandbox:true`+CSP stark gemildert (Wahrscheinlichkeit niedrig), aber inkonsistent zur bestehenden `media://`-Allowlist. **Fix:** geteilte `assertPathAllowed()` vor alle fs-Handler.
- **M-2 — macOS/Windows Auto-Update unsigned** (`electron-builder.yml:49-50` `identity:null`, `notarize:false`): SHA512 schützt Integrität, nicht Authentizität. Restrisiko = GitHub-Release-Channel-Compromise → Supply-Chain-RCE. **Fix:** Apple Developer ID + Notarization (macOS), Code-Signing (Win); sofort: 2FA + Fine-grained `GH_TOKEN`.
- **M-3 — Gebündelte Binaries (ffmpeg/yt-dlp) ohne Checksum-Pin** (`scripts/download-binaries.js`, alles `latest` von evermeet.cx/BtbN/yt-dlp, `postinstall || true` schluckt Fehler): Supply-Chain. **Fix:** Versionen pinnen + SHA256-Verify, Release-Build bei Mismatch hart abbrechen.
- **M-4 — Deep-Link akzeptiert Tokens aus jeder `auth-callback`-URL** (`App.tsx:146-164`): Session-**Fixation** (fremde gültige Session unterschieben), kein Token-Diebstahl/-Forgery. **Fix:** OAuth-`state`-Nonce in SecureStore, im Callback abgleichen, unsolicited `setSession` bei eingeloggtem User ignorieren.
- **M-5 — OAuth/Email-Redirect-Sicherheit hängt an Supabase-Allowlist** (Dashboard, nicht im Repo): bei zu offenen Wildcards → Token-Exfiltration/Takeover. **Fix:** Redirect-URL-Allowlist auf exakte Pfade prüfen, keine `*`/`localhost`-Wildcards in Prod; `www.fisora.app/auth-callback`-Seite auf Open-Redirect prüfen.
- **M-6 — Auth-DB-Roundtrip vor Rate-Limiter** (`auth.ts:29` vor Limiter): unauth Token-Flood trifft Supabase-Auth ungebremst. **Fix:** leichter per-IP-Limiter **vor** `authMiddleware`.
- **M-7 — Supabase Schema-Baseline nicht versioniert** (`subscriptions`/`profiles` nur via ALTER referenziert, kein `CREATE TABLE`): DR-Risiko + der kritische `UNIQUE(user_id)` ist nur nachträglich (009) gesichert. **Fix:** `000_baseline_schema.sql` mit `CREATE TABLE IF NOT EXISTS` + Constraints.

---

## 🟢 NIEDRIG — empfohlene Verbesserungen

- **N-1** RevenueCat-Webhook prüft `ev.environment` nicht → mit Secret+Ziel-UUID Sandbox-Abo fälschbar. Fix: `if (ev.environment!=='PRODUCTION') skip`.
- **N-2** Refund/Chargeback entzieht kein Entitlement (v.a. Lifetime → dauerhafter Pro nach Refund). Fix: `charge.refunded`/`dispute.created` + RC-`REFUND` handhaben → `status='canceled'`/`lifetime=false`.
- **N-3** Passwort-Policy (Supabase-Default 6 Zeichen) + MFA + Leaked-Password-Protection nicht aktiviert (Dashboard). Fix: Mindestlänge ≥10, HaveIBeenPwned-Check, TOTP-MFA, client-side Mindestlänge.
- **N-4** `supabase/.temp/` git-getrackt (Projekt-Ref, Versionen — kein Passwort). Fix: `git rm -r --cached` + gitignore.
- **N-5** `.gitignore` ohne generische Keystore-Patterns (`*.jks`,`*.keystore`,`*.p12`,`*.pem`,`google-services.json`). Fix: ergänzen + Pre-commit-Secret-Scan (gitleaks) — Repo ist **öffentlich**, verzeiht keinen `.env`-Fehltritt.
- **N-6** Firebase-`AIza`-Key in getracktem `google-services.json` (by-design public): App-Restriction (Package+SHA) + API-Restriction in Cloud Console verifizieren.
- **N-7** Website `.htaccess` blockt `config.js`/`*.bak`/`backups/` nicht (nur public-Werte). Fix: 403-Block als Defense-in-Depth.
- **N-8** Dedupe-Tabellen ohne Cleanup-Cron (Storage-Hygiene). Fix: `pg_cron` DELETE >30d.
- **N-9** R2-Lifecycle nur für `sources/*`, nicht `outputs/*`. Fix: Lifecycle 30–90d auf outputs.
- **N-10** Android-Storage-Permissions überbreit (`WRITE/READ_EXTERNAL_STORAGE` auf SDK35 wirkungslos), `SYSTEM_ALERT_WINDOW` unklar. Fix: `maxSdkVersion=32` bzw. streichen.
- **N-11** REVOKE/GRANT bei Quota-RPC-Redefinitionen nicht wiederholt (CREATE OR REPLACE erhält GRANTs → aktuell ok, Risiko nur bei künftigem DROP+CREATE).
- **N-12** Kein SSL-Pinning/Root-Detection/Obfuscation Mobile — **bewusst akzeptabel** für diese App-Klasse (Bundle enthält nur public Keys), kein Handlungsbedarf.
- **N-13** `fisora://`/`fiano://` Custom-Scheme statt Universal/App Links — durch `openAuthSessionAsync` gut abgesichert; optional auf verifizierte App Links umstellen.

---

## 💀 CLOUD-KOSTEN-ANGRIFFSVEKTOREN & SCHUTZMASSNAHMEN (explizit)

| # | Wie ein Angreifer hohe Cloud-Rechnungen verursacht | Aktueller Schutz | Fehlende/empfohlene Schutzmaßnahme |
|---|---|---|---|
| 1 | In-Memory-Rate-Limit über mehrere Instanzen umgehen (50/min statt 5) | ⚠️ wirkungslos >1 Instanz | **Zentraler Store (Redis/Postgres)** → K-1 |
| 2 | Trial-/Multi-Account-Farming (N×100 Renders gratis) | ⚠️ nur Per-User-Quota | **Trial-Gating + Email-Verify + Per-IP-Limit** → K-2 |
| 3 | Ein User belegt alle 10 Instanzen parallel | ❌ keiner | **Per-User-Concurrency-Limit (1–2)** → K-3 |
| 4 | Maximal teure Specs (4K×motionBlur×fps120×lang) | ⚠️ nur 4K plan-gated | **Spec-Caps + teure Kombis = 2 Quota-Einheiten + MAX_DURATION↓** → K-4 |
| 5 | Fleet 24/7 sättigen bis Killswitch (€169/Tag) | ⚠️ reaktiv, Stunden-Latenz | **`max-instances=2` als echtes €-Limit + Instance-Time-Alert** → H-1 |
| 6 | R2 mit großen Uploads fluten (unbezahlt) | ⚠️ nur Lifecycle 7d | **Abo-Gate + content-length-range PUT + Lifecycle 24-48h** → H-2 |
| 7 | Fremde große Videos durch /download proxyen | ✅ SSRF-Allowlist, ⚠️ 500MB | **Size/Duration↓ + Concurrency** → H-3 |
| 8 | /transcribe Audio-Extract aus 500MB Video | ⚠️ Abo-gated, Trial-bypassbar | **Source-Cap 150MB + Concurrency + Key-Check** → H-3 |
| 9 | Unauth Token-Flood → Supabase-Auth-Last | ❌ Limiter steht hinter Auth | **Per-IP-Limiter vor authMiddleware** → M-6 |

**Physische Worst-Case-Obergrenze heute:** ~€5.060/Monat pro Worker-Rev (Fleet 100% gesättigt) — der Killswitch deckelt real auf **€50 + Latenzschaden**, nicht €50.

---

## ✅ PRE-LAUNCH-CHECKLISTE (priorisiert)

**ZWINGEND vor öffentlichem Launch (Denial-of-Wallet):**
- [ ] **K-3** Per-User-Concurrency-Limit (1–2) in der Quota-RPC — höchster Hebel, kleinster Aufwand
- [ ] **K-1** Rate-Limit auf zentralen Store (Redis ODER Postgres-RPC) — In-Memory-Limit ist wirkungslos
- [ ] **K-2** Email-Verifizierung als Render-Vorbedingung + Trial vom Cloud-Gate trennen + Per-IP-Tageslimit
- [ ] **K-4** Render-Spec-Caps (MAX_DURATION↓, motionBlur/fps an Plan, teure Kombis = 2 Einheiten, Output-Dauer-Cap↓)
- [ ] **H-1** `max-instances=2` als echtes €-Limit + Cloud-Monitoring-Alert auf `billable_instance_time`
- [ ] **H-2** Abo-Gate auf `/v1/upload-url` + content-length-range Presigned-PUT

**Vor öffentlichem Launch (Sicherheit):**
- [ ] **M-5** Supabase-Redirect-URL-Allowlist auditieren (exakte Pfade, keine Wildcards) + `www.fisora.app/auth-callback` auf Open-Redirect prüfen
- [ ] **M-4** OAuth-`state`-Nonce (Mobile+Desktop) gegen Session-Fixation
- [ ] **N-3** Supabase: Passwort-Mindestlänge ≥10 + Leaked-Password-Protection + MFA aktivieren
- [ ] **N-1** RevenueCat-Webhook `environment==='PRODUCTION'`-Filter

**Kurzfristig (Härtung):**
- [ ] **H-3** /download + /transcribe Caps senken
- [ ] **M-6** Per-IP-Limiter vor Auth
- [ ] **M-1** Electron-IPC `assertPathAllowed()`
- [ ] **N-2** Refund/Dispute-Webhook-Handler (Lifetime-Schutz)
- [ ] **N-4/N-5** `supabase/.temp/` entfernen + Keystore-gitignore + gitleaks (public Repo!)
- [ ] **N-6** Firebase-Key-Restriktionen in Cloud Console verifizieren

**Mittelfristig:**
- [ ] **M-2** Desktop-Update-Signierung (macOS Notarization, Win Code-Sign)
- [ ] **M-3** Binary-Checksum-Pinning
- [ ] **M-7** Supabase-Schema-Baseline-Migration
- [ ] **N-7..N-13** Hygiene/Defense-in-Depth

---

## ✅ WAS BEREITS SICHER IST (kein Handlungsbedarf, verifiziert)
RLS lückenlos · Abo-/Quota-Bypass unmöglich · service_role nur server-side · Stripe Preis server-fest + Webhook-Signatur + Replay-Dedupe · RevenueCat Secret konstantzeit + Replay-Dedupe + UUID-Filter · FFmpeg-Arg-Injection geschlossen (typed RenderSpec, spawn ohne Shell) · SSRF-Allowlist (Host+Pfad) · Path-Traversal-Schutz (isOwnedSafeKey, media://) · Output via Signed-URL direkt von R2 (kein Worker-Egress) + UUIDv4-Keys (nicht enumerierbar) · Electron `contextIsolation/sandbox/webSecurity` + DevTools-prod-off + minimal Preload + CSP · safeStorage/SecureStore für alle Tokens+Keys · Android-Backup-Exfil geschlossen · keine Command-Injection (spawn-Arrays) · keine Secrets im Bundle/Binary (nur public Keys) · Gemini/OpenAI = User-eigene Keys.

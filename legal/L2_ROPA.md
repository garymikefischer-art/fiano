# L2 — Verzeichnis von Verarbeitungstätigkeiten (Art. 30 Abs. 1 DSGVO)

**Verantwortlicher:** Werbeagentur FIANO e.U.
**Produkt:** Fisora — Gaming-Clip-Editor für Streamer (Desktop + Android-Mobile + Cloud-Render-Backend)
**Erstellt/Stand:** 2026-06-05
**Version:** 1.0

---

## A. Angaben zum Verantwortlichen (Art. 30 Abs. 1 lit. a)

| Feld | Wert |
|---|---|
| Verantwortlicher i. S. d. Art. 4 Z 7 DSGVO | Werbeagentur FIANO e.U. |
| Vertretungsbefugter Inhaber | Gary Fischer |
| Anschrift | Hohenthurn 52, 9602 Hohenthurn, Österreich |
| Firmenbuchnummer | FN 640653 m, Landesgericht Klagenfurt |
| Umsatzsteuerlicher Status | Kleinunternehmer gem. § 6 Abs. 1 Z 27 UStG |
| Kontakt für Datenschutzanfragen | support@fisora.app |

### Datenschutzbeauftragter (DSB)

**Es ist kein Datenschutzbeauftragter benannt.** Eine Benennungspflicht nach Art. 37 Abs. 1 DSGVO besteht **nicht**, weil:

- FIANO e.U. ist **keine Behörde/öffentliche Stelle** (lit. a);
- die **Kerntätigkeit besteht nicht** in Verarbeitungsvorgängen, die eine **umfangreiche regelmäßige und systematische Überwachung** betroffener Personen erfordern (lit. b) — Fisora betreibt **keine** Profilbildung, **kein** Tracking, **keine** Werbe-/Analytics-Pipelines; die Verarbeitung dient der reinen Vertrags-/Funktionserfüllung;
- es findet **keine umfangreiche Verarbeitung besonderer Kategorien** personenbezogener Daten (Art. 9) oder von Daten über strafrechtliche Verurteilungen (Art. 10) statt (lit. c).

Als Einzelunternehmen unterhalb der einschlägigen Schwellen wird auf eine freiwillige Benennung verzichtet; Datenschutzanfragen laufen über **support@fisora.app**.

---

## B. Technisch-organisatorische Maßnahmen — allgemein (Art. 32 DSGVO)

Die folgenden, **real implementierten** Maßnahmen gelten querschnittlich für alle Tätigkeiten und werden je Eintrag (Abschnitt C) konkret referenziert:

| Maßnahme | Umsetzung in Fisora |
|---|---|
| **Verschlüsselung in-transit** | Durchgängig TLS/HTTPS für alle API-/Storage-Aufrufe (Supabase, Stripe, RevenueCat, Cloudflare R2, Cloud Run, Resend). R2-Zugriff über kurzlebige signierte URLs (Upload 1 h, Download 24 h). |
| **Verschlüsselung at-rest** | Supabase-DB serverseitig verschlüsselt (Region Frankfurt). Client-Secrets verschlüsselt: Desktop = OS-Keychain via Electron `safeStorage` (fail-closed); Mobile = `expo-secure-store` (iOS Keychain / Android EncryptedSharedPreferences), Supabase-Session als chunked-Secure-Store. |
| **Zugriffskontrolle Datenbank** | **Row-Level-Security (RLS)** auf allen Nutzer-Tabellen (`profiles`, `subscriptions`, Push-Token) — explizite REVOKE + enge GRANTs; jeder Datensatz nur für den Eigentümer lesbar. |
| **Authentifizierung** | Supabase Auth (E-Mail+Passwort, Google OAuth, PKCE-Flow). API-Autorisierung am Cloud-Worker via **JWT-Verifikation** (`authMiddleware`). Passwort-Stärke-Regeln im Client. |
| **Server-seitige Berechtigungs-/Plan-Durchsetzung** | Render-Worker prüft Plan **und** Monats-Quota serverseitig (`check_and_increment_render_quota`-RPC, `hasActiveSubscription`) — nicht nur clientseitige Paywall. Free/abgelaufen → 402. |
| **Rate-Limiting** | `express-rate-limit` je `userId` am Worker: `/upload-url` 30/min, `/render` 5/min, `/transcribe` 5/min, `/download` 3/min + Monats-Hard-Cap. Schutz gegen DoS/Quota-Burn. |
| **Eigentums-/Pfad-Validierung** | R2-Keys streng auf `sources/{userId}/…` geprüft (Regex, kein `..`/`//`). `media://`-Desktop-Protokoll path-validiert. Typed RenderSpec statt Client-`args[]` (keine FFmpeg-/libass-Injektion); `.ass`-/Subtitle-Inhalt allow-list-validiert. |
| **Datenminimierung / kein Tracking** | Keine Werbe-SDKs, keine Analytics, keine Telemetrie mit PII. Logs sanitisiert (keine URLs/Secrets/PII). BYOK-Keys werden **nie** persistiert. |
| **Mandantentrennung** | Pro-User-Scoping in DB (RLS) und Storage (userId-Pfade); Realtime-Channel pro User. |
| **Löschbarkeit / Betroffenenrechte** | Self-Service Account-Löschung (`delete-account` Edge Function: Stripe-Cancel + Customer-Delete + Cascade-Delete `auth.users`→`profiles`+`subscriptions`). Datenexport (Art. 20) in den App-Einstellungen. |
| **Webhook-Integrität** | Stripe-Webhook signatur-verifiziert + Event-ID-Dedupe; RevenueCat-Webhook über geheimes Authorization-Header-Token; Edge-Function-CORS auf Origin-Whitelist. |

---

## C. Verarbeitungstätigkeiten

> Jede Tätigkeit enthält: Zweck (lit. b), Betroffenen- (lit. c) und Datenkategorien (lit. c), Empfänger/Auftragsverarbeiter (lit. d), Drittlandübermittlung + Garantie (lit. e), Löschfristen (lit. f) und TOMs (Verweis auf Abschnitt B, Art. 32 / Art. 30 Abs. 1 lit. g).

---

### Nr. 1 — Nutzerkonto & Authentifizierung

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Registrierung, Login und Verwaltung des Fisora-Nutzerkontos |
| **Zweck** | Erstellung/Verwaltung eines Kontos; Authentifizierung (E-Mail+Passwort, Google OAuth); Zuordnung von Subscription, Projekten und Geräten zum Nutzer; Versand sicherheitsrelevanter Konto-E-Mails |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** DSGVO (Vertragserfüllung — ohne Konto keine Nutzung der App). Bei Google-OAuth zusätzlich Vertragsanbahnung lit. b. Sicherheits-/Pflicht-Mails: lit. b bzw. **lit. c** (Rechenschaftspflicht) |
| **Betroffenenkategorien** | Registrierte Nutzer (Streamer/Creator) der Desktop- und Android-App |
| **Datenkategorien** | E-Mail-Adresse, Passwort-Hash (bei Supabase, nie im Klartext bei FIANO), User-UUID, Anzeigename (optional), Avatar-URL (optional), Erstell-Zeitstempel, JWT-Session-Token, OAuth-Identität (bei Google-Login) |
| **Empfänger / Auftragsverarbeiter** | **Supabase** (Auth + `profiles`-Tabelle, EU-Region Frankfurt). **Resend** (SMTP-Versand der Auth-Mails). Google als OAuth-Identity-Provider (nur bei Google-Login — agiert dort als eigener Verantwortlicher für die Authentifizierung) |
| **Drittlandübermittlung + Garantie** | Daten-at-rest in **EU (Frankfurt)**. Supabase-Konzernentität US/SG → **SCC** (2021/914) + TIA. Resend (US) → **EU-US-DPF** + SCC. Siehe L1-Tracker Nr. 1 + 9 |
| **Löschfrist / Speicherdauer** | Bis zur Konto-Löschung durch den Nutzer. Self-Service-Löschung entfernt `auth.users` + per Cascade `profiles`/`subscriptions` **unverzüglich**. Keine darüber hinausgehende Speicherung von Kontostammdaten (Ausnahme: zahlungsbezogene Belege, siehe Nr. 2) |
| **TOMs (Art. 32)** | RLS auf `profiles`; TLS in-transit; Supabase-Verschlüsselung at-rest; Session client-seitig verschlüsselt (safeStorage/SecureStore); JWT-Auth + PKCE; Passwort-Stärke-Prüfung; sanitisierte Logs. (Abschnitt B) |

---

### Nr. 2 — Abo- & Zahlungsabwicklung Desktop (Stripe)

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Abschluss, Verwaltung und Abrechnung kostenpflichtiger Pläne über die Desktop-App via Stripe |
| **Zweck** | Verkauf/Verwaltung der Pläne **Creator** & **Pro** (Monats-Abo) sowie **Studio Lifetime** (Einmalzahlung); Zahlungsabwicklung; Rechnungs-/Beleg-Erstellung; Kündigung; Kunden-Portal |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** (Vertragserfüllung — entgeltlicher Nutzungsvertrag) sowie **Art. 6 Abs. 1 lit. c** (gesetzliche Aufbewahrungspflichten für Zahlungs-/Buchungsbelege, §§ 132 BAO / 212 UGB) |
| **Betroffenenkategorien** | Zahlende Desktop-Nutzer |
| **Datenkategorien** | Stripe-Customer-ID, Stripe-Subscription-ID, gewählter Plan, Abo-Status, `current_period_end`, `cancel_at_period_end`, Zahlungsbelege. **Keine Kreditkartennummern bei FIANO** — Kartendaten ausschließlich bei Stripe (PCI-DSS) |
| **Empfänger / Auftragsverarbeiter** | **Stripe Payments Europe, Ltd.** (Irland) als Zahlungsdienstleister/Auftragsverarbeiter; Status-Spiegelung in **Supabase** `subscriptions` (Frankfurt) über signatur-verifizierten Stripe-Webhook (Edge Function) |
| **Drittlandübermittlung + Garantie** | EU-Vertragspartner (Irland). Mögliche US-Konzernverarbeitung (Stripe, Inc.) → **EU-US-DPF** (Stripe, Inc. zertifiziert) + SCC im DPA. Siehe L1-Tracker Nr. 2 |
| **Löschfrist / Speicherdauer** | Subscription-Statusdaten bis Konto-Löschung; bei Löschung Stripe-Subscription gecancelt + Stripe-Customer gelöscht. **Zahlungs-/Buchungsbelege:** gesetzliche Aufbewahrung (i. d. R. **7 Jahre** gem. § 132 BAO) bei Stripe/Buchhaltung — überlebt die Konto-Löschung |
| **TOMs (Art. 32)** | TLS in-transit; PCI-DSS bei Stripe; Webhook-Signaturprüfung + Event-ID-Dedupe; RLS auf `subscriptions`; CORS-Whitelist der Edge Functions; keine Kartendaten im FIANO-System. (Abschnitt B) |

---

### Nr. 3 — Abo- & Zahlungsabwicklung Mobile (Google Play Billing / RevenueCat)

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | In-App-Käufe (Abos) in der Android-App über Google Play Billing, vermittelt/synchronisiert via RevenueCat |
| **Zweck** | Verkauf der In-App-Abos **Creator** & **Pro** über den Pflicht-Zahlungsweg Google Play; Entitlement-Verwaltung; Sync des Abo-Status in den Fisora-Account; geräteübergreifender Plan-Abgleich |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** (Vertragserfüllung). Buchhalterische Belege: **lit. c** (soweit FIANO Belege erhält — Abrechnung erfolgt primär über Google) |
| **Betroffenenkategorien** | Zahlende Android-Nutzer |
| **Datenkategorien** | `app_user_id` (= Supabase-User-UUID; die App ruft `Purchases.logIn(userId)`), Entitlement-Status (`creator`/`pro`), Store-Produkt-/Transaktions-IDs, Abo-Status. **Karten-/Zahlungsdaten verbleiben bei Google** — FIANO/RevenueCat erhalten nur den Kauf-/Entitlement-Status |
| **Empfänger / Auftragsverarbeiter** | **Google Ireland Limited** (Google Play Billing). **RevenueCat, Inc.** (IAP-/Entitlement-Abwicklung). Status-Spiegelung in **Supabase** `subscriptions` über `revenuecat-webhook` Edge Function (Authorization-Header-Secret) |
| **Drittlandübermittlung + Garantie** | Google: EU-Vertrag (IE) + **DPF** (Google LLC) + SCC. **RevenueCat: USA**, **SCC** (DPF-Status 2026-06 unbestätigt → vor Go-Live prüfen). Siehe L1-Tracker Nr. 3 + 4 |
| **Löschfrist / Speicherdauer** | Entitlement-Daten bis Konto-/Abo-Ende bzw. Konto-Löschung. RevenueCat-seitige Subscriber-Historie nach deren Aufbewahrungslogik; FIANO-seitiger Status wird bei Account-Löschung mitgelöscht (Cascade) |
| **TOMs (Art. 32)** | TLS in-transit; Webhook-Auth über geheimes Header-Token; RLS auf `subscriptions`; serverseitige Plan-/Quota-Enforcement am Worker; keine Kartendaten im FIANO-System. (Abschnitt B) |

---

### Nr. 4 — Cloud-Video-Rendering

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Serverseitige Verarbeitung hochgeladener Videos zu fertigen Clips (Layout, Effekte, Untertitel, Export) |
| **Zweck** | Rechen-/hardwareintensives Rendering, das auf Mobilgeräten nicht (patent-/leistungsbedingt) lokal erfolgt: Empfang der Quell-Uploads, FFmpeg-Pass-1 (Layout/Effekte/Audio) + Pass-2 (Untertitel-PNG-Overlay), Rückgabe des Outputs; optional yt-dlp-Quell-Download |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** (Kernleistung der App — Erstellung der Clips ist der vertragliche Hauptzweck) |
| **Betroffenenkategorien** | Nutzer, die die Cloud-Render-Funktion verwenden; **mittelbar** in den Videos abgebildete/hörbare Dritte (Gameplay-/Facecam-/Audio-Inhalte) — der Nutzer ist für die Rechtmäßigkeit seines Quellmaterials selbst verantwortlich (in den Nutzungsbedingungen geregelt) |
| **Datenkategorien** | Quellvideos (Bild + Ton), gerenderte Output-Videos, Untertitel-/Cue-Daten, Job-/Projekt-Metadaten, User-UUID + JWT (Auth). Inhalte können personenbezogene Bild-/Tondaten enthalten |
| **Empfänger / Auftragsverarbeiter** | **Cloudflare R2** (Cloudflare Germany GmbH) als temporärer Objektspeicher; **Google Cloud Run** (Google Ireland Ltd., Region **europe-west1/Belgien**) als Render-Compute |
| **Drittlandübermittlung + Garantie** | Verarbeitung/Storage in **EU-Regionen** (Cloudflare DE, Cloud Run Belgien). US-Konzernmütter → **DPF** (Cloudflare, Inc. / Google LLC) + SCC in den jeweiligen DPAs. Siehe L1-Tracker Nr. 5 + 6 |
| **Löschfrist / Speicherdauer** | **Temporär / sitzungsbezogen.** Quell-Uploads (`sources/*`): Auto-Delete per Lifecycle-Regel **> 7 Tage** (R2-Dashboard-Rule — *aktuell noch zu aktivieren, siehe To-do*). Outputs (`outputs/*`): max. 7 Tage. Signierte URLs kurzlebig (Upload 1 h, Download 24 h). Auf dem Worker selbst nur **flüchtig** in `/tmp` während des Jobs, danach gelöscht |
| **TOMs (Art. 32)** | TLS in-transit; signierte, kurzlebige R2-URLs; **R2-Key-Ownership-Regex** (`sources/{userId}/…`, kein Path-Traversal); **Typed RenderSpec** statt Client-`args[]` (keine FFmpeg-/libass-Injektion); `.ass`-/Subtitle-Allow-List-Validierung + Größen-Caps; **Rate-Limiting** je userId; **server-seitige Plan-/Quota-Enforcement**; sanitisierte Logs; yt-dlp gehärtet (Host-Allow-List, Größen-/Dauer-Cap). (Abschnitt B) |

---

### Nr. 5 — KI-Transkription & Highlight-Erkennung (BYOK — OpenAI Whisper / Google Gemini)

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | KI-gestützte Transkription (Whisper) zur Highlight-/Untertitel-Erkennung sowie Thumbnail-Generierung (Gemini) — jeweils mit dem **eigenen API-Key des Nutzers** |
| **Zweck** | Automatische Transkription der Clip-Audiospur (Highlight-Findung, Untertitel) und Thumbnail-Erstellung aus Text-Prompt/Referenzbild |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** für die FIANO-seitige **Durchleitung** (technische Vermittlung als Teil der Funktion). Die **inhaltliche KI-Verarbeitung verantwortet der Nutzer** gegenüber OpenAI/Google (BYOK) — insoweit ist **FIANO nicht Verantwortlicher**, sondern Vermittler |
| **Betroffenenkategorien** | Nutzer (Key-Inhaber); mittelbar in Audio/Bild enthaltene Dritte |
| **Datenkategorien** | Audiospur des Clips (Whisper) bzw. Text-Prompt + ggf. Referenzbild (Gemini). **Der API-Key wird nie persistiert** (Desktop OS-Keychain, Mobile SecureStore; am Worker nur transient pro Request, kein Logging) |
| **Empfänger / Auftragsverarbeiter** | **OpenAI** (Whisper) und **Google Gemini** — jeweils **Auftragsverarbeiter DES NUTZERS**, nicht von FIANO. FIANO leitet die Daten technisch durch (Desktop direkt vom Gerät; Mobile-Whisper über den Cloud-Worker als reiner Transit) |
| **Drittlandübermittlung + Garantie** | OpenAI (US/IE) und Google (US/IE) → **DPF + SCC** im Verhältnis **Nutzer ↔ Anbieter** (deren jeweilige DPAs). FIANO trifft insoweit keine eigene Übermittlungs-Garantiepflicht, stellt aber **Transparenz** sicher. Siehe L1-Tracker Nr. 10 + 11 |
| **Löschfrist / Speicherdauer** | FIANO speichert weder Audio/Prompt noch Key dauerhaft. Aufbewahrung beim KI-Anbieter richtet sich nach dessen Bedingungen (Vertrag Nutzer↔Anbieter); Whisper-Request am Worker nur flüchtig |
| **TOMs (Art. 32)** | API-Key client-seitig verschlüsselt (Keychain/SecureStore), am Worker nur transient + ohne Logging; TLS in-transit; **Transparenzhinweis** in Datenschutzerklärung/Hilfe (Inhalte gehen an OpenAI/Google, deren Bedingungen gelten); Rate-Limiting `/transcribe`. (Abschnitt B) |

---

### Nr. 6 — Push-Benachrichtigungen (Android)

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Versand von Push-Benachrichtigungen an die Android-App (z. B. „Render abgeschlossen") |
| **Zweck** | Information des Nutzers über abgeschlossene Renders / kontobezogene Ereignisse via System-Push |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** (vertragsbezogene Service-Benachrichtigung) bzw. **Art. 6 Abs. 1 lit. f** (berechtigtes Interesse an Funktions-Benachrichtigung; Push systemseitig deaktivierbar) |
| **Betroffenenkategorien** | Android-Nutzer mit aktivierten Benachrichtigungen |
| **Datenkategorien** | Expo-/FCM-Push-Token (`expo_push_token` in `profiles`), geräteseitiger Push-Identifier. Keine Werbe-/Tracking-Inhalte |
| **Empfänger / Auftragsverarbeiter** | **Firebase Cloud Messaging / Google Ireland Limited** (Push-Zustellung). Token-Speicherung in **Supabase** `profiles`. Token-Erzeugung über Expo-Push-Service (siehe Nr. 8) |
| **Drittlandübermittlung + Garantie** | Google: EU-Vertrag (IE) + **DPF** (Google LLC) + SCC (Firebase DPST). Siehe L1-Tracker Nr. 7 |
| **Löschfrist / Speicherdauer** | Push-Token bis Konto-Löschung bzw. bis Token-Invalidierung/Abmeldung; mit Account-Löschung per Cascade entfernt. **Nur Android — kein iOS** |
| **TOMs (Art. 32)** | RLS auf Token-Feld; TLS in-transit; kein Inhalts-Tracking; Token serverseitig pro User gescoped. (Abschnitt B) |

---

### Nr. 7 — Transaktionale E-Mails

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Versand systembedingter, transaktionaler E-Mails |
| **Zweck** | Konto-Bestätigung (Double-Opt-In), Passwort-Reset, Lösch-Bestätigung, ggf. Render-/Status-Benachrichtigung |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. b** (Vertragsdurchführung) sowie **Art. 6 Abs. 1 lit. c** (Nachweis-/Sicherheitsfunktion). **Kein Newsletter/Marketing** (daher kein lit. a erforderlich) |
| **Betroffenenkategorien** | Registrierte Nutzer |
| **Datenkategorien** | E-Mail-Adresse, E-Mail-Inhalt (Betreff/Body der jeweiligen System-Mail). Kein Tracking-Pixel |
| **Empfänger / Auftragsverarbeiter** | **Resend, Inc.** als SMTP-Provider (auch als SMTP-Backend der Supabase-Auth-Mails; Sender `support@fisora.app`) |
| **Drittlandübermittlung + Garantie** | Resend (USA) → **EU-US-DPF** (Resend, Inc. zertifiziert) + SCC im DPA. Siehe L1-Tracker Nr. 9 |
| **Löschfrist / Speicherdauer** | Zustell-/Log-Daten gemäß Resend-Aufbewahrung (kurzfristig, für Zustellnachweis/Bounce-Handling); FIANO speichert keine eigenständige Mail-Historie über das Auth-System hinaus |
| **TOMs (Art. 32)** | TLS in-transit; DKIM/SPF für `fisora.app` (DKIM-Verifikation als To-do); kein Tracking-Pixel; Inhalt auf System-Mails beschränkt. (Abschnitt B) |

---

### Nr. 8 — Crash-/Telemetrie-Logs

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Erfassung technischer Fehler-/Diagnosedaten zur Stabilitäts- und Sicherheitssicherung |
| **Zweck** | Erkennung/Behebung von Abstürzen und Fehlern, Auslieferung von Over-the-Air-Updates, Betriebssicherheit (Missbrauchs-/DoS-Erkennung) |
| **Rechtsgrundlage** | **Art. 6 Abs. 1 lit. f** (berechtigtes Interesse an Fehlerfreiheit, Sicherheit und Update-Fähigkeit der Software). Datenminimiert — **ohne PII in Logs** |
| **Betroffenenkategorien** | Nutzer der Mobile-/Desktop-App und API-Aufrufer (serverseitig) |
| **Datenkategorien** | Crash-/Fehler-Stacks, App-/Geräte-/Build-Infos (Version, OS), EAS-Update-Auslieferungs-Telemetrie, serverseitige Betriebslogs (Job-IDs, Status). **Logs sind sanitisiert** — keine URLs, Secrets oder PII; BYOK-Keys werden nicht geloggt |
| **Empfänger / Auftragsverarbeiter** | **Expo / EAS (650 Industries, Inc.)** für Build-/Update-/Crash-Telemetrie der Mobile-App; **Google Cloud Run** (Cloud Logging) für serverseitige Betriebslogs des Workers |
| **Drittlandübermittlung + Garantie** | Expo (USA) → **SCC** (Modul 1; DPF-Compliance angegeben — zu verifizieren). Google Cloud Logging → **DPF + SCC** (CDPA). Siehe L1-Tracker Nr. 8 + 6 |
| **Löschfrist / Speicherdauer** | Nach Aufbewahrungslogik der jeweiligen Plattform (Cloud-Logging-Retention; Expo-Build/Update-Logs). Kurzfristig, nur betrieblich; keine langfristige FIANO-Profilbildung |
| **TOMs (Art. 32)** | **Log-Sanitisierung** (keine PII/Secrets); TLS in-transit; reduzierte `/health`-Ausgabe; keine Analytics-SDKs; serverseitige Zugriffskontrolle. (Abschnitt B) |

---

### Nr. 9 — Webseite (Kontaktformular + Consent-Management)

| Feld | Inhalt |
|---|---|
| **Bezeichnung** | Betrieb der Marketing-/Produktwebseite fisora.app inkl. Kontaktformular und Cookie-/Consent-Verwaltung |
| **Zweck** | Bereitstellung der Webseite (Produktinfos, Rechtstexte, Auth-Callback-Bridge); Entgegennahme von Kontaktanfragen; Einholung/Verwaltung von Einwilligungen für nicht zwingend erforderliche Cookies/Dienste |
| **Rechtsgrundlage** | Kontaktformular: **Art. 6 Abs. 1 lit. b** bzw. **lit. f** (Beantwortung von Anfragen). Technisch notwendige Auslieferung/Sicherheit: **lit. f**. Nicht notwendige Cookies/Dienste: **Art. 6 Abs. 1 lit. a** (Einwilligung) i. V. m. § 165 Abs. 3 TKG 2021 (Cookie-Einwilligung Österreich) |
| **Betroffenenkategorien** | Webseitenbesucher; Personen, die das Kontaktformular nutzen |
| **Datenkategorien** | Kontaktformular: Name, E-Mail, Nachrichtentext. Technisch: IP-Adresse, User-Agent (Server-/CDN-Logs beim Asset-Abruf). Consent-Status (Einwilligungs-Cookie) |
| **Empfänger / Auftragsverarbeiter** | **Formspree, Inc.** (Kontaktformular-Verarbeitung); **jsDelivr / Cloudflare CDN** (Auslieferung statischer Bibliotheken → IP-Übertragung); ggf. Hosting-Provider der Webseite |
| **Drittlandübermittlung + Garantie** | Formspree (USA) → **DPF + SCC** (lt. Anbieter). jsDelivr/CDN: PoP-abhängig, IP-Transfer → **Empfehlung Self-Hosting** bzw. Cloudflare-DPA. Siehe L1-Tracker Nr. 12 + 13 |
| **Löschfrist / Speicherdauer** | Kontaktanfragen: bis zur abschließenden Bearbeitung + etwaige gesetzliche Fristen; danach Löschung. Server-/CDN-Logs: kurzfristig (technisch). Consent: gemäß eingestellter Cookie-Lebensdauer, regelmäßige Re-Abfrage |
| **TOMs (Art. 32)** | TLS/HTTPS; Consent-Banner mit Opt-in für nicht notwendige Dienste; Datenminimierung im Formular; Empfehlung: Bibliotheken self-hosten (Drittland-IP-Transfer vermeiden). (Abschnitt B) |

---

## D. Übersicht — Drittlandübermittlungen (Art. 30 Abs. 1 lit. e)

| Tätigkeit | Drittland-Empfänger | Garantie |
|---|---|---|
| 1 Konto | Supabase (US/SG-Entität; Daten EU/FFM), Resend (US) | SCC + TIA (Supabase); DPF + SCC (Resend) |
| 2 Zahlung Desktop | Stripe (IE-Vertrag, US-Mutter) | DPF + SCC |
| 3 Zahlung Mobile | Google (IE-Vertrag), RevenueCat (US) | DPF+SCC (Google); SCC (RevenueCat, DPF offen) |
| 4 Cloud-Render | Cloudflare R2 (DE), Cloud Run (BE) | EU-Region; DPF + SCC (US-Mütter) |
| 5 KI (BYOK) | OpenAI (US/IE), Gemini (US/IE) | DPF + SCC im Verhältnis **Nutzer↔Anbieter** (FIANO = Vermittler) |
| 6 Push | Google/FCM (IE-Vertrag) | DPF + SCC |
| 7 E-Mail | Resend (US) | DPF + SCC |
| 8 Crash/Telemetrie | Expo/650 Industries (US), Google Cloud (IE) | SCC (Expo); DPF + SCC (Google) |
| 9 Webseite | Formspree (US), jsDelivr/CDN | DPF/SCC (Formspree); CDN → Self-Hosting empfohlen |

---

## E. Offene Maßnahmen mit Datenschutzbezug (Stand 2026-06-05)
- ☐ R2-Lifecycle-Rule `sources/* > 7 Tage` im Cloudflare-Dashboard **aktivieren** (Tätigkeit Nr. 4 — Löschfrist verbindlich machen).
- ☐ DKIM-/SPF-Records für `fisora.app` verifizieren (Nr. 7).
- ☐ RevenueCat-DPF-Status erneut prüfen; bis dahin SCC dokumentiert führen (Nr. 3).
- ☐ Webseiten-Bibliotheken (jsDelivr) auf Self-Hosting umstellen (Nr. 9).
- ☐ Alle DPAs gemäß L1-Tracker gegenzeichnen/akzeptieren + archivieren.

---

> **Disclaimer:** Dieses Verzeichnis von Verarbeitungstätigkeiten dokumentiert den **realen technischen Stand von Fisora zum 2026-06-05** und dient der Erfüllung der Rechenschaftspflicht nach Art. 30 DSGVO. Es **ersetzt keine Rechtsberatung.** Rechtsgrundlagen-Einordnung, Aufbewahrungsfristen (insb. steuer-/handelsrechtliche Fristen nach BAO/UGB) und die Bewertung der Drittlandübermittlungen sollten vor Veröffentlichung der App durch eine **Rechtsanwältin/einen Rechtsanwalt bzw. die WKO (Wirtschaftskammer Österreich)** final geprüft werden. Bei Änderungen der Architektur, der eingesetzten Dienste oder der Verarbeitungszwecke ist dieses Verzeichnis fortzuschreiben.

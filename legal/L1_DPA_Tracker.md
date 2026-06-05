# L1 — Auftragsverarbeiter-Verzeichnis & DPA-Tracker (Art. 28 DSGVO)

**Produkt:** Fisora — Gaming-Clip-Editor für Streamer (Desktop: Electron/Stripe · Mobile: Android/Google Play + RevenueCat · Cloud-Render-Backend)
**Stand:** 2026-06-05
**Status dieses Dokuments:** Arbeitsdokument zum laufenden Abhaken — bei jedem neuen Dienst / jeder DPA-Neufassung aktualisieren.

---

## 0. Verantwortlicher (Controller)

| Feld | Wert |
|---|---|
| Firma | Werbeagentur FIANO e.U. |
| Inhaber | Gary Fischer |
| Anschrift | Hohenthurn 52, 9602 Hohenthurn, Österreich |
| Firmenbuch | FN 640653 m, Landesgericht Klagenfurt |
| Steuerstatus | Umsatzsteuerlicher Kleinunternehmer (§ 6 Abs. 1 Z 27 UStG) |
| E-Mail | support@fisora.app |

FIANO e.U. ist **Verantwortlicher** für die Verarbeitung der Fisora-Nutzerdaten. Alle unten gelisteten Dienste verarbeiten personenbezogene Daten **im Auftrag** von FIANO (Art. 28 DSGVO) — mit Ausnahme der ausdrücklich als „BYOK / Auftragsverarbeiter des Nutzers" markierten KI-Dienste (siehe § 3).

---

## 1. Überblickstabelle — Auftragsverarbeiter

Legende Transfergrundlage: **DPF** = EU-US Data Privacy Framework (Angemessenheitsbeschluss 2023) · **SCC** = EU-Standardvertragsklauseln (Durchführungsbeschluss (EU) 2021/914) · **EU/EWR** = keine Drittlandübermittlung (Datenverarbeitung in EU/EWR) · **Adäquanz** = sonstiger Angemessenheitsbeschluss.

| # | Dienst | Rechtsträger (Vertragspartner) | Sitz | Drittland? | Transfergrundlage | Datenkategorien | Zweck | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | **Supabase** | Supabase, Inc. (operativ über Supabase Pte. Ltd.) | USA (Delaware) / Singapur | **Ja** (Konzern-Entität; Daten-at-rest jedoch EU) | **SCC** (Supabase ist *nicht* DPF-zertifiziert) + TIA; DB-Region **Frankfurt (EU)** | Auth-Identität, User-UUID, E-Mail, Anzeigename, Subscription-Status, Push-Token | Authentifizierung, Datenbank (Postgres), Edge Functions, Realtime | ☐ |
| 2 | **Stripe** | Stripe Payments Europe, Ltd. (EU-Vertragspartner für EU-Kunden); Stripe, Inc. (US-Konzernmutter) | Irland (EU) / USA | **Teilweise** (EU-Vertrag; US-Verarbeitung möglich) | **DPF** (Stripe, Inc. zertifiziert) + SCC im DPA | Zahlungs-/Abodaten, Stripe-Customer-ID, Subscription-ID, Belege | Zahlungsabwicklung Desktop, Kunden-Portal | ☐ |
| 3 | **RevenueCat** | RevenueCat, Inc. | USA | **Ja** | **SCC** (RevenueCat ist *nicht* DPF-zertifiziert — Stand 2026-06; vor Akzeptanz prüfen) | app_user_id (= Supabase-UUID), Kauf-/Entitlement-Status, Store-Transaktions-IDs | Mobile-IAP-Abwicklung / Entitlement-Sync (Android) | ☐ |
| 4 | **Google Play Billing** | Google Ireland Limited (EU-Vertragspartner); Google LLC | Irland (EU) / USA | **Teilweise** | **DPF** (Google LLC zertifiziert) + SCC (CDPA) | Kaufabwicklung, Store-Kaufdaten, Abo-Status | Mobile-Zahlungsabwicklung (Android, Pflicht-IAP) | ☐ |
| 5 | **Cloudflare R2** | Cloudflare Germany GmbH (EU-Vertragspartner); Cloudflare, Inc. | Deutschland (EU) / USA | **Teilweise** | **DPF** (Cloudflare, Inc. zertifiziert) + SCC (Customer DPA) | Hochgeladene Quellvideos + gerenderte Outputs (temporär) | Temporärer Render-Storage (Source-Uploads + Outputs, Auto-Delete) | ☐ |
| 6 | **Google Cloud Run** | Google Ireland Limited (EU-Vertragspartner); Google LLC | Irland (EU) / USA; **Region europe-west1 (Belgien)** | **Teilweise** (Compute in EU) | **DPF** + SCC (Cloud Data Processing Addendum, CDPA) | Videoinhalte während der Verarbeitung (flüchtig, /tmp), Job-Metadaten | Cloud-Video-Rendering (Render-Worker) | ☐ |
| 7 | **Firebase Cloud Messaging (FCM)** | Google Ireland Limited (EU-Vertragspartner); Google LLC | Irland (EU) / USA | **Teilweise** | **DPF** + SCC (Firebase Data Processing & Security Terms) | Push-Token (Expo/FCM), Geräte-Push-Identifier | Push-Benachrichtigungen (nur Android) | ☐ |
| 8 | **Expo / EAS** | 650 Industries, Inc. | USA | **Ja** | **SCC** (Modul 1, Beschluss C/2021/3972); 650 Industries gibt DPF-Compliance an — vor Akzeptanz auf dataprivacyframework.gov verifizieren | Build-Metadaten, ggf. Crash-/Update-Logs (Geräte-/App-Telemetrie ohne Inhalt) | App-Builds + OTA-Updates (EAS Update) | ☐ |
| 9 | **Resend** | Resend, Inc. | USA | **Ja** | **DPF** (Resend, Inc. zertifiziert) + SCC im DPA | E-Mail-Adresse, E-Mail-Inhalt (transaktional) | Transaktionale E-Mails (Konto-Bestätigung, Passwort-Reset, Lösch-/Render-Benachrichtigung) | ☐ |
| 10 | **OpenAI (Whisper)** | OpenAI, L.L.C. (bzw. OpenAI Ireland Ltd. für EU) — **Auftragsverarbeiter DES NUTZERS** (BYOK) | USA / Irland | **Ja** | DPF anerkannt + SCC (OpenAI DPA); **Vertragspartner ist der Nutzer**, nicht FIANO | Audiospur des Clips (Durchleitung), kein API-Key persistiert | Transkription für KI-Highlight-Erkennung (Bring-your-own-key) | ☐ (n. a. für FIANO — siehe § 3) |
| 11 | **Google Gemini** | Google LLC / Google Ireland Limited — **Auftragsverarbeiter DES NUTZERS** (BYOK) | USA / Irland | **Ja** | DPF + SCC (Gemini API Additional Terms / CDPA); **Vertragspartner ist der Nutzer** | Text-Prompt + ggf. Referenzbild (Durchleitung), kein API-Key persistiert | Thumbnail-Generierung (Bring-your-own-key) | ☐ (n. a. für FIANO — siehe § 3) |
| 12 | **Formspree** | Formspree, Inc. | USA | **Ja** | DPF + SCC (gem. Anbieterangabe) | Name, E-Mail, Nachrichtentext aus dem Kontaktformular | Webseiten-Kontaktformular (fisora.app) | ☐ |
| 13 | **jsDelivr / Cloudflare CDN** | Volkmar Gronau / prospfeld („jsDelivr"); Auslieferung über Fastly/Cloudflare/GCore | EU / global | **Möglich** (CDN-PoP-abhängig) | Reines CDN — IP-Übertragung; bevorzugt selbst-hosten oder Cloudflare-DPA (§ 5) | IP-Adresse, User-Agent (technisch, bei Asset-Abruf) | Auslieferung statischer Webseiten-Bibliotheken | ☐ |

> **Daten-Residenz-Hinweis (wichtig):** Die produktiven *Daten-at-rest* liegen bewusst in der EU — Supabase-DB in **Frankfurt**, Cloud Run + R2-Verarbeitung in **europe-west1 (Belgien) / Cloudflare DE**. Der **Konzern-Sitz** mancher Anbieter (Supabase US/SG, Cloudflare/Google US-Mutter) begründet dennoch eine potenzielle Drittland-*Berührung* auf Vertrags-/Support-Ebene → deshalb sind die DPA + SCC/DPF dieser Anbieter erforderlich, auch wenn die Nutzdaten die EU nicht verlassen.

---

## 2. Detailblöcke je Dienst

### 1 — Supabase (Auth · Postgres-DB · Storage/Realtime · Edge Functions)
- **Rechtsträger:** Supabase, Inc. (Delaware, USA); operativer Betrieb über Supabase Pte. Ltd. (Singapur).
- **Drittland:** Ja (Konzern-Entität US/SG). **Aber:** gewählte Projekt-Region = **EU (Frankfurt)** → Nutzdaten-at-rest in der EU.
- **Transfergrundlage:** Standardvertragsklauseln (EU) 2021/914 + UK-Addendum + Transfer Impact Assessment. **Supabase ist nicht DPF-zertifiziert** und stützt sich ausdrücklich auf SCC.
- **Datenkategorien:** Auth-Identität (`auth.users`), User-UUID, E-Mail, Anzeigename, `profiles`, `subscriptions` (Plan/Status), `expo_push_token`.
- **Zweck:** Nutzerkonto, Login (E-Mail + Google OAuth), Subscription-Tabelle, Realtime-Sync, serverseitige Edge Functions (Stripe-/RevenueCat-Webhook, delete-account).
- **DPA-URL:** https://supabase.com/legal/dpa (PDF: https://supabase.com/downloads/docs/Supabase+DPA+250314.pdf · TIA: https://supabase.com/downloads/docs/Supabase+TIA+250314.pdf)
- **Status:** ☐ DPA akzeptiert/unterzeichnet (Datum: __________)

### 2 — Stripe (Desktop-Zahlungsabwicklung)
- **Rechtsträger (EU-Kunden):** Stripe Payments Europe, Ltd., Dublin, Irland. Konzernmutter: Stripe, Inc. (USA).
- **Drittland:** EU-Vertragspartner (Irland) — US-Verarbeitung im Konzern möglich.
- **Transfergrundlage:** Stripe, Inc. ist **EU-US-DPF-zertifiziert**; DPA enthält zusätzlich SCC (Data Transfers Addendum).
- **Datenkategorien:** Stripe-Customer-ID, Subscription-ID, Plan, Abrechnungszeitraum, Zahlungsbelege. **FIANO sieht keine Kreditkartennummern** (PAN ausschließlich bei Stripe).
- **Zweck:** Desktop-Abowicklung (Creator/Pro Monats-Abo, Studio Lifetime Einmalzahlung), Kunden-Portal, Kündigung, Account-Löschung (Customer-Delete).
- **DPA-URL:** https://stripe.com/legal/dpa (DPF-Policy: https://stripe.com/legal/data-privacy-framework)
- **Status:** ☐ DPA akzeptiert (Annahme über Stripe-ToS / Dashboard — siehe § 4)

### 3 — RevenueCat (Mobile-IAP-Abwicklung / Entitlement-Sync)
- **Rechtsträger:** RevenueCat, Inc., USA.
- **Drittland:** Ja (USA).
- **Transfergrundlage:** SCC im RevenueCat-DPA. **DPF-Status zum Stand 2026-06 nicht bestätigt** → vor Go-Live auf dataprivacyframework.gov prüfen; bis dahin gilt SCC als Grundlage.
- **Datenkategorien:** `app_user_id` (= Supabase-User-UUID; die App ruft `Purchases.logIn(userId)`), Entitlement-Status (`creator`/`pro`), Store-Transaktions-/Produkt-IDs.
- **Zweck:** Verwaltung der Android-In-App-Käufe, Entitlement-Sync via `revenuecat-webhook` Edge Function → `subscriptions`-Tabelle.
- **DPA-URL:** https://www.revenuecat.com/dpa (GDPR-Übersicht: https://www.revenuecat.com/gdpr · Subprozessoren: https://www.revenuecat.com/security-and-compliance)
- **Status:** ☐ DPA akzeptiert (Datum: __________)

### 4 — Google Play Billing (Mobile-Zahlung)
- **Rechtsträger:** Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland (EU-Vertragspartner); Google LLC (USA).
- **Drittland:** EU-Vertragspartner — US-Konzernverarbeitung möglich.
- **Transfergrundlage:** Google LLC **DPF-zertifiziert**; SCC über das Cloud/Google Data Processing Addendum.
- **Datenkategorien:** Kaufabwicklung, Store-Kaufdaten, Abo-Status. **Karten-/Zahlungsdaten verbleiben bei Google** — FIANO erhält nur den Abo-/Entitlement-Status (über RevenueCat).
- **Zweck:** Pflicht-Zahlungsweg für In-App-Subscriptions in der Android-App.
- **DPA-URL:** https://cloud.google.com/terms/data-processing-addendum · Developer Distribution Agreement: https://play.google.com/about/developer-distribution-agreement.html
- **Status:** ☐ akzeptiert mit Annahme der Play Developer Distribution Agreement (Play Console)

### 5 — Cloudflare R2 (temporärer Render-Storage)
- **Rechtsträger:** Cloudflare Germany GmbH (EU-Vertragspartner); Cloudflare, Inc. (USA).
- **Drittland:** EU-Vertragspartner (DE) — US-Konzern.
- **Transfergrundlage:** Cloudflare, Inc. **DPF-zertifiziert**; Customer DPA enthält SCC.
- **Datenkategorien:** Hochgeladene Quellvideos (`sources/{userId}/{projectId}/…`) + gerenderte Outputs (`outputs/{userId}/…`). **Temporär:** Source-Uploads werden auto-gelöscht (Lifecycle `sources/* > 7 Tage`; signierte Upload-URL 1 h, Download-URL 24 h).
- **Zweck:** Zwischenspeicher für den Cloud-Render-Workflow (Mobile lädt Source nach R2, Worker holt sie, schreibt Output zurück).
- **DPA-URL:** https://www.cloudflare.com/cloudflare-customer-dpa/
- **Status:** ☐ DPA akzeptiert (Datum: __________)

### 6 — Google Cloud Run (Render-Worker)
- **Rechtsträger:** Google Ireland Limited (EU-Vertragspartner); Google LLC (USA).
- **Drittland:** Compute-**Region = europe-west1 (Belgien, EU)**; Konzern US.
- **Transfergrundlage:** Google LLC **DPF-zertifiziert**; CDPA mit SCC.
- **Datenkategorien:** Videoinhalte **flüchtig während der Verarbeitung** (Download nach `/tmp`, ffmpeg-Pass-1/-2, Upload zurück nach R2), Job-Metadaten, User-JWT zur Auth. Kein dauerhafter Inhalts-Speicher auf dem Worker.
- **Zweck:** Serverseitiges Video-Rendering (Layout, Effekte, Untertitel-PNG-Overlay), yt-dlp-Download, Whisper-Proxy.
- **DPA-URL:** https://cloud.google.com/terms/data-processing-addendum
- **Status:** ☐ DPA akzeptiert (Datum: __________)

### 7 — Firebase Cloud Messaging / Google (Push, nur Android)
- **Rechtsträger:** Google Ireland Limited (EU-Vertragspartner); Google LLC (USA).
- **Drittland:** EU-Vertragspartner — US-Konzern.
- **Transfergrundlage:** Google LLC **DPF-zertifiziert**; Firebase Data Processing & Security Terms mit SCC.
- **Datenkategorien:** Expo-/FCM-Push-Token, geräteseitiger Push-Identifier. Kein Nachrichten-Tracking, keine Analytics-SDKs aktiv.
- **Zweck:** Versand von Push-Benachrichtigungen (z. B. „Render fertig") an Android-Geräte. **Nur Android — kein iOS.**
- **DPA-URL:** https://firebase.google.com/terms/data-processing-terms
- **Status:** ☐ DPA akzeptiert (mit Google-Cloud-/Firebase-Annahme)

### 8 — Expo / EAS (650 Industries Inc.)
- **Rechtsträger:** 650 Industries, Inc., USA.
- **Drittland:** Ja (USA).
- **Transfergrundlage:** SCC (Modul 1, EU-Kommission C/2021/3972); 650 Industries gibt zusätzlich DPF-Compliance an — **vor Akzeptanz auf dataprivacyframework.gov verifizieren**.
- **Datenkategorien:** Build-Metadaten, EAS-Update-Auslieferungs-Telemetrie, ggf. Crash-Logs (App-/Geräteinfos ohne Nutzerinhalte).
- **Zweck:** Native App-Builds + Over-the-Air-Updates (`eas build`, `eas update --branch preview`).
- **DPA-URL:** Kein Self-Service-DPA-PDF öffentlich; Grundlage = Expo Terms of Service (https://expo.dev/terms) + GDPR-Doku (https://docs.expo.dev/regulatory-compliance/gdpr/). **DPA bei Bedarf über privacy@expo.dev / Privacy-Kontaktformular anfordern.**
- **Status:** ☐ DPA angefragt/akzeptiert (Datum: __________)

### 9 — Resend (transaktionale E-Mails)
- **Rechtsträger:** Resend, Inc., USA.
- **Drittland:** Ja (USA).
- **Transfergrundlage:** Resend, Inc. **EU-US-DPF-zertifiziert** (inkl. UK-Extension); DPA enthält SCC.
- **Datenkategorien:** E-Mail-Adresse, E-Mail-Inhalt (Konto-Bestätigung, Passwort-Reset, Lösch-/Render-Benachrichtigung). Kein Tracking-Pixel.
- **Zweck:** SMTP-Versand der transaktionalen System-Mails (Supabase-Auth-Mails via Resend-SMTP, Sender `support@fisora.app`).
- **DPA-URL:** https://resend.com/legal/dpa (Subprozessoren: https://resend.com/legal/subprocessors)
- **Status:** ☐ DPA akzeptiert (Datum: __________)

### 10 + 11 — OpenAI (Whisper) & Google Gemini — **BYOK (Auftragsverarbeiter des NUTZERS)**
> **Rechtliche Klarstellung (wichtig):** Fisora verwendet ein **„Bring-your-own-key"-Modell.** Der **Nutzer** gibt seinen **eigenen** OpenAI- bzw. Gemini-API-Key ein. Dadurch werden **OpenAI und Google zu Auftragsverarbeitern DES NUTZERS**, nicht von FIANO. FIANO schließt für diese Verarbeitung **keinen** eigenen Art.-28-Vertrag und ist insoweit **nicht Verantwortlicher**.
>
> - Der API-Key wird **nie persistiert**: Desktop = OS-Keychain (Electron `safeStorage`), Mobile = `expo-secure-store`. Der Cloud-Worker erhält den Key nur **transient pro Transkriptions-Request** und verwirft ihn nach dem Call (kein Logging, keine Speicherung).
> - FIANO **leitet** die Audiodaten (Whisper) bzw. Prompt/Referenzbild (Gemini) lediglich **durch** — als technischer Vermittler. Die inhaltliche Verarbeitung verantwortet der jeweilige KI-Anbieter gegenüber dem Nutzer.
> - Transparenz gegenüber dem Nutzer ist in der Hilfe/Datenschutzerklärung umgesetzt („Audio-/Bildinhalte werden direkt an OpenAI bzw. Google gesendet; deren Datenschutzbestimmungen gelten").
>
> - **OpenAI DPA (zur Info):** https://openai.com/policies/data-processing-addendum/ — OpenAI, L.L.C. (US) / OpenAI Ireland Ltd.; DPF anerkannt + SCC.
> - **Gemini API Additional Terms (zur Info):** https://ai.google.dev/gemini-api/terms — Google LLC / Google Ireland Limited; DPF + CDPA.
> - **Status:** ☐ Kein eigener DPA durch FIANO nötig — **nur Transparenz-Hinweis im Produkt sicherstellen** (erledigt: Datenschutzerklärung §§ KI-Dienste).

### 12 — Formspree (Webseiten-Kontaktformular)
- **Rechtsträger:** Formspree, Inc., USA.
- **Drittland:** Ja (USA).
- **Transfergrundlage:** Lt. Anbieterangabe DPF + SCC. **Kein sauber öffentlich verlinktes DPA-PDF** auffindbar — Grundlage über Security-/Legal-Seite bzw. auf Anfrage.
- **Datenkategorien:** Name, E-Mail, Nachrichtentext aus dem Kontaktformular auf fisora.app.
- **Zweck:** Entgegennahme von Kontaktanfragen über die Marketing-Webseite.
- **DPA-URL:** https://formspree.io/legal/dpa/ (falls 404 → https://formspree.io/security/ bzw. DPA per security@formspree.io anfordern)
- **Status:** ☐ DPA angefragt/akzeptiert (Datum: __________)

### 13 — jsDelivr / Cloudflare CDN (Webseiten-Bibliotheken)
- **Rechtsträger:** jsDelivr (Open-Source-Projekt; Auslieferung über Fastly/Cloudflare/GCore-PoPs). Cloudflare-Anteil = Cloudflare Germany GmbH / Cloudflare, Inc.
- **Drittland:** Möglich (CDN-PoP-abhängig; oft EU, aber nicht garantiert).
- **Transfergrundlage:** Reines CDN — es wird beim Asset-Abruf die **IP-Adresse** des Webseitenbesuchers übertragen. **Empfehlung:** Bibliotheken selbst hosten (auf fisora.app) → entfällt komplett; alternativ ausschließlich über Cloudflare ausliefern und unter dem Cloudflare-DPA (§ 5) führen.
- **Datenkategorien:** IP-Adresse, User-Agent (technisch notwendig beim Abruf).
- **Zweck:** Auslieferung statischer JS/CSS-Bibliotheken der Webseite.
- **DPA-URL:** jsDelivr ohne klassischen Auftragsverarbeiter-DPA. Cloudflare-Anteil: https://www.cloudflare.com/cloudflare-customer-dpa/
- **Status:** ☐ geprüft — Empfehlung: Self-Hosting (Datum: __________)

---

## 3. Sonderfall BYOK — warum OpenAI & Gemini *keine* FIANO-Auftragsverarbeiter sind

Bei Whisper-Transkription und Gemini-Thumbnails nutzt der Endnutzer seinen **eigenen** API-Key. FIANO ist hier **technischer Durchleiter**, nicht Auftraggeber der KI-Verarbeitung:

1. Der Schlüssel wird **client-seitig verschlüsselt** gespeichert (OS-Keychain / SecureStore) und **nie** in einer FIANO-Datenbank abgelegt.
2. Beim Cloud-Render wird der OpenAI-Key **transient** an den Worker übergeben, ausschließlich für den einen Whisper-Call verwendet und danach verworfen — **kein Logging, keine Persistenz**.
3. Vertragsverhältnis besteht zwischen **Nutzer ↔ OpenAI/Google**, nicht FIANO ↔ OpenAI/Google.

**Pflicht von FIANO:** ausschließlich **Transparenz** (Aufklärung in Datenschutzerklärung/Hilfe, dass Inhalte an den KI-Anbieter gehen und dessen Bedingungen gelten) — kein eigener Art.-28-Vertrag erforderlich. Diese Nuance ist im ROPA (Tätigkeit Nr. 5) ebenfalls dokumentiert.

---

## 4. Anleitung — „Wie akzeptiere ich die DPA bei jedem Anbieter?"

> Die meisten modernen SaaS-DPAs gelten **automatisch mit Annahme der ToS** oder per **Self-Service-Klick/Signatur im Dashboard**. Konkret pro Anbieter:

| Dienst | Weg zur DPA-Annahme |
|---|---|
| **Supabase** | DPA wird über ein PandaDoc-Dokument unterzeichnet, verlinkt auf https://supabase.com/legal/dpa. Ausfüllen (Firmenname/Anschrift FIANO e.U.) + signieren. PDF-Kopie archivieren. |
| **Stripe** | DPA ist Bestandteil der Stripe Services Agreement und gilt **automatisch** mit Kontonutzung. Optional: Dashboard → Settings → Legal/Compliance → DPA einsehen/akzeptieren. DPF-Policy zusätzlich auf stripe.com/legal/data-privacy-framework. |
| **RevenueCat** | DPA unter revenuecat.com/dpa. In der Regel per Reference in den ToS akzeptiert; bei Bedarf gegengezeichnete Fassung über den Account/Support anfordern. |
| **Google Play Billing** | Mit Annahme der **Play Developer Distribution Agreement** + Google/Cloud DPA in der Play Console abgedeckt. Keine separate Signatur nötig. |
| **Cloudflare R2** | Dashboard → Account Home → **Legal/Compliance Documents** → „Data Processing Addendum" als akzeptiert markieren (Self-Service-Klick). Bestätigung speichern. |
| **Google Cloud Run** | CDPA gilt automatisch mit Annahme der Google Cloud Terms. Optional Console → IAM & Admin → Settings / Legal → DPA bestätigen. Region bereits auf europe-west1 gesetzt. |
| **Firebase (FCM)** | Über die Google-Cloud-/Firebase-Annahme (Firebase Data Processing & Security Terms) automatisch mit abgedeckt. |
| **Expo / EAS** | Kein Self-Service-DPA. Geltung über die ToS (expo.dev/terms). Bei Bedarf signierte DPA per **privacy@expo.dev** / Privacy-Kontaktformular anfordern. |
| **Resend** | DPA unter resend.com/legal/dpa; ausgeführte Fassung anschließend **über das Resend-Dashboard** abrufbar. Allgemeine Subprozessor-Autorisierung mit Annahme. |
| **OpenAI / Gemini** | **Kein FIANO-DPA nötig** (BYOK — Verarbeiter des Nutzers). Nur Transparenz-Hinweis im Produkt sicherstellen. |
| **Formspree** | Über Security-/Legal-Seite (formspree.io/security) bzw. DPA per **security@formspree.io** anfordern. |
| **jsDelivr / CDN** | Kein klassischer DPA. Empfehlung: Bibliotheken **selbst hosten** → Punkt entfällt. |

---

## 5. EU-US-DPF-Zertifizierung — Pflicht-Verifikation

Für jeden Anbieter, der sich auf das **EU-US Data Privacy Framework** stützt (oben: Stripe, Cloudflare, Google/Firebase/Play, Resend; sowie OpenAI/Gemini im BYOK-Kontext), ist die aktive Zertifizierung **vor Produktivbetrieb zu prüfen** und periodisch (mind. jährlich) zu re-validieren:

1. Aufruf der offiziellen Liste: **https://www.dataprivacyframework.gov/list**
2. Suche nach dem **exakten US-Rechtsträger** (z. B. „Stripe, Inc.", „Cloudflare, Inc.", „Google LLC", „Resend, Inc.").
3. Prüfen, dass der Status **„Active"** ist und der **„EU-US DPF"** (ggf. UK-Extension / Swiss-US) abgedeckt ist.
4. Ergebnis + Prüfdatum in der Status-Spalte oben dokumentieren.

> **Achtung — nicht DPF-gestützt:** **Supabase** (nur SCC + TIA) und **RevenueCat** (DPF-Status 2026-06 unbestätigt) sowie **Expo/650 Industries** (vorrangig SCC). Für diese ist die **SCC-Grundlage** maßgeblich — die DPF-Liste hilft hier nicht; stattdessen das unterzeichnete DPA mit SCC-Anhang archivieren. Sollte ein bisher DPF-zertifizierter Anbieter von der Liste fallen, **greift automatisch die SCC-Klausel** im jeweiligen DPA (alle obigen DPAs enthalten SCC als Fallback) — der Transfer bleibt damit rechtlich abgesichert.

---

## 6. Drittland-kritische Dienste (Zusammenfassung für die Risikobetrachtung)

**Reine USA-Verarbeitung / -Entität (höchste Drittland-Sensibilität):**
- **RevenueCat** (US, DPF unbestätigt → SCC) — verarbeitet Supabase-UUID + Kaufstatus.
- **Expo / 650 Industries** (US, SCC) — Build-/Update-Telemetrie.
- **Resend** (US, DPF) — E-Mail-Adresse + Inhalt.
- **Formspree** (US, DPF/SCC) — Kontaktformular-PII.
- **Supabase** (US/SG-Entität, **SCC, kein DPF**) — Kern-Identitätsdaten; *aber Daten-at-rest in Frankfurt/EU.*

**EU-Vertragspartner mit möglicher US-Konzernberührung (mittlere Sensibilität):**
- **Stripe** (IE-Vertrag, US-DPF), **Cloudflare R2** (DE-Vertrag, US-DPF), **Google Cloud Run / Play / FCM** (IE-Vertrag, US-DPF) — Nutzdaten überwiegend in EU-Regionen.

**BYOK — kein FIANO-Drittlandtransfer als Verantwortlicher:** OpenAI, Gemini (Verarbeiter des Nutzers).

---

## 7. Offene To-dos (Stand 2026-06-05)
- ☐ Supabase-DPA via PandaDoc signieren + TIA ablegen.
- ☐ RevenueCat-DPA gegenzeichnen; DPF-Status erneut prüfen (war 2026-06 offen).
- ☐ Cloudflare-R2-DPA im Dashboard akzeptieren **und** Lifecycle-Rule `sources/* > 7 Tage` aktiv schalten (derzeit als TODO offen — siehe ROPA Nr. 4).
- ☐ Expo-DPA per privacy@expo.dev anfordern.
- ☐ Resend-DPA akzeptieren + DKIM für `fisora.app` verifizieren.
- ☐ Formspree-DPA anfordern (oder Kontaktformular-Alternative prüfen).
- ☐ jsDelivr: Webseiten-Bibliotheken auf Self-Hosting umstellen (Drittland-IP-Transfer vermeiden).
- ☐ DPF-Liste (dataprivacyframework.gov) für alle DPF-Anbieter dokumentiert prüfen + Prüfdatum eintragen.

---

> **Disclaimer:** Dieses Dokument ist eine technisch-organisatorische Arbeitshilfe und **ersetzt keine Rechtsberatung.** Rechtsträger, Sitz, Transfergrundlagen und DPA-URLs der Anbieter können sich ändern (insb. DPF-Zertifizierungen). Stand der Recherche: **2026-06-05**. Vor Produktivbetrieb/Veröffentlichung wird die **finale Prüfung durch eine Rechtsanwältin/einen Rechtsanwalt bzw. die WKO (Wirtschaftskammer Österreich, Gründer-/Datenschutz-Service)** dringend empfohlen.

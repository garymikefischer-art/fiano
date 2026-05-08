import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { FianoLogo } from '../components/FianoLogo';
import { useT } from '../lib/i18n';

/**
 * Legal-Page für fiano (Phase 6.4).
 *
 * Vier Sub-Pages: Impressum, Privacy/Datenschutz, Terms/AGB, Licenses + Trademarks.
 * Erreichbar via /legal/:doc?  (default: imprint).
 *
 * Sprache: Deutsch ist die rechtsverbindliche Sprache (Anbieter-Sitz Österreich).
 * Englische Übersetzung als Service-Translation, nicht-rechtsbindend. User kann
 * via Toggle wechseln.
 *
 * Diese Seite ist auch ohne Login zugänglich (DSGVO-Pflicht für EU-User).
 */

type LegalDoc = 'imprint' | 'privacy' | 'terms' | 'licenses';
type LegalLang = 'de' | 'en';

const VALID_DOCS: LegalDoc[] = ['imprint', 'privacy', 'terms', 'licenses'];

export function LegalPage() {
  const { doc: routeDoc } = useParams<{ doc?: string }>();
  const navigate = useNavigate();
  const t = useT();
  const doc = (VALID_DOCS as string[]).includes(routeDoc ?? '') ? (routeDoc as LegalDoc) : 'imprint';

  // Default-Lang: DE. User-Override per localStorage persistiert.
  const [lang, setLangState] = useState<LegalLang>(() => {
    try {
      const stored = window.localStorage.getItem('fiano:legal:lang');
      if (stored === 'de' || stored === 'en') return stored;
    } catch { /* ignore */ }
    return 'de';
  });
  const setLang = (l: LegalLang) => {
    try { window.localStorage.setItem('fiano:legal:lang', l); } catch { /* ignore */ }
    setLangState(l);
  };

  // Bei Doc-Wechsel zum Top scrollen
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [doc]);

  return (
    <div className="relative h-full flex flex-col bg-fiano-black overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="fiano-bg-tint" />
        <div className="fiano-bg-glow" />
      </div>

      <div className="relative h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-7">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition">
              <FianoLogo className="h-9 w-auto" />
              <span className="text-[12px] text-zinc-500 uppercase tracking-[0.18em] font-semibold">{t('legal.title')}</span>
            </Link>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(['de', 'en'] as LegalLang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={clsx(
                    'text-[10px] font-semibold px-2.5 py-1 rounded-md transition',
                    lang === l
                      ? 'bg-fiano-red/15 border border-fiano-red/40 text-white'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-Page Tabs */}
          <div className="flex gap-1 p-1 mb-7 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            {VALID_DOCS.map((d) => (
              <button
                key={d}
                onClick={() => navigate(`/legal/${d}`)}
                className={clsx(
                  'flex-1 text-[11px] font-medium py-2 rounded-lg transition',
                  doc === d
                    ? 'bg-fiano-red/15 border border-fiano-red/40 text-white shadow-[0_0_12px_rgba(255,16,57,0.18)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent',
                )}
              >
                {t(`legal.tab.${d}`)}
              </button>
            ))}
          </div>

          {/* Inhalt */}
          <div className="glass p-8 rounded-2xl">
            {lang === 'en' && doc !== 'imprint' && (
              <div className="text-[10px] text-amber-300/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2 mb-6">
                {t('legal.translationDisclaimer')}
              </div>
            )}
            {doc === 'imprint'  && <ImprintContent  lang={lang} />}
            {doc === 'privacy'  && <PrivacyContent  lang={lang} />}
            {doc === 'terms'    && <TermsContent    lang={lang} />}
            {doc === 'licenses' && <LicensesContent lang={lang} />}
          </div>

          {/* Back-Link */}
          <div className="mt-6 text-center">
            <Link to="/" className="text-[11px] text-zinc-500 hover:text-zinc-300 underline-offset-4 hover:underline transition">
              ← {t('legal.backToApp')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inhalts-Komponenten ─────────────────────────────────────────────── */

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[20px] font-semibold tracking-tight text-zinc-100 mb-4">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[14px] font-semibold text-zinc-200 mt-6 mb-2">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-zinc-400 leading-relaxed mb-3">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="text-[12px] text-zinc-400 leading-relaxed mb-3 ml-5 list-disc space-y-1">{children}</ul>;
}
function HR() {
  return <hr className="my-5 border-white/[0.06]" />;
}
function Updated({ date }: { date: string }) {
  return <div className="text-[10px] text-zinc-600 italic mb-4">{date}</div>;
}

/* ─── Impressum ────────────────────────────────────────────────────────── */

function ImprintContent({ lang }: { lang: LegalLang }) {
  // Impressum ist nur in DE rechtsverbindlich (österreichisches Recht).
  // Die EN-Variante ist hier ohne Disclaimer weil kein Long-Form-Text der
  // missverstanden werden könnte — nur Kontaktdaten.
  return (
    <div>
      <H1>{lang === 'de' ? 'Impressum' : 'Legal Notice / Imprint'}</H1>
      <Updated date={lang === 'de' ? 'Stand: 8. Mai 2026' : 'Last updated: May 8, 2026'} />

      <P>{lang === 'de' ? 'Informationen über den Diensteanbieter:' : 'Information about the service provider:'}</P>

      <H2>{lang === 'de' ? 'Anbieter' : 'Provider'}</H2>
      <P>
        Werbeagentur FIANO e.U.<br />
        Gary Fischer<br />
        Hohenthurn 52<br />
        9602 Hohenthurn<br />
        {lang === 'de' ? 'Österreich' : 'Austria'}
      </P>
      <P>
        Tel.: <a href="tel:+436502720108" className="text-fiano-red hover:underline">+43 650 272 0108</a><br />
        E-Mail: <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>
      </P>

      <H2>{lang === 'de' ? 'Firmenbuch' : 'Commercial Register'}</H2>
      <P>
        {lang === 'de' ? 'Firmenbuchnummer' : 'Company register number'}: FN 640653 m<br />
        {lang === 'de' ? 'Firmenbuchgericht' : 'Register court'}: Landesgericht Klagenfurt<br />
        {lang === 'de' ? 'Firmensitz' : 'Registered office'}: Hohenthurn, Österreich<br />
        {lang === 'de' ? 'Unternehmensgegenstand' : 'Business purpose'}: {lang === 'de' ? 'Werbeagentur' : 'Advertising agency'}<br />
        GLN: 9110036897848
      </P>

      <H2>{lang === 'de' ? 'Berufsrechtliche Angaben' : 'Professional Information'}</H2>
      <P>
        {lang === 'de' ? 'Mitglied bei' : 'Member of'}: WKO ({lang === 'de' ? 'Wirtschaftskammer Österreich' : 'Austrian Chamber of Commerce'})<br />
        {lang === 'de' ? 'Berufsrecht' : 'Professional regulations'}: {lang === 'de' ? 'Werbeagentur' : 'Advertising agency'}, {lang === 'de' ? 'Fachgruppe Werbung und Marktkommunikation' : 'Trade group Advertising & Market Communication'}<br />
        {lang === 'de' ? 'Verleihungsstaat' : 'State of award'}: {lang === 'de' ? 'Österreich' : 'Austria'}<br />
        {lang === 'de' ? 'Aufsichtsbehörde' : 'Supervisory authority'}: Bezirkshauptmannschaft Villach-Land
      </P>

      <H2>{lang === 'de' ? 'Datenschutz-Verantwortlicher' : 'Data Protection Responsible'}</H2>
      <P>
        Gary Fischer<br />
        Hohenthurn 52, 9602 Hohenthurn, {lang === 'de' ? 'Österreich' : 'Austria'}<br />
        E-Mail: <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a><br />
        Tel.: +43 650 272 0108
      </P>

      <H2>{lang === 'de' ? 'EU-Streitbeilegung' : 'EU Dispute Resolution'}</H2>
      <P>
        {lang === 'de'
          ? <>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">https://ec.europa.eu/consumers/odr</a>. Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</>
          : <>The European Commission provides an Online Dispute Resolution (ODR) platform: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">https://ec.europa.eu/consumers/odr</a>. We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.</>
        }
      </P>

      <H2>{lang === 'de' ? 'Bildernachweis' : 'Image Credits'}</H2>
      <P>
        {lang === 'de'
          ? 'Die Bilder, Fotos und Grafiken auf dieser Webseite sind urheberrechtlich geschützt. Die Bilderrechte liegen bei: Fotograf Gary Fischer / FIANO.'
          : 'Images, photos and graphics on this website are protected by copyright. Image rights held by: Photographer Gary Fischer / FIANO.'}
      </P>

      <H2>{lang === 'de' ? 'Weitere Online-Auftritte' : 'Other Online Presences'}</H2>
      <P>{lang === 'de' ? 'Dieses Impressum gilt auch für:' : 'This imprint also applies to:'}</P>
      <UL>
        <li><a href="https://www.instagram.com/werbeagenturfiano/" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">instagram.com/werbeagenturfiano</a></li>
        <li><a href="https://www.tiktok.com/@werbeagentur.fiano" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">tiktok.com/@werbeagentur.fiano</a></li>
        <li><a href="https://www.youtube.com/@werbeagenturfiano" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">youtube.com/@werbeagenturfiano</a></li>
        <li><a href="https://www.fiano.at/impressum" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">fiano.at/impressum</a></li>
      </UL>

      <HR />
      <P><span className="text-zinc-600 italic text-[10px]">{lang === 'de' ? 'Alle Texte sind urheberrechtlich geschützt.' : 'All texts are protected by copyright.'}</span></P>
    </div>
  );
}

/* ─── Privacy / Datenschutz ────────────────────────────────────────────── */

function PrivacyContent({ lang }: { lang: LegalLang }) {
  if (lang === 'de') return <PrivacyDE />;
  return <PrivacyEN />;
}

function PrivacyDE() {
  return (
    <div>
      <H1>Datenschutzerklärung</H1>
      <Updated date="Stand: 8. Mai 2026" />

      <P>
        Wir nehmen den Schutz deiner persönlichen Daten ernst und behandeln sie vertraulich gemäß der EU-Datenschutz-Grundverordnung (DSGVO) sowie dem österreichischen Datenschutzgesetz.
      </P>

      <H2>1. Verantwortlicher</H2>
      <P>
        Werbeagentur FIANO e.U., Gary Fischer<br />
        Hohenthurn 52, 9602 Hohenthurn, Österreich<br />
        E-Mail: <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>
      </P>

      <H2>2. Welche Daten wir verarbeiten</H2>
      <P><strong className="text-zinc-300">Konto-Daten</strong> (über Supabase, EU-Server in Frankfurt):</P>
      <UL>
        <li>E-Mail-Adresse (für Login und Account-Verwaltung)</li>
        <li>Verschlüsseltes Passwort (Argon2-Hash, niemals im Klartext gespeichert)</li>
        <li>Optional: Name & Avatar bei Google-OAuth-Login</li>
        <li>Erstellungs- und Login-Zeitstempel</li>
      </UL>
      <P><strong className="text-zinc-300">Subscription-Daten</strong> (über Stripe, Sitz Irland für EU-Kunden):</P>
      <UL>
        <li>Stripe-Kundennummer (zur Plan-Verwaltung)</li>
        <li>Plan-Status und Subscription-Periode</li>
        <li>Zahlungsdaten werden ausschließlich von Stripe verarbeitet — fiano sieht keine Kreditkartennummern</li>
      </UL>
      <P><strong className="text-zinc-300">Lokale App-Daten</strong> (auf deinem Gerät):</P>
      <UL>
        <li>Auth-Session (verschlüsselt im OS-Keychain via Electron safeStorage)</li>
        <li>Projekt-Dateien, generierte Clips, Thumbnails — alles bleibt auf deinem Computer</li>
        <li>App-Einstellungen und API-Keys (verschlüsselt via Electron safeStorage)</li>
      </UL>

      <H2>3. Nutzung externer KI-Dienste (BYO-Key)</H2>
      <P>
        fiano nutzt das "Bring-Your-Own-Key"-Prinzip: Du verwendest deine eigenen API-Keys für OpenAI (Whisper, TTS) und Google Gemini (Thumbnails). Wenn du diese Funktionen nutzt:
      </P>
      <UL>
        <li>Audio- und Bildinhalte werden direkt von deinem Gerät an OpenAI bzw. Google gesendet</li>
        <li>fiano leitet keine Daten weiter und speichert keine Inhalte serverseitig</li>
        <li>Es gelten die Datenschutzbestimmungen von <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">OpenAI</a> und <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">Google</a></li>
        <li>Du kannst diese Funktionen optional deaktivieren, indem du keinen API-Key hinterlegst</li>
      </UL>

      <H2>4. Cookies und Tracking</H2>
      <P>
        fiano ist eine Desktop-App und nutzt keine Cookies, kein Tracking und kein Analytics. Die App-Telemetrie ist deaktiviert.
      </P>

      <H2>5. E-Mail-Versand</H2>
      <P>
        Für Account-bezogene E-Mails (Bestätigung, Passwort-Reset) nutzen wir Resend (Sitz USA) als SMTP-Provider. Es werden ausschließlich deine E-Mail-Adresse und der E-Mail-Inhalt verarbeitet, kein Tracking-Pixel oder ähnliches.
      </P>

      <H2>6. Rechtsgrundlagen</H2>
      <UL>
        <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> — Vertragserfüllung (Bereitstellung der App-Funktionen)</li>
        <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong> — Berechtigtes Interesse (Account-Sicherheit, Missbrauchsprävention)</li>
        <li><strong>Art. 6 Abs. 1 lit. a DSGVO</strong> — Einwilligung (z.B. bei Newsletter, falls angeboten)</li>
      </UL>

      <H2>7. Speicherdauer</H2>
      <UL>
        <li>Konto-Daten werden gespeichert, solange dein Konto aktiv ist</li>
        <li>Bei Konto-Löschung werden alle Konto-Daten unwiderruflich entfernt (binnen 30 Tagen)</li>
        <li>Stripe behält Zahlungs-Belege gemäß gesetzlicher Aufbewahrungsfristen (7 Jahre)</li>
        <li>Lokale Dateien bleiben unangetastet auf deinem Gerät</li>
      </UL>

      <H2>8. Deine Rechte</H2>
      <P>Du hast jederzeit das Recht auf:</P>
      <UL>
        <li><strong>Auskunft</strong> über die zu deiner Person gespeicherten Daten (Art. 15 DSGVO)</li>
        <li><strong>Berichtigung</strong> unrichtiger Daten (Art. 16 DSGVO)</li>
        <li><strong>Löschung</strong> deines Kontos und aller Daten (Art. 17 DSGVO) — direkt in der App unter Einstellungen → Konto → Konto löschen</li>
        <li><strong>Datenportabilität</strong> — Export aller deiner Daten als ZIP (Art. 20 DSGVO) — verfügbar unter Einstellungen → Konto → Daten exportieren</li>
        <li><strong>Widerspruch</strong> gegen die Verarbeitung (Art. 21 DSGVO)</li>
        <li><strong>Beschwerde</strong> bei der österreichischen Datenschutzbehörde (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">dsb.gv.at</a>)</li>
      </UL>

      <H2>9. Datensicherheit</H2>
      <UL>
        <li>Alle API-Verbindungen sind TLS-verschlüsselt</li>
        <li>Passwörter werden mit Argon2 gehasht</li>
        <li>Lokale Auth-Sessions sind via OS-Keychain (macOS) bzw. DPAPI (Windows) verschlüsselt</li>
        <li>API-Keys werden nie an unsere Server gesendet — sie bleiben verschlüsselt auf deinem Gerät</li>
      </UL>

      <H2>10. Änderungen dieser Erklärung</H2>
      <P>
        Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn Gesetze oder unsere Funktionen es erfordern. Bei wesentlichen Änderungen informieren wir dich per E-Mail.
      </P>

      <HR />
      <P>
        Bei Fragen zum Datenschutz erreichst du uns unter <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.
      </P>
    </div>
  );
}

function PrivacyEN() {
  return (
    <div>
      <H1>Privacy Policy</H1>
      <Updated date="Last updated: May 8, 2026" />
      <P>
        We take the protection of your personal data seriously and treat it confidentially in accordance with the EU General Data Protection Regulation (GDPR) and the Austrian Data Protection Act.
      </P>

      <H2>1. Data Controller</H2>
      <P>
        Werbeagentur FIANO e.U., Gary Fischer<br />
        Hohenthurn 52, 9602 Hohenthurn, Austria<br />
        Email: <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>
      </P>

      <H2>2. Data We Process</H2>
      <P><strong className="text-zinc-300">Account Data</strong> (via Supabase, EU servers in Frankfurt):</P>
      <UL>
        <li>Email address (for login and account management)</li>
        <li>Encrypted password (Argon2 hash, never stored as plain text)</li>
        <li>Optional: Name & avatar for Google OAuth login</li>
        <li>Creation and login timestamps</li>
      </UL>
      <P><strong className="text-zinc-300">Subscription Data</strong> (via Stripe, Ireland for EU customers):</P>
      <UL>
        <li>Stripe customer ID (for plan management)</li>
        <li>Plan status and subscription period</li>
        <li>Payment data is processed exclusively by Stripe — fiano never sees credit card numbers</li>
      </UL>
      <P><strong className="text-zinc-300">Local App Data</strong> (on your device):</P>
      <UL>
        <li>Auth session (encrypted in OS Keychain via Electron safeStorage)</li>
        <li>Project files, generated clips, thumbnails — all stay on your computer</li>
        <li>App settings and API keys (encrypted via Electron safeStorage)</li>
      </UL>

      <H2>3. Use of External AI Services (BYO-Key)</H2>
      <P>
        fiano follows a "Bring Your Own Key" approach: you use your own API keys for OpenAI (Whisper, TTS) and Google Gemini (thumbnails). When you use these features:
      </P>
      <UL>
        <li>Audio and image content is sent directly from your device to OpenAI or Google</li>
        <li>fiano does not relay any data and stores no content server-side</li>
        <li>The privacy policies of <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">OpenAI</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">Google</a> apply</li>
        <li>You can opt out of these features by not entering an API key</li>
      </UL>

      <H2>4. Cookies and Tracking</H2>
      <P>
        fiano is a desktop application and uses no cookies, no tracking, no analytics. App telemetry is disabled.
      </P>

      <H2>5. Email Sending</H2>
      <P>
        For account-related emails (confirmation, password reset) we use Resend (US-based) as SMTP provider. Only your email address and the email content are processed — no tracking pixels or similar.
      </P>

      <H2>6. Legal Bases</H2>
      <UL>
        <li><strong>Art. 6 (1)(b) GDPR</strong> — Contract performance (providing app features)</li>
        <li><strong>Art. 6 (1)(f) GDPR</strong> — Legitimate interest (account security, abuse prevention)</li>
        <li><strong>Art. 6 (1)(a) GDPR</strong> — Consent (e.g. for newsletter, if offered)</li>
      </UL>

      <H2>7. Storage Duration</H2>
      <UL>
        <li>Account data is stored as long as your account is active</li>
        <li>On account deletion, all account data is irrevocably removed (within 30 days)</li>
        <li>Stripe retains payment records as required by law (7 years)</li>
        <li>Local files remain untouched on your device</li>
      </UL>

      <H2>8. Your Rights</H2>
      <P>You have the right at any time to:</P>
      <UL>
        <li><strong>Access</strong> data stored about you (Art. 15 GDPR)</li>
        <li><strong>Rectification</strong> of incorrect data (Art. 16 GDPR)</li>
        <li><strong>Deletion</strong> of your account and all data (Art. 17 GDPR) — directly in the app under Settings → Account → Delete Account</li>
        <li><strong>Data Portability</strong> — Export of all your data as ZIP (Art. 20 GDPR) — available under Settings → Account → Export Data</li>
        <li><strong>Object</strong> to processing (Art. 21 GDPR)</li>
        <li><strong>Lodge a complaint</strong> with the Austrian Data Protection Authority (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">dsb.gv.at</a>)</li>
      </UL>

      <H2>9. Data Security</H2>
      <UL>
        <li>All API connections are TLS-encrypted</li>
        <li>Passwords are hashed with Argon2</li>
        <li>Local auth sessions are encrypted via OS Keychain (macOS) or DPAPI (Windows)</li>
        <li>API keys are never sent to our servers — they remain encrypted on your device</li>
      </UL>

      <H2>10. Changes to This Policy</H2>
      <P>
        We reserve the right to adjust this privacy policy when laws or our features require it. We will notify you by email of material changes.
      </P>

      <HR />
      <P>
        For privacy questions, reach us at <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.
      </P>
    </div>
  );
}

/* ─── Terms / AGB ─────────────────────────────────────────────────────── */

function TermsContent({ lang }: { lang: LegalLang }) {
  if (lang === 'de') return <TermsDE />;
  return <TermsEN />;
}

function TermsDE() {
  return (
    <div>
      <H1>Allgemeine Geschäftsbedingungen (AGB)</H1>
      <Updated date="Stand: 8. Mai 2026" />

      <H2>1. Geltungsbereich</H2>
      <P>
        Diese AGB regeln die Nutzung der Software fiano (im Folgenden "App") durch dich (im Folgenden "Nutzer") mit der Werbeagentur FIANO e.U. (im Folgenden "Anbieter").
      </P>

      <H2>2. Vertragsgegenstand</H2>
      <P>
        Der Anbieter stellt eine Desktop-Anwendung zur Verfügung, mit der du Videos analysieren, schneiden und für verschiedene Formate aufbereiten kannst. Die App nutzt KI-Dienste über deine eigenen API-Keys (Bring-Your-Own-Key-Prinzip).
      </P>

      <H2>3. Plan-Modelle und Zahlung</H2>
      <UL>
        <li><strong>Creator</strong> (17,99 €/Monat) — eingeschränkter Funktionsumfang, max. 25 Projekte</li>
        <li><strong>Pro</strong> (29,99 €/Monat) — voller Funktionsumfang, unbegrenzte Projekte</li>
        <li><strong>Studio Lifetime</strong> (299 € einmalig) — voller Funktionsumfang inkl. zukünftiger Updates</li>
      </UL>
      <P>
        Zahlungen werden über Stripe (Sitz Irland für EU-Kunden) abgewickelt. Es gelten die dort hinterlegten Zahlungsbedingungen. Alle Preise inkl. ges. MwSt., sofern anwendbar.
      </P>

      <H2>4. Kündigung und Widerrufsrecht</H2>
      <P>
        Subscriptions (Creator, Pro) können jederzeit über den Stripe Customer Portal in der App gekündigt werden. Die Kündigung wirkt zum Ende der laufenden Abrechnungsperiode — bereits gezahlte Beträge werden nicht anteilig zurückerstattet.
      </P>
      <P>
        Studio Lifetime ist eine einmalige Zahlung und nicht zurückerstattbar nach erfolgter Aktivierung des Plans, vorbehaltlich des gesetzlichen Widerrufsrechts.
      </P>
      <P>
        <strong>Widerrufsrecht für Verbraucher</strong>: Du hast das Recht, binnen 14 Tagen ohne Angabe von Gründen zu widerrufen. Mit Beginn der Nutzung der digitalen Inhalte erlischt das Widerrufsrecht jedoch, sofern du dem zugestimmt hast.
      </P>

      <H2>5. Nutzungsrechte</H2>
      <P>
        Mit aktiver Subscription oder Lifetime-Lizenz erhältst du das nicht-exklusive, nicht-übertragbare Recht, die App auf deinen Geräten für eigene oder kommerzielle Zwecke zu nutzen. Reverse Engineering, Weiterverkauf oder Vervielfältigung der App-Software sind untersagt.
      </P>

      <H2>6. Eigene Inhalte und Verantwortung</H2>
      <UL>
        <li>Du bist allein verantwortlich für die Inhalte, die du mit der App verarbeitest</li>
        <li>Du versicherst, dass du über die nötigen Rechte (Urheber-, Persönlichkeits-, Markenrecht) für deine Eingaben und Outputs verfügst</li>
        <li>Verarbeite niemals illegale, rechtswidrige oder rechteverletzende Inhalte mit der App</li>
        <li>Bei Eingabe von Markennamen (z.B. im Custom-Spielname-Feld) trägst du die volle Verantwortung für die markenrechtliche Zulässigkeit</li>
      </UL>

      <H2>7. KI-Dienste (Drittanbieter)</H2>
      <P>
        Die App nutzt KI-Dienste von OpenAI (Whisper, TTS) und Google (Gemini) über deinen eigenen API-Key. Die Outputs dieser Dienste werden direkt von dort generiert — der Anbieter hat keinen Einfluss auf deren Inhalt, Verfügbarkeit oder Korrektheit. Es gelten zusätzlich die Nutzungsbedingungen der jeweiligen Drittanbieter.
      </P>

      <H2>8. Haftungsausschluss</H2>
      <P>
        Die App wird "wie besehen" zur Verfügung gestellt. Der Anbieter haftet nicht für mittelbare Schäden, Datenverlust oder entgangene Gewinne durch die Nutzung der App, soweit gesetzlich zulässig. Die Haftung für leichte Fahrlässigkeit ist ausgeschlossen.
      </P>
      <P>
        Bei grober Fahrlässigkeit oder Vorsatz haftet der Anbieter unbeschränkt. Bei Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt.
      </P>

      <H2>9. Verfügbarkeit und Updates</H2>
      <P>
        Der Anbieter ist bemüht, eine möglichst hohe Verfügbarkeit der Backend-Services (Auth, Subscription) sicherzustellen, garantiert aber keine ständige Verfügbarkeit. Updates der Desktop-App werden über GitHub Releases automatisch oder manuell bereitgestellt.
      </P>

      <H2>10. Änderungen der AGB</H2>
      <P>
        Der Anbieter behält sich vor, diese AGB anzupassen. Wesentliche Änderungen werden mit mindestens 30 Tagen Vorlauf per E-Mail mitgeteilt. Widersprichst du der Änderung, kannst du die Subscription zum Wirksamwerden der Änderung kündigen.
      </P>

      <H2>11. Anwendbares Recht und Gerichtsstand</H2>
      <P>
        Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand für Verbraucher ist deren Wohnsitz, ansonsten der Sitz des Anbieters in Klagenfurt.
      </P>

      <HR />
      <P>
        Bei Fragen zu diesen AGB erreichst du uns unter <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.
      </P>
    </div>
  );
}

function TermsEN() {
  return (
    <div>
      <H1>Terms of Service</H1>
      <Updated date="Last updated: May 8, 2026" />

      <H2>1. Scope</H2>
      <P>
        These Terms govern the use of the fiano software (the "App") by you (the "User") with Werbeagentur FIANO e.U. (the "Provider").
      </P>

      <H2>2. Subject Matter</H2>
      <P>
        The Provider makes available a desktop application that lets you analyze, edit and prepare videos for various formats. The App uses AI services through your own API keys (Bring-Your-Own-Key approach).
      </P>

      <H2>3. Plans and Payment</H2>
      <UL>
        <li><strong>Creator</strong> (€17.99/month) — limited features, up to 25 projects</li>
        <li><strong>Pro</strong> (€29.99/month) — full features, unlimited projects</li>
        <li><strong>Studio Lifetime</strong> (€299 one-time) — full features incl. all future updates</li>
      </UL>
      <P>
        Payments are processed via Stripe (Ireland for EU customers). Their payment terms apply. All prices include applicable VAT where relevant.
      </P>

      <H2>4. Cancellation and Right of Withdrawal</H2>
      <P>
        Subscriptions (Creator, Pro) can be canceled at any time via the Stripe Customer Portal in the App. Cancellation takes effect at the end of the current billing period — already paid amounts are not pro-rated or refunded.
      </P>
      <P>
        Studio Lifetime is a one-time payment and not refundable after plan activation, subject to the statutory right of withdrawal.
      </P>
      <P>
        <strong>Right of Withdrawal for Consumers</strong>: You have the right to withdraw within 14 days without giving reasons. The right of withdrawal expires once you start using the digital content, provided you have agreed to this.
      </P>

      <H2>5. License</H2>
      <P>
        With an active subscription or Lifetime license you receive a non-exclusive, non-transferable right to use the App on your devices for personal or commercial purposes. Reverse engineering, resale or duplication of the App's software is prohibited.
      </P>

      <H2>6. Your Content and Responsibility</H2>
      <UL>
        <li>You are solely responsible for the content you process with the App</li>
        <li>You warrant that you hold the necessary rights (copyright, personality, trademark) for your inputs and outputs</li>
        <li>Never process illegal, unlawful or rights-violating content with the App</li>
        <li>When entering trademarks (e.g. in the custom game name field) you bear full responsibility for trademark compliance</li>
      </UL>

      <H2>7. AI Services (Third Parties)</H2>
      <P>
        The App uses AI services from OpenAI (Whisper, TTS) and Google (Gemini) via your own API key. The outputs of these services are generated directly from them — the Provider has no influence on their content, availability or correctness. The third-party terms of service additionally apply.
      </P>

      <H2>8. Disclaimer of Liability</H2>
      <P>
        The App is provided "as is". The Provider is not liable for indirect damages, data loss or lost profits resulting from use of the App, to the extent permitted by law. Liability for slight negligence is excluded.
      </P>
      <P>
        For gross negligence or intent the Provider is liable without limitation. For breach of essential contractual obligations, liability is limited to the foreseeable, contract-typical damage.
      </P>

      <H2>9. Availability and Updates</H2>
      <P>
        The Provider strives to ensure high availability of backend services (auth, subscription) but does not guarantee constant availability. Desktop app updates are distributed automatically or manually via GitHub Releases.
      </P>

      <H2>10. Changes to These Terms</H2>
      <P>
        The Provider reserves the right to adjust these Terms. Material changes will be communicated by email at least 30 days in advance. If you object to the change, you can cancel the subscription effective at the time the change takes effect.
      </P>

      <H2>11. Applicable Law and Jurisdiction</H2>
      <P>
        Austrian law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Consumer place of jurisdiction is the consumer's domicile; otherwise the Provider's seat in Klagenfurt.
      </P>

      <HR />
      <P>
        For questions about these Terms, reach us at <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.
      </P>
    </div>
  );
}

/* ─── Lizenzen + Marken ────────────────────────────────────────────────── */

function LicensesContent({ lang }: { lang: LegalLang }) {
  return (
    <div>
      <H1>{lang === 'de' ? 'Lizenzen & Markenhinweise' : 'Licenses & Trademark Notices'}</H1>
      <Updated date={lang === 'de' ? 'Stand: 8. Mai 2026' : 'Last updated: May 8, 2026'} />

      <H2>{lang === 'de' ? 'Eingebettete Software (Open Source)' : 'Embedded Software (Open Source)'}</H2>
      <P>
        {lang === 'de'
          ? 'fiano nutzt folgende Open-Source-Komponenten:'
          : 'fiano uses the following open-source components:'}
      </P>
      <UL>
        <li><strong>FFmpeg</strong> — LGPL/GPL ({lang === 'de' ? 'je nach System-Build' : 'depending on system build'}) — <a href="https://ffmpeg.org/legal.html" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">ffmpeg.org/legal</a></li>
        <li><strong>yt-dlp</strong> — Unlicense (Public Domain) — <a href="https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">github.com/yt-dlp</a></li>
        <li><strong>SAM (Segment Anything Model) ONNX</strong> — Apache 2.0 (Meta Platforms, Inc.) — <a href="https://github.com/facebookresearch/segment-anything/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">github.com/facebookresearch/segment-anything</a></li>
        <li><strong>Electron</strong> — MIT — <a href="https://github.com/electron/electron/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">github.com/electron</a></li>
        <li><strong>React</strong>, <strong>Tailwind CSS</strong>, <strong>Zustand</strong>, <strong>react-router-dom</strong> — MIT</li>
        <li><strong>Geist Font</strong> — SIL Open Font License (Vercel) — <a href="https://github.com/vercel/geist-font/blob/main/LICENSE.TXT" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">github.com/vercel/geist-font</a></li>
      </UL>

      <H2>{lang === 'de' ? 'KI-Dienste (Bring-Your-Own-Key)' : 'AI Services (Bring Your Own Key)'}</H2>
      <P>
        {lang === 'de'
          ? 'Folgende externe KI-Dienste werden über deinen eigenen API-Key genutzt — du gehst dabei direkt einen Vertrag mit dem jeweiligen Anbieter ein:'
          : 'The following external AI services are used through your own API key — you enter into a direct contract with the respective provider:'}
      </P>
      <UL>
        <li><strong>OpenAI</strong> (Whisper, TTS, GPT-4o-mini) — <a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">openai.com/policies</a></li>
        <li><strong>Google Gemini</strong> (Flash Image / Nano Banana) — <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">ai.google.dev/terms</a></li>
      </UL>

      <H2>{lang === 'de' ? 'Backend-Dienste' : 'Backend Services'}</H2>
      <UL>
        <li><strong>Supabase</strong> ({lang === 'de' ? 'Auth, Datenbank, Edge Functions' : 'auth, database, Edge Functions'}) — EU-Server (Frankfurt) — <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">supabase.com/privacy</a></li>
        <li><strong>Stripe</strong> ({lang === 'de' ? 'Zahlungen, Kunden-Portal' : 'payments, customer portal'}) — Stripe Payments Europe Ltd., Irland</li>
        <li><strong>Resend</strong> ({lang === 'de' ? 'E-Mail-Versand für Account-Mails' : 'email sending for account mails'}) — <a href="https://resend.com/legal" target="_blank" rel="noopener noreferrer" className="text-fiano-red hover:underline">resend.com/legal</a></li>
      </UL>

      <H2>{lang === 'de' ? 'Markenhinweise' : 'Trademark Notices'}</H2>
      <P>
        {lang === 'de'
          ? 'Alle in der App genannten Marken-, Plattform- oder Spielnamen sind eingetragene Marken ihrer jeweiligen Inhaber und werden ausschließlich zur Beschreibung von Funktionen und Zielformaten verwendet (nominativer Markengebrauch). fiano steht in keinerlei geschäftlicher Verbindung zu diesen Marken oder ihren Inhabern.'
          : 'All brand, platform or game names mentioned in the App are registered trademarks of their respective owners and are used exclusively to describe features and target formats (nominative trademark use). fiano has no commercial affiliation with these brands or their owners.'}
      </P>
      <UL>
        <li><strong>TikTok®</strong> — {lang === 'de' ? 'Marke von ByteDance Ltd.' : 'trademark of ByteDance Ltd.'}</li>
        <li><strong>YouTube®</strong>, <strong>YouTube Shorts®</strong> — {lang === 'de' ? 'Marken von Google LLC' : 'trademarks of Google LLC'}</li>
        <li><strong>Twitch®</strong> — {lang === 'de' ? 'Marke von Twitch Interactive, Inc. (Amazon)' : 'trademark of Twitch Interactive, Inc. (Amazon)'}</li>
        <li><strong>Instagram®</strong> — {lang === 'de' ? 'Marke von Meta Platforms, Inc.' : 'trademark of Meta Platforms, Inc.'}</li>
        <li><strong>{lang === 'de' ? 'Spielenamen' : 'Game names'}</strong> ({lang === 'de' ? 'z.B. eingegeben über das Custom-Game-Feld' : 'e.g. entered via the custom game field'}) — {lang === 'de' ? 'Marken ihrer jeweiligen Studios und Publisher (u.a. Epic Games, Microsoft/Mojang, Take-Two Interactive, Riot Games, Valve, Activision)' : 'trademarks of their respective studios and publishers (including Epic Games, Microsoft/Mojang, Take-Two Interactive, Riot Games, Valve, Activision)'}</li>
      </UL>

      <H2>{lang === 'de' ? 'Hinweis zur Custom-Game-Eingabe' : 'Note on Custom Game Input'}</H2>
      <P>
        {lang === 'de'
          ? 'Wenn du im Thumbnail-Generator eigene Spielnamen eingibst, werden diese unverändert an Google Gemini weitergeleitet. Du bist allein für die markenrechtliche Zulässigkeit der eingegebenen Begriffe und der generierten Inhalte verantwortlich.'
          : 'If you enter your own game names in the thumbnail generator, they are passed unchanged to Google Gemini. You are solely responsible for the trademark compliance of the entered terms and the generated content.'}
      </P>

      <H2>{lang === 'de' ? 'fiano-Marke' : 'fiano Brand'}</H2>
      <P>
        {lang === 'de'
          ? 'Der Name "fiano" sowie das Logo sind Marken der Werbeagentur FIANO e.U.'
          : 'The name "fiano" and the logo are trademarks of Werbeagentur FIANO e.U.'}
      </P>

      <HR />
      <P>
        {lang === 'de'
          ? <>Bei Fragen zu Lizenzen erreichst du uns unter <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.</>
          : <>For licensing questions, reach us at <a href="mailto:office@fiano.at" className="text-fiano-red hover:underline">office@fiano.at</a>.</>}
      </P>
    </div>
  );
}

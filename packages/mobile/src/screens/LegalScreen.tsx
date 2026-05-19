/**
 * LegalScreen — Impressum, Datenschutz & AGB (3-Tab-Switcher).
 *
 * Phase B3.10 (2026-05-19): Inhalt 1:1 vom Desktop LegalPage übernommen
 * (rechtsverbindliche Texte). Plus theme-aware + 3 statt 2 Tabs.
 */

import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { useColors, useResolvedMode } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Legal'>;
type Tab = 'imprint' | 'privacy' | 'terms';

export function LegalScreen() {
  const nav = useNavigation<Nav>();
  const colors = useColors();
  const mode = useResolvedMode();
  const [tab, setTab] = useState<Tab>('imprint');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
      <RNStatusBar
        barStyle={mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg.secondary}
      />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.bg.elevated,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text.primary} />
        </Pressable>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>Rechtliches</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Switcher */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          marginTop: 8,
          padding: 4,
          backgroundColor: colors.bg.elevated,
          borderWidth: 1,
          borderColor: colors.border.subtle,
          borderRadius: 12,
        }}
      >
        <TabButton label="Impressum" active={tab === 'imprint'} onPress={() => setTab('imprint')} />
        <TabButton label="Datenschutz" active={tab === 'privacy'} onPress={() => setTab('privacy')} />
        <TabButton label="AGB" active={tab === 'terms'} onPress={() => setTab('terms')} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 18, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'imprint' && <ImprintContent />}
        {tab === 'privacy' && <PrivacyContent />}
        {tab === 'terms' && <TermsContent />}
        <Text style={{ color: colors.text.muted, fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Stand: 8. Mai 2026
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 9,
        borderRadius: 9,
        backgroundColor: active ? colors.accent.subtle : 'transparent',
        borderWidth: 1,
        borderColor: active ? colors.accent.border : 'transparent',
        alignItems: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: active ? colors.accent.base : colors.text.secondary,
          fontSize: 12,
          fontWeight: active ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function H1({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.text.primary, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
      {children}
    </Text>
  );
}

function H2({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700', marginTop: 12 }}>
      {children}
    </Text>
  );
}

function P({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 19 }}>{children}</Text>
  );
}

function A({ href, children }: { href: string; children: string }) {
  const colors = useColors();
  return (
    <Text
      style={{ color: colors.accent.base, textDecorationLine: 'underline' }}
      onPress={() => void Linking.openURL(href)}
    >
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 8 }}>
      <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 19 }}>•</Text>
      <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  );
}

/* ─── Impressum ─────────────────────────────────────────────────── */

function ImprintContent() {
  return (
    <>
      <H1>Impressum</H1>
      <P>Informationen über den Diensteanbieter:</P>

      <H2>Anbieter</H2>
      <P>
        Werbeagentur FIANO e.U.{'\n'}
        Gary Fischer{'\n'}
        Hohenthurn 52{'\n'}
        9602 Hohenthurn{'\n'}
        Österreich
      </P>
      <P>
        Tel.: <A href="tel:+436502720108">+43 650 272 0108</A>{'\n'}
        E-Mail: <A href="mailto:office@fiano.at">office@fiano.at</A>
      </P>

      <H2>Firmenbuch</H2>
      <P>
        Firmenbuchnummer: FN 640653 m{'\n'}
        Firmenbuchgericht: Landesgericht Klagenfurt{'\n'}
        Firmensitz: Hohenthurn, Österreich{'\n'}
        Unternehmensgegenstand: Werbeagentur{'\n'}
        GLN: 9110036897848
      </P>

      <H2>Berufsrechtliche Angaben</H2>
      <P>
        Mitglied bei: WKO (Wirtschaftskammer Österreich){'\n'}
        Berufsrecht: Werbeagentur, Fachgruppe Werbung und Marktkommunikation{'\n'}
        Verleihungsstaat: Österreich{'\n'}
        Aufsichtsbehörde: Bezirkshauptmannschaft Villach-Land
      </P>

      <H2>Datenschutz-Verantwortlicher</H2>
      <P>
        Gary Fischer{'\n'}
        Hohenthurn 52, 9602 Hohenthurn, Österreich{'\n'}
        E-Mail: <A href="mailto:office@fiano.at">office@fiano.at</A>{'\n'}
        Tel.: +43 650 272 0108
      </P>

      <H2>EU-Streitbeilegung</H2>
      <P>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
        <A href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</A>. Wir sind nicht
        verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </P>

      <H2>Bildernachweis</H2>
      <P>
        Die Bilder, Fotos und Grafiken auf dieser Webseite sind urheberrechtlich geschützt. Die
        Bilderrechte liegen bei: Fotograf Gary Fischer / FIANO.
      </P>

      <H2>Weitere Online-Auftritte</H2>
      <P>Dieses Impressum gilt auch für:</P>
      <Bullet>
        <A href="https://www.instagram.com/werbeagenturfiano/">instagram.com/werbeagenturfiano</A>
      </Bullet>
      <Bullet>
        <A href="https://www.tiktok.com/@werbeagentur.fiano">tiktok.com/@werbeagentur.fiano</A>
      </Bullet>
      <Bullet>
        <A href="https://www.youtube.com/@werbeagenturfiano">youtube.com/@werbeagenturfiano</A>
      </Bullet>
      <Bullet>
        <A href="https://www.fiano.at/impressum">fiano.at/impressum</A>
      </Bullet>
    </>
  );
}

/* ─── Datenschutz ──────────────────────────────────────────────── */

function PrivacyContent() {
  return (
    <>
      <H1>Datenschutzerklärung</H1>
      <P>
        Wir nehmen den Schutz deiner persönlichen Daten ernst und behandeln sie vertraulich gemäß
        der EU-Datenschutz-Grundverordnung (DSGVO) sowie dem österreichischen Datenschutzgesetz.
      </P>

      <H2>1. Verantwortlicher</H2>
      <P>
        Werbeagentur FIANO e.U., Gary Fischer{'\n'}
        Hohenthurn 52, 9602 Hohenthurn, Österreich{'\n'}
        E-Mail: <A href="mailto:office@fiano.at">office@fiano.at</A>
      </P>

      <H2>2. Welche Daten wir verarbeiten</H2>
      <P>Konto-Daten (über Supabase, EU-Server in Frankfurt):</P>
      <Bullet>E-Mail-Adresse (für Login und Account-Verwaltung)</Bullet>
      <Bullet>Verschlüsseltes Passwort (Argon2-Hash, niemals im Klartext gespeichert)</Bullet>
      <Bullet>Optional: Name & Avatar bei Google-OAuth-Login</Bullet>
      <Bullet>Erstellungs- und Login-Zeitstempel</Bullet>

      <P>Subscription-Daten (über Stripe, Sitz Irland für EU-Kunden):</P>
      <Bullet>Stripe-Kundennummer (zur Plan-Verwaltung)</Bullet>
      <Bullet>Plan-Status und Subscription-Periode</Bullet>
      <Bullet>
        Zahlungsdaten werden ausschließlich von Stripe verarbeitet — fiano sieht keine
        Kreditkartennummern
      </Bullet>

      <P>Lokale App-Daten (auf deinem Gerät):</P>
      <Bullet>Auth-Session (verschlüsselt im OS-Keychain via expo-secure-store)</Bullet>
      <Bullet>Projekt-Dateien, generierte Clips, Thumbnails — alles bleibt auf deinem Gerät</Bullet>
      <Bullet>App-Einstellungen und API-Keys (verschlüsselt via SecureStore)</Bullet>

      <H2>3. Nutzung externer KI-Dienste (BYO-Key)</H2>
      <P>
        fiano nutzt das „Bring-Your-Own-Key"-Prinzip: Du verwendest deine eigenen API-Keys für
        OpenAI (Whisper, TTS) und Google Gemini (Thumbnails). Wenn du diese Funktionen nutzt:
      </P>
      <Bullet>Audio- und Bildinhalte werden direkt an OpenAI bzw. Google gesendet</Bullet>
      <Bullet>fiano leitet keine Daten weiter und speichert keine Inhalte serverseitig</Bullet>
      <Bullet>
        Es gelten die Datenschutzbestimmungen von{' '}
        <A href="https://openai.com/policies/privacy-policy">OpenAI</A> und{' '}
        <A href="https://policies.google.com/privacy">Google</A>
      </Bullet>
      <Bullet>Du kannst diese Funktionen deaktivieren, indem du keinen API-Key hinterlegst</Bullet>

      <H2>4. Cloud-Render (fiano-Worker)</H2>
      <P>
        Auf Mobile werden Video-Renderings via Cloud-Worker (Google Cloud Run, EU-Region) und
        Cloudflare R2 (EU-Region) durchgeführt. Source-Videos werden via pre-signed URLs hochgeladen
        und nach max. 7 Tagen automatisch gelöscht. Render-Outputs nach 7 Tagen.
      </P>

      <H2>5. Cookies und Tracking</H2>
      <P>
        fiano nutzt keine Cookies, kein Tracking und kein Analytics. Die App-Telemetrie ist
        deaktiviert.
      </P>

      <H2>6. E-Mail-Versand</H2>
      <P>
        Für Account-bezogene E-Mails (Bestätigung, Passwort-Reset) nutzen wir Supabase Auth +
        Resend (Sitz USA) als SMTP-Provider. Es werden ausschließlich deine E-Mail-Adresse und der
        E-Mail-Inhalt verarbeitet.
      </P>

      <H2>7. Rechtsgrundlagen</H2>
      <Bullet>Art. 6 Abs. 1 lit. b DSGVO — Vertragserfüllung (Bereitstellung der App)</Bullet>
      <Bullet>
        Art. 6 Abs. 1 lit. f DSGVO — Berechtigtes Interesse (Account-Sicherheit, Missbrauchsprävention)
      </Bullet>

      <H2>8. Speicherdauer</H2>
      <Bullet>Konto-Daten werden gespeichert, solange dein Konto aktiv ist</Bullet>
      <Bullet>
        Bei Konto-Löschung werden alle Konto-Daten unwiderruflich entfernt (binnen 30 Tagen)
      </Bullet>
      <Bullet>Stripe behält Zahlungs-Belege gemäß gesetzlicher Aufbewahrungsfristen (7 Jahre)</Bullet>

      <H2>9. Deine Rechte</H2>
      <P>Du hast jederzeit das Recht auf:</P>
      <Bullet>Auskunft über die zu deiner Person gespeicherten Daten (Art. 15 DSGVO)</Bullet>
      <Bullet>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</Bullet>
      <Bullet>
        Löschung deines Kontos und aller Daten (Art. 17 DSGVO) — Einstellungen → Konto löschen
      </Bullet>
      <Bullet>Datenportabilität (Art. 20 DSGVO)</Bullet>
      <Bullet>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</Bullet>
      <Bullet>
        Beschwerde bei der österreichischen Datenschutzbehörde (<A href="https://www.dsb.gv.at">dsb.gv.at</A>)
      </Bullet>

      <H2>10. Datensicherheit</H2>
      <Bullet>Alle API-Verbindungen sind TLS-verschlüsselt</Bullet>
      <Bullet>Passwörter werden mit Argon2 gehasht</Bullet>
      <Bullet>
        Auth-Sessions sind via iOS Keychain / Android EncryptedSharedPreferences (expo-secure-store)
        verschlüsselt
      </Bullet>
      <Bullet>API-Keys bleiben verschlüsselt auf deinem Gerät</Bullet>

      <P>
        Bei Fragen zum Datenschutz erreichst du uns unter{' '}
        <A href="mailto:office@fiano.at">office@fiano.at</A>.
      </P>
    </>
  );
}

/* ─── AGB ──────────────────────────────────────────────────────── */

function TermsContent() {
  return (
    <>
      <H1>Allgemeine Geschäftsbedingungen (AGB)</H1>

      <H2>1. Geltungsbereich</H2>
      <P>
        Diese AGB regeln die Nutzung der App fiano (im Folgenden „App") durch dich (im Folgenden
        „Nutzer") mit der Werbeagentur FIANO e.U. (im Folgenden „Anbieter").
      </P>

      <H2>2. Vertragsgegenstand</H2>
      <P>
        Der Anbieter stellt eine Mobile-/Desktop-Anwendung zur Verfügung, mit der du Videos
        analysieren, schneiden und für verschiedene Formate aufbereiten kannst. Die App nutzt
        KI-Dienste über deine eigenen API-Keys (Bring-Your-Own-Key-Prinzip) sowie einen
        Cloud-Render-Service in EU-Region.
      </P>

      <H2>3. Plan-Modelle und Zahlung</H2>
      <Bullet>Creator (17,99 €/Monat) — eingeschränkter Funktionsumfang, max. 25 Projekte</Bullet>
      <Bullet>Pro (29,99 €/Monat) — voller Funktionsumfang, unbegrenzte Projekte</Bullet>
      <P>
        Zahlungen werden über Stripe (Sitz Irland für EU-Kunden) oder bei iOS via Apple In-App-Purchase
        abgewickelt. Alle Preise inkl. ges. MwSt., sofern anwendbar.
      </P>

      <H2>4. Kündigung und Widerrufsrecht</H2>
      <P>
        Subscriptions können jederzeit über den Stripe Customer Portal (Settings → Subscription) bzw.
        die App-Store-Subscription-Verwaltung gekündigt werden. Die Kündigung wirkt zum Ende der
        laufenden Abrechnungsperiode — bereits gezahlte Beträge werden nicht anteilig zurückerstattet.
      </P>
      <P>
        Als Verbraucher hast du gemäß FAGG ein 14-tägiges Widerrufsrecht. Mit Zustimmung zur
        sofortigen Bereitstellung der digitalen Inhalte (z.B. erste Render-Nutzung nach Subscription)
        erlischt dieses Widerrufsrecht.
      </P>

      <H2>5. Nutzungsverantwortung</H2>
      <P>
        fiano ist für persönliche und kommerzielle Creator-Workflows vorgesehen. Du darfst die App
        nicht für Inhalte nutzen, an denen du keine Rechte hast. Wir behalten uns vor, Konten zu
        sperren bei Missbrauch oder illegalen Aktivitäten.
      </P>

      <H2>6. Verfügbarkeit & Haftung</H2>
      <P>
        Die App wird „wie besehen" („as-is") bereitgestellt. Wir testen ausführlich, garantieren
        aber keine spezifische Performance, Output-Qualität bei allen Codecs oder Kompatibilität mit
        jedem Input-File. Unsere Gesamthaftung ist auf die in den letzten 12 Monaten gezahlten Beträge
        beschränkt.
      </P>

      <H2>7. Änderungen</H2>
      <P>
        Wir können diese AGB gelegentlich aktualisieren — wesentliche Änderungen werden in der App
        und via E-Mail angekündigt. Fortgesetzte Nutzung nach Inkrafttreten der Änderungen gilt als
        Zustimmung.
      </P>

      <H2>8. Gerichtsstand</H2>
      <P>
        Es gilt österreichisches Recht. Ausschließlicher Gerichtsstand ist Villach, Österreich,
        soweit gesetzlich zulässig.
      </P>

      <P>
        Bei Fragen erreichst du uns unter <A href="mailto:office@fiano.at">office@fiano.at</A>.
      </P>
    </>
  );
}

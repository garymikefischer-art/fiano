/**
 * LegalScreen — Privacy & Terms (Tab-Switcher).
 * Inhalt ist platzhalterisch (PROD-Texte werden in einer Compliance-Phase geliefert).
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Legal'>;
type Tab = 'privacy' | 'terms';

export function LegalScreen() {
  const nav = useNavigation<Nav>();
  const [tab, setTab] = useState<Tab>('privacy');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
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
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={18} color="#f1f2f2" />
        </Pressable>
        <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>Privacy & Terms</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab Switcher */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          marginTop: 8,
          padding: 4,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 12,
        }}
      >
        <TabButton label="Privacy" active={tab === 'privacy'} onPress={() => setTab('privacy')} />
        <TabButton label="Terms" active={tab === 'terms'} onPress={() => setTab('terms')} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 18, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        <Text style={{ color: '#52525b', fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Last updated: May 2026
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 9,
        borderRadius: 9,
        backgroundColor: active ? 'rgba(255,16,57,0.18)' : 'transparent',
        borderWidth: 1,
        borderColor: active ? 'rgba(255,16,57,0.4)' : 'transparent',
        alignItems: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: active ? '#ff1039' : '#a1a1aa',
          fontSize: 12,
          fontWeight: active ? '700' : '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 19 }}>{children}</Text>
  );
}

function PrivacyContent() {
  return (
    <>
      <Text style={{ color: '#f1f2f2', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
        Privacy Policy
      </Text>
      <Section title="What we store">
        <P>
          fiano stores your account email, subscription state and a small set of preferences
          (language, default export quality). All clipping and rendering happens on-device — your
          videos never leave your phone unless you explicitly upload them yourself.
        </P>
      </Section>
      <Section title="Third parties">
        <P>
          Authentication is handled by Supabase (EU region). Payments go through Stripe; for in-app
          purchases on mobile, RevenueCat brokers the App Store / Play Store receipts. We never see
          or store your payment details.
        </P>
      </Section>
      <Section title="Analytics">
        <P>
          We collect anonymous crash logs and a minimal set of usage events (which screens are
          opened, which features are used) to improve the product. No content of your projects is
          ever included.
        </P>
      </Section>
      <Section title="Your rights">
        <P>
          You can export, modify or delete all account data via Settings → Account. Deleting your
          account removes the profile and subscription data permanently and cancels any active plan
          on the same day (no refund for the running period).
        </P>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <Text style={{ color: '#f1f2f2', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }}>
        Terms of Service
      </Text>
      <Section title="Subscription">
        <P>
          Creator and Pro plans are billed monthly via Stripe (web) or via the App Store / Play
          Store (mobile IAP). Studio Lifetime is a single payment that unlocks all current and
          future fiano features for the original purchaser, on up to two devices.
        </P>
      </Section>
      <Section title="Acceptable use">
        <P>
          fiano is intended for personal and commercial creator workflows. You may not use it to
          process content you do not have the rights to clip, redistribute or monetize. We reserve
          the right to suspend accounts engaged in clearly abusive or illegal activity.
        </P>
      </Section>
      <Section title="Liability">
        <P>
          fiano is provided as-is. While we test extensively, we make no warranty about specific
          performance, output quality on every codec, or compatibility with every input file. Our
          aggregate liability is limited to the fees you have paid in the most recent twelve months.
        </P>
      </Section>
      <Section title="Changes">
        <P>
          We may update these terms occasionally — material changes are announced in the app and via
          email. Continued use of the app after changes take effect counts as acceptance.
        </P>
      </Section>
    </>
  );
}

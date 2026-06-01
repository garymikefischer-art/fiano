/**
 * HelpScreen — Help & Support. FAQ-Akkordeon + Contact-Support.
 * Mailto-Action öffnet das System-Mail-Compose-Sheet via Linking.
 *
 * Phase i18n-Help (2026-05-26): vorher hardcoded EN, jetzt useT()-driven.
 * Alle UI-Strings unter `helpScreen.*` keys in den 9 Locale-Dateien.
 */

import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { useColors } from '../lib/theme';
import { useT } from '../lib/i18n';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Help'>;

interface FaqItem {
  qKey: string;
  aKey: string;
  qFallback: string;
  aFallback: string;
}

const FAQS: FaqItem[] = [
  {
    qKey: 'helpScreen.faqAIQ',
    aKey: 'helpScreen.faqAIA',
    qFallback: 'How does AI highlight detection work?',
    aFallback:
      'Fisora scans audio peaks, scene cuts and on-screen text to score every moment of your video. The 10 to 25 highest-scoring moments become exportable clips — usually within a couple of minutes for a 30 min source video.',
  },
  {
    qKey: 'helpScreen.faqFormatsQ',
    aKey: 'helpScreen.faqFormatsA',
    qFallback: 'Which video formats are supported?',
    aFallback:
      'Most common formats — MP4, MOV, MKV, AVI, WebM. On mobile, picking from your camera roll is recommended; the file is copied into the app sandbox before processing so the original stays untouched.',
  },
  {
    qKey: 'helpScreen.faq916Q',
    aKey: 'helpScreen.faq916A',
    qFallback: "Why doesn't 9:16 export work yet on mobile?",
    aFallback:
      'The 9:16/TikTok export needs a native FFmpeg module (Phase 9.4.x). On Desktop the bundled FFmpeg binary handles it; on mobile we are integrating a custom Swift Package + Android NDK build. The UI is already complete and waiting for the native layer.',
  },
  {
    qKey: 'helpScreen.faqCancelQ',
    aKey: 'helpScreen.faqCancelA',
    qFallback: 'How do I cancel my Pro subscription?',
    aFallback:
      'Settings → Manage billing — opens the Stripe customer portal where you can cancel, change or pause your plan. Lifetime is one-time and not recurring, so there is nothing to cancel.',
  },
  {
    qKey: 'helpScreen.faqUploadsQ',
    aKey: 'helpScreen.faqUploadsA',
    qFallback: 'Are my videos uploaded anywhere?',
    aFallback:
      'No. All clipping happens locally on your device. Only your account and subscription state live in our database (Supabase). The actual videos never leave your phone.',
  },
  {
    qKey: 'helpScreen.faqBugQ',
    aKey: 'helpScreen.faqBugA',
    qFallback: 'I found a bug — how do I report it?',
    aFallback:
      'Tap "Contact support" at the bottom of this screen, or email support@fisora.app. Including your Fisora version (Settings → Version) and a short repro helps us fix it faster.',
  },
];

export function HelpScreen() {
  const nav = useNavigation<Nav>();
  const colors = useColors();
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(0);

  const onContact = () => {
    const subject = encodeURIComponent(
      t('helpScreen.mailSubject', 'Fisora mobile support request'),
    );
    void Linking.openURL(`mailto:support@fisora.app?subject=${subject}`).catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
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
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
          {t('helpScreen.headerTitle', 'Help & Support')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 }}>
            {t('helpScreen.heroTitle', 'How can we help?')}
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
            {t(
              'helpScreen.heroBody',
              'Browse the most common questions, or reach out — we usually reply within a few hours on weekdays.',
            )}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: colors.bg.elevated,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {FAQS.map((f, i) => {
            const open = openId === i;
            return (
              <View key={i}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.bg.elevated }} />}
                <Pressable
                  onPress={() => setOpenId(open ? null : i)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text style={{ flex: 1, color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                      {t(f.qKey, f.qFallback)}
                    </Text>
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#71717a"
                    />
                  </View>
                </Pressable>
                {open && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 18 }}>
                      {t(f.aKey, f.aFallback)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View
          style={{
            backgroundColor: colors.bg.elevated,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            borderRadius: 16,
            padding: 18,
            gap: 12,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(255,16,57,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.32)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="mail-outline" size={22} color="#ff1039" />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>
            {t('helpScreen.contactStillNeed', 'Still need help?')}
          </Text>
          <Text
            style={{
              color: colors.text.secondary,
              fontSize: 12,
              textAlign: 'center',
              lineHeight: 17,
              maxWidth: 280,
            }}
          >
            {t(
              'helpScreen.contactBody',
              'Reach out to support and include your Fisora version + a short description of what you saw.',
            )}
          </Text>
          <Pressable
            onPress={onContact}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 22,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            })}
          >
            <Ionicons name="mail" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {t('helpScreen.contactButton', 'Contact support')}
            </Text>
          </Pressable>
          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>support@fisora.app</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

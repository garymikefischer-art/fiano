/**
 * PricingScreen — Mobile-Adaption der Desktop PricingPage.
 * 3 Plan-Karten gestapelt (Creator, Pro highlighted, Studio Lifetime).
 *
 * Phase 9.4.6: UI-MVP. Stripe-Checkout ist heute ein Alert-Stub —
 * Edge-Function-Wiring + Mobile-IAP/RevenueCat folgt in Phase 9.4.x post-MVP.
 *
 * String-Quelle: packages/shared/src/i18n/locales/en.ts (hier hardcoded EN bis
 * mobile i18n in einer eigenen Phase aktiviert wird).
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useT } from '../lib/i18n';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Pricing'>;
type R = RouteProp<RootStackParamList, 'Pricing'>;
// Phase A6.3.2 (2026-05-18): Lifetime entfernt aus Mobile. Lifetime ist
// Desktop-only (lokales FFmpeg, kein monatliches Revenue für Cloud-Render).
type PlanId = 'creator' | 'pro';

interface PlanDef {
  id: PlanId;
  nameKey: string;
  price: string;
  periodKey: string;
  taglineKey: string;
  featureKeys: string[];
  ctaKey: string;
  highlight?: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: 'creator',
    nameKey: 'pricing.creatorName',
    price: '17,99 €',
    periodKey: 'pricing.perMonth',
    taglineKey: 'pricing.creatorTagline',
    featureKeys: [
      'pricing.f.autoHighlights',
      'pricing.f.manualHighlights',
      'pricing.f.tiktokTab',
      'pricing.f.builder',
      'pricing.f.multiTrack',
      'pricing.f.subtitleStudio',
      'pricing.f.musicIntro',
      'pricing.f.basicEffects',
      'pricing.f.fullhd',
      'pricing.f.creatorLimit',
    ],
    ctaKey: 'pricing.getCreator',
  },
  {
    id: 'pro',
    nameKey: 'pricing.proName',
    price: '29,99 €',
    periodKey: 'pricing.perMonth',
    taglineKey: 'pricing.proTagline',
    highlight: true,
    featureKeys: [
      'pricing.f.allCreator',
      'pricing.f.podcastHighlights',
      'pricing.f.thumbnailGen',
      'pricing.f.aiMask',
      'pricing.f.stabilizer',
      'pricing.f.lutFilters',
      'pricing.f.layeredSubs',
      'pricing.f.export4k',
      'pricing.f.qualityMode',
      'pricing.f.unlimited',
      'pricing.f.priorityQueue',
      'pricing.f.earlyAccess',
    ],
    ctaKey: 'pricing.getPro',
  },
  // Phase A6.3.2 (2026-05-18): Lifetime entfernt — siehe PlanId-Kommentar oben.
];

export function PricingScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  // Phase A6.3.2: paywallMode = true → Hard-Gate vor App-Zugang. Back-Button
  // wird ausgeblendet, statt dessen Sign-Out-Button. Wird aus RootNavigator
  // gesetzt wenn User ohne creator/pro Sub einloggt.
  const paywallMode = route.params?.paywallMode === true;
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const signOut = useAuthStore((s) => s.signOut);
  const [busy, setBusy] = useState<PlanId | null>(null);

  // Lifetime ist nicht mehr im Mobile PLANS array, aber wir lesen die DB-
  // Subscription weiter — wenn Lifetime gesetzt aber kein creator/pro:
  // currentPlan bleibt null (= "kein Mobile-tauglicher Plan").
  const currentPlan: PlanId | null =
    subscription?.plan === 'creator' || subscription?.plan === 'pro'
      ? (subscription.plan as PlanId)
      : null;

  const onCheckout = (plan: PlanDef) => {
    setBusy(plan.id);
    Alert.alert(
      t('pricing.checkoutTitle', 'Checkout'),
      t(
        'pricing.mobileCheckoutSoon',
        'Stripe checkout for mobile uses RevenueCat IAP — wired up in Phase 9.4.x post-MVP.',
      ),
      [{ text: t('common.ok', 'OK'), onPress: () => setBusy(null) }],
    );
  };

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
        {paywallMode ? (
          // Paywall-Mode: kein Back-Button, statt dessen Sign-Out.
          // User MUSS subscriben oder ausloggen — kein Bypass.
          <Pressable
            onPress={() => {
              Alert.alert(
                t('pricing.signOutTitle', 'Sign out'),
                t(
                  'pricing.signOutMsg',
                  'You need an active subscription to use the app. Sign out and try a different account?',
                ),
                [
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                  {
                    text: t('pricing.signOutBtn', 'Sign out'),
                    style: 'destructive',
                    onPress: () => void signOut(),
                  },
                ],
              );
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="log-out-outline" size={14} color="#a1a1aa" />
            <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
              {t('pricing.signOutBtn', 'Sign out')}
            </Text>
          </Pressable>
        ) : (
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
        )}
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 4, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Headline */}
        <View style={{ gap: 8, marginBottom: 4 }}>
          {paywallMode && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(255,16,57,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(255,16,57,0.35)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                alignSelf: 'flex-start',
              }}
            >
              <Ionicons name="lock-closed" size={12} color="#ff1039" />
              <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>
                {t('pricing.paywallBadge', 'SUBSCRIPTION REQUIRED')}
              </Text>
            </View>
          )}
          <Text style={{ color: '#f1f2f2', fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }}>
            {paywallMode
              ? t('pricing.paywallHeadline', 'Choose a plan to continue')
              : currentPlan
                ? t('pricing.headlineUpgrade')
                : t('pricing.headline')}
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 19 }}>
            {paywallMode
              ? t(
                  'pricing.paywallSubhead',
                  'fiano cloud render requires an active subscription. Pick Creator or Pro below to start using the app.',
                )
              : currentPlan
                ? t('pricing.subheadUpgrade')
                : t('pricing.subhead')}
          </Text>
          {user?.email && (
            <Text style={{ color: '#71717a', fontSize: 12 }}>
              {t('pricing.signedInAs').replace('{email}', user.email)}
            </Text>
          )}
        </View>

        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={currentPlan === plan.id}
            busy={busy === plan.id}
            onCheckout={() => onCheckout(plan)}
            t={t}
          />
        ))}

        <Text style={{ color: '#52525b', fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
          {t('pricing.footnote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  plan,
  current,
  busy,
  onCheckout,
  t,
}: {
  plan: PlanDef;
  current: boolean;
  busy: boolean;
  onCheckout: () => void;
  t: (k: string, f?: string) => string;
}) {
  const isHighlight = plan.highlight;

  // Outer-Wrapper hält das "MOST POPULAR"-Pill außerhalb der overflow:hidden Card,
  // damit das Pill nicht clippt. Die Card selbst clipped intern den Glow auf den Border-Radius.
  return (
    <View style={{ position: 'relative', marginTop: isHighlight ? 14 : 0 }}>
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: isHighlight ? 'rgba(255,16,57,0.45)' : 'rgba(255,255,255,0.08)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          padding: 20,
          gap: 14,
          overflow: 'hidden',
        }}
      >
        {/* Glow für Pro-Card — LinearGradient von oben (rot) nach unten (transparent),
            füllt zuverlässig die volle Breite. */}
        {isHighlight && (
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,16,57,0.22)', 'rgba(255,16,57,0.06)', 'rgba(255,16,57,0)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#f1f2f2', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
            {t(plan.nameKey)}
          </Text>
          {current && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: 'rgba(34,197,94,0.15)',
                borderWidth: 1,
                borderColor: 'rgba(34,197,94,0.4)',
              }}
            >
              <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '700' }}>
                {t('pricing.currentPlan')}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 17 }}>{t(plan.taglineKey)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ color: '#f1f2f2', fontSize: 32, fontWeight: '700', letterSpacing: -0.6 }}>
          {plan.price}
        </Text>
        <Text style={{ color: '#71717a', fontSize: 13 }}>{t(plan.periodKey)}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

      <View style={{ gap: 9 }}>
        {plan.featureKeys.map((fk, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: isHighlight ? 'rgba(255,16,57,0.18)' : 'rgba(34,197,94,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              <Ionicons
                name="checkmark"
                size={12}
                color={isHighlight ? '#ff1039' : '#22c55e'}
              />
            </View>
            <Text style={{ flex: 1, color: '#d4d4d8', fontSize: 13, lineHeight: 18 }}>{t(fk)}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onCheckout}
        disabled={current || busy}
        style={({ pressed }) => ({
          marginTop: 4,
          backgroundColor: current
            ? 'rgba(255,255,255,0.06)'
            : pressed
              ? '#cc0d2e'
              : isHighlight
                ? '#ff1039'
                : 'rgba(255,255,255,0.06)',
          borderWidth: isHighlight || current ? 0 : 1,
          borderColor: 'rgba(255,255,255,0.12)',
          borderRadius: 14,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          shadowColor: isHighlight ? '#ff1039' : 'transparent',
          shadowOpacity: isHighlight ? 0.4 : 0,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          opacity: busy ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            color: current ? '#71717a' : isHighlight ? '#fff' : '#f1f2f2',
            fontSize: 14,
            fontWeight: '700',
          }}
        >
          {current ? t('pricing.currentPlan') : busy ? t('pricing.opening') : t(plan.ctaKey)}
        </Text>
        {!current && !busy && (
          <Ionicons name="arrow-forward" size={14} color={isHighlight ? '#fff' : '#f1f2f2'} />
        )}
      </Pressable>
      </View>

      {/* MOST-POPULAR-Ribbon: außerhalb des overflow:hidden-Containers,
          damit es nicht am oberen Card-Rand abgeschnitten wird. */}
      {isHighlight && (
        <View
          style={{
            position: 'absolute',
            top: -12,
            left: 20,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: '#ff1039',
            zIndex: 10,
            shadowColor: '#ff1039',
            shadowOpacity: 0.5,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 }}>
            {t('pricing.mostPopular').toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

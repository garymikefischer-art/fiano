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

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, StatusBar as RNStatusBar } from 'react-native';
import type { PurchasesOffering } from 'react-native-purchases';
import { appAlert } from '../components/AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';

import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import {
  getCurrentOffering,
  packageForPlan,
  purchase,
  restore,
  iapAvailable,
  getManagementUrl,
} from '../lib/iap';
import { useT } from '../lib/i18n';
import { useColors } from '../lib/theme';
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
  const colors = useColors();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const signOut = useAuthStore((s) => s.signOut);
  const fetchSubscription = useAuthStore((s) => s.fetchSubscription);
  const applyIapCustomerInfo = useAuthStore((s) => s.applyIapCustomerInfo);
  const [busy, setBusy] = useState<PlanId | null>(null);

  // M5 (2026-06-05): RevenueCat-Offering `default` beim Mount laden. Liefert
  // die lokalisierten Store-Preise (inkl. lokaler Steuer) + verfügbare Packages.
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [offeringLoading, setOfferingLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const off = await getCurrentOffering();
      if (alive) {
        setOffering(off);
        setOfferingLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Store-Preis für einen Plan (lokalisiert, inkl. Steuer) — Fallback auf den
  // hardcoded PLANS-Preis bis das Offering geladen ist.
  const priceFor = (id: PlanId): string => {
    const fallback = PLANS.find((p) => p.id === id)?.price ?? '';
    if (!offering) return fallback;
    const pkg = packageForPlan(offering, id);
    return pkg?.product.priceString ?? fallback;
  };

  // Phase R10 (Bug-3): "current plan" (grüne Karte) nur wenn der Status auch aktiv ist — sonst stand fälschlich grün "current plan" bei inaktivem/abgelaufenem Abo.
  const subActive =
    subscription?.status === 'active' || subscription?.status === 'trialing';
  const currentPlan: PlanId | null =
    subActive && (subscription?.plan === 'creator' || subscription?.plan === 'pro')
      ? (subscription!.plan as PlanId)
      : null;
  // Plan-Row existiert (unabhängig vom Status) — für Refresh-Button + Status-Diagnose.
  const hasPlanRow = subscription?.plan === 'creator' || subscription?.plan === 'pro';

  // M5 (2026-06-05): RevenueCat In-App-Purchase. Ersetzt den früheren Stripe-
  // Web-Checkout — Google verlangt IAP für digitale Subs INNERHALB der Mobile-
  // App (Desktop nutzt weiter Stripe, siehe PROJECT_SUMMARY §7a).
  // Flow: Package aus dem geladenen Offering ziehen → purchasePackage öffnet den
  // nativen Google-Play-Kauf-Dialog → bei Erfolg Entitlement sofort optimistisch
  // lokal anwenden (Instant-Paywall-Open) + auf den RevenueCat-Webhook pollen,
  // der die kanonische subscriptions-Row schreibt (gleiches Pattern wie Stripe).
  const onPurchase = async (plan: PlanDef) => {
    if (!iapAvailable()) {
      appAlert(
        t('pricing.iapUnavailableTitle', 'Purchases unavailable'),
        t(
          'pricing.iapUnavailableBody',
          'In-app purchases are not available in this build. Please install Fisora from Google Play.',
        ),
      );
      return;
    }
    if (!offering) {
      appAlert(
        t('pricing.iapLoadingTitle', 'Please wait'),
        t('pricing.iapLoadingBody', 'Products are still loading — try again in a moment.'),
      );
      return;
    }
    const pkg = packageForPlan(offering, plan.id);
    if (!pkg) {
      appAlert(
        t('pricing.checkoutErrorTitle', 'Checkout failed'),
        t('pricing.iapNoProduct', 'This plan is not available right now.'),
      );
      return;
    }
    setBusy(plan.id);
    try {
      // Plan-Wechsel: besteht schon ein aktives Abo, dessen Store-Produkt-ID
      // mitgeben → Google ERSETZT das alte Abo statt ein zweites abzuschließen
      // (Creator→Pro-Doppelabo-Fix 2026-06-08).
      const oldProductId =
        currentPlan && currentPlan !== plan.id
          ? (packageForPlan(offering, currentPlan)?.product.identifier ?? null)
          : null;
      const result = await purchase(pkg, oldProductId);
      if (result.userCancelled) return; // User hat abgebrochen — kein Fehler.
      if (!result.ok) {
        appAlert(
          t('pricing.checkoutErrorTitle', 'Checkout failed'),
          result.error ?? 'Purchase failed',
        );
        return;
      }
      // Erfolg: Entitlement sofort lokal anwenden (Paywall öffnet instant),
      // dann auf den Webhook pollen der die kanonische subscriptions-Row schreibt
      // (max 20s = 13 Versuche à 1.5s).
      if (result.customerInfo) applyIapCustomerInfo(result.customerInfo);
      for (let i = 0; i < 13; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await fetchSubscription();
        const latest = useAuthStore.getState().subscription;
        if (
          (latest?.status === 'active' || latest?.status === 'trialing') &&
          (latest?.plan === 'creator' || latest?.plan === 'pro')
        ) {
          return;
        }
      }
      // Webhook noch nicht durch — das optimistische Entitlement bleibt aktiv;
      // fetchSubscription beim nächsten App-Start korrigiert/bestätigt es.
    } finally {
      setBusy(null);
    }
  };

  // M5: Käufe wiederherstellen — Google-Pflicht für IAP-Apps. Z.B. nach
  // Neuinstallation oder Gerätewechsel; RevenueCat verknüpft anhand der
  // App-User-ID (= Supabase-user_id) die vorhandenen Entitlements.
  const onRestore = async () => {
    if (!iapAvailable()) {
      appAlert(
        t('pricing.iapUnavailableTitle', 'Purchases unavailable'),
        t(
          'pricing.iapUnavailableBody',
          'In-app purchases are not available in this build. Please install Fisora from Google Play.',
        ),
      );
      return;
    }
    setBusy('creator');
    try {
      const result = await restore();
      if (result.ok && result.customerInfo) {
        applyIapCustomerInfo(result.customerInfo);
        await fetchSubscription();
      }
      const latest = useAuthStore.getState().subscription;
      const active =
        (latest?.status === 'active' || latest?.status === 'trialing') &&
        (latest?.plan === 'creator' || latest?.plan === 'pro');
      appAlert(
        active
          ? t('pricing.restoreOkTitle', 'Purchases restored')
          : t('pricing.restoreNoneTitle', 'Nothing to restore'),
        active
          ? t('pricing.restoreOkBody', 'Your subscription has been restored.')
          : t(
              'pricing.restoreNoneBody',
              'We could not find an active subscription for this account.',
            ),
      );
    } finally {
      setBusy(null);
    }
  };

  // Phase A6.3.6 (2026-05-18): Manual-Refresh Button für edge-case wo Polling
  // nach 20s noch keinen active sub findet. Tap → fetchSubscription → wenn jetzt
  // aktiv, paywall-gate öffnet sich.
  const onRefreshSub = async () => {
    setBusy('creator');
    try {
      await fetchSubscription();
      const latest = useAuthStore.getState().subscription;
      if (
        (latest?.status !== 'active' && latest?.status !== 'trialing') ||
        (latest?.plan !== 'creator' && latest?.plan !== 'pro')
      ) {
        appAlert(
          t('pricing.stillPendingTitle', 'Still pending'),
          t(
            'pricing.stillPendingBody',
            'Your subscription is still being processed. Try again in a few seconds.',
          ),
        );
      }
    } finally {
      setBusy(null);
    }
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
        {paywallMode ? (
          // Paywall-Mode: kein Back-Button, statt dessen Sign-Out.
          // User MUSS subscriben oder ausloggen — kein Bypass.
          <Pressable
            onPress={() => {
              appAlert(
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
              backgroundColor: colors.bg.elevated,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="log-out-outline" size={14} color="#a1a1aa" />
            <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
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
          <Text style={{ color: colors.text.primary, fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }}>
            {paywallMode
              ? t('pricing.paywallHeadline', 'Choose a plan to continue')
              : currentPlan
                ? t('pricing.headlineUpgrade')
                : t('pricing.headline')}
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19 }}>
            {paywallMode
              ? t(
                  'pricing.paywallSubhead',
                  'Fisora cloud render requires an active subscription. Pick Creator or Pro below to start using the app.',
                )
              : currentPlan
                ? t('pricing.subheadUpgrade')
                : t('pricing.subhead')}
          </Text>
          {user?.email && (
            <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
              {t('pricing.signedInAs').replace('{email}', user.email)}
            </Text>
          )}
        </View>

        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            price={priceFor(plan.id)}
            priceLoading={offeringLoading}
            current={currentPlan === plan.id}
            busy={busy === plan.id}
            onPress={() => onPurchase(plan)}
            t={t}
          />
        ))}

        {/* Phase R10 (Bug-3): Refresh + echter Abo-Status sobald eine Plan-Row
            existiert aber das Paywall-Gate noch zu ist (Status nicht aktiv). */}
        {paywallMode && hasPlanRow && (
          <View style={{ gap: 8, marginTop: 6 }}>
            {!currentPlan && (
              <Text
                style={{
                  color: colors.text.tertiary,
                  fontSize: 11,
                  textAlign: 'center',
                  lineHeight: 16,
                }}
              >
                {t('pricing.subStatusLabel', 'Subscription status')}:{' '}
                {subscription?.status ?? '—'}
                {subscription?.current_period_end
                  ? ` · ${new Date(subscription.current_period_end).toLocaleDateString()}`
                  : ''}
              </Text>
            )}
            <Pressable
              onPress={onRefreshSub}
              style={({ pressed }) => ({
                backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
                borderRadius: 14,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                {t('pricing.refreshSub', 'Refresh subscription status')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* M5: Restore-Purchases — Google-Pflicht für IAP-Apps. */}
        <Pressable
          onPress={onRestore}
          disabled={busy !== null}
          hitSlop={8}
          style={{ alignSelf: 'center', paddingVertical: 8, marginTop: 4 }}
        >
          <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
            {t('pricing.restorePurchases', 'Restore purchases')}
          </Text>
        </Pressable>

        {/* Fix (2026-06-05): Kündigen/Verwalten lebt jetzt hier (aus den
            Einstellungen hierher verschoben — dort war der Button zu prominent).
            Google-Play-Abos sind NUR im Play Store kündbar (Google-Policy) →
            Deep-Link via RevenueCat-managementURL, Fallback Play-Subscriptions-
            Seite. Nur sichtbar bei aktivem Abo. */}
        {subActive && (
          <Pressable
            onPress={async () => {
              const url =
                (await getManagementUrl()) ??
                'https://play.google.com/store/account/subscriptions';
              try {
                await Linking.openURL(url);
              } catch (e) {
                appAlert(
                  t('settings.account.manageOpenError', 'Could not open Google Play'),
                  String(e),
                );
              }
            }}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: 8, marginTop: 2 }}
          >
            <Text style={{ color: colors.text.tertiary, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
              {t('settings.account.cancelSub', 'Cancel / manage on Google Play')}
            </Text>
          </Pressable>
        )}

        <Text style={{ color: '#52525b', fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
          {t('pricing.footnoteIap')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  plan,
  price,
  priceLoading,
  current,
  busy,
  onPress,
  t,
}: {
  plan: PlanDef;
  /** Lokalisierter Store-Preis (RevenueCat), Fallback auf plan.price. */
  price: string;
  /** true solange das Offering noch lädt — zeigt einen Platzhalter statt Preis. */
  priceLoading: boolean;
  current: boolean;
  busy: boolean;
  onPress: () => void;
  t: (k: string, f?: string) => string;
}) {
  const colors = useColors();
  const isHighlight = plan.highlight;

  // Outer-Wrapper hält das "MOST POPULAR"-Pill außerhalb der overflow:hidden Card,
  // damit das Pill nicht clippt. Die Card selbst clipped intern den Glow auf den Border-Radius.
  return (
    <View style={{ position: 'relative', marginTop: isHighlight ? 14 : 0 }}>
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: isHighlight ? 'rgba(255,16,57,0.45)' : colors.border.subtle,
          backgroundColor: colors.bg.elevated,
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
          <Text style={{ color: colors.text.primary, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
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
        <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 17 }}>{t(plan.taglineKey)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text style={{ color: colors.text.primary, fontSize: 32, fontWeight: '700', letterSpacing: -0.6 }}>
          {priceLoading ? '…' : price}
        </Text>
        <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>{t(plan.periodKey)}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.bg.elevated }} />

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
            <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 13, lineHeight: 18 }}>{t(fk)}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onPress}
        disabled={current || busy}
        style={({ pressed }) => ({
          marginTop: 4,
          backgroundColor: current
            ? colors.bg.elevated
            : pressed
              ? '#cc0d2e'
              : isHighlight
                ? '#ff1039'
                : colors.bg.elevated,
          borderWidth: isHighlight || current ? 0 : 1,
          borderColor: colors.border.strong,
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

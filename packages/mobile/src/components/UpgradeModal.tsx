/**
 * UpgradeModal — Liquid-Glass Dialog der erscheint wenn ein User auf ein
 * gelocktes Feature klickt (Phase A5 — 2026-05-16).
 *
 * Port von src/renderer/src/components/UpgradeModal.tsx (Desktop) — gleiche
 * Struktur, RN-native APIs (Modal, BlurView, Pressable, react-native-svg).
 *
 * Wird einmalig in App.tsx gemountet. Render-no-op wenn kein Lock-Feature
 * aktiv. Liest globalen Store-State via useUpgradeModal().
 *
 * Phase B3.7 (2026-05-19): theme-aware via inline-styles (statt
 * StyleSheet.create) — Light/Dark-Switch beachten.
 */

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path, Rect } from 'react-native-svg';

import { useT } from '../lib/i18n';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import { FEATURE_LABEL_KEY, FEATURE_MIN_PLAN, type PlanRequirement } from '../lib/features';
import { useAuthStore } from '../stores/authStore';
import { useColors, useResolvedMode } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PLAN_NAME_KEY: Record<PlanRequirement, string> = {
  creator: 'pricing.creatorName',
  pro: 'pricing.proName',
  studio_lifetime: 'pricing.lifetimeName',
};

export function UpgradeModal() {
  const t = useT();
  const nav = useNavigation<Nav>();
  const colors = useColors();
  const mode = useResolvedMode();
  const featureId = useUpgradeModal((s) => s.featureId);
  const close = useUpgradeModal((s) => s.close);
  const subscription = useAuthStore((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;

  const isOpen = featureId !== null;

  if (!featureId) {
    return null;
  }

  const requiredPlan = FEATURE_MIN_PLAN[featureId];
  const featureName = t(FEATURE_LABEL_KEY[featureId]);
  const requiredPlanName = t(PLAN_NAME_KEY[requiredPlan]);
  const currentPlanName = currentPlan ? t(PLAN_NAME_KEY[currentPlan]) : '—';

  const onUpgrade = () => {
    close();
    nav.navigate('Pricing');
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: colors.bg.backdrop,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
        onPress={close}
      >
        <BlurView intensity={40} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable
          style={{
            width: '100%',
            maxWidth: 460,
            backgroundColor: colors.bg.card,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            padding: 24,
            shadowColor: '#000',
            shadowOpacity: 0.7,
            shadowRadius: 60,
            shadowOffset: { width: 0, height: 24 },
            elevation: 16,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable
            onPress={close}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={t('upgradeModal.close', 'Close')}
            hitSlop={10}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M6 6l12 12M6 18L18 6" stroke={colors.text.secondary} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>

          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: 'rgba(255,16,57,0.15)',
                borderWidth: 1,
                borderColor: colors.accent.border,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.accent.base,
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Rect x={4} y={11} width={16} height={10} rx={2} stroke={colors.accent.base} strokeWidth={1.6} />
                <Path
                  d="M8 11V7a4 4 0 0 1 8 0v4"
                  stroke={colors.accent.base}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>

          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.8,
              color: colors.accent.base,
              fontWeight: '600',
              textAlign: 'center',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {t('upgradeModal.eyebrow', 'Premium feature')}
          </Text>

          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: colors.text.primary,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {featureName}
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
              textAlign: 'center',
              lineHeight: 19,
              marginBottom: 18,
            }}
          >
            {t('upgradeModal.body', 'This feature is part of {plan}. Upgrade now to unlock it.').replace(
              '{plan}',
              requiredPlanName,
            )}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.bg.elevated,
                borderWidth: 1,
                borderColor: colors.border.subtle,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.text.tertiary,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t('upgradeModal.currentPlan', 'Your plan')}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.primary }}>
                {currentPlanName}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.accent.subtle,
                borderWidth: 1,
                borderColor: colors.accent.border,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,16,57,0.85)',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t('upgradeModal.requiredPlan', 'Required')}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>
                {requiredPlanName}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={close}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 11,
                borderRadius: 10,
                alignItems: 'center',
                backgroundColor: pressed ? colors.bg.elevated : 'transparent',
              })}
            >
              <Text style={{ fontSize: 12, color: colors.text.secondary }}>
                {t('upgradeModal.maybeLater', 'Maybe later')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onUpgrade}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: colors.accent.base,
                alignItems: 'center',
                shadowColor: colors.accent.base,
                shadowOpacity: 0.45,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.onAccent }}>
                {t('upgradeModal.upgradeNow', 'Upgrade now')} →
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

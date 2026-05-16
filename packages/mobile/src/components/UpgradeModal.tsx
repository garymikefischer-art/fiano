/**
 * UpgradeModal — Liquid-Glass Dialog der erscheint wenn ein User auf ein
 * gelocktes Feature klickt (Phase A5 — 2026-05-16).
 *
 * Port von src/renderer/src/components/UpgradeModal.tsx (Desktop) — gleiche
 * Struktur, RN-native APIs (Modal, BlurView, Pressable, react-native-svg).
 *
 * Wird einmalig in App.tsx gemountet. Render-no-op wenn kein Lock-Feature
 * aktiv. Liest globalen Store-State via useUpgradeModal().
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
  const featureId = useUpgradeModal((s) => s.featureId);
  const close = useUpgradeModal((s) => s.close);
  const subscription = useAuthStore((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;

  const isOpen = featureId !== null;

  if (!featureId) {
    // Modal komplett unmounted wenn closed — kein leerer overlay-tree
    return null;
  }

  const requiredPlan = FEATURE_MIN_PLAN[featureId];
  const featureName = t(FEATURE_LABEL_KEY[featureId]);
  const requiredPlanName = t(PLAN_NAME_KEY[requiredPlan]);
  const currentPlanName = currentPlan ? t(PLAN_NAME_KEY[currentPlan]) : '—';

  const onUpgrade = () => {
    close();
    // Nav-Stack-Push zur Pricing-Page. Kein highlight-Param weil Mobile
    // PricingScreen einen einfacheren UI-Flow hat als Desktop.
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
      <Pressable style={styles.backdrop} onPress={close}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Close-X */}
          <Pressable
            onPress={close}
            style={styles.closeBtn}
            accessibilityLabel={t('upgradeModal.close', 'Close')}
            hitSlop={10}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path d="M6 6l12 12M6 18L18 6" stroke="#a1a1aa" strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>

          {/* Schloss-Icon im Glow-Kreis */}
          <View style={styles.lockIconWrapper}>
            <View style={styles.lockIconBox}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Rect x={4} y={11} width={16} height={10} rx={2} stroke="#ff1039" strokeWidth={1.6} />
                <Path
                  d="M8 11V7a4 4 0 0 1 8 0v4"
                  stroke="#ff1039"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>

          {/* Eyebrow */}
          <Text style={styles.eyebrow}>{t('upgradeModal.eyebrow', 'Premium feature')}</Text>

          {/* Feature-Name (Title) */}
          <Text style={styles.title}>{featureName}</Text>

          {/* Body */}
          <Text style={styles.body}>
            {t('upgradeModal.body', 'This feature is part of {plan}. Upgrade now to unlock it.').replace(
              '{plan}',
              requiredPlanName,
            )}
          </Text>

          {/* Plan-Vergleich */}
          <View style={styles.planRow}>
            <View style={styles.planBoxCurrent}>
              <Text style={styles.planBoxLabel}>{t('upgradeModal.currentPlan', 'Your plan')}</Text>
              <Text style={styles.planBoxValue}>{currentPlanName}</Text>
            </View>
            <View style={styles.planBoxRequired}>
              <Text style={styles.planBoxLabelRequired}>
                {t('upgradeModal.requiredPlan', 'Required')}
              </Text>
              <Text style={styles.planBoxValueRequired}>{requiredPlanName}</Text>
            </View>
          </View>

          {/* Action-Buttons */}
          <View style={styles.actions}>
            <Pressable
              onPress={close}
              style={({ pressed }) => [
                styles.btnSecondary,
                pressed && { backgroundColor: 'rgba(255,255,255,0.08)' },
              ]}
            >
              <Text style={styles.btnSecondaryText}>
                {t('upgradeModal.maybeLater', 'Maybe later')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onUpgrade}
              style={({ pressed }) => [
                styles.btnPrimary,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.btnPrimaryText}>
                {t('upgradeModal.upgradeNow', 'Upgrade now')} →
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: 'rgba(20,21,23,0.95)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  lockIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,16,57,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff1039',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: '#ff1039',
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f2f2',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: '#d4d4d8',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  planBoxCurrent: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  planBoxRequired: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255,16,57,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.3)',
  },
  planBoxLabel: {
    fontSize: 10,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  planBoxLabelRequired: {
    fontSize: 10,
    color: 'rgba(255,16,57,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  planBoxValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#e4e4e7',
  },
  planBoxValueRequired: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f2f2',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 12,
    color: '#d4d4d8',
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#ff1039',
    alignItems: 'center',
    shadowColor: '#ff1039',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

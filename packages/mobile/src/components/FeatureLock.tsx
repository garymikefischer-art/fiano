/**
 * FeatureLock — RN-Wrapper der UI-Elemente sperrt wenn der User den passenden
 * Plan nicht hat (Phase A5 — 2026-05-16).
 *
 * Port von src/renderer/src/components/FeatureLock.tsx (Desktop). Statt
 * Tailwind/clsx nutzt Mobile React Native StyleSheet + react-native-svg
 * für das Schloss-Icon.
 *
 * Drei Components:
 *
 *   <FeatureLock featureId="ai_subject_mask">       — zentriertes Schloss-
 *     <BigButton>…</BigButton>                        Overlay (für große Buttons)
 *   </FeatureLock>
 *
 *   <FeatureLockInline featureId="podcast_highlights"> — kleines Schloss-Badge
 *     <PickerOption>…</PickerOption>                    oben rechts (für Picker)
 *   </FeatureLockInline>
 *
 *   <LockBadge />  — standalone visual (z.B. neben Toggle-Rows)
 *
 * Default + Inline blockieren onClick-Events der Children und öffnen
 * stattdessen das globale UpgradeModal via Store.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useFeature, type FeatureId } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';

interface BaseProps {
  featureId: FeatureId;
  children: ReactNode;
  /** Optional: Lock erzwingen (für Tests/Debug). */
  forceLocked?: boolean;
  /** Optional Style für den Wrapper. */
  style?: ViewStyleProp;
}

type ViewStyleProp = React.ComponentProps<typeof View>['style'];

/* ────────────────────────────────────────────────────────────────────── */
/* FeatureLock — zentriertes Overlay                                       */
/* ────────────────────────────────────────────────────────────────────── */

export function FeatureLock({ featureId, children, forceLocked, style }: BaseProps) {
  const { unlocked } = useFeature(featureId);
  const open = useUpgradeModal((s) => s.open);

  const isLocked = forceLocked || !unlocked;

  if (!isLocked) return <>{children}</>;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Children gedimmt + non-interaktiv */}
      <View pointerEvents="none" style={styles.dimmedFull}>
        {children}
      </View>

      {/* Click-Catcher + zentriertes Schloss */}
      <Pressable
        accessibilityLabel="Locked feature — upgrade required"
        onPress={() => open(featureId)}
        style={styles.overlayClickCatcher}
      >
        <View style={styles.lockCircleBig}>
          <LockIcon size={16} color="#ff1039" />
        </View>
      </Pressable>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* FeatureLockInline — kleines Schloss oben rechts                        */
/* ────────────────────────────────────────────────────────────────────── */

export function FeatureLockInline({ featureId, children, forceLocked, style }: BaseProps) {
  const { unlocked } = useFeature(featureId);
  const open = useUpgradeModal((s) => s.open);

  const isLocked = forceLocked || !unlocked;

  if (!isLocked) return <>{children}</>;

  return (
    <Pressable
      accessibilityLabel="Locked feature — upgrade required"
      onPress={() => open(featureId)}
      style={[styles.inlineWrapper, style]}
    >
      <View pointerEvents="none" style={styles.dimmedInline}>
        {children}
      </View>
      <View style={styles.lockBadgeCorner}>
        <LockIcon size={10} color="#fff" />
      </View>
    </Pressable>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* LockBadge — standalone visual                                           */
/* ────────────────────────────────────────────────────────────────────── */

export function LockBadge() {
  return (
    <View style={styles.lockBadgeStandalone}>
      <LockIcon size={10} color="#ff1039" />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Inline-SVG Schloss                                                      */
/* ────────────────────────────────────────────────────────────────────── */

function LockIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={11} width={16} height={10} rx={2} stroke={color} strokeWidth={2} />
      <Path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Styles                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  dimmedFull: {
    opacity: 0.4,
  },
  dimmedInline: {
    opacity: 0.5,
  },
  overlayClickCatcher: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  lockCircleBig: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,16,57,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff1039',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  inlineWrapper: {
    position: 'relative',
  },
  lockBadgeCorner: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(255,16,57,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff1039',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  lockBadgeStandalone: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,16,57,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

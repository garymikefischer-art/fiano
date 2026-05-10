/**
 * ProjectStatusBadge — Pill-Badge mit farbigem Dot.
 *
 * processing → orange, soft pulse
 * ready      → grün
 * failed     → rot
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useT } from '../lib/i18n';

type Status = 'ready' | 'processing' | 'failed';

interface Props {
  status: Status;
  /** Kompakt-Variante (kleinere Schrift, weniger Padding) für Cards. */
  compact?: boolean;
  style?: ViewStyle;
}

const STYLES: Record<Status, { fg: string; bg: string; border: string; labelKey: string; fallback: string }> = {
  ready: {
    fg: '#22c55e',
    bg: 'rgba(34,197,94,0.15)',
    border: 'rgba(34,197,94,0.4)',
    labelKey: 'project.statusReady',
    fallback: 'Ready',
  },
  processing: {
    fg: '#fb923c',
    bg: 'rgba(251,146,60,0.15)',
    border: 'rgba(251,146,60,0.4)',
    labelKey: 'project.statusProcessing',
    fallback: 'Processing',
  },
  failed: {
    fg: '#ef4444',
    bg: 'rgba(239,68,68,0.15)',
    border: 'rgba(239,68,68,0.4)',
    labelKey: 'project.statusFailed',
    fallback: 'Failed',
  },
};

export function ProjectStatusBadge({ status, compact, style }: Props) {
  const t = useT();
  const meta = STYLES[status];
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'processing') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const dotSize = compact ? 6 : 7;

  return (
    <View
      style={[
        styles.pill,
        compact ? styles.pillCompact : styles.pillFull,
        { backgroundColor: meta.bg, borderColor: meta.border },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: meta.fg,
          },
          status === 'processing' && { opacity: pulse },
        ]}
      />
      <Text
        style={[
          { color: meta.fg, fontWeight: '700' },
          compact ? styles.labelCompact : styles.labelFull,
        ]}
      >
        {t(meta.labelKey, meta.fallback)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillFull: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  labelFull: {
    fontSize: 11,
  },
  labelCompact: {
    fontSize: 10,
  },
});

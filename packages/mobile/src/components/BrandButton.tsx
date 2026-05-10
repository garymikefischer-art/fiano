/**
 * Brand-Button — primary (rot mit Glow) oder secondary (Glas).
 *
 * Inline-StyleSheet (kein NativeWind mehr, das aus dem Mobile-Stack rausgenommen
 * wurde — dadurch greifen Styles wieder zuverlässig).
 */

import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function BrandButton({ title, onPress, variant = 'primary', disabled, loading, icon }: Props) {
  const isPrimary = variant === 'primary';
  const isDimmed = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDimmed}
      style={({ pressed }) => [
        styles.base,
        isPrimary
          ? {
              backgroundColor: pressed && !isDimmed ? '#cc0d2e' : '#ff1039',
              shadowColor: '#ff1039',
              shadowOpacity: isDimmed ? 0 : 0.4,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 4 },
            }
          : {
              backgroundColor: pressed && !isDimmed ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            },
        isDimmed && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : '#f1f2f2'} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, { color: isPrimary ? '#fff' : '#f1f2f2' }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
});

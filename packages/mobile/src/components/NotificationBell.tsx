/**
 * NotificationBell — Glas-Pill mit Glocke + roter Badge.
 */

import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useColors } from '../lib/theme';

interface Props {
  count?: number;
  onPress?: () => void;
}

export function NotificationBell({ count, onPress }: Props) {
  // Phase B3.6 (2026-05-18): theme-aware — Glocke war im Light-Mode unsichtbar.
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
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
      <Ionicons name="notifications-outline" size={18} color={colors.text.primary} />
      {count != null && count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.accent.base,
            borderWidth: 2,
            borderColor: colors.bg.primary,
          }}
        />
      )}
    </Pressable>
  );
}

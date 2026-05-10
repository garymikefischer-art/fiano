/**
 * NotificationBell — Glas-Pill mit Glocke + roter Badge.
 */

import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  count?: number;
  onPress?: () => void;
}

export function NotificationBell({ count, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
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
      <Ionicons name="notifications-outline" size={18} color="#f1f2f2" />
      {count != null && count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: '#ff1039',
            borderWidth: 2,
            borderColor: '#0a0a0a',
          }}
        />
      )}
    </Pressable>
  );
}

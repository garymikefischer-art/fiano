/**
 * Brand-Button — primary (rot) oder secondary (border).
 */

import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { type ReactNode } from 'react';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function BrandButton({ title, onPress, variant = 'primary', disabled, loading, icon }: Props) {
  const baseClass = 'rounded-2xl px-6 py-4 flex-row items-center justify-center gap-2';
  const styleClass =
    variant === 'primary'
      ? `bg-brand ${disabled || loading ? 'opacity-50' : 'active:bg-brand-dark'}`
      : `border border-fiano-border bg-fiano-panel ${disabled || loading ? 'opacity-50' : 'active:bg-[#1a1d22]'}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClass} ${styleClass}`}
    >
      {loading ? (
        <ActivityIndicator color="#f1f2f2" />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className="text-fiano-fg font-semibold text-base">{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

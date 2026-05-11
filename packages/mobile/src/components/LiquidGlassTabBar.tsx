/**
 * LiquidGlassTabBar — schwebende Bottom-Bar im Apple-Liquid-Glass-Stil.
 *
 * - BlurView (intensity 80) + dunkler Tint = "frosted glass"
 * - Capsule-Indicator hinter aktivem Tab
 * - Ionicons-Outlines (active = filled + brand-rot)
 * - Floating mit margin → wirkt wie echtes iOS-Element
 */

import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Library: { active: 'albums', inactive: 'albums-outline' },
  Clips: { active: 'cut', inactive: 'cut-outline' },
  TikTok: { active: 'logo-tiktok', inactive: 'logo-tiktok' },
  Builder: { active: 'construct', inactive: 'construct-outline' },
};

const TAB_I18N_KEYS: Record<string, { key: string; fallback: string }> = {
  Home: { key: 'sidebar.home', fallback: 'Home' },
  Library: { key: 'sidebar.projects', fallback: 'Projects' },
  Clips: { key: 'tab.highlights', fallback: 'Highlights' },
  TikTok: { key: 'tab.nineSixteen', fallback: '9:16' },
  Builder: { key: 'sidebar.builder', fallback: 'Builder' },
};

export function LiquidGlassTabBar({ state, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useT();
  const horizontalMargin = 12;
  const innerHorizontalPadding = 6;
  const barWidth = width - horizontalMargin * 2;
  const innerWidth = barWidth - innerHorizontalPadding * 2;
  const tabWidth = innerWidth / state.routes.length;
  // Bottom-Position: Safe-Area-Inset (Android Gesture-Bar / iOS Home-Indicator)
  // plus zusätzlicher Polster-Abstand, damit die Tab-Bar visuell deutlich
  // über der System-UI floatet statt direkt dranzukleben.
  // Bottom-Position: Safe-Area-Inset minimal anheben damit die Bar nicht
  // auf System-UI klebt aber auch nicht zu hoch floatet.
  const bottomPosition = insets.bottom > 0 ? insets.bottom + 4 : 12;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: horizontalMargin,
        right: horizontalMargin,
        bottom: bottomPosition,
        borderRadius: 28,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      }}
    >
      <BlurView intensity={100} tint="dark" style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            paddingVertical: 7,
            paddingHorizontal: 6,
            backgroundColor: 'rgba(13,16,20,0.35)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.10)',
            borderRadius: 28,
          }}
        >
          {/* Capsule-Indicator hinter aktivem Tab */}
          <View
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: innerHorizontalPadding + state.index * tabWidth + tabWidth * 0.08,
              width: tabWidth * 0.84,
              borderRadius: 22,
              backgroundColor: 'rgba(255,16,57,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.32)',
            }}
          />

          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const icons = TAB_ICONS[route.name] ?? TAB_ICONS.Home;
            const labelEntry = TAB_I18N_KEYS[route.name];
            const label = labelEntry ? t(labelEntry.key, labelEntry.fallback) : route.name;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    haptic.selection();
                    navigation.navigate(route.name);
                  }
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 6,
                  gap: 2,
                }}
              >
                <Ionicons
                  name={focused ? icons.active : icons.inactive}
                  size={20}
                  color={focused ? '#ff1039' : '#a1a1aa'}
                />
                <Text
                  style={{
                    color: focused ? '#ff1039' : '#a1a1aa',
                    fontSize: 10,
                    fontWeight: focused ? '700' : '500',
                    letterSpacing: 0.2,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

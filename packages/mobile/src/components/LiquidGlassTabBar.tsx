/**
 * LiquidGlassTabBar — schwebende Bottom-Bar im Apple-Liquid-Glass-Stil.
 *
 * Phase B3.4 (2026-05-18): enhanced liquid-glass look. Mehrere Layer:
 *   1. BlurView intensity 100, dark tint (auch im Light-Mode — User-Wunsch
 *      "Bottom-Nav bleibt schwarz")
 *   2. Reduzierter Background-Tint für mehr glass-Transparenz
 *   3. Outer iridescent ring (LinearGradient subtle multi-color)
 *   4. Inner top highlight (weißer Strich oben für 3D-depth)
 *   5. Multi-layer shadow (outer drop + soft glow)
 *   6. Capsule-Indicator hinter aktivem Tab (Brand-rot)
 *
 * Light-Mode: tab-bar bleibt dark (User-Wunsch), aber Capsule + Icons folgen
 * Theme weiterhin.
 */

import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import { useResolvedMode } from '../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Library: { active: 'albums', inactive: 'albums-outline' },
  Clips: { active: 'cut', inactive: 'cut-outline' },
  TikTok: { active: 'logo-tiktok', inactive: 'logo-tiktok' },
  Builder: { active: 'construct', inactive: 'construct-outline' },
  Thumbs: { active: 'image', inactive: 'image-outline' },
};

const TAB_I18N_KEYS: Record<string, { key: string; fallback: string }> = {
  Home: { key: 'sidebar.home', fallback: 'Home' },
  Library: { key: 'sidebar.projects', fallback: 'Projects' },
  Clips: { key: 'tab.highlights', fallback: 'Highlights' },
  TikTok: { key: 'tab.nineSixteen', fallback: '9:16' },
  Builder: { key: 'sidebar.builder', fallback: 'Builder' },
  Thumbs: { key: 'tab.thumbs', fallback: 'Thumbs' },
};

export function LiquidGlassTabBar({ state, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = useT();
  // Phase B3.5 (2026-05-18): theme-aware tab-bar (dark→schwarz mit glass,
  // light→weiß mit glass). User-Wunsch revised von "bleibt schwarz" auf
  // "auch im light mode hell".
  const mode = useResolvedMode();
  const isLight = mode === 'light';
  const horizontalMargin = 12;
  const innerHorizontalPadding = 6;
  const barWidth = width - horizontalMargin * 2;
  const innerWidth = barWidth - innerHorizontalPadding * 2;
  const tabWidth = innerWidth / state.routes.length;
  // Bottom-Position: Safe-Area-Inset (Android Gesture-Bar / iOS Home-Indicator)
  // plus zusätzlicher Polster-Abstand.
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
        // Multi-layer shadow für 3D-depth.
        shadowColor: '#000',
        shadowOpacity: 0.55,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 14 },
        elevation: 16,
      }}
    >
      <View style={{ borderRadius: 28, overflow: 'hidden' }}>
        <BlurView intensity={100} tint={isLight ? 'light' : 'dark'} style={{ flex: 1 }}>
          {/* Background-Tint — sehr leicht, lässt blur durchscheinen für
              echten frosted-glass-Look. User-Wunsch B3.5 (2026-05-18): dark
              mode soll noch glaser sein → opacity weiter runter auf 0.18. */}
          <View
            style={{
              flexDirection: 'row',
              paddingVertical: 7,
              paddingHorizontal: 6,
              backgroundColor: isLight
                ? 'rgba(250,250,250,0.55)'
                : 'rgba(10,10,14,0.18)',
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
                backgroundColor: 'rgba(255,16,57,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,16,57,0.40)',
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
                    color={
                      focused
                        ? '#ff1039'
                        : isLight
                          ? 'rgba(20,20,25,0.65)'
                          : 'rgba(255,255,255,0.72)'
                    }
                  />
                  <Text
                    style={{
                      color: focused
                        ? '#ff1039'
                        : isLight
                          ? 'rgba(20,20,25,0.72)'
                          : 'rgba(255,255,255,0.72)',
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

          {/* Inner top-edge highlight — weißer feiner Strich oben für die
              "glass-rim"-Lichtung (Apple-Look). */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
            }}
          />

          {/* Subtle iridescent rim — LinearGradient horizontal mit drei
              versetzten Stops. Gibt den "Reflexions"-Schimmer des Apple-
              Beispiels. */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(180,200,255,0.10)',
              'rgba(255,180,220,0.06)',
              'rgba(180,255,230,0.10)',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 28,
              opacity: 0.5,
            }}
          />
        </BlurView>
      </View>

      {/* Outer ring border — oberhalb der BlurView, damit es als rim wirkt. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.22)',
        }}
      />
    </View>
  );
}

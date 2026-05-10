/**
 * OnboardingScreen (Phase 9.4.10).
 *
 * Wird einmalig nach Sign-up / vor erstem Home-Anzeigen gezeigt, wenn das
 * `appStore.onboardingCompleted`-Flag noch nicht gesetzt ist. Skip oder
 * Durchklicken setzt das Flag persistent → erscheint nicht wieder.
 *
 * Kein Backbutton — Onboarding ist absichtlich "blockierend" bis Skip / Get-started.
 */

import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { FianoLogo } from '../components/FianoLogo';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useAppStore } from '../stores/appStore';
import { useT } from '../lib/i18n';

interface Slide {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  ringColor: string;
  /** Wenn `true` → erste Slide zeigt das fiano-Wordmark statt eines Icon-Avatars. */
  brandHero?: boolean;
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
}

const SLIDES: Slide[] = [
  {
    brandHero: true,
    iconColor: '#ff1039',
    iconBg: 'rgba(255,16,57,0.12)',
    ringColor: 'rgba(255,16,57,0.32)',
    titleKey: 'onboarding.welcomeTitle',
    titleFallback: 'Welcome to fiano.',
    bodyKey: 'onboarding.welcomeBody',
    bodyFallback:
      'AI-powered video clipping in your pocket — analyze, trim and ship 9:16 highlights without ever leaving the phone.',
  },
  {
    icon: 'sparkles',
    iconColor: '#e879f9',
    iconBg: 'rgba(232,121,249,0.15)',
    ringColor: 'rgba(232,121,249,0.32)',
    titleKey: 'onboarding.aiTitle',
    titleFallback: 'AI finds the best moments',
    bodyKey: 'onboarding.aiBody',
    bodyFallback:
      'Drop in a 30-minute gameplay or podcast and fiano scores audio peaks, scene cuts and on-screen text — surfacing 10–25 export-ready clips.',
  },
  {
    icon: 'logo-tiktok',
    iconColor: '#60a5fa',
    iconBg: 'rgba(96,165,250,0.15)',
    ringColor: 'rgba(96,165,250,0.32)',
    titleKey: 'onboarding.tiktokTitle',
    titleFallback: '9:16, social-ready',
    bodyKey: 'onboarding.tiktokBody',
    bodyFallback:
      'Auto-crop to vertical, burn in subtitles, save straight to your camera roll. TikTok, Reels & Shorts in one tap.',
  },
  {
    icon: 'lock-closed-outline',
    iconColor: '#34d399',
    iconBg: 'rgba(52,211,153,0.15)',
    ringColor: 'rgba(52,211,153,0.32)',
    titleKey: 'onboarding.privacyTitle',
    titleFallback: 'Your videos stay on-device',
    bodyKey: 'onboarding.privacyBody',
    bodyFallback:
      'No upload, no cloud rendering. Clipping runs locally — only your account and subscription state ever leave the phone.',
  },
];

export function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const t = useT();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const goNext = () => {
    if (isLast) {
      void completeOnboarding();
      return;
    }
    const next = index + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onSkip = () => {
    void completeOnboarding();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top', 'bottom']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Skip top-right */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 0,
        }}
      >
        <Pressable
          onPress={onSkip}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600' }}>
            {t('onboarding.skip', 'Skip')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <SlideView key={i} slide={slide} width={width} t={t} />
        ))}
      </ScrollView>

      {/* Dots + CTA */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {SLIDES.map((_, i) => {
            const active = i === index;
            return (
              <View
                key={i}
                style={{
                  height: 6,
                  width: active ? 22 : 6,
                  borderRadius: 3,
                  backgroundColor: active ? '#ff1039' : 'rgba(255,255,255,0.16)',
                }}
              />
            );
          })}
        </View>

        <Pressable
          onPress={goNext}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
            borderRadius: 14,
            paddingVertical: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            shadowColor: '#ff1039',
            shadowOpacity: 0.4,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 6 },
          })}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
            {isLast
              ? t('onboarding.getStarted', 'Get started')
              : t('onboarding.next', 'Next')}
          </Text>
          <Ionicons name={isLast ? 'rocket' : 'arrow-forward'} size={16} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SlideView({
  slide,
  width,
  t,
}: {
  slide: Slide;
  width: number;
  t: (k: string, f?: string) => string;
}) {
  return (
    <View style={{ width, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      {/* Hero-Visual */}
      <View
        style={{
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: slide.iconBg,
          borderWidth: 1,
          borderColor: slide.ringColor,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[slide.iconBg, 'transparent']}
          style={StyleSheet.absoluteFillObject}
        />
        {slide.brandHero ? (
          <FianoLogo variant="mark" height={88} />
        ) : (
          slide.icon && <Ionicons name={slide.icon} size={84} color={slide.iconColor} />
        )}
      </View>

      <View style={{ gap: 10, alignItems: 'center', maxWidth: 320 }}>
        <Text
          style={{
            color: '#f1f2f2',
            fontSize: 28,
            fontWeight: '700',
            letterSpacing: -0.6,
            textAlign: 'center',
            lineHeight: 32,
          }}
        >
          {t(slide.titleKey, slide.titleFallback)}
        </Text>
        <Text
          style={{
            color: '#a1a1aa',
            fontSize: 14,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          {t(slide.bodyKey, slide.bodyFallback)}
        </Text>
      </View>
    </View>
  );
}

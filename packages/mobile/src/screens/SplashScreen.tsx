/**
 * Splash / Loading Screen — analog Desktop LoadingScreen.tsx mit
 * BackgroundGlow + pulsierendem Logo + Progress-Sweep + INITIALIZING.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { FianoLogo } from '../components/FianoLogo';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useColors } from '../lib/theme';

export function SplashScreen() {
  const colors = useColors();
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.7, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ).start();
  }, [pulse, sweep]);

  const sweepLeft = sweep.interpolate({ inputRange: [0, 1], outputRange: ['-33%', '100%'] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
      <BackgroundGlow />

      <View style={{ alignItems: 'center', gap: 28 }}>
        <Animated.View style={{ opacity: pulse }}>
          <FianoLogo height={112} />
        </Animated.View>

        <View
          style={{
            width: 160,
            height: 2,
            borderRadius: 1,
            backgroundColor: colors.bg.elevated,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              width: '33%',
              backgroundColor: '#ff1039',
              borderRadius: 1,
              left: sweepLeft,
            }}
          />
        </View>

        <Text style={{ fontSize: 10, color: '#666', letterSpacing: 4, textTransform: 'uppercase' }}>
          Initializing
        </Text>
      </View>
    </View>
  );
}

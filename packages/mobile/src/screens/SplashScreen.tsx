/**
 * Splash / Loading Screen — Pendant zur Desktop-LoadingScreen.tsx.
 * Wird gezeigt während useAuthStore.init() läuft.
 *
 * Design: dunkles bg, radialer Glow, Logo mit pulsierendem Schimmer,
 * indeterminate Progress-Bar, "INITIALIZING" caps.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { FianoLogo } from '../components/FianoLogo';

export function SplashScreen() {
  // Pulse-Animation für Logo-Glow
  const pulse = useRef(new Animated.Value(0.65)).current;
  // Sweep-Animation für Progress-Bar
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.65, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ).start();
  }, [pulse, sweep]);

  const sweepLeft = sweep.interpolate({ inputRange: [0, 1], outputRange: ['-33%', '100%'] });

  return (
    <View style={{ flex: 1, backgroundColor: '#090b0c', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Radialer roter Glow im Hintergrund */}
      <View
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: 300,
          backgroundColor: '#ff1039',
          opacity: 0.06,
        }}
      />

      <View style={{ alignItems: 'center', gap: 28 }}>
        {/* Logo mit pulsierendem Glow */}
        <Animated.View style={{ opacity: pulse }}>
          <FianoLogo height={64} />
        </Animated.View>

        {/* Indeterminate Progress-Bar */}
        <View style={{ width: 160, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              width: '33%',
              backgroundColor: '#ff1039',
              borderRadius: 1,
              left: sweepLeft,
              shadowColor: '#ff1039',
              shadowOpacity: 0.6,
              shadowRadius: 8,
            }}
          />
        </View>

        <Text
          style={{
            fontSize: 10,
            color: '#666',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          Initializing
        </Text>
      </View>
    </View>
  );
}

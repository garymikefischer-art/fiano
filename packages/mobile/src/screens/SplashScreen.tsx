/**
 * Splash / Loading Screen — analog Desktop LoadingScreen.tsx.
 * Pure UI. Logo + indeterminate Progress-Bar + "INITIALIZING".
 * Keine Gradient-Glows.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import { FianoLogo } from '../components/FianoLogo';

export function SplashScreen() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
    ).start();
  }, [sweep]);

  const sweepLeft = sweep.interpolate({ inputRange: [0, 1], outputRange: ['-33%', '100%'] });

  return (
    <View style={{ flex: 1, backgroundColor: '#090b0c', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', gap: 28 }}>
        <FianoLogo height={56} />

        <View
          style={{
            width: 160,
            height: 2,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.06)',
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

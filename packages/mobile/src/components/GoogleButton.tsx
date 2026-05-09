/**
 * "Continue with Google" Button — exakt analog Desktop LoginPage.tsx GoogleIcon.
 * Weiß, mit echten Google-Logo-Pfaden.
 */

import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function GoogleButton({ onPress, loading, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#f0f0f0' : '#ffffff',
        opacity: disabled || loading ? 0.5 : 1,
        borderRadius: 8,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      })}
    >
      {loading ? (
        <ActivityIndicator color="#1a1a1a" />
      ) : (
        <>
          <GoogleLogo />
          <Text style={{ color: '#18181b', fontSize: 13, fontWeight: '600' }}>
            Continue with Google
          </Text>
        </>
      )}
    </Pressable>
  );
}

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z" fill="#4285F4" />
      <Path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" fill="#34A853" />
      <Path d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" fill="#FBBC05" />
      <Path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A8.97 8.97 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335" />
    </Svg>
  );
}

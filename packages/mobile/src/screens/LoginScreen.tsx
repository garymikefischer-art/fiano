/**
 * LoginScreen — 1:1 Pixel-Parität zum Desktop-Screenshot.
 *
 * Layout (Desktop-Match):
 *   - BackgroundGlow (radial-gradients, smooth)
 *   - Glass-Card centered
 *     - "Sign in" / "Welcome back."
 *     - Continue with Google (weiß, Logo)
 *     - OR Divider
 *     - EMAIL + PASSWORD inputs
 *     - Sign in (rot, full)
 *     - Forgot password?
 *     - Divider + "No account yet? Sign up"
 *   - "By signing in or signing up..." footer text
 *   - Imprint · Privacy · Terms · Licenses footer
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { GoogleButton } from '../components/GoogleButton';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export function LoginScreen() {
  const nav = useNavigation<Nav>();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);

  const onSubmit = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = () => {
    Alert.alert('Google Sign-In', 'Folgt in Phase 9.4.x (expo-auth-session).');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a0a0a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundGlow />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Glass-Card — Desktop .glass class */}
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.045)',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            padding: 28,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          {/* Heading */}
          <Text style={{ color: '#f1f2f2', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            Sign in
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
            Welcome back.
          </Text>

          {/* Continue with Google */}
          <View style={{ marginTop: 20 }}>
            <GoogleButton onPress={onGoogle} disabled={busy} />
          </View>

          {/* OR Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <Text style={{ color: '#52525b', fontSize: 10, fontWeight: '500', letterSpacing: 1.5 }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </View>

          {/* Email */}
          <View>
            <Text style={LABEL}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="you@example.com"
              placeholderTextColor="#52525b"
              editable={!busy}
              style={inputStyle(emailFocus)}
            />
          </View>

          {/* Password */}
          <View style={{ marginTop: 12 }}>
            <Text style={LABEL}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPwFocus(true)}
              onBlur={() => setPwFocus(false)}
              secureTextEntry
              autoComplete="current-password"
              placeholderTextColor="#52525b"
              editable={!busy}
              style={inputStyle(pwFocus)}
            />
          </View>

          {/* Error */}
          {error && (
            <View
              style={{
                marginTop: 12,
                backgroundColor: 'rgba(255, 16, 57, 0.08)',
                borderColor: 'rgba(255, 16, 57, 0.2)',
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: '#ff1039', fontSize: 11 }}>{error}</Text>
            </View>
          )}

          {/* Sign in Button */}
          <Pressable
            onPress={onSubmit}
            disabled={busy || !email || !password}
            style={({ pressed }) => ({
              marginTop: 16,
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy || !email || !password ? 0.5 : 1,
              borderRadius: 8,
              paddingVertical: 11,
              alignItems: 'center',
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Sign in</Text>
            )}
          </Pressable>

          {/* Forgot password */}
          <Pressable
            onPress={() => Alert.alert('Reset password', 'Folgt in Phase 9.4.x.')}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#71717a', fontSize: 11 }}>Forgot password?</Text>
          </Pressable>

          {/* Divider + Sign up */}
          <View
            style={{
              marginTop: 20,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255, 255, 255, 0.06)',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Text style={{ color: '#71717a', fontSize: 12 }}>No account yet?</Text>
            <Pressable onPress={() => nav.navigate('Signup')}>
              <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '500' }}>Sign up</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer Notice */}
        <Text
          style={{
            color: '#52525b',
            fontSize: 10,
            textAlign: 'center',
            marginTop: 24,
            paddingHorizontal: 16,
          }}
        >
          By signing in or signing up you accept our terms of service.
        </Text>

        {/* Legal Links */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
          }}
        >
          {['Imprint', 'Privacy', 'Terms', 'Licenses'].map((label, i) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() =>
                  Alert.alert(label, 'Web-View Folgt in Phase 9.4.x.\n\nDesktop hat alle Pages unter /legal/.')
                }
              >
                <Text style={{ color: '#52525b', fontSize: 10 }}>{label}</Text>
              </Pressable>
              {i < 3 && <Text style={{ color: '#3f3f46', fontSize: 10 }}>·</Text>}
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LABEL = {
  fontSize: 10,
  color: '#71717a',
  letterSpacing: 1.6,
  marginBottom: 4,
} as const;

function inputStyle(focused: boolean) {
  return {
    backgroundColor: focused ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: focused ? 'rgba(255, 16, 57, 0.5)' : 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 13,
  } as const;
}

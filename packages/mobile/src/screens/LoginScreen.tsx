/**
 * LoginScreen — exakt analog Desktop LoginPage.tsx (Liquid-Glass-Card).
 * Keine Background-Glows. Card centered. Title + Email/Password + Submit + Footer-Link.
 */

import { useState } from 'react';
import {
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#090b0c' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Glass-Card — analog Desktop .glass class */}
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            padding: 28,
          }}
        >
          {/* Heading */}
          <View>
            <Text style={{ color: '#f1f2f2', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
              Sign in to fiano
            </Text>
            <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
              Continue to your projects
            </Text>
          </View>

          {/* Email */}
          <View style={{ marginTop: 20 }}>
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
              style={inputStyle(emailFocus)}
            />
          </View>

          {/* Password */}
          <View style={{ marginTop: 12 }}>
            <Text style={LABEL}>PASSWORT</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPwFocus(true)}
              onBlur={() => setPwFocus(false)}
              secureTextEntry
              autoComplete="current-password"
              placeholderTextColor="#52525b"
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

          {/* Submit */}
          <Pressable
            onPress={onSubmit}
            disabled={busy || !email || !password}
            style={({ pressed }) => ({
              marginTop: 16,
              backgroundColor: !email || !password ? 'rgba(255, 16, 57, 0.4)' : pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy ? 0.6 : 1,
              borderRadius: 8,
              paddingVertical: 11,
              alignItems: 'center',
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Sign In</Text>
            )}
          </Pressable>

          {/* Footer-Link — Sign Up */}
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
            <Text style={{ color: '#71717a', fontSize: 12 }}>No account?</Text>
            <Pressable onPress={() => nav.navigate('Signup')}>
              <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '500' }}>Sign up</Text>
            </Pressable>
          </View>
        </View>

        <Text
          style={{
            color: '#52525b',
            fontSize: 10,
            textAlign: 'center',
            marginTop: 24,
          }}
        >
          By continuing you agree to our Terms and Privacy Policy.
        </Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: focused ? 'rgba(255, 16, 57, 0.5)' : 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#fff',
    fontSize: 13,
  } as const;
}

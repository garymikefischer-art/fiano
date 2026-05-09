/**
 * LoginScreen — Apple-Liquid-Glass-Style analog Desktop LoginPage.tsx.
 *
 * Layout (Desktop-Parität):
 *   - Brand-Glow im Hintergrund
 *   - fiano-Logo (Pfeil + Wortmarke)
 *   - Glass-Card mit Title + Subtitle + Email/Password + Submit + "noAccount"-Link
 *   - Forgot-Password (vorerst nur Anzeige, Reset-Flow Phase 9.4.x)
 *   - Footer: "byContinuing"
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
import { FianoLogo } from '../components/FianoLogo';
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
    if (!email || !password) {
      setError('Bitte E-Mail und Passwort eingeben.');
      return;
    }
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
      {/* Brand-Glow Layer (analog Desktop fiano-bg-glow) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-30%',
          width: 600,
          height: 600,
          borderRadius: 300,
          backgroundColor: '#ff1039',
          opacity: 0.07,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-25%',
          width: 480,
          height: 480,
          borderRadius: 240,
          backgroundColor: '#ff1039',
          opacity: 0.05,
        }}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <FianoLogo height={48} />
        </View>

        {/* Glass-Card */}
        <View
          style={{
            backgroundColor: 'rgba(20, 24, 28, 0.7)',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            padding: 24,
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 16 },
          }}
        >
          {/* Title */}
          <Text style={{ color: '#f1f2f2', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            Willkommen zurück
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
            Melde dich mit deinem fiano-Konto an
          </Text>

          {/* Email */}
          <View style={{ marginTop: 24 }}>
            <Text style={LABEL}>E-MAIL</Text>
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
          <View style={{ marginTop: 14 }}>
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
                marginTop: 14,
                backgroundColor: 'rgba(255, 16, 57, 0.08)',
                borderColor: 'rgba(255, 16, 57, 0.2)',
                borderWidth: 1,
                borderRadius: 8,
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
              marginTop: 18,
              backgroundColor: !email || !password ? 'rgba(255, 16, 57, 0.4)' : pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy ? 0.6 : 1,
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
              shadowColor: '#ff1039',
              shadowOpacity: pressed ? 0.6 : 0.4,
              shadowRadius: pressed ? 16 : 24,
              shadowOffset: { width: 0, height: 6 },
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Anmelden</Text>
            )}
          </Pressable>

          {/* Forgot password — Phase 9.4.x */}
          <Pressable onPress={() => Alert.alert('Passwort zurücksetzen', 'Folgt in Phase 9.4.x')} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: '#71717a', fontSize: 11 }}>Passwort vergessen?</Text>
          </Pressable>

          {/* Divider + Sign-Up-Link */}
          <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#71717a', fontSize: 12 }}>Noch kein Konto?</Text>
              <Pressable onPress={() => nav.navigate('Signup')}>
                <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '500' }}>Registrieren</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Legal Footer */}
        <Text style={{ color: '#52525b', fontSize: 10, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 }}>
          Mit der Anmeldung akzeptierst du unsere AGB und Datenschutzerklärung.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LABEL = {
  fontSize: 10,
  color: '#71717a',
  letterSpacing: 1.6,
  marginBottom: 6,
} as const;

function inputStyle(focused: boolean) {
  return {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: focused ? 'rgba(255, 16, 57, 0.5)' : 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#f1f2f2',
    fontSize: 14,
  } as const;
}

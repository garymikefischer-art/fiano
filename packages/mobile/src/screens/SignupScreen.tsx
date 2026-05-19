/**
 * SignupScreen — analog LoginScreen, identische Struktur, mit BackgroundGlow.
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
import { appAlert } from '../components/AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { GoogleButton } from '../components/GoogleButton';
import { useT } from '../lib/i18n';
import { useColors } from '../lib/theme';

export function SignupScreen() {
  const t = useT();
  const nav = useNavigation();
  const colors = useColors();
  const signUp = useAuthStore((s) => s.signUp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);

  const onSubmit = async () => {
    if (!email || password.length < 8) {
      setError(t('auth.signupPasswordMin', 'Password must be at least 8 characters.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
      appAlert(
        t('auth.checkEmailTitle'),
        t('auth.checkEmailBody').replace('{email}', email.trim()),
      );
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signInWithGoogle();
      if (!res.ok && !res.canceled && res.error) setError(res.error);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundGlow />
      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        {/* Phase A6.3.4 (2026-05-18): Custom Back-Button statt React-Nav
            Header-Bar — Header war hellerer Ton (#0d1014) als Screen-BG
            (#0d0509) → sichtbarer Seam. headerShown=false in RootNavigator. */}
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            marginLeft: 12,
            marginTop: 6,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="arrow-back" size={22} color="#ff1039" />
        </Pressable>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
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
          <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            {t('auth.signUpTitle')}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
            {t('auth.signUpSubtitle')}
          </Text>

          <View style={{ marginTop: 20 }}>
            <GoogleButton onPress={onGoogle} disabled={busy} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border.subtle }} />
            <Text style={{ color: '#52525b', fontSize: 10, fontWeight: '500', letterSpacing: 1.5 }}>
              {t('auth.or').toUpperCase()}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border.subtle }} />
          </View>

          <View>
            <Text style={LABEL}>{t('auth.email').toUpperCase()}</Text>
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

          <View style={{ marginTop: 12 }}>
            <Text style={LABEL}>
              {t('auth.password').toUpperCase()} (MIN. 8)
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPwFocus(true)}
              onBlur={() => setPwFocus(false)}
              secureTextEntry
              autoComplete="password-new"
              placeholderTextColor="#52525b"
              editable={!busy}
              style={inputStyle(pwFocus)}
            />
          </View>

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

          <Pressable
            onPress={onSubmit}
            disabled={busy || !email || password.length < 8}
            style={({ pressed }) => ({
              marginTop: 16,
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy || !email || password.length < 8 ? 0.5 : 1,
              borderRadius: 8,
              paddingVertical: 11,
              alignItems: 'center',
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                {busy ? t('auth.signingUp') : t('auth.signUpTitle')}
              </Text>
            )}
          </Pressable>
        </View>

        <Text
          style={{
            color: '#52525b',
            fontSize: 10,
            textAlign: 'center',
            marginTop: 24,
            paddingHorizontal: 16,
          }}
        >
          {t('auth.byContinuing')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Phase B3.7 (2026-05-19): module-level const → color hardcoded.
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

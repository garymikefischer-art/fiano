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

import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { GoogleButton } from '../components/GoogleButton';

export function SignupScreen() {
  const signUp = useAuthStore((s) => s.signUp);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);

  const onSubmit = async () => {
    if (!email || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
      Alert.alert('Success', 'Please confirm your email address.');
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
          <Text style={{ color: '#f1f2f2', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            Create account
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
            Get started with fiano.
          </Text>

          <View style={{ marginTop: 20 }}>
            <GoogleButton onPress={onGoogle} disabled={busy} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <Text style={{ color: '#52525b', fontSize: 10, fontWeight: '500', letterSpacing: 1.5 }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </View>

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

          <View style={{ marginTop: 12 }}>
            <Text style={LABEL}>PASSWORD (MIN. 8)</Text>
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
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Create account</Text>
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
          By signing in or signing up you accept our terms of service.
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

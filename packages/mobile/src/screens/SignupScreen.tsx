/**
 * SignupScreen — analog LoginScreen, mit Password-Strength-Hint.
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
import { FianoLogo } from '../components/FianoLogo';

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
      setError('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
      Alert.alert('Erfolg', 'Bitte bestätige deine E-Mail-Adresse.');
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
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '-15%',
          right: '-30%',
          width: 600,
          height: 600,
          borderRadius: 300,
          backgroundColor: '#ff1039',
          opacity: 0.06,
        }}
      />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <FianoLogo height={48} />
        </View>

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
          <Text style={{ color: '#f1f2f2', fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            Konto erstellen
          </Text>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
            Synchronisiere deine Videos auf allen Geräten
          </Text>

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

          <View style={{ marginTop: 14 }}>
            <Text style={LABEL}>PASSWORT (MIN. 8 ZEICHEN)</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPwFocus(true)}
              onBlur={() => setPwFocus(false)}
              secureTextEntry
              autoComplete="password-new"
              placeholderTextColor="#52525b"
              style={inputStyle(pwFocus)}
            />
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor:
                      password.length >= i * 2
                        ? password.length >= 12
                          ? '#10b981'
                          : password.length >= 8
                            ? '#f59e0b'
                            : '#ff1039'
                        : 'rgba(255,255,255,0.06)',
                  }}
                />
              ))}
            </View>
          </View>

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

          <Pressable
            onPress={onSubmit}
            disabled={busy || !email || password.length < 8}
            style={({ pressed }) => ({
              marginTop: 18,
              backgroundColor: !email || password.length < 8 ? 'rgba(255, 16, 57, 0.4)' : pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy ? 0.6 : 1,
              borderRadius: 10,
              paddingVertical: 13,
              alignItems: 'center',
              shadowColor: '#ff1039',
              shadowOpacity: 0.4,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 6 },
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Konto erstellen</Text>
            )}
          </Pressable>
        </View>

        <Text style={{ color: '#52525b', fontSize: 10, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 }}>
          Mit der Registrierung akzeptierst du unsere AGB und Datenschutzerklärung.
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

/** ResetPasswordScreen (Phase R10, Bug-4) — neues Passwort nach Recovery-Deep-Link. */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { appAlert } from '../components/AppAlert';
import { useAuthStore } from '../stores/authStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useT } from '../lib/i18n';
import { useColors } from '../lib/theme';

export function ResetPasswordScreen() {
  const t = useT();
  const colors = useColors();
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const signOut = useAuthStore((s) => s.signOut);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    if (password.length < 8) {
      setError(t('auth.signupPasswordMin', 'Password must be at least 8 characters.'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch', 'Passwords do not match.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      appAlert(
        t('auth.passwordUpdatedTitle', 'Password updated'),
        t('auth.passwordUpdatedBody', 'Your password has been changed.'),
      );
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text.primary,
    fontSize: 13,
  } as const;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <BackgroundGlow />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: colors.bg.elevated,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            padding: 28,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>
            {t('auth.resetTitle', 'Set a new password')}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
            {t('auth.resetSubtitle', 'Choose a new password for your account.')}
          </Text>

          <View style={{ marginTop: 20 }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              placeholder={t('auth.newPasswordPlaceholder', 'New password (min. 8)')}
              placeholderTextColor="#52525b"
              editable={!busy}
              style={inputStyle}
            />
          </View>
          <View style={{ marginTop: 12 }}>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="password-new"
              placeholder={t('auth.confirmPasswordPlaceholder', 'Confirm new password')}
              placeholderTextColor="#52525b"
              editable={!busy}
              style={inputStyle}
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
            onPress={() => void onSubmit()}
            disabled={busy || !password || !confirm}
            style={({ pressed }) => ({
              marginTop: 16,
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              opacity: busy || !password || !confirm ? 0.5 : 1,
              borderRadius: 8,
              paddingVertical: 11,
              alignItems: 'center',
            })}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                {t('auth.resetSubmit', 'Update password')}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            disabled={busy}
            style={{ marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

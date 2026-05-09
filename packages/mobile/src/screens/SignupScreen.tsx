import { useState } from 'react';
import { Text, TextInput, View, Alert, KeyboardAvoidingView, Platform } from 'react-native';

import { useAuthStore } from '../stores/authStore';
import { BrandButton } from '../components/BrandButton';

export function SignupScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email || password.length < 8) {
      Alert.alert('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    setBusy(true);
    try {
      await signUp(email.trim(), password);
      Alert.alert('Erfolg', 'Bitte bestätige deine E-Mail-Adresse.');
    } catch (err: any) {
      Alert.alert('Registrierung fehlgeschlagen', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-fiano-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View className="flex-1 px-6 pt-8">
        <Text className="text-fiano-fg/70 mb-6">
          Erstelle ein Konto um deine Videos auf allen Geräten zu synchronisieren.
        </Text>
        <View className="gap-3">
          <TextInput
            placeholder="E-Mail"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            className="bg-fiano-panel border border-fiano-border text-fiano-fg rounded-2xl px-4 py-4"
          />
          <TextInput
            placeholder="Passwort (min. 8 Zeichen)"
            placeholderTextColor="#666"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            className="bg-fiano-panel border border-fiano-border text-fiano-fg rounded-2xl px-4 py-4"
          />
          <BrandButton title="Konto erstellen" onPress={onSubmit} loading={busy} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

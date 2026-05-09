import { useState } from 'react';
import { Text, TextInput, View, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { BrandButton } from '../components/BrandButton';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export function LoginScreen() {
  const nav = useNavigation<Nav>();
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login fehlgeschlagen', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-fiano-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-brand text-5xl font-bold mb-2">fiano</Text>
        <Text className="text-fiano-fg/60 mb-12">AI Video Clipping for mobile.</Text>

        <View className="w-full gap-3">
          <TextInput
            placeholder="E-Mail"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            className="bg-fiano-panel border border-fiano-border text-fiano-fg rounded-2xl px-4 py-4"
          />
          <TextInput
            placeholder="Passwort"
            placeholderTextColor="#666"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            className="bg-fiano-panel border border-fiano-border text-fiano-fg rounded-2xl px-4 py-4"
          />
          <BrandButton title="Anmelden" onPress={onSubmit} loading={busy} />
          <BrandButton
            title="Konto erstellen"
            variant="secondary"
            onPress={() => nav.navigate('Signup')}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

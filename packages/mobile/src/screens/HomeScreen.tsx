import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { BrandButton } from '../components/BrandButton';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const subscription = useAuthStore((s) => s.subscription);

  return (
    <ScrollView className="flex-1 bg-fiano-bg" contentContainerStyle={{ padding: 24, gap: 24 }}>
      <View>
        <Text className="text-fiano-fg/60 text-sm">Eingeloggt als</Text>
        <Text className="text-fiano-fg text-base font-medium">{user?.email}</Text>
        <Text className="text-fiano-fg/40 text-xs mt-1">
          Plan: {subscription?.plan ?? 'kein aktives Abo'}
        </Text>
      </View>

      <View className="bg-fiano-panel border border-fiano-border rounded-2xl p-6">
        <Text className="text-fiano-fg text-lg font-semibold mb-2">Neues 9:16-Video</Text>
        <Text className="text-fiano-fg/60 mb-4 text-sm">
          Wähle ein Video aus deiner Galerie, schneide es zu und exportiere als TikTok/Reels-Format.
        </Text>
        <BrandButton title="+ Video importieren" onPress={() => nav.navigate('Import')} />
      </View>

      <View className="mt-8">
        <BrandButton title="Abmelden" variant="secondary" onPress={signOut} />
      </View>

      <Text className="text-fiano-fg/40 text-xs text-center mt-4">
        MVP — Phase 9.4. Editor, Builder, Highlights kommen später.
      </Text>
    </ScrollView>
  );
}

/**
 * HomeScreen / Library — analog Desktop LibraryPage + Bottom-Tab-Pattern.
 *
 * Phase 9.4.2 MVP: Empty-State mit "+ Neues Video"-CTA wie auf Desktop.
 * Project-Cards-Grid + Search + Bottom-Tabs folgen in Phase 9.4.x sobald
 * Projects-CRUD + Highlights gepiped sind.
 */

import {
  Pressable,
  ScrollView,
  Text,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { FianoLogo } from '../components/FianoLogo';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const planLabel: Record<string, string> = {
  creator: 'Creator',
  pro: 'Pro',
  studio_lifetime: 'Studio Lifetime',
};

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const signOut = useAuthStore((s) => s.signOut);

  const planName = subscription?.plan ? planLabel[subscription.plan] : 'Kein aktives Abo';
  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b0c' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#090b0c" />

      {/* Header — Logo links, Avatar rechts */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <FianoLogo height={32} />

        <Pressable
          onPress={signOut}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#ff1039',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{initial}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}>
        {/* Title */}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 32, fontWeight: '700', letterSpacing: -0.5 }}>Library</Text>
          <Text style={{ color: '#71717a', fontSize: 13, marginTop: 4 }}>
            Plan: {planName}
          </Text>
        </View>

        {/* New Video CTA — analog Desktop "+ New Video" */}
        <Pressable
          onPress={() => nav.navigate('Import')}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
            borderRadius: 16,
            paddingVertical: 16,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            shadowColor: '#ff1039',
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 6 },
          })}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>+</Text>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Neues Video</Text>
        </Pressable>

        {/* Empty-State Card — wenn keine Projekte */}
        <View
          style={{
            backgroundColor: 'rgba(20, 24, 28, 0.7)',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            padding: 24,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: 'rgba(255, 16, 57, 0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Text style={{ color: '#ff1039', fontSize: 28 }}>▶</Text>
          </View>
          <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
            Noch keine Projekte
          </Text>
          <Text style={{ color: '#71717a', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
            Importiere ein Video aus deiner Galerie und erstelle{'\n'}dein erstes 9:16-Reel in wenigen Sekunden.
          </Text>
        </View>

        {/* Phase-Hinweis */}
        <View
          style={{
            backgroundColor: 'rgba(20, 24, 28, 0.4)',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.04)',
            padding: 14,
            marginTop: 4,
          }}
        >
          <Text style={{ color: '#71717a', fontSize: 11, lineHeight: 16 }}>
            Phase 9.4.2 MVP — Highlights, Builder, 9:16-Editor und Project-Library folgen in Phase 9.4.x.
            Aktuell verfügbar: Login + Video-Import + Trim + 9:16-Export-UI.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Tab Bar (visual only — Routing kommt mit echten Tabs in 9.4.x) */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(13, 16, 20, 0.95)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.06)',
          flexDirection: 'row',
          paddingTop: 10,
          paddingBottom: 24,
          paddingHorizontal: 8,
        }}
      >
        <BottomTab label="Home" icon="⌂" active />
        <BottomTab label="Projects" icon="▦" />
        <BottomTab label="Clips" icon="▥" />
        <BottomTab label="9:16" icon="◽" />
        <BottomTab label="Builder" icon="◫" />
      </View>
    </SafeAreaView>
  );
}

function BottomTab({ label, icon, active }: { label: string; icon: string; active?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Text style={{ color: active ? '#ff1039' : '#52525b', fontSize: 18 }}>{icon}</Text>
      <Text style={{ color: active ? '#ff1039' : '#52525b', fontSize: 10, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

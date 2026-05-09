/**
 * HomeScreen / Library — analog Desktop LibraryPage.
 * Header (Logo links + Avatar rechts), Title + Plan, "+ New Video" CTA, Project-Grid.
 * Keine Glows.
 */

import { Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
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

  const planName = subscription?.plan ? planLabel[subscription.plan] : 'No active plan';
  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#090b0c' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#090b0c" />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <FianoLogo height={28} />
        <Pressable
          onPress={signOut}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#ff1039',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{initial}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: 20, gap: 16 }}>
        {/* Title + Subtitle */}
        <View>
          <Text style={{ color: '#f1f2f2', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>Library</Text>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>0 projects · {planName}</Text>
        </View>

        {/* + New Video CTA */}
        <Pressable
          onPress={() => nav.navigate('Import')}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>+</Text>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>New Video</Text>
        </Pressable>

        {/* Empty-State */}
        <View
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.08)',
            padding: 28,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '600', marginBottom: 6 }}>No projects yet</Text>
          <Text style={{ color: '#71717a', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            Import a video from your gallery to create your first 9:16 reel.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Tab-Bar */}
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
        }}
      >
        <Tab label="Home" active />
        <Tab label="Projects" />
        <Tab label="Clips" />
        <Tab label="9:16" />
        <Tab label="Builder" />
      </View>
    </SafeAreaView>
  );
}

function Tab({ label, active }: { label: string; active?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: active ? '#ff1039' : '#52525b', fontSize: 11, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

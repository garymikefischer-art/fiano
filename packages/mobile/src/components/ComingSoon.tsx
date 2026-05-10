/**
 * ComingSoon — wiederverwendbarer Glas-Placeholder für ungebaute Tabs.
 * Header-Layout (Logo + Bell + Avatar) bleibt konsistent zu Home/Library.
 */

import { Pressable, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../stores/authStore';
import { useUnreadCount } from '../stores/notificationsStore';
import { FianoLogo } from './FianoLogo';
import { BackgroundGlow } from './BackgroundGlow';
import { NotificationBell } from './NotificationBell';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  phaseTag?: string;
}

export function ComingSoon({ icon, title, description, phaseTag }: Props) {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useUnreadCount();
  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <FianoLogo height={88} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => nav.navigate('Search')}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="search" size={16} color="#f1f2f2" />
          </Pressable>
          <NotificationBell count={unreadCount} onPress={() => nav.navigate('Notifications')} />
          <Pressable
            onPress={() => nav.navigate('Settings')}
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
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: 'rgba(255,16,57,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.32)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={36} color="#ff1039" />
        </View>

        <Text style={{ color: '#f1f2f2', fontSize: 26, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' }}>
          {title}
        </Text>

        <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          {description}
        </Text>

        {phaseTag && (
          <View
            style={{
              marginTop: 8,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: '#f1f2f2', fontSize: 11, fontWeight: '600', letterSpacing: 0.4 }}>
              {phaseTag}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

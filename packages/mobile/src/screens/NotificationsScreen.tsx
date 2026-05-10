/**
 * NotificationsScreen — Ziel des Bell-Press in Header-Bars.
 * Phase 9.4.7: UI-MVP mit Mock-Notifications. Integration mit echtem
 * Notification-Backend (Push/Realtime) folgt in einer eigenen Phase.
 */

import { Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { useT } from '../lib/i18n';
import { useNotificationsStore } from '../stores/notificationsStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Notifications'>;

export function NotificationsScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const items = useNotificationsStore((s) => s.items);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clearAll = useNotificationsStore((s) => s.clearAll);
  const unreadCount = items.reduce((c, n) => c + (n.unread ? 1 : 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <Pressable
          onPress={() => nav.goBack()}
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
          <Ionicons name="chevron-back" size={18} color="#f1f2f2" />
        </Pressable>
        <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>
          {t('topBar.notifications')}
        </Text>
        <Pressable
          onPress={items.length === 0 ? undefined : unreadCount > 0 ? markAllRead : clearAll}
          disabled={items.length === 0}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            height: 40,
            justifyContent: 'center',
            opacity: items.length === 0 ? 0.4 : pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
            {unreadCount > 0
              ? t('notifications.markAllRead', 'Mark all read')
              : t('topBar.clearAll', 'Clear')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 8, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary-Pill */}
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: unreadCount > 0 ? 'rgba(255,16,57,0.12)' : 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: unreadCount > 0 ? 'rgba(255,16,57,0.28)' : 'rgba(255,255,255,0.08)',
            marginBottom: 6,
          }}
        >
          <Text
            style={{
              color: unreadCount > 0 ? '#ff1039' : '#a1a1aa',
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.4,
            }}
          >
            {unreadCount > 0
              ? `${unreadCount} ${t('notifications.unread', 'UNREAD').toUpperCase()}`
              : t('notifications.allCaughtUp', 'ALL CAUGHT UP').toUpperCase()}
          </Text>
        </View>

        {items.length === 0 ? (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 64,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="notifications-off-outline" size={26} color="#71717a" />
            </View>
            <Text style={{ color: '#a1a1aa', fontSize: 13, fontWeight: '600' }}>
              {t('topBar.noNotificationsYet', 'No notifications')}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 11, textAlign: 'center', maxWidth: 240 }}>
              {t(
                'topBar.noNotificationsHint',
                "You'll be notified here when projects finish processing or new features arrive.",
              )}
            </Text>
          </View>
        ) : (
          items.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => markRead(n.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: n.unread ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.06)',
                backgroundColor: n.unread ? 'rgba(255,16,57,0.05)' : 'rgba(255,255,255,0.03)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: n.iconBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Ionicons name={n.icon} size={18} color={n.iconColor} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Text
                    style={{
                      flex: 1,
                      color: '#f1f2f2',
                      fontSize: 13,
                      fontWeight: '700',
                      lineHeight: 18,
                    }}
                  >
                    {n.title}
                  </Text>
                  {n.unread && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#ff1039',
                        marginTop: 6,
                      }}
                    />
                  )}
                </View>
                <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 17 }}>{n.body}</Text>
                <Text style={{ color: '#71717a', fontSize: 10, marginTop: 2 }}>{n.time}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

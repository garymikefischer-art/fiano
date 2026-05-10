/**
 * Notifications-Store (Phase 9.4.11).
 *
 * Hält den Notification-Stream + unread-Count zentral, damit die NotificationBell
 * in Header-Bars dieselbe Quelle wie der NotificationsScreen sieht.
 *
 * Initial geseedet mit den bisherigen Mock-Notifications aus dem ersten
 * NotificationsScreen-Wurf. Echte Push-Notifications kommen in einer eigenen Phase
 * (Supabase Realtime + expo-notifications).
 */

import type { ComponentProps } from 'react';
import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as sounds from '../lib/sounds';

type IconName = ComponentProps<typeof Ionicons>['name'];

const STORAGE_KEY = 'fiano.notifications';

export interface Notification {
  id: string;
  icon: IconName;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

const SEED: Notification[] = [
  {
    id: '1',
    icon: 'sparkles',
    iconColor: '#22c55e',
    iconBg: 'rgba(34,197,94,0.15)',
    title: 'Insane Fortnite Session is ready',
    body: '12 highlights detected · Tap to review and export.',
    time: '2 min ago',
    unread: true,
  },
  {
    id: '2',
    icon: 'rocket-outline',
    iconColor: '#ff1039',
    iconBg: 'rgba(255,16,57,0.15)',
    title: 'Pro features unlocked',
    body: 'Welcome to fiano Pro — 4K export, AI subject mask & more are now active.',
    time: '1 h ago',
    unread: true,
  },
  {
    id: '3',
    icon: 'cloud-done-outline',
    iconColor: '#60a5fa',
    iconBg: 'rgba(96,165,250,0.15)',
    title: 'Warzone Highlights #12 exported',
    body: '8 clips saved to your camera roll.',
    time: 'Yesterday',
    unread: false,
  },
  {
    id: '4',
    icon: 'megaphone-outline',
    iconColor: '#fbbf24',
    iconBg: 'rgba(251,191,36,0.15)',
    title: "What's new in fiano",
    body: 'Mobile is here, Liquid-Glass nav, project detail & per-clip score view.',
    time: '2 d ago',
    unread: false,
  },
];

interface NotificationsState {
  items: Notification[];
  hydrated: boolean;
  init: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  add: (n: Omit<Notification, 'id' | 'unread'> & Partial<Pick<Notification, 'id' | 'unread'>>) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: SEED,
  hydrated: false,
  init: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = JSON.parse(raw) as Notification[];
        set({ items, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
  markRead: (id) =>
    set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, unread: false } : n)) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, unread: false })) })),
  clearAll: () => set({ items: [] }),
  add: (n) => {
    set((s) => ({
      items: [
        {
          id: n.id ?? `n-${Date.now()}`,
          unread: n.unread ?? true,
          ...n,
        } as Notification,
        ...s.items,
      ],
    }));
    // Notify-Sound — dezenter E6-Ding analog Desktop notify().
    sounds.notify();
  },
}));

// Persist auf jede items-Änderung — erst NACH der Hydration, sonst würden wir
// den AsyncStorage gleich beim Boot mit dem Seed überschreiben bevor die echten
// Daten geladen wurden.
useNotificationsStore.subscribe((state, prev) => {
  if (!state.hydrated) return;
  if (state.items === prev.items) return;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)).catch(() => {});
});

/** Selector-Hook: anzahl ungelesener Notifications. */
export function useUnreadCount(): number {
  return useNotificationsStore((s) => s.items.reduce((c, n) => c + (n.unread ? 1 : 0), 0));
}

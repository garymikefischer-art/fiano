/**
 * fiano mobile — Root.
 *
 * Lädt Auth-Session aus SecureStore beim Start, setzt Theme-Farben,
 * navigiert zwischen Auth-Stack und App-Stack basierend auf Login-State.
 */

import { useEffect, useMemo } from 'react';
import { SystemBars } from 'react-native-edge-to-edge';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import * as Linking from 'expo-linking';

import { LogBox } from 'react-native';

import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/authStore';
import { useAppStore } from './src/stores/appStore';
import { useNotificationsStore } from './src/stores/notificationsStore';
import { useProjectsStore } from './src/stores/projectsStore';
import { supabase } from './src/lib/supabase';
import { initLanguage } from './src/lib/i18n';
import { initSounds, appStart as playAppStart } from './src/lib/sounds';
import { UpgradeModal } from './src/components/UpgradeModal';
import { AppAlertHost } from './src/components/AppAlert';
import { initThumbnailBackfill } from './src/lib/thumbnails';
import { useColors, useResolvedMode } from './src/lib/theme';
import * as WebBrowser from 'expo-web-browser';

// Phase R9 (2026-05-20): OAuth-Redirect-Dispatcher initialisieren. Ohne diesen
// Modul-Level-Call öffnet sich der Google-Sign-in-Browser in Release-Builds
// nicht (Dev-Builds tolerieren das Fehlen).
WebBrowser.maybeCompleteAuthSession();

// Phase B1.4 (2026-05-18) / B1.5 (2026-05-19): known-harmless Reanimated v3
// warning, triggert bei NestableDraggableFlatList + TrimModal open. Reanimated
// wrapped manche refs als Animated-components, RN's measureLayout-call schlägt
// dann auf den non-native ref fehl. App funktioniert trotzdem normal.
//
// LogBox.ignoreLogs filtert nur die in-app yellow-box, NICHT die Metro/Hermes
// `(NOBRIDGE) ERROR Warning:`-Outputs. Daher zusätzlich console.warn +
// console.error-Patch am module-top-level.
LogBox.ignoreLogs([
  'ref.measureLayout must be called with a ref to a native component',
]);

const SILENCED_WARNINGS = [
  'measureLayout must be called with a ref to a native component',
];
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (SILENCED_WARNINGS.some((p) => msg.includes(p))) return;
  originalConsoleWarn(...args);
};
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (SILENCED_WARNINGS.some((p) => msg.includes(p))) return;
  originalConsoleError(...args);
};

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initApp = useAppStore((s) => s.init);
  const initNotifications = useNotificationsStore((s) => s.init);
  const initProjects = useProjectsStore((s) => s.init);

  // Phase B3 (2026-05-18): theme-resolved colors für NavigationContainer +
  // System-Nav-Bar. useColors hookt sich an appStore.themeMode + System-Color-
  // Scheme — re-rendert wenn User Theme switcht ODER OS Dark-Mode togglet.
  const colors = useColors();
  const resolvedMode = useResolvedMode();
  const navTheme = useMemo(
    () => ({
      ...(resolvedMode === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(resolvedMode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
        background: colors.bg.secondary,
        card: colors.bg.card,
        text: colors.text.primary,
        border: colors.border.subtle,
        primary: colors.accent.base,
      },
    }),
    [resolvedMode, colors],
  );

  useEffect(() => {
    void initLanguage();
    void initApp();
    void initNotifications();
    void initProjects();
    initAuth();
    void initSounds().then(() => playAppStart());
    // Phase A2: Thumbnail-Backfill für alte Library-Cards ohne thumbUri.
    const unsubBackfill = initThumbnailBackfill();

    // Phase A6.3.3 (2026-05-18): Deep-Link-Handler für email-confirm Callback.
    // Wenn User auf Confirm-Link in Bestätigungs-Email klickt → OS öffnet App
    // via fiano://auth-callback?... → wir parsen Tokens/Code, setzen Session.
    // Unterstützt beide Supabase-Flows:
    //   - Token-Flow (hash):  #access_token=...&refresh_token=...
    //   - PKCE-Flow (query):  ?code=...
    const handleAuthUrl = async (urlEvent: { url: string } | string) => {
      const url = typeof urlEvent === 'string' ? urlEvent : urlEvent.url;
      if (!url || !url.includes('auth-callback')) return;
      try {
        // Token-Flow: hash-fragment
        const hashIdx = url.indexOf('#');
        if (hashIdx >= 0) {
          const params = new URLSearchParams(url.slice(hashIdx + 1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            // Phase R10 (Bug-4): Recovery-Link → ResetPasswordScreen erzwingen.
            if (params.get('type') === 'recovery') {
              useAuthStore.setState({ recoveryMode: true });
            }
            return;
          }
        }
        // PKCE-Flow: ?code=...
        const queryIdx = url.indexOf('?');
        if (queryIdx >= 0) {
          const queryEnd = hashIdx >= 0 ? hashIdx : url.length;
          const params = new URLSearchParams(url.slice(queryIdx + 1, queryEnd));
          const code = params.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          }
        }
      } catch (e) {
        console.warn('[App] auth-callback URL parse failed:', e);
      }
    };
    // App started via deep link (cold start):
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });
    // App already running, deep link arrives:
    const sub = Linking.addEventListener('url', handleAuthUrl);
    return () => {
      unsubBackfill();
      sub.remove();
    };
  }, [initAuth, initApp, initNotifications, initProjects]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.secondary }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
          {/* Phase R10 (Bug-1): SystemBars (react-native-edge-to-edge) statt expo-status-bar/expo-navigation-bar — steuert beide System-Bar-Icons, edge-to-edge-kompatibel. */}
          <SystemBars style={resolvedMode === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
          {/* Phase A5: globaler Upgrade-Modal für Feature-Locks. Liest
              useUpgradeModal-Store, unmounts wenn featureId === null. */}
          <UpgradeModal />
          {/* Phase A6.3.7 (2026-05-18): custom-styled Alert. Drop-in für
              RN's Alert.alert(), aber in fiano-Design. */}
          <AppAlertHost />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

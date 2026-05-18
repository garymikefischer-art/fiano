/**
 * fiano mobile — Root.
 *
 * Lädt Auth-Session aus SecureStore beim Start, setzt Theme-Farben,
 * navigiert zwischen Auth-Stack und App-Stack basierend auf Login-State.
 */

import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import * as Linking from 'expo-linking';

import { Platform } from 'react-native';

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

/**
 * Setzt die Android-Navigation-Bar-Farbe zur Laufzeit. Macht den schwarzen
 * Balken unter der Tab-Bar weg, indem wir der System-Nav unsere Hintergrund-
 * Tint-Farbe geben. Lazy require → no-op wenn das Native-Modul (noch) nicht
 * verlinkt ist.
 */
function configureAndroidNavBar(bg: string, buttonStyle: 'light' | 'dark') {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NavigationBar = require('expo-navigation-bar');
    void NavigationBar.setBackgroundColorAsync(bg).catch(() => {});
    void NavigationBar.setButtonStyleAsync(buttonStyle).catch(() => {});
  } catch {
    /* expo-navigation-bar nicht installiert oder Native-Build pending — ignorieren */
  }
}

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

  // Android Nav-Bar follow theme — re-applied bei jedem Theme-Wechsel.
  useEffect(() => {
    configureAndroidNavBar(colors.bg.primary, resolvedMode === 'dark' ? 'light' : 'dark');
  }, [colors.bg.primary, resolvedMode]);

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
          <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
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

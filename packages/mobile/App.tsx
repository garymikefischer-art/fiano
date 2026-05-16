/**
 * fiano mobile — Root.
 *
 * Lädt Auth-Session aus SecureStore beim Start, setzt Theme-Farben,
 * navigiert zwischen Auth-Stack und App-Stack basierend auf Login-State.
 */

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';

import { Platform } from 'react-native';

import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/authStore';
import { useAppStore } from './src/stores/appStore';
import { useNotificationsStore } from './src/stores/notificationsStore';
import { useProjectsStore } from './src/stores/projectsStore';
import { initLanguage } from './src/lib/i18n';
import { initSounds, appStart as playAppStart } from './src/lib/sounds';
import { UpgradeModal } from './src/components/UpgradeModal';

/**
 * Setzt die Android-Navigation-Bar-Farbe zur Laufzeit. Macht den schwarzen
 * Balken unter der Tab-Bar weg, indem wir der System-Nav unsere Hintergrund-
 * Tint-Farbe geben. Lazy require → no-op wenn das Native-Modul (noch) nicht
 * verlinkt ist.
 */
function configureAndroidNavBar() {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NavigationBar = require('expo-navigation-bar');
    void NavigationBar.setBackgroundColorAsync('#0d0509').catch(() => {});
    void NavigationBar.setButtonStyleAsync('light').catch(() => {});
  } catch {
    /* expo-navigation-bar nicht installiert oder Native-Build pending — ignorieren */
  }
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#090b0c',
    card: '#13161a',
    text: '#f1f2f2',
    border: '#2a2e34',
    primary: '#ff1039',
  },
};

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initApp = useAppStore((s) => s.init);
  const initNotifications = useNotificationsStore((s) => s.init);
  const initProjects = useProjectsStore((s) => s.init);

  useEffect(() => {
    configureAndroidNavBar();
    void initLanguage();
    void initApp();
    void initNotifications();
    void initProjects();
    initAuth();
    void initSounds().then(() => playAppStart());
  }, [initAuth, initApp, initNotifications, initProjects]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#090b0c' }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <RootNavigator />
          {/* Phase A5: globaler Upgrade-Modal für Feature-Locks. Liest
              useUpgradeModal-Store, unmounts wenn featureId === null. */}
          <UpgradeModal />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

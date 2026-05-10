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

import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/authStore';
import { useAppStore } from './src/stores/appStore';
import { useNotificationsStore } from './src/stores/notificationsStore';
import { useProjectsStore } from './src/stores/projectsStore';
import { initLanguage } from './src/lib/i18n';
import { initSounds, appStart as playAppStart } from './src/lib/sounds';

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
    void initLanguage();
    void initApp();
    void initNotifications();
    void initProjects();
    initAuth();
    // App-Start-Sound nach init (Mute-State hydriert) — ein dezentes E-Major-
    // Triaden-Chime, gleicher Sound wie auf Desktop.
    void initSounds().then(() => playAppStart());
  }, [initAuth, initApp, initNotifications, initProjects]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#090b0c' }}>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

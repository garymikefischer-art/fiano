/**
 * fiano mobile — Root.
 *
 * Lädt Auth-Session aus SecureStore beim Start, setzt Theme-Farben,
 * navigiert zwischen Auth-Stack und App-Stack basierend auf Login-State.
 */

import './global.css';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';

import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/authStore';

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

  useEffect(() => {
    initAuth();
  }, [initAuth]);

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

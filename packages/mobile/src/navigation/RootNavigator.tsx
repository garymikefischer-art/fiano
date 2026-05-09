/**
 * Root-Navigator mit Auth-Gate + Splash-Loading.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { ExportScreen } from '../screens/ExportScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const initializing = useAuthStore((s) => s.initializing);
  const session = useAuthStore((s) => s.session);

  if (initializing) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0d1014' },
        headerTitleStyle: { color: '#f1f2f2', fontSize: 16, fontWeight: '600' },
        headerTintColor: '#ff1039',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#090b0c' },
      }}
    >
      {session ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Import' }} />
          <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'Export' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: '' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

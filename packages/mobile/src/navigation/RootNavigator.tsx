/**
 * Root-Navigator.
 *
 * Auth-Gate: zeigt Login/Signup wenn keine Session, sonst App-Stack.
 * Initial-Loading-Screen während `authStore.init()` läuft.
 */

import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
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
    return (
      <View className="flex-1 items-center justify-center bg-fiano-bg">
        <ActivityIndicator color="#ff1039" size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#13161a' },
        headerTitleStyle: { color: '#f1f2f2' },
        headerTintColor: '#ff1039',
        contentStyle: { backgroundColor: '#090b0c' },
      }}
    >
      {session ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'fiano' }} />
          <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Import' }} />
          <Stack.Screen name="Export" component={ExportScreen} options={{ title: 'Export' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Sign up' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

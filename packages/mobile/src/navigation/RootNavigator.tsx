/**
 * Root-Navigator mit Auth-Gate + Splash-Loading.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ExportScreen } from '../screens/ExportScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { AddVideoProjectScreen } from '../screens/AddVideoProjectScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PricingScreen } from '../screens/PricingScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { LanguagePickerScreen } from '../screens/LanguagePickerScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SearchModalScreen } from '../screens/SearchModalScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const authInitializing = useAuthStore((s) => s.initializing);
  const appInitializing = useAppStore((s) => s.initializing);
  const session = useAuthStore((s) => s.session);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

  if (authInitializing || appInitializing) {
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
        !onboardingCompleted ? (
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
        ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Pricing"
            component={PricingScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Legal"
            component={LegalScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="LanguagePicker"
            component={LanguagePickerScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="Search"
            component={SearchModalScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="AddVideoProject"
            component={AddVideoProjectScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="Export"
            component={ExportScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
        </>
        )
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: '' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

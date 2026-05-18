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
import { ThumbnailGeneratorScreen } from '../screens/ThumbnailGeneratorScreen';
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
  const subscription = useAuthStore((s) => s.subscription);
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

  if (authInitializing || appInitializing) {
    return <SplashScreen />;
  }

  // Phase A6.3.2 (2026-05-18): App-Paywall-Gate. User OHNE active creator/pro
  // Sub kommt nicht in die App — Pricing-Screen ist der einzige sichtbare
  // Screen mit paywallMode=true. Lifetime allein reicht NICHT (Mobile cloud
  // render kostet uns monatlich → muss durch monatliches Revenue gedeckt sein).
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const hasActiveMobileSub =
    subscription?.status === 'active' &&
    (subscription?.plan === 'creator' || subscription?.plan === 'pro') &&
    (periodEnd === null || periodEnd > new Date());

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
        ) : !hasActiveMobileSub ? (
          // Paywall-Gate: erst Sub kaufen, dann App-Zugang.
          <Stack.Screen
            name="Pricing"
            component={PricingScreen}
            initialParams={{ paywallMode: true }}
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
            name="ThumbnailGenerator"
            component={ThumbnailGeneratorScreen}
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
          <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}

/**
 * MainTabs — Bottom-Tab-Navigator mit Liquid-Glass-Bar.
 * Reihenfolge analog Screenshot: Home · Projects · Clips · TikTok · Builder.
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { LiquidGlassTabBar } from '../components/LiquidGlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ClipsScreen } from '../screens/ClipsScreen';
import { TikTokScreen } from '../screens/TikTokScreen';
import { BuilderScreen } from '../screens/BuilderScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#0d0509' } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Clips" component={ClipsScreen} />
      <Tab.Screen name="TikTok" component={TikTokScreen} />
      <Tab.Screen name="Builder" component={BuilderScreen} />
    </Tab.Navigator>
  );
}

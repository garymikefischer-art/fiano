/**
 * MainTabs — Bottom-Tab-Navigator mit Liquid-Glass-Bar.
 * Reihenfolge analog Screenshot: Home · Projects · Highlights (Clips) · 9:16 (TikTok) · Builder.
 *
 * Clips/TikTok/Builder-Tabs: tabPress preventDefault + direkter Root-Stack-
 * Navigate zum letzten Projekt mit korrektem initialTab. Damit fällt der
 * Back-Button nicht zurück in einen aktiv-Highlights-Tab der sofort wieder
 * navigiert (Loop).
 */

import { Alert } from 'react-native';
import { appAlert } from '../components/AppAlert';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';

import { LiquidGlassTabBar } from '../components/LiquidGlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ClipsScreen } from '../screens/ClipsScreen';
import { TikTokScreen } from '../screens/TikTokScreen';
import { BuilderScreen } from '../screens/BuilderScreen';
import { useAppStore } from '../stores/appStore';
import { useProjectsStore } from '../stores/projectsStore';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Helper: holt das aktuell zu öffnende Projekt (lastOpened ODER erstes). */
function pickProject() {
  const lastId = useAppStore.getState().lastOpenedProjectId;
  const projects = useProjectsStore.getState().projects;
  return projects.find((p) => p.id === lastId) ?? projects[0] ?? null;
}

/** Quick-Open-Handler: navigiert direkt zum Project-Tab oder zeigt Alert. */
function quickOpenProject(
  navigation: { dispatch: (action: ReturnType<typeof CommonActions.navigate>) => void },
  initialTab: 'highlights' | 'tiktok' | 'builder',
) {
  const target = pickProject();
  if (!target) {
    appAlert(
      'Noch kein Projekt',
      'Erstelle erst ein Projekt, dann öffnet sich hier dein zuletzt bearbeitetes.',
      [
        {
          text: 'Projekt erstellen',
          onPress: () =>
            navigation.dispatch(CommonActions.navigate({ name: 'AddVideoProject' })),
        },
        { text: 'Abbrechen', style: 'cancel' },
      ],
    );
    return;
  }
  navigation.dispatch(
    CommonActions.navigate({
      name: 'ProjectDetail',
      params: { projectId: target.id, initialTab },
    }),
  );
}

/** Phase 9.8: Thumbs-Tab — Quick-Open zum ThumbnailGenerator des aktuellen Projekts. */
function quickOpenThumbs(
  navigation: { dispatch: (action: ReturnType<typeof CommonActions.navigate>) => void },
) {
  const target = pickProject();
  if (!target) {
    appAlert(
      'Noch kein Projekt',
      'Erstelle erst ein Projekt — Thumbnails werden pro Projekt generiert.',
      [
        {
          text: 'Projekt erstellen',
          onPress: () =>
            navigation.dispatch(CommonActions.navigate({ name: 'AddVideoProject' })),
        },
        { text: 'Abbrechen', style: 'cancel' },
      ],
    );
    return;
  }
  navigation.dispatch(
    CommonActions.navigate({ name: 'ThumbnailGenerator', params: { projectId: target.id } }),
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LiquidGlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#0d0509' } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen
        name="Clips"
        component={ClipsScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            quickOpenProject(navigation.getParent() ?? navigation, 'highlights');
          },
        })}
      />
      <Tab.Screen
        name="TikTok"
        component={TikTokScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            quickOpenProject(navigation.getParent() ?? navigation, 'tiktok');
          },
        })}
      />
      <Tab.Screen
        name="Builder"
        component={BuilderScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            quickOpenProject(navigation.getParent() ?? navigation, 'builder');
          },
        })}
      />
      <Tab.Screen
        name="Thumbs"
        component={BuilderScreen /* placeholder — tabPress navigates direkt zum ThumbnailGenerator */}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            quickOpenThumbs(navigation.getParent() ?? navigation);
          },
        })}
      />
    </Tab.Navigator>
  );
}

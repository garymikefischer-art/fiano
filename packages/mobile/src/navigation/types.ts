/**
 * React-Navigation Type-Map.
 * RootStack = Auth + App-Container; MainTabs = Bottom-Tabs nach Login.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Library: undefined;
  Clips: undefined;
  TikTok: undefined;
  Builder: undefined;
};

export type RootStackParamList = {
  // Auth
  Login: undefined;
  Signup: undefined;
  // App
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ProjectDetail: {
    projectId: string;
    /** Welcher Tab beim Öffnen aktiv sein soll. Default: 'highlights'. */
    initialTab?: 'highlights' | 'manual' | 'tiktok' | 'builder';
  };
  Settings: undefined;
  Pricing: undefined;
  Notifications: undefined;
  Help: undefined;
  Legal: undefined;
  LanguagePicker: undefined;
  Onboarding: undefined;
  Search: undefined;
  AddVideoProject: undefined;
  Export: {
    sourceUri: string;
    trimStart: number;
    trimEnd: number;
    sourceDuration: number;
    /** Welchen Mode der User in ProjectModeScreen gewählt hat. */
    mode?: 'highlights' | 'manual' | 'tiktok' | 'builder';
    /** Wenn vorhanden, updated ExportScreen den Projekt-Status nach Erfolg/Fehler. */
    projectId?: string;
    /** Per-Export override (Phase 9.6.2.1). Wenn nicht gesetzt, fällt's auf
     *  appStore.exportSettings zurück. */
    exportSettings?: {
      fps: 24 | 30 | 60;
      resolution: '720p' | '1080p' | '4k';
      bitrate: '5M' | '10M' | '20M' | '40M' | '80M';
    };
  };
};

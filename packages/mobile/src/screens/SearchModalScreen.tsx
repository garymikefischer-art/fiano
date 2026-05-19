/**
 * SearchModalScreen — Vollbild-Search analog Desktop-Topbar-Search.
 *
 * Sucht in:
 *   - Projekten (Title)
 *   - Settings-Quick-Targets (API-Keys, Capture-Regions, Sounds, Language, …)
 *   - Tab-Routes (Home, Projects, Clips, TikTok, Builder)
 *
 * Tap auf einen Treffer navigiert + schließt das Modal.
 */

import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { useProjects } from '../stores/projectsStore';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Search'>;

interface Hit {
  id: string;
  group: 'projects' | 'settings' | 'tabs';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPick: () => void;
}

export function SearchModalScreen() {
  const colors = useColors();
  const nav = useNavigation<Nav>();
  const t = useT();
  const projects = useProjects();
  const [query, setQuery] = useState('');

  const allHits: Hit[] = useMemo(() => {
    const projectHits: Hit[] = projects.map((p) => ({
      id: `p-${p.id}`,
      group: 'projects',
      icon: 'film-outline',
      title: p.title,
      subtitle: `${p.clips.length} ${t('library.clipsLabel', 'clips')} · ${p.subtitle}`,
      onPick: () => {
        nav.replace('ProjectDetail', { projectId: p.id });
      },
    }));

    const settingHits: Hit[] = [
      {
        id: 's-apikeys',
        group: 'settings',
        icon: 'key-outline',
        title: t('search.apiKeys', 'API Keys'),
        subtitle: t('search.apiKeysHint', 'OpenAI · Gemini'),
        onPick: () => nav.replace('Settings'),
      },
      {
        id: 's-export',
        group: 'settings',
        icon: 'cloud-upload-outline',
        title: t('search.exportDefaults', 'Export defaults'),
        subtitle: 'fps · resolution · bitrate',
        onPick: () => nav.replace('Settings'),
      },
      {
        id: 's-regions',
        group: 'settings',
        icon: 'crop-outline',
        title: t('search.captureRegions', 'Capture regions'),
        subtitle: 'Facecam · Gameplay',
        onPick: () => nav.replace('Settings'),
      },
      {
        id: 's-sounds',
        group: 'settings',
        icon: 'musical-note-outline',
        title: t('search.sounds', 'Sounds'),
        subtitle: t('search.soundsHint', 'Toggle UI sound effects'),
        onPick: () => nav.replace('Settings'),
      },
      {
        id: 's-lang',
        group: 'settings',
        icon: 'language-outline',
        title: t('search.language', 'Language'),
        subtitle: t('search.languageHint', '9 supported'),
        onPick: () => nav.replace('LanguagePicker'),
      },
      {
        id: 's-help',
        group: 'settings',
        icon: 'help-circle-outline',
        title: t('search.helpSupport', 'Help & Support'),
        onPick: () => nav.replace('Help'),
      },
    ];

    const tabHits: Hit[] = [
      {
        id: 't-home',
        group: 'tabs',
        icon: 'home-outline',
        title: t('sidebar.home', 'Home'),
        onPick: () => nav.replace('MainTabs', { screen: 'Home' }),
      },
      {
        id: 't-library',
        group: 'tabs',
        icon: 'albums-outline',
        title: t('sidebar.projects', 'Projects'),
        onPick: () => nav.replace('MainTabs', { screen: 'Library' }),
      },
      {
        id: 't-tiktok',
        group: 'tabs',
        icon: 'logo-tiktok',
        title: t('sidebar.tiktokClips', '9:16 Clips'),
        onPick: () => nav.replace('MainTabs', { screen: 'TikTok' }),
      },
      {
        id: 't-builder',
        group: 'tabs',
        icon: 'construct-outline',
        title: t('sidebar.builder', 'Builder'),
        onPick: () => nav.replace('MainTabs', { screen: 'Builder' }),
      },
    ];

    return [...projectHits, ...settingHits, ...tabHits];
  }, [projects, nav, t]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? allHits.filter(
        (h) =>
          h.title.toLowerCase().includes(q) ||
          (h.subtitle && h.subtitle.toLowerCase().includes(q)),
      )
    : allHits.slice(0, 12);

  const grouped = {
    projects: filtered.filter((h) => h.group === 'projects'),
    settings: filtered.filter((h) => h.group === 'settings'),
    tabs: filtered.filter((h) => h.group === 'tabs'),
  };

  const onPick = (hit: Hit) => {
    haptic.light();
    hit.onPick();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <BackgroundGlow />

        {/* Search Input + Cancel */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 6,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.bg.elevated,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.bg.elevated,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              borderRadius: 14,
              paddingHorizontal: 14,
              height: 40,
            }}
          >
            <Ionicons name="search" size={16} color="#71717a" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder', 'Projects, clips, settings…')}
              placeholderTextColor="#71717a"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: colors.text.primary, fontSize: 14, padding: 0 }}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={16} color="#71717a" />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => nav.goBack()} hitSlop={6}>
            <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '600' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
              <Ionicons name="search-outline" size={32} color="rgba(255,255,255,0.32)" />
              <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>
                {t('search.noResults', 'No results')}
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, textAlign: 'center', maxWidth: 240 }}>
                {t(
                  'search.noResultsHint',
                  'Try another keyword. Search runs across project titles, settings and quick navigation.',
                )}
              </Text>
            </View>
          ) : (
            <>
              {grouped.projects.length > 0 && (
                <ResultGroup
                  label={t('search.groupProjects', 'PROJECTS')}
                  hits={grouped.projects}
                  onPick={onPick}
                />
              )}
              {grouped.settings.length > 0 && (
                <ResultGroup
                  label={t('search.groupSettings', 'SETTINGS')}
                  hits={grouped.settings}
                  onPick={onPick}
                />
              )}
              {grouped.tabs.length > 0 && (
                <ResultGroup
                  label={t('search.groupNavigation', 'NAVIGATION')}
                  hits={grouped.tabs}
                  onPick={onPick}
                />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function ResultGroup({
  label,
  hits,
  onPick,
}: {
  label: string;
  hits: Hit[];
  onPick: (h: Hit) => void;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderWidth: 1,
          borderColor: colors.border.subtle,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {hits.map((hit, idx) => (
          <View key={hit.id}>
            {idx > 0 && (
              <View
                style={{ height: 1, backgroundColor: colors.bg.elevated, marginLeft: 50 }}
              />
            )}
            <Pressable
              onPress={() => onPick(hit)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name={hit.icon} size={18} color="#a1a1aa" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}
                >
                  {hit.title}
                </Text>
                {hit.subtitle && (
                  <Text numberOfLines={1} style={{ color: colors.text.tertiary, fontSize: 11 }}>
                    {hit.subtitle}
                  </Text>
                )}
              </View>
              <Ionicons name="arrow-forward" size={14} color="#52525b" />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * HomeScreen — Mobile-Adaption der Desktop HomePage.
 * Header (Logo + Bell + Avatar), Hero (Headline + Description + 2 CTAs),
 * Feature-Cards (horizontal scroll, 5 Cards, Gradient-Wash + farbige Icons),
 * Recent-Projects (horizontal scroll, 4 Cards + "+ New" Tile).
 *
 * String-Quelle: packages/shared/src/i18n/locales/en.ts (hier hardcoded EN bis
 * mobile i18n in einer eigenen Phase aktiviert wird).
 */

import { Image, Pressable, ScrollView, StyleSheet, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '../stores/authStore';
import { useProjects, type Project } from '../stores/projectsStore';
import { useUnreadCount } from '../stores/notificationsStore';
import { FianoLogo } from '../components/FianoLogo';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { NotificationBell } from '../components/NotificationBell';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { useT } from '../lib/i18n';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface FeatureCard {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  gradient: [string, string];
  titleKey: string;
  descKey: string;
  actionKey: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: 'sparkles',
    iconColor: '#e879f9',
    iconBg: 'rgba(232,121,249,0.15)',
    gradient: ['rgba(217,70,239,0.20)', 'rgba(168,85,247,0.10)'],
    titleKey: 'home.featureAiHighlights',
    descKey: 'home.featureAiHighlightsDesc',
    actionKey: 'home.featureAiHighlightsAction',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    iconColor: '#60a5fa',
    iconBg: 'rgba(96,165,250,0.15)',
    gradient: ['rgba(59,130,246,0.20)', 'rgba(14,165,233,0.10)'],
    titleKey: 'home.featureSubtitles',
    descKey: 'home.featureSubtitlesDesc',
    actionKey: 'home.featureSubtitlesAction',
  },
  {
    icon: 'color-wand-outline',
    iconColor: '#fbbf24',
    iconBg: 'rgba(251,191,36,0.15)',
    gradient: ['rgba(245,158,11,0.20)', 'rgba(249,115,22,0.10)'],
    titleKey: 'home.featureEffects',
    descKey: 'home.featureEffectsDesc',
    actionKey: 'home.featureEffectsAction',
  },
  {
    icon: 'musical-notes',
    iconColor: '#f472b6',
    iconBg: 'rgba(244,114,182,0.15)',
    gradient: ['rgba(236,72,153,0.20)', 'rgba(255,16,57,0.10)'],
    titleKey: 'home.featureMusic',
    descKey: 'home.featureMusicDesc',
    actionKey: 'home.featureMusicAction',
  },
  {
    icon: 'cloud-upload-outline',
    iconColor: '#34d399',
    iconBg: 'rgba(52,211,153,0.15)',
    gradient: ['rgba(16,185,129,0.20)', 'rgba(20,184,166,0.10)'],
    titleKey: 'home.featureExport',
    descKey: 'home.featureExportDesc',
    actionKey: 'home.featureExportAction',
  },
];

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const initial = (user?.email?.[0] ?? '?').toUpperCase();
  const projects = useProjects();
  const unreadCount = useUnreadCount();
  const recent = projects.slice(0, 4);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <View style={{ marginLeft: -10 }}>
          <FianoLogo height={72} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SearchIconButton onPress={() => nav.navigate('Search')} />
          <NotificationBell count={unreadCount} onPress={() => nav.navigate('Notifications')} />
          <Pressable
            onPress={() => nav.navigate('Settings')}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#ff1039',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 140, paddingTop: 18, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero (Glass-Card mit roter Eck-Glow analog Desktop) */}
        <View style={{ paddingHorizontal: 20 }}>
          <HeroCard onNew={() => nav.navigate('AddVideoProject')} />
        </View>

        {/* Feature Cards — horizontaler Scroll */}
        <View style={{ gap: 12 }}>
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 }}>
              {t('home.whatYouCanDo', 'What you can do')}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {FEATURES.map((f) => (
              <FeatureTile key={f.titleKey} feature={f} onPress={() => nav.navigate('AddVideoProject')} />
            ))}
          </ScrollView>
        </View>

        {/* Recent Projects */}
        <View style={{ gap: 12 }}>
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 }}>
              {t('home.recentProjects')}
            </Text>
            <Pressable
              onPress={() => nav.navigate('Library')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
                {t('home.viewAllProjects')}
              </Text>
              <Ionicons name="arrow-forward" size={12} color="#a1a1aa" />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {recent.map((p) => (
              <RecentProjectTile
                key={p.id}
                project={p}
                onPress={() => nav.navigate('ProjectDetail', { projectId: p.id })}
              />
            ))}
            <NewProjectTile onPress={() => nav.navigate('AddVideoProject')} t={t} />
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchIconButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="search" size={16} color="#f1f2f2" />
    </Pressable>
  );
}

/* ─── Hero ───────────────────────────────────────────────────── */

function HeroCard({ onNew }: { onNew: () => void }) {
  const t = useT();
  return (
    <View
      style={{
        position: 'relative',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 22,
        padding: 22,
        gap: 14,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,16,57,0.40)', 'rgba(255,16,57,0.10)', 'rgba(255,16,57,0)']}
        locations={[0, 0.55, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Text
        style={{
          color: '#f1f2f2',
          fontSize: 30,
          fontWeight: '700',
          lineHeight: 34,
          letterSpacing: -0.8,
        }}
      >
        {t('home.heroLine1')}{'\n'}
        <Text style={{ color: '#ff1039' }}>{t('home.heroLine2Highlight')}</Text>{' '}
        {t('home.heroLine2Rest')}
      </Text>
      <Text style={{ color: '#a1a1aa', fontSize: 13, lineHeight: 20 }}>
        {t('home.heroDescription')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable
          onPress={onNew}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            shadowColor: '#ff1039',
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
          })}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
            {t('home.newProject')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onNew}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="cloud-upload-outline" size={16} color="#f1f2f2" />
          <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
            {t('home.importVideo')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Feature Tile ───────────────────────────────────────────── */

function FeatureTile({ feature, onPress }: { feature: FeatureCard; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 220,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: 16,
        gap: 12,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Gradient-Wash — LinearGradient statt zwei gestapelter Solid-Layers
          (vorher gab's eine sichtbare Kante bei 50% wo der zweite Layer anfing). */}
      <LinearGradient
        pointerEvents="none"
        colors={[feature.gradient[0], feature.gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={{ flex: 1, gap: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: feature.iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={feature.icon} size={20} color={feature.iconColor} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>
            {t(feature.titleKey)}
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 16 }}>
            {t(feature.descKey)}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ff1039',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t(feature.actionKey)}</Text>
        <Ionicons name="arrow-forward" size={12} color="#fff" />
      </View>
    </Pressable>
  );
}

/* ─── Recent Project Tile ────────────────────────────────────── */

function RecentProjectTile({ project, onPress }: { project: Project; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 180,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          aspectRatio: 16 / 10,
          backgroundColor: `hsl(${project.thumbHue}, 40%, 18%)`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {project.thumbUri && (
          <Image
            source={{ uri: project.thumbUri }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
          />
        )}
        <Ionicons name="play-circle-outline" size={28} color="rgba(255,255,255,0.45)" />
      </View>
      <View style={{ padding: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 4 }}>
        <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
          {project.title}
        </Text>
        <Text style={{ color: '#71717a', fontSize: 10 }}>
          {project.clips.length} clips · {project.subtitle}
        </Text>
        <ProjectStatusBadge status={project.status} compact />
      </View>
    </Pressable>
  );
}

function NewProjectTile({ onPress, t }: { onPress: () => void; t: (k: string, f?: string) => string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 180,
        aspectRatio: 0.86,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: pressed ? 'rgba(255,16,57,0.04)' : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={18} color="#71717a" />
      </View>
      <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '700' }}>{t('home.newProject')}</Text>
    </Pressable>
  );
}

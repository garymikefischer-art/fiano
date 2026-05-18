/**
 * LibraryScreen — Projekt-Grid analog Screenshot.
 * Header: größere fiano-Wortmarke + Bell + Avatar.
 * Body: Title + "+ New Video" Pill, Search-Bar, 2-spaltiges Karten-Grid.
 */

import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { appAlert } from '../components/AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../stores/authStore';
import { useProjects, useProjectsStore, flushProjectsNow, type Project } from '../stores/projectsStore';
import { useUnreadCount } from '../stores/notificationsStore';
import { FianoLogo } from '../components/FianoLogo';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { NotificationBell } from '../components/NotificationBell';
import { SearchBar } from '../components/SearchBar';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import { transcribeVideo } from '../lib/whisper';
import { DEFAULT_SUBTITLES } from '../data/demoProjects';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LibraryScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const projects = useProjects();
  const removeProject = useProjectsStore((s) => s.removeProject);
  const unreadCount = useUnreadCount();
  const [query, setQuery] = useState('');
  const [analyzingProjectId, setAnalyzingProjectId] = useState<string | null>(null);

  const onLongPressProject = (p: Project) => {
    haptic.warning();
    appAlert(
      p.title,
      t('projectCard.deleteConfirmHint', 'This removes all clips and highlights.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('projectCard.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            haptic.success();
            removeProject(p.id);
          },
        },
      ],
    );
  };

  // Re-Analyze (Phase 9.6.7c) — Whisper-Transcribe + Highlight-Detection direkt
  // aus der Library-Card. Bei done: project.clips + project.subtitles.cues.
  const onReAnalyzeProject = (p: Project) => {
    if (!p.sourceUri) {
      appAlert(
        t('library.noSourceTitle', 'No source video'),
        t('library.noSourceBody', 'This project has no source video to analyze.'),
      );
      return;
    }
    if (analyzingProjectId) {
      appAlert(
        t('library.busyTitle', 'Already analyzing'),
        t('library.busyBody', 'Wait for the current analysis to finish.'),
      );
      return;
    }
    appAlert(
      t('library.reAnalyzeTitle', 'Re-analyze with AI'),
      t(
        'library.reAnalyzeBody',
        'Run Whisper transcription + highlight detection. Existing cues and clips will be replaced. Uses your OpenAI API key.',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('library.reAnalyzeConfirm', 'Analyze'),
          onPress: async () => {
            haptic.medium();
            setAnalyzingProjectId(p.id);
            useProjectsStore.getState().updateProject(p.id, { status: 'processing' });
            try {
              const result = await transcribeVideo({
                sourceUri: p.sourceUri!,
                projectId: p.id,
                videoType: p.videoType ?? 'auto',
              });
              const existing = p.subtitles ?? DEFAULT_SUBTITLES;
              const newClips =
                result.highlights.length > 0
                  ? result.highlights.map((h, i) => ({
                      id: `ai-${Date.now().toString(36)}-${i}`,
                      startSec: h.startSec,
                      endSec: h.endSec,
                      label: h.label,
                      score: h.score,
                    }))
                  : p.clips;
              useProjectsStore.getState().updateProject(p.id, {
                subtitles: { ...existing, enabled: true, cues: result.cues },
                clips: newClips,
                status: 'ready',
                errorMessage: undefined,
              });
              await flushProjectsNow();
              haptic.success();
              appAlert(
                t('library.analyzeDoneTitle', 'AI analysis complete'),
                `${result.cues.length} cues · ${result.highlights.length} highlight clips`,
              );
            } catch (err: any) {
              haptic.error();
              useProjectsStore.getState().updateProject(p.id, {
                status: 'failed',
                errorMessage: err?.message ?? String(err),
              });
              appAlert(
                t('library.analyzeFailed', 'Analysis failed'),
                err?.message ?? String(err),
              );
            } finally {
              setAnalyzingProjectId(null);
            }
          },
        },
      ],
    );
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [query, projects]);

  const initial = (user?.email?.[0] ?? '?').toUpperCase();
  const totalClips = projects.reduce((s, p) => s + p.clips.length, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header — paddingHorizontal=20 ident mit body. marginLeft=-9 gleicht
          das SVG-viewBox-Inner-Padding (~75/1000 = 7.5% bei height=72) aus.
          Damit beginnt das sichtbare Logo-Pixel bei exakt 20px (= Body-Title). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 6,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <View style={{ marginLeft: -9 }}>
          <FianoLogo height={72} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => nav.navigate('Search')}
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, paddingTop: 12, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title-Row: "Library" + Counts + "+ New Video" */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: '#f1f2f2', fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }}>
              {t('library.title')}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 13, marginTop: 4 }}>
              {projects.length}{' '}
              {projects.length === 1
                ? t('library.projectSingular')
                : t('library.projectPlural')}{' '}
              · {totalClips} {t('library.clipsLabel')}
            </Text>
          </View>
          <Pressable
            onPress={() => nav.navigate('AddVideoProject')}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              borderRadius: 999,
              paddingVertical: 11,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
            })}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {t('library.newVideo')}
            </Text>
          </Pressable>
        </View>

        <SearchBar
          placeholder={t('library.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
        />

        {/* Project Grid (2-spaltig) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => nav.navigate('ProjectDetail', { projectId: p.id })}
              onLongPress={() => onLongPressProject(p)}
              onAnalyze={() => onReAnalyzeProject(p)}
              analyzing={analyzingProjectId === p.id}
              t={t}
            />
          ))}
        </View>

        {filtered.length === 0 && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.045)',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              padding: 28,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '600' }}>
              {t('library.noMatches', 'No matches')}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
              {t('library.tryDifferentSearch', 'Try a different search term.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProjectCard({
  project,
  onOpen,
  onLongPress,
  onAnalyze,
  analyzing,
  t,
}: {
  project: Project;
  onOpen: () => void;
  onLongPress: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  t: (k: string, f?: string) => string;
}) {
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        width: '48%',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
        <Ionicons name="play-circle-outline" size={32} color="rgba(255,255,255,0.45)" />
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
            {project.clips.length} {t('library.clipsLabel')}
          </Text>
        </View>
      </View>

      <View style={{ padding: 12, gap: 6 }}>
        <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
          {project.title}
        </Text>
        <Text style={{ color: '#71717a', fontSize: 11 }}>{project.subtitle}</Text>
        <View style={{ marginTop: 2 }}>
          <ProjectStatusBadge status={project.status} compact />
        </View>
        <Text style={{ color: '#71717a', fontSize: 10 }}>
          {project.clips.length} {t('library.highlightsDetected', 'highlights detected')}
        </Text>

        {/* Phase 9.6.7c: Open + Re-Analyze nebeneinander analog Desktop ProjectCard. */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <Pressable
            onPress={onOpen}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {t('library.openProject', 'Open')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onAnalyze}
            disabled={analyzing || !project.sourceUri}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: analyzing || !project.sourceUri ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name={analyzing ? 'hourglass-outline' : 'sparkles-outline'}
              size={14}
              color="#f1f2f2"
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

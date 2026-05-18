/**
 * ProjectDetailScreen — analog Desktop ProjectDetailPage mit Tabs.
 *
 * Vier Tabs (Reihenfolge wie Desktop):
 *   - Highlights — Clip-Liste, Multi-Select, „Build YouTube video" → Builder-Tab
 *   - Manual     — VideoPlayer + Mark In/Out + Clip-Liste (absorbiert ManualEditor)
 *   - 9:16       — TikTok-Mode mit Stacking + Subs + Music + Intro (Stubs)
 *   - Builder    — gewählte Clips in Reihenfolge + Export-Stub
 *
 * Tab + Multi-Select-State lebt hier zentral, einzelne Tab-Bodies sind
 * Sub-Komponenten unten in der Datei.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
} from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { VideoPlayer } from '../components/VideoPlayer';
import {
  DEFAULT_SPLIT_RATIO,
  formatDuration,
  formatTimecode,
  type AIHighlight,
  type DemoClip,
  type DemoProject,
  type ProjectExtraVideo,
  type ProjectMode,
  type SourceType,
} from '../data/demoProjects';
import { useProject, useProjectsStore, flushProjectsNow } from '../stores/projectsStore';
import {
  useAppStore,
  FACECAM_PRESETS,
  GAMEPLAY_PRESETS,
  type FacecamPreset,
  type GameplayPreset,
  type Region,
} from '../stores/appStore';
import { RegionOverlay } from '../components/RegionOverlay';
import { RegionPreviewCard } from '../components/RegionPreviewCard';
import {
  RegionCroppedVideoPlayer,
  type RegionCroppedVideoHandle,
} from '../components/RegionCroppedVideoPlayer';
import { MusicPreviewPlayer } from '../components/MusicPreviewPlayer';
import { VoiceOverPreviewPlayer } from '../components/VoiceOverPreviewPlayer';
import { SimpleSlider } from '../components/SimpleSlider';
import { VoiceOversSection } from '../components/VoiceOversSection';
import { CueEditorModal } from '../components/CueEditorModal';
import { ActionSheet, type ActionSheetItem } from '../components/ActionSheet';
import { RegionPickerModal } from '../components/RegionPickerModal';
import { TrimModal } from '../components/TrimModal';
import { extractVideoThumbnail } from '../lib/thumbnails';
import { transcribeVideo, transcribeMultiSource } from '../lib/whisper';
import { SubtitleSettingsModal } from '../components/SubtitleSettingsModal';
import { SubtitleOverlay } from '../components/SubtitleOverlay';
import { ExportSettingsModal } from '../components/ExportSettingsModal';
import { DEFAULT_SUBTITLES, type SubtitleSettings } from '../data/demoProjects';
import { pickVideoFromFiles } from '../lib/mediaPicker';
import { MultiAudioPicker, type AudioTrack } from '../components/MultiAudioPicker';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import * as sounds from '../lib/sounds';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ProjectDetail'>;
type R = RouteProp<RootStackParamList, 'ProjectDetail'>;
type TabId = 'highlights' | 'manual' | 'tiktok' | 'builder';

export function ProjectDetailScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const { params } = useRoute<R>();
  const project = useProject(params.projectId);
  const removeProject = useProjectsStore((s) => s.removeProject);

  const [activeTab, setActiveTab] = useState<TabId>(params.initialTab ?? 'highlights');
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());

  const setLastOpenedProjectId = useAppStore((s) => s.setLastOpenedProjectId);

  useEffect(() => {
    sounds.projectOpen();
    if (params.projectId) {
      void setLastOpenedProjectId(params.projectId);
    }
  }, [params.projectId, setLastOpenedProjectId]);

  const onDelete = () => {
    if (!project) return;
    haptic.warning();
    appAlert(
      project.title,
      t('projectCard.deleteConfirmHint', 'This removes all clips and highlights.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('projectCard.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            haptic.success();
            removeProject(project.id);
            nav.goBack();
          },
        },
      ],
    );
  };

  if (!project) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 16 }}>
            {t('projectDetail.notFound', 'Project not found')}
          </Text>
          <Pressable
            onPress={() => nav.goBack()}
            style={{
              marginTop: 16,
              paddingVertical: 10,
              paddingHorizontal: 18,
              borderRadius: 12,
              backgroundColor: '#ff1039',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {t('projectDetail.goBack', 'Go back')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <IconButton icon="chevron-back" onPress={() => nav.goBack()} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700' }}>
            {project.title}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton
            icon="sparkles-outline"
            onPress={() => nav.navigate('ThumbnailGenerator', { projectId: project.id })}
          />
          <IconButton icon="trash-outline" onPress={onDelete} />
          <IconButton icon="share-outline" onPress={() => {}} />
        </View>
      </View>

      {/* Tabs */}
      <TabBar
        active={activeTab}
        onChange={(tab) => {
          haptic.selection();
          setActiveTab(tab);
        }}
        t={t}
      />

      {/* Tab Body */}
      {activeTab === 'highlights' && (
        <HighlightsTab
          project={project}
          selectedClipIds={selectedClipIds}
          setSelectedClipIds={setSelectedClipIds}
          onBuild={() => setActiveTab('builder')}
          t={t}
        />
      )}
      {activeTab === 'manual' && <ManualTab project={project} t={t} />}
      {activeTab === 'tiktok' && (
        <TikTokTab
          project={project}
          selectedClipIds={selectedClipIds}
          setSelectedClipIds={setSelectedClipIds}
          t={t}
        />
      )}
      {activeTab === 'builder' && (
        <BuilderTab project={project} selectedClipIds={selectedClipIds} t={t} />
      )}
    </SafeAreaView>
  );
}

/* ─── Header IconButton ────────────────────────────────────────── */

function IconButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
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
      <Ionicons name={icon} size={18} color="#f1f2f2" />
    </Pressable>
  );
}

/* ─── TabBar ───────────────────────────────────────────────────── */

const TABS: Array<{ id: TabId; key: string; fallback: string }> = [
  { id: 'highlights', key: 'projectDetail.tabHighlights', fallback: 'Highlights' },
  { id: 'manual', key: 'projectDetail.manualLabel', fallback: 'Manual' },
  { id: 'tiktok', key: 'projectDetail.tabTikTok', fallback: '9:16' },
  { id: 'builder', key: 'sidebar.builder', fallback: 'Builder' },
];

function TabBar({
  active,
  onChange,
  t,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  t: (k: string, f?: string) => string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {TABS.map((tab) => {
        const focused = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => ({
              paddingVertical: 12,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                color: focused ? '#f1f2f2' : '#71717a',
                fontSize: 13,
                fontWeight: focused ? '700' : '600',
              }}
            >
              {t(tab.key, tab.fallback)}
            </Text>
            {focused && (
              <View
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: '#ff1039',
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─── HighlightsTab ────────────────────────────────────────────── */

function HighlightsTab({
  project,
  selectedClipIds,
  setSelectedClipIds,
  onBuild,
  t,
}: {
  project: DemoProject;
  selectedClipIds: Set<string>;
  setSelectedClipIds: (s: Set<string>) => void;
  onBuild: () => void;
  t: (k: string, f?: string) => string;
}) {
  // Phase A3.9: nav-hook für AI-Highlight → Export-Routing
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const exportSettings = useAppStore((s) => s.exportSettings);
  const totalDuration = project.clips.reduce((s, c) => s + (c.endSec - c.startSec), 0);
  const avgScore = project.clips.length
    ? Math.round((project.clips.reduce((s, c) => s + c.score, 0) / project.clips.length) * 100)
    : 0;
  const selectedCount = selectedClipIds.size;
  const allSelected = selectedCount > 0 && selectedCount === project.clips.length;

  // Phase 9.6.7a — AI-Transcribe-State
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'uploading' | 'transcribing' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cueEditorOpen, setCueEditorOpen] = useState(false);
  // Phase A3 — Multi-Clip-Transcribe-Progress
  const [multiProgress, setMultiProgress] = useState<{
    current: number;
    total: number;
    phase: 'uploading' | 'transcribing';
  } | null>(null);
  const cues = project.subtitles?.cues ?? [];
  const hasCues = cues.length > 0;
  const multiClipCount = project.sourceUris?.length ?? 0;
  const isMultiClip = multiClipCount > 1;
  // Phase A3.6: Active-Source-Selector für Multi-Clip-Preview.
  // Tap auf SelectableClipRow → wechselt Player zur ausgewählten Source.
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const projectSourceUris = project.sourceUris ?? [];
  const isMultiSource = projectSourceUris.length >= 2;
  const activeSourceUri = isMultiSource
    ? projectSourceUris[Math.min(activeSourceIdx, projectSourceUris.length - 1)]
    : project.sourceUri;
  // Phase A3.9.b1: state für ActionSheet auf AI-Highlight-Tap.
  const [aiActionSheet, setAiActionSheet] = useState<{
    h: AIHighlight;
    idx: number;
  } | null>(null);
  // Phase A3.10.2: SeekTo für Hero-Player. Wird bei AI-Highlight-Play-Tap
  // gesetzt → VideoPlayer scrubt zur Range-Start und spielt ab.
  const [heroSeekTo, setHeroSeekTo] = useState<number | undefined>(undefined);
  // Phase A3.10.2: index des AI-Highlights der gerade "in preview" ist
  // (für visuellen Indikator auf der Card).
  const [previewingHighlightIdx, setPreviewingHighlightIdx] = useState<number | null>(null);

  // Phase A3: Multi-Clip-Transcribe — transcribed ALLE sourceUris, merged cues
  // mit Time-Offsets. Opt-in via separater Button (sichtbar nur bei
  // isMultiClip), weil Cost = N × Whisper-API-Use auf User's OpenAI-Key.
  const onAnalyzeAllClips = () => {
    const sourceUris = project.sourceUris ?? [];
    if (sourceUris.length <= 1 || analysisBusy) return;
    appAlert(
      t('highlights.analyzeAllTitle', 'Analyze all clips'),
      t(
        'highlights.analyzeAllBody',
        'Transcribe all {n} clips? Uses your OpenAI API key — multiple calls.',
      ).replace('{n}', String(sourceUris.length)),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.continue', 'Continue'),
          onPress: () => void runMultiAnalyze(sourceUris),
        },
      ],
    );
  };

  const runMultiAnalyze = async (sourceUris: string[]) => {
    haptic.medium();
    setAnalysisBusy(true);
    setMultiProgress({ current: 0, total: sourceUris.length, phase: 'uploading' });
    try {
      const result = await transcribeMultiSource({
        sourceUris,
        projectId: project.id,
        videoType: project.videoType ?? 'auto',
        onProgress: (current, total, phase) =>
          setMultiProgress({ current, total, phase }),
      });
      const existing = project.subtitles ?? DEFAULT_SUBTITLES;
      // Phase A3.1 + A3.2 + A3.5 + A3.11 (2026-05-17):
      //  - clips bleiben source-clips, AI-Highlights werden zusätzlich als
      //    kind='highlight' clips angehängt (A3.11 — User-Wunsch direkt im
      //    TikTok+Builder Selector nutzbar).
      //  - subtitles.cues bekommen aggregierte Cues mit clipIndex (A3.2)
      //  - perClipDurations gespeichert für Cue-Zuordnung im Editor (A3.2)
      //  - aiHighlights als separates Feld (A3.5) — für HighlightsTab.
      const sourceClips = project.clips.filter((c) => c.kind !== 'highlight');
      const highlightClips: DemoClip[] = result.highlights.map((h, i) => {
        // Multi-Clip: Highlight startSec/endSec ist absolute time across
        // sources. Resolve auf source-relative + sourceIdx.
        const fakeProject = {
          ...project,
          aiHighlights: result.highlights,
          perClipDurations: result.perClipDurations,
        };
        const resolved = resolveHighlightSource(h, fakeProject);
        return {
          id: `ai-${Date.now().toString(36)}-${i}`,
          startSec: resolved?.trimStart ?? h.startSec,
          endSec: resolved?.trimEnd ?? h.endSec,
          label: h.label || `AI ${i + 1}`,
          score: h.score,
          kind: 'highlight',
          reason: h.reason,
          sourceIdx: resolved?.clipIndex,
        };
      });
      useProjectsStore.getState().updateProject(project.id, {
        subtitles: { ...existing, enabled: true, cues: result.cues },
        perClipDurations: result.perClipDurations,
        aiHighlights: result.highlights,
        clips: [...sourceClips, ...highlightClips],
        status: 'ready',
      });
      await flushProjectsNow();
      haptic.success();
      appAlert(
        t('highlights.analyzeAllDoneTitle', 'Multi-clip analysis done'),
        t(
          'highlights.analyzeAllDoneBody',
          '{cues} cues across {clips} clips · {highlights} highlights',
        )
          .replace('{cues}', String(result.cues.length))
          .replace('{clips}', String(sourceUris.length))
          .replace('{highlights}', String(result.highlights.length)),
      );
    } catch (err: any) {
      haptic.error();
      const failedAt = multiProgress
        ? `${t('highlights.analyzeAllFailedClip', 'Failed at clip {n}/{total}')
            .replace('{n}', String((multiProgress.current ?? 0) + 1))
            .replace('{total}', String(multiProgress.total))}: `
        : '';
      appAlert(
        t('highlights.analyzeFailed', 'Analysis failed'),
        `${failedAt}${err?.message ?? String(err)}`,
      );
    } finally {
      setAnalysisBusy(false);
      setMultiProgress(null);
    }
  };

  const onAnalyze = async () => {
    if (!project.sourceUri || analysisBusy) return;
    haptic.medium();
    setAnalysisBusy(true);
    setUploadProgress(0);
    setAnalysisPhase('uploading');
    try {
      const result = await transcribeVideo({
        sourceUri: project.sourceUri,
        projectId: project.id,
        videoType: project.videoType ?? 'auto',
        onPhase: setAnalysisPhase,
        onUploadProgress: setUploadProgress,
      });
      const existing = project.subtitles ?? DEFAULT_SUBTITLES;
      // Phase A3.10.1 + A3.11 (2026-05-17): source-clip(s) bleiben erhalten.
      // AI-Highlights werden in BEIDE Felder geschrieben:
      //  - project.aiHighlights: für HighlightsTab-Sektion + back-compat
      //  - project.clips als zusätzliche items mit kind='highlight':
      //    erscheinen automatisch in TikTok+Builder Clip-Selektoren
      //    (User-Wunsch A3.11: AI-Highlights direkt nutzbar ohne extra
      //    "Add to ..."-Klick).
      // Source-clips (kind='source' oder undefined) bleiben unverändert.
      const sourceClips = project.clips.filter((c) => c.kind !== 'highlight');
      const highlightClips: DemoClip[] = result.highlights.map((h, i) => ({
        id: `ai-${Date.now().toString(36)}-${i}`,
        startSec: h.startSec,
        endSec: h.endSec,
        label: h.label || `AI ${i + 1}`,
        score: h.score,
        kind: 'highlight',
        reason: h.reason,
      }));
      useProjectsStore.getState().updateProject(project.id, {
        subtitles: { ...existing, enabled: true, cues: result.cues },
        aiHighlights: result.highlights,
        clips: [...sourceClips, ...highlightClips],
        status: 'ready',
      });
      // Explicit force-flush — sonst kann pending AsyncStorage-Write beim
      // App-Kill verloren gehen (User-Report 9.6.7g: Highlights weg nach Neustart).
      await flushProjectsNow();
      haptic.success();
      appAlert(
        t('highlights.analyzeDoneTitle', 'AI analysis complete'),
        `${result.cues.length} cues · ${result.highlights.length} highlight clips detected. Tap 'Edit cues' to refine subtitles.`,
      );
    } catch (err: any) {
      haptic.error();
      appAlert(
        t('highlights.analyzeFailed', 'Analysis failed'),
        err?.message ?? String(err),
      );
    } finally {
      setAnalysisBusy(false);
      setAnalysisPhase(null);
    }
  };

  const toggleClip = (id: string) => {
    haptic.light();
    const next = new Set(selectedClipIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedClipIds(next);
  };

  const toggleAll = () => {
    haptic.selection();
    if (allSelected) setSelectedClipIds(new Set());
    else setSelectedClipIds(new Set(project.clips.map((c) => c.id)));
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, paddingTop: 16, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero — Phase A3.6/A3.10.2: bei Multi-Source wird der aktive Clip
          gezeigt. `key={activeSourceUri}` zwingt Re-Mount damit der Player
          das neue Video lädt. `seekTo` wird bei AI-Highlight-Play-Tap gesetzt
          (A3.10.2) → Player scrubt zur Range. */}
      {activeSourceUri ? (
        <VideoPlayer
          uri={activeSourceUri}
          key={activeSourceUri}
          seekTo={heroSeekTo}
        />
      ) : (
        <PlaceholderHero project={project} />
      )}
      {/* Phase A3.6: Multi-Source-Tab — zeigt welcher Clip gerade abgespielt wird. */}
      {isMultiSource && (
        <Text style={{ color: '#71717a', fontSize: 11, marginTop: -8 }}>
          {t('multiClip.playingClip', 'Playing clip {n}/{total}')
            .replace('{n}', String(activeSourceIdx + 1))
            .replace('{total}', String(projectSourceUris.length))}
        </Text>
      )}

      {/* Stats */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ProjectStatusBadge status={project.status} />
        <Text style={{ color: '#71717a', fontSize: 12 }}>
          {project.clips.length} {t('projectDetail.highlightsLabel', 'highlights')}
          {project.clips.length > 0 && ` · ${formatDuration(totalDuration)}`}
          {project.clips.length > 0 && ` · ${t('projectDetail.avgScore', 'avg score')} ${avgScore}`}
        </Text>
      </View>

      {project.status === 'failed' && project.errorMessage && (
        <Text style={{ color: '#ef4444', fontSize: 11, lineHeight: 16 }}>
          {project.errorMessage}
        </Text>
      )}

      {/* AI Analysis Box (Phase 9.6.7a) — generiert Subtitle-Cues via Whisper. */}
      {project.sourceUri && (
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: hasCues ? 'rgba(34,197,94,0.32)' : 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 12,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons
              name={hasCues ? 'checkmark-circle' : 'sparkles-outline'}
              size={16}
              color={hasCues ? '#22c55e' : '#ff1039'}
            />
            <Text style={{ flex: 1, color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
              {t('highlights.aiAnalysis', 'AI Analysis')}
            </Text>
            {hasCues && (
              <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '700' }}>
                {cues.length} {t('highlights.cuesLabel', 'cues')}
              </Text>
            )}
          </View>
          <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 15 }}>
            {hasCues
              ? t(
                  'highlights.aiAnalysisDone',
                  'Subtitles transcribed. Edit cues to refine text, then enable subtitles in the 9:16 tab.',
                )
              : t(
                  'highlights.aiAnalysisHint',
                  'Transcribe audio via OpenAI Whisper to generate timed subtitle cues. Uses your OpenAI API key.',
                )}
          </Text>
          {analysisBusy && (
            <View style={{ gap: 4 }}>
              {/* Phase A3: Multi-Clip-Progress hat Vorrang — zeigt "Clip 2/5 · Uploading" */}
              {multiProgress ? (
                <Text style={{ color: '#71717a', fontSize: 10 }}>
                  {t('highlights.analyzeAllProgress', 'Clip {n}/{total} · {phase}')
                    .replace('{n}', String(multiProgress.current + 1))
                    .replace('{total}', String(multiProgress.total))
                    .replace(
                      '{phase}',
                      multiProgress.phase === 'uploading'
                        ? t('highlights.phaseUploading', 'Uploading')
                        : t('highlights.phaseTranscribing', 'Transcribing'),
                    )}
                </Text>
              ) : (
                <Text style={{ color: '#71717a', fontSize: 10 }}>
                  {analysisPhase === 'uploading'
                    ? t('highlights.uploading', `Uploading source… ${Math.round(uploadProgress * 100)}%`).replace(
                        '${pct}',
                        String(Math.round(uploadProgress * 100)),
                      )
                    : t('highlights.transcribing', 'Transcribing audio with Whisper…')}
                </Text>
              )}
              <View
                style={{
                  height: 3,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: analysisPhase === 'uploading' ? `${Math.round(uploadProgress * 100)}%` : '60%',
                    backgroundColor: '#ff1039',
                  }}
                />
              </View>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={onAnalyze}
              disabled={analysisBusy}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: analysisBusy
                  ? 'rgba(255,255,255,0.06)'
                  : pressed
                    ? '#cc0d2e'
                    : '#ff1039',
                opacity: analysisBusy ? 0.5 : 1,
              })}
            >
              <Ionicons name="sparkles" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {hasCues
                  ? t('highlights.reAnalyze', 'Re-analyze')
                  : t('highlights.analyze', 'Analyze with AI')}
              </Text>
            </Pressable>
            {/* Phase A3: Multi-Clip Analyze-Button — sichtbar nur bei >1 sourceUri. */}
            {isMultiClip && !analysisBusy && (
              <Pressable
                onPress={onAnalyzeAllClips}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,16,57,0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,16,57,0.4)',
                  opacity: pressed ? 0.7 : 1,
                })}
                accessibilityLabel={t('highlights.analyzeAllTitle', 'Analyze all clips')}
              >
                <Ionicons name="layers-outline" size={13} color="#ff1039" />
                <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
                  {t('highlights.analyzeAllShort', 'All {n}').replace('{n}', String(multiClipCount))}
                </Text>
              </Pressable>
            )}
            {hasCues && !analysisBusy && (
              <Pressable
                onPress={() => {
                  haptic.medium();
                  setCueEditorOpen(true);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.10)',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="create-outline" size={13} color="#f1f2f2" />
                <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
                  {t('highlights.editCues', 'Edit cues')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <CueEditorModal
        visible={cueEditorOpen}
        cues={cues}
        sourceUris={project.sourceUris}
        onClose={() => setCueEditorOpen(false)}
        onSave={(nextCues) => {
          const existing = project.subtitles ?? DEFAULT_SUBTITLES;
          useProjectsStore.getState().updateProject(project.id, {
            subtitles: { ...existing, cues: nextCues },
          });
        }}
      />

      {/* Multi-Select Action-Bar */}
      {project.clips.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Pressable onPress={toggleAll} hitSlop={6}>
            <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '700' }}>
              {allSelected
                ? t('highlights.unselectAll', 'Unselect all')
                : t('highlights.selectAll', 'Select all')}
              {selectedCount > 0 && !allSelected ? ` (${selectedCount})` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (selectedCount === 0) {
                haptic.error();
                return;
              }
              haptic.medium();
              onBuild();
            }}
            disabled={selectedCount === 0}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: selectedCount === 0
                ? 'rgba(255,255,255,0.06)'
                : pressed
                  ? '#cc0d2e'
                  : '#ff1039',
              opacity: selectedCount === 0 ? 0.5 : 1,
            })}
          >
            <Ionicons
              name="construct"
              size={14}
              color={selectedCount === 0 ? '#a1a1aa' : '#fff'}
            />
            <Text
              style={{
                color: selectedCount === 0 ? '#a1a1aa' : '#fff',
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {t('highlights.buildVideo', 'Build YouTube video')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Clip List or Empty */}
      {project.clips.length === 0 ? (
        <EmptyClips project={project} t={t} />
      ) : (
        <View style={{ gap: 8 }}>
          {project.clips.map((clip, idx) => (
            <SelectableClipRow
              key={clip.id}
              index={idx + 1}
              clip={clip}
              hue={project.thumbHue}
              selected={selectedClipIds.has(clip.id)}
              /* Phase A3.6: bei Multi-Source markiert + switched zum source-clip. */
              activeForPreview={isMultiSource && idx === activeSourceIdx}
              onToggle={() => {
                if (isMultiSource) setActiveSourceIdx(idx);
                toggleClip(clip.id);
              }}
            />
          ))}
        </View>
      )}

      {/* Phase A3.5 + A3.9 (2026-05-17): AI-Highlights-Section.
          Sichtbar nur wenn Multi-Clip-Analyze AI-Highlights gefunden hat.
          A3.9: Cards sind jetzt klickbar — Action-Sheet mit Export- und
          Builder-Add-Option. */}
      {(project.aiHighlights?.length ?? 0) > 0 && (
        <View style={{ gap: 8, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={13} color="#ff1039" />
            <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
              {t('highlights.aiHighlightsHeading', 'AI HIGHLIGHTS')} · {project.aiHighlights!.length}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 10 }}>· {t('highlights.aiTapHint', 'tap for actions')}</Text>
          </View>
          {project.aiHighlights!.map((h, idx) => {
            const isPreviewActive = previewingHighlightIdx === idx;
            return (
              <View
                key={`ai-${idx}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: isPreviewActive ? 'rgba(255,16,57,0.18)' : 'rgba(255,16,57,0.06)',
                  borderWidth: isPreviewActive ? 2 : 1,
                  borderColor: isPreviewActive ? '#ff1039' : 'rgba(255,16,57,0.2)',
                  gap: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                {/* Phase A3.10.2: Separater Play-Button für Player-Preview */}
                <Pressable
                  onPress={() => {
                    haptic.light();
                    const resolved = resolveHighlightSource(h, project);
                    if (!resolved) {
                      appAlert(
                        t('highlights.aiCrossClipTitle', 'Cross-clip highlight'),
                        t(
                          'highlights.aiCrossClipBody',
                          'Multi-clip highlight preview is coming in a future phase.',
                        ),
                      );
                      return;
                    }
                    // Bei Multi-Source: zur richtigen Source switchen
                    if (isMultiSource && resolved.clipIndex !== activeSourceIdx) {
                      setActiveSourceIdx(resolved.clipIndex);
                    }
                    // Player-Seek mit kleinem random epsilon damit gleicher
                    // seekTo nochmal triggert (siehe ManualTab pattern).
                    setHeroSeekTo(resolved.trimStart + Math.random() * 1e-9);
                    setPreviewingHighlightIdx(idx);
                  }}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: isPreviewActive
                      ? '#ff1039'
                      : pressed
                        ? 'rgba(255,16,57,0.35)'
                        : 'rgba(255,16,57,0.2)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#ff1039',
                  })}
                  accessibilityLabel={t('highlights.aiPlayPreview', 'Play preview')}
                >
                  <Ionicons
                    name={isPreviewActive ? 'pause' : 'play'}
                    size={12}
                    color={isPreviewActive ? '#fff' : '#ff1039'}
                  />
                </Pressable>
                {/* Main-Card-Area: Tap öffnet ActionSheet (Export/Add to ...) */}
                <Pressable
                  onPress={() => {
                    haptic.medium();
                    setAiActionSheet({ h, idx });
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    gap: 4,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                        {h.label || `Highlight ${idx + 1}`}
                      </Text>
                    </View>
                    <Text style={{ color: '#71717a', fontSize: 10 }}>
                      {formatTime(h.startSec)} – {formatTime(h.endSec)} · {Math.round((h.endSec - h.startSec))}s · {Math.round(h.score * 100)}%
                    </Text>
                  </View>
                  {h.reason && (
                    <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 15 }} numberOfLines={2}>
                      {h.reason}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Phase A3.9.b1: App-Style ActionSheet für AI-Highlight-Tap.
          Statt RN Alert.alert — custom Modal mit BlurView, Glass-Style,
          drei Action-Buttons (Export 9:16 / Add to 9:16 / Add to Builder). */}
      {aiActionSheet && (
        <ActionSheet
          visible={!!aiActionSheet}
          title={aiActionSheet.h.label || `Highlight ${aiActionSheet.idx + 1}`}
          subtitle={`${formatTime(aiActionSheet.h.startSec)} – ${formatTime(aiActionSheet.h.endSec)} · ${Math.round(aiActionSheet.h.endSec - aiActionSheet.h.startSec)}s · ${Math.round(aiActionSheet.h.score * 100)}%`}
          body={aiActionSheet.h.reason}
          icon="sparkles"
          items={buildAIHighlightActions(
            aiActionSheet.h,
            aiActionSheet.idx,
            project,
            nav,
            exportSettings,
            t,
          )}
          onClose={() => setAiActionSheet(null)}
        />
      )}
    </ScrollView>
  );
}

/** Helper: Sekunden → "mm:ss" für AI-Highlights-Display. */
function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Phase A3.9 (2026-05-17): Mappt einen AI-Highlight (absolute timestamps
 * across alle source-clips bei Multi-Clip-Mode) auf seine Source + relative
 * Trim-Range.
 *
 * Returns null bei cross-boundary highlights (selten, würde Multi-Clip-Export
 * mit builderItemPlan benötigen — kommt in A3.9b).
 */
function resolveHighlightSource(
  h: AIHighlight,
  project: DemoProject,
): { uri: string; trimStart: number; trimEnd: number; clipIndex: number } | null {
  const sourceUris = project.sourceUris ?? [];
  // Single-source-Mode: trims sind direkt auf project.sourceUri.
  if (sourceUris.length < 2) {
    if (!project.sourceUri) return null;
    return {
      uri: project.sourceUri,
      trimStart: h.startSec,
      trimEnd: h.endSec,
      clipIndex: 0,
    };
  }
  // Multi-source-Mode: durch perClipDurations iterieren um zu finden in
  // welchem clip dieser highlight liegt.
  const durations = project.perClipDurations ?? sourceUris.map(() => 0);
  let offset = 0;
  for (let i = 0; i < sourceUris.length; i++) {
    const clipDur = durations[i] ?? 0;
    const clipEnd = offset + clipDur;
    if (h.startSec >= offset && h.endSec <= clipEnd + 0.5) {
      return {
        uri: sourceUris[i],
        trimStart: Math.max(0, h.startSec - offset),
        trimEnd: h.endSec - offset,
        clipIndex: i,
      };
    }
    offset = clipEnd;
  }
  return null; // cross-boundary — caller zeigt entweder Warning oder fällt zurück
}

/**
 * Phase A3.9.b1 (2026-05-17): baut die Action-Items für den AI-Highlight-
 * ActionSheet. Liefert 3 Buttons:
 *   1. Export 9:16 (primary, filled red)
 *   2. Add to 9:16 (secondary, outlined) — appended zu project.clips.
 *      Bei Multi-Source: disabled mit Hinweis (Datenmodell unterstützt das
 *      heute nicht ohne clip.sourceIdx-Feld — Future Phase).
 *   3. Add to Builder (secondary, outlined) — extra zu builderExtras.
 *
 * Cross-Boundary-Highlights (resolveHighlightSource returns null) →
 * alle Items disabled mit Hinweis.
 */
function buildAIHighlightActions(
  h: AIHighlight,
  idx: number,
  project: DemoProject,
  nav: NativeStackNavigationProp<RootStackParamList>,
  exportSettings: ReturnType<typeof useAppStore.getState>['exportSettings'],
  t: (k: string, f?: string) => string,
): ActionSheetItem[] {
  const resolved = resolveHighlightSource(h, project);
  if (!resolved) {
    return [
      {
        label: t('highlights.aiCrossClipTitle', 'Highlight spans multiple clips'),
        icon: 'warning-outline',
        variant: 'disabled',
        hint: t(
          'highlights.aiCrossClipBody',
          'Multi-clip highlight export is coming in a future phase.',
        ),
        onPress: () => {},
      },
    ];
  }
  const title = h.label || `Highlight ${idx + 1}`;
  const projectSourceUris = project.sourceUris ?? [];
  const isMultiSource = projectSourceUris.length >= 2;

  return [
    {
      label: t('highlights.aiExport916', 'Export as 9:16'),
      icon: 'share-outline',
      variant: 'primary',
      onPress: () => {
        nav.navigate('Export', {
          sourceUri: resolved.uri,
          projectId: project.id,
          trimStart: resolved.trimStart,
          trimEnd: resolved.trimEnd,
          sourceDuration: resolved.trimEnd - resolved.trimStart,
          mode: 'tiktok',
          exportSettings,
        });
      },
    },
    {
      // Phase A3.10.3 (2026-05-17): Multi-Source jetzt auch unterstützt via
      // DemoClip.sourceIdx. Bei Single-Source bleibt sourceIdx undefined
      // (legacy-Verhalten, mappt auf project.sourceUri).
      label: t('highlights.aiAddTo916', 'Add to 9:16'),
      icon: 'phone-portrait-outline',
      variant: 'secondary',
      onPress: () => {
        const newClip: DemoClip = {
          id: `ai-${Date.now().toString(36)}-${idx}`,
          startSec: resolved.trimStart,
          endSec: resolved.trimEnd,
          label: `AI · ${title.slice(0, 50)}`,
          score: h.score,
          // Bei Multi-Source clipIndex setzen damit TikTok-Tab + Export
          // wissen welche source-uri zu nehmen ist. Single-Source: undefined.
          sourceIdx: isMultiSource ? resolved.clipIndex : undefined,
        };
        useProjectsStore.getState().updateProject(project.id, {
          clips: [...project.clips, newClip],
        });
        haptic.success();
      },
    },
    {
      label: t('highlights.aiAddToBuilder', 'Add to Builder'),
      icon: 'apps-outline',
      variant: 'secondary',
      onPress: () => {
        const newExtra: ProjectExtraVideo = {
          id: `extra-ai-${Date.now().toString(36)}-${idx}`,
          path: resolved.uri,
          filename: `AI · ${title.slice(0, 50)}`,
          durationSec: Math.max(0, resolved.trimEnd - resolved.trimStart),
          trimStart: resolved.trimStart,
          trimEnd: resolved.trimEnd,
        };
        useProjectsStore.getState().updateProject(project.id, {
          builderExtras: [...(project.builderExtras ?? []), newExtra],
          clipOrder: [...(project.clipOrder ?? []), newExtra.id],
        });
        haptic.success();
      },
    },
  ];
}

function SelectableClipRow({
  index,
  clip,
  hue,
  selected,
  activeForPreview,
  onToggle,
}: {
  index: number;
  clip: DemoClip;
  hue: number;
  selected: boolean;
  /** Phase A3.6: Multi-Source-Mode markiert die aktuell im Player abgespielte Source. */
  activeForPreview?: boolean;
  onToggle: () => void;
}) {
  const scorePct = Math.round(clip.score * 100);
  const len = clip.endSec - clip.startSec;
  // A3.6: aktive Source bekommt einen extra fiano-roten Border-Glow.
  const borderColor = activeForPreview
    ? '#ff1039'
    : selected
      ? 'rgba(255,16,57,0.32)'
      : 'rgba(255,255,255,0.08)';
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: selected ? 'rgba(255,16,57,0.08)' : 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        borderWidth: activeForPreview ? 2 : 1,
        borderColor,
        padding: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {/* A3.6: kleines Play-Icon zeigt aktive Preview-Source */}
      {activeForPreview && (
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#ff1039',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#ff1039',
            shadowOpacity: 0.6,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 4,
          }}
        >
          <Ionicons name="play" size={10} color="#fff" />
        </View>
      )}
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? '#ff1039' : 'rgba(255,255,255,0.25)',
          backgroundColor: selected ? '#ff1039' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          backgroundColor: `hsl(${hue}, 40%, 22%)`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' }}>
          #{index}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
          {clip.label}
        </Text>
        <Text style={{ color: '#71717a', fontSize: 11 }}>
          {formatTimecode(clip.startSec)} → {formatTimecode(clip.endSec)} · {len}s
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <View
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${scorePct}%`,
                height: '100%',
                backgroundColor: scorePct > 85 ? '#ff1039' : '#ff7e3e',
              }}
            />
          </View>
          <Text
            style={{
              color: '#a1a1aa',
              fontSize: 10,
              fontWeight: '700',
              minWidth: 28,
              textAlign: 'right',
            }}
          >
            {scorePct}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyClips({
  project,
  t,
}: {
  project: DemoProject;
  t: (k: string, f?: string) => string;
}) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Ionicons name="cut-outline" size={28} color="rgba(255,255,255,0.32)" />
      <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
        {t('projectDetail.noClipsYet', 'No clips yet')}
      </Text>
      <Text
        style={{
          color: '#a1a1aa',
          fontSize: 11,
          textAlign: 'center',
          lineHeight: 17,
          maxWidth: 280,
        }}
      >
        {project.mode === 'manual'
          ? t('projectDetail.noClipsManualHint', 'Switch to the Manual tab to mark in/out points.')
          : t('projectDetail.noClipsAutoHint', 'Re-run the AI analyzer or add clips in Manual tab.')}
      </Text>
    </View>
  );
}

/* ─── ProjectInfoCard ─────────────────────────────────────────── */

const MODE_LABELS: Record<ProjectMode, { key: string; fallback: string }> = {
  highlights: { key: 'projectInfo.modeAuto', fallback: 'Auto · AI extracts highlights' },
  manual: { key: 'projectInfo.modeManual', fallback: 'Manual · User picks clips' },
  tiktok: { key: 'projectInfo.modeTiktok', fallback: '9:16 · vertical export' },
  builder: { key: 'projectInfo.modeBuilder', fallback: 'Builder · multi-clip composition' },
};

const SOURCE_LABELS: Record<SourceType, string> = {
  file: 'File',
  url: 'URL',
  'multi-clip': 'Multi-clip',
};

function ProjectInfoCard({
  project,
  t,
}: {
  project: DemoProject;
  t: (k: string, f?: string) => string;
}) {
  const modeMeta = project.mode ? MODE_LABELS[project.mode] : null;
  const modeText = modeMeta ? t(modeMeta.key, modeMeta.fallback) : '—';
  const sourceText = project.sourceType ? SOURCE_LABELS[project.sourceType] : 'File';
  const created = project.createdAt
    ? new Date(project.createdAt).toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : project.subtitle;
  const nameOrUrl = project.sourceUrl ?? project.title;

  return (
    <View
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 18,
        padding: 16,
        gap: 14,
      }}
    >
      {/* Top-Row: Mode · Source · Status */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <InfoCell
          label={t('projectInfo.modeLabel', 'MODE')}
          value={modeText}
          flex={2}
        />
        <InfoCell
          label={t('projectInfo.sourceTypeLabel', 'SOURCE')}
          value={sourceText}
          flex={1}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={infoLabelStyle}>{t('projectInfo.statusLabel', 'STATUS')}</Text>
        <ProjectStatusBadge status={project.status} compact />
      </View>

      {project.videoType && (
        <View>
          <Text style={infoLabelStyle}>{t('projectInfo.videoTypeLabel', 'VIDEO TYPE')}</Text>
          <Text style={infoValueStyle}>
            {project.videoType.charAt(0).toUpperCase() + project.videoType.slice(1)}
          </Text>
        </View>
      )}

      <View>
        <Text style={infoLabelStyle}>
          {project.sourceUrl
            ? t('projectInfo.urlLabel', 'URL')
            : t('projectInfo.nameLabel', 'NAME')}
        </Text>
        <Text numberOfLines={1} style={infoValueStyle}>
          {nameOrUrl}
        </Text>
      </View>

      {/* Bottom-Row: Created · Duration · Highlights */}
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingTop: 4,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <InfoCell
          label={t('projectInfo.createdLabel', 'CREATED')}
          value={created}
          flex={2}
        />
        <InfoCell
          label={t('projectInfo.durationLabel', 'DURATION')}
          value={formatDuration(project.durationSec)}
          flex={1}
        />
        <InfoCell
          label={t('projectInfo.highlightsLabel', 'HIGHLIGHTS')}
          value={String(project.clips.length)}
          flex={1}
        />
      </View>
    </View>
  );
}

const infoLabelStyle = {
  color: '#71717a',
  fontSize: 10,
  fontWeight: '700' as const,
  letterSpacing: 0.6,
};
const infoValueStyle = {
  color: '#f1f2f2',
  fontSize: 13,
  fontWeight: '600' as const,
  marginTop: 4,
};

function InfoCell({ label, value, flex }: { label: string; value: string; flex: number }) {
  return (
    <View style={{ flex }}>
      <Text style={infoLabelStyle}>{label}</Text>
      <Text numberOfLines={1} style={infoValueStyle}>
        {value}
      </Text>
    </View>
  );
}

/* ─── ManualTab ───────────────────────────────────────────────── */

function ManualTab({
  project,
  t,
}: {
  project: DemoProject;
  t: (k: string, f?: string) => string;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const [currentSec, setCurrentSec] = useState(0);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  // Phase A3.6: Active-Source-Index für Multi-Clip-Projekte (3 Clips switchen).
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);
  const sourceUris = project.sourceUris ?? [];
  const isMultiSource = sourceUris.length >= 2;
  const effectiveSourceUri = isMultiSource
    ? sourceUris[Math.min(activeSourceIdx, sourceUris.length - 1)]
    : project.sourceUri;

  const seek = (sec: number) => setSeekTo(sec + Math.random() * 1e-9);

  // A3.6: bei Source-Switch markIn/markOut reset (nicht-übertragbare timestamps)
  const switchSource = (idx: number) => {
    if (idx === activeSourceIdx) return;
    haptic.light();
    setActiveSourceIdx(idx);
    setMarkIn(null);
    setMarkOut(null);
    setSeekTo(0 + Math.random() * 1e-9);
    setCurrentSec(0);
  };

  const onAddClip = () => {
    if (markIn == null || markOut == null) {
      haptic.error();
      return;
    }
    if (markOut <= markIn) {
      haptic.error();
      appAlert(
        t('manualEditor.invalidRangeTitle', 'Invalid range'),
        t('manualEditor.invalidRangeBody', 'Set Out after In.'),
      );
      return;
    }
    haptic.success();
    const newClip: DemoClip = {
      id: `m-${Date.now().toString(36)}`,
      startSec: markIn,
      endSec: markOut,
      label: `Manual ${project.clips.length + 1}`,
      score: 1,
    };
    updateProject(project.id, { clips: [...project.clips, newClip], status: 'ready' });
    setMarkIn(null);
    setMarkOut(null);
  };

  const onDeleteClip = (clipId: string) => {
    haptic.light();
    updateProject(project.id, { clips: project.clips.filter((c) => c.id !== clipId) });
  };

  const canAddClip = markIn != null && markOut != null && markOut > markIn;

  if (!effectiveSourceUri) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Ionicons name="warning-outline" size={32} color="#fbbf24" />
        <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
          {t('manualEditor.noSourceTitle', 'This project has no source video')}
        </Text>
        <Text
          style={{
            color: '#a1a1aa',
            fontSize: 12,
            textAlign: 'center',
            maxWidth: 280,
            lineHeight: 17,
          }}
        >
          {t(
            'manualEditor.noSourceBody',
            'Manual editing only works for projects that were imported from a video file.',
          )}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Allgemeine Video-Infos analog Desktop Manual-Tab */}
      <ProjectInfoCard project={project} t={t} />

      {/* Phase A3.6: VideoPlayer mit key auf effectiveSourceUri für Re-Mount
          beim Source-Switch (sonst behält Player das alte Video). */}
      <VideoPlayer
        key={effectiveSourceUri}
        uri={effectiveSourceUri}
        seekTo={seekTo}
        onProgress={(sec) => setCurrentSec(sec)}
      />

      {/* Phase A3.6: Multi-Source-Switcher — eine Reihe Pills pro Source. */}
      {isMultiSource && (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {sourceUris.map((uri, idx) => {
            const isActive = idx === activeSourceIdx;
            return (
              <Pressable
                key={`src-${idx}`}
                onPress={() => switchSource(idx)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: isActive ? '#ff1039' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: isActive ? '#ff1039' : 'rgba(255,255,255,0.10)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {isActive && <Ionicons name="play" size={11} color="#fff" />}
                <Text style={{ color: isActive ? '#fff' : '#a1a1aa', fontSize: 11, fontWeight: '700' }}>
                  {t('multiClip.clipShort', 'Clip {n}').replace('{n}', String(idx + 1))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Mark-In/Out Card */}
      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: 16,
          gap: 14,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text
            style={{ color: '#71717a', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}
          >
            {t('manualEditor.currentLabel', 'CURRENT TIME')}
          </Text>
          <Text
            style={{
              color: '#f1f2f2',
              fontSize: 14,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatTimecode(currentSec)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <MarkButton
            icon="log-in-outline"
            label={t('manualEditor.markIn', 'Mark In')}
            value={markIn}
            onSet={() => {
              haptic.medium();
              setMarkIn(currentSec);
            }}
            onSeek={() => markIn != null && seek(markIn)}
            onClear={() => {
              haptic.light();
              setMarkIn(null);
            }}
          />
          <MarkButton
            icon="log-out-outline"
            label={t('manualEditor.markOut', 'Mark Out')}
            value={markOut}
            onSet={() => {
              haptic.medium();
              setMarkOut(currentSec);
            }}
            onSeek={() => markOut != null && seek(markOut)}
            onClear={() => {
              haptic.light();
              setMarkOut(null);
            }}
          />
        </View>

        <Pressable
          onPress={onAddClip}
          disabled={!canAddClip}
          style={({ pressed }) => ({
            backgroundColor: !canAddClip
              ? 'rgba(255,255,255,0.06)'
              : pressed
                ? '#cc0d2e'
                : '#ff1039',
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: canAddClip ? 1 : 0.55,
          })}
        >
          <Ionicons name="add-circle" size={16} color={canAddClip ? '#fff' : '#a1a1aa'} />
          <Text
            style={{ color: canAddClip ? '#fff' : '#a1a1aa', fontSize: 13, fontWeight: '700' }}
          >
            {canAddClip
              ? `${t('manualEditor.addClip', 'Add highlight')} · ${formatDuration((markOut ?? 0) - (markIn ?? 0))}`
              : t('manualEditor.addClip', 'Add highlight')}
          </Text>
        </Pressable>
      </View>

      {/* Clip Liste */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#a1a1aa', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
          {t('manualEditor.clipsHeader', 'CLIPS').toUpperCase()} · {project.clips.length}
        </Text>

        {project.clips.length === 0 ? (
          <View
            style={{
              padding: 18,
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              borderRadius: 14,
              alignItems: 'center',
            }}
          >
            <Text
              style={{ color: '#71717a', fontSize: 12, textAlign: 'center', lineHeight: 17 }}
            >
              {t(
                'manualEditor.emptyHint',
                'Scrub the video, tap Mark In and Mark Out, then Add highlight.',
              )}
            </Text>
          </View>
        ) : (
          project.clips.map((clip, idx) => (
            <Pressable
              key={clip.id}
              onPress={() => seek(clip.startSec)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: 'rgba(255,16,57,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '800' }}>
                  {idx + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}
                >
                  {clip.label}
                </Text>
                <Text
                  style={{ color: '#71717a', fontSize: 11, fontVariant: ['tabular-nums'] }}
                >
                  {formatTimecode(clip.startSec)} → {formatTimecode(clip.endSec)} ·{' '}
                  {formatDuration(clip.endSec - clip.startSec)}
                </Text>
              </View>
              <Pressable
                onPress={() => onDeleteClip(clip.id)}
                hitSlop={8}
                style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function MarkButton({
  icon,
  label,
  value,
  onSet,
  onSeek,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number | null;
  onSet: () => void;
  onSeek: () => void;
  onClear: () => void;
}) {
  const set = value != null;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Pressable
        onPress={onSet}
        style={({ pressed }) => ({
          backgroundColor: set ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: set ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.12)',
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name={icon} size={14} color={set ? '#ff1039' : '#f1f2f2'} />
        <Text style={{ color: set ? '#ff1039' : '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
          {label}
        </Text>
      </Pressable>
      {set ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}
        >
          <Pressable onPress={onSeek} hitSlop={4}>
            <Text
              style={{
                color: '#ff1039',
                fontSize: 11,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatTimecode(value!)}
            </Text>
          </Pressable>
          <Pressable onPress={onClear} hitSlop={4}>
            <Ionicons name="close-circle" size={14} color="#71717a" />
          </Pressable>
        </View>
      ) : (
        <Text
          style={{
            color: '#52525b',
            fontSize: 11,
            textAlign: 'center',
            fontVariant: ['tabular-nums'],
          }}
        >
          —:—
        </Text>
      )}
    </View>
  );
}

/* ─── TikTokTab ───────────────────────────────────────────────── */

type Layout = 'stacked' | 'full' | 'split';

function TikTokTab({
  project,
  selectedClipIds,
  setSelectedClipIds,
  t,
}: {
  project: DemoProject;
  /** Phase B6 (2026-05-18): Multi-Select-Set vom Root — shared mit Highlights-Tab.
   *  Hier nutzt der "Export N selected clips"-Button die Auswahl. */
  selectedClipIds: Set<string>;
  setSelectedClipIds: (s: Set<string>) => void;
  t: (k: string, f?: string) => string;
}) {
  const nav = useNavigation<Nav>();
  const updateProject = useProjectsStore((s) => s.updateProject);
  const defaultFacecam = useAppStore((s) => s.facecamRegion);
  const defaultGameplay = useAppStore((s) => s.gameplayRegion);

  // Per-Project-Override: wenn am Project gesetzt → benutzen, sonst Settings-Default.
  const facecamRegion =
    project.facecamRegion !== undefined ? project.facecamRegion : defaultFacecam;
  const gameplayRegion = project.gameplayRegion ?? defaultGameplay;
  const usingOverride = project.gameplayRegion != null || project.facecamRegion !== undefined;

  const [layout, setLayoutState] = useState<Layout>(project.tiktokLayout ?? 'stacked');
  // Sync wenn project von außen aktualisiert wird (anderer Tab/Device)
  useEffect(() => {
    if (project.tiktokLayout && project.tiktokLayout !== layout) {
      setLayoutState(project.tiktokLayout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tiktokLayout]);
  const setLayout = (next: Layout) => {
    setLayoutState(next);
    updateProject(project.id, { tiktokLayout: next });
  };
  const [splitRatio, setSplitRatio] = useState(project.splitRatio ?? DEFAULT_SPLIT_RATIO);
  // Sync wenn das Project von außen aktualisiert wird (z.B. anderer Tab).
  useEffect(() => {
    setSplitRatio(project.splitRatio ?? DEFAULT_SPLIT_RATIO);
  }, [project.splitRatio]);
  const [fullOffsetX, setFullOffsetX] = useState(project.fullOffsetX ?? 0.5);
  useEffect(() => {
    setFullOffsetX(project.fullOffsetX ?? 0.5);
  }, [project.fullOffsetX]);
  // Subtitle-State aus project.subtitles ableiten. Echter DEFAULT-Merge: fehlende
  // Fields (z.B. weil project alt ist und neue Fields nicht hat) bekommen den
  // Default-Wert. Sonst gibt's false-positives wo undefined-fields den
  // settings-Code in fallback-Pfade zwingen (siehe Drop-Shadow → Glow Bug).
  const subSettings: SubtitleSettings = { ...DEFAULT_SUBTITLES, ...project.subtitles };
  const subtitles = subSettings.enabled;
  const setSubtitles = (next: boolean) => {
    updateProject(project.id, { subtitles: { ...subSettings, enabled: next } });
  };
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [tiktokCueEditorOpen, setTiktokCueEditorOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  // Phase A3.4 (2026-05-17): pending Multi-Clip-9:16-Export flag.
  // Bei `true` baut der onConfirm-Handler einen builderItemPlan aus allen
  // source-clips und navigiert mit `mode='tiktok' + builderItemPlan`.
  const [pendingMultiExport, setPendingMultiExport] = useState(false);
  // Phase A4.c (2026-05-18): Region-Picker per-Project state.
  // Öffnet den existing RegionPickerModal (auch in SettingsScreen genutzt)
  // mit den AKTUELLEN regions (project-overrides oder defaults). On-save
  // werden die werte als project-overrides geschrieben — NICHT in app-store
  // (globale defaults bleiben unverändert, User-Wunsch).
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const exportSettings = useAppStore((s) => s.exportSettings);
  const setExportSettingsStore = useAppStore((s) => s.setExportSettings);
  const hasVoiceOvers = (project.voiceOvers ?? []).length > 0;

  // Music + Intro: persistiert auf project (Phase 9.6.4 / 9.6.6 / Bugfix-volume)
  const musicTracks: AudioTrack[] = (project.musicTracks ?? []).map((m) => ({
    uri: m.path,
    filename: m.filename ?? 'audio',
    volume: m.volume,
  }));
  const setMusicTracks = (next: AudioTrack[]) => {
    updateProject(project.id, {
      musicTracks: next.map((t) => ({
        path: t.uri,
        filename: t.filename,
        volume: t.volume ?? 0.6,
      })),
    });
  };
  const musicShuffle = project.musicShuffle ?? false;
  const setMusicShuffle = (next: boolean) => {
    updateProject(project.id, { musicShuffle: next });
  };
  const introUri = project.intro?.path ?? null;
  const introName = project.intro?.filename ?? null;
  const introMode = project.intro?.mode ?? 'before';
  const setIntroMode = (mode: 'before' | 'overlay') => {
    if (project.intro) {
      updateProject(project.id, { intro: { ...project.intro, mode } });
    }
  };
  const setIntroUri = (uri: string | null) => {
    if (uri) {
      updateProject(project.id, {
        intro: { path: uri, filename: introName ?? undefined, mode: introMode },
      });
    } else {
      updateProject(project.id, { intro: undefined });
    }
  };
  const setIntroName = (_name: string | null) => {
    /* no-op — pickIntro setzt URI direkt, filename kommt mit */
  };
  const [introPosition, setIntroPosition] = useState<'top' | 'center' | 'bottom' | 'full'>('full');
  const [showOverlay, setShowOverlay] = useState(true);

  // Clip-Selector (Phase 9.5.8.1) — bei Multi-Clip-Projects oder Highlight-Cards-Projects.
  // selectedClipIdx wählt den aktiven Clip; effective-sourceUri/trim werden in
  // LayoutPreview UND Export-Navigation genutzt.
  const [selectedClipIdx, setSelectedClipIdx] = useState(0);
  // Phase B5 (2026-05-18): TrimModal-State. null = closed.
  const [editingClipIdx, setEditingClipIdx] = useState<number | null>(null);
  const clips = project.clips ?? [];
  // Phase B6 (2026-05-18): Multi-Select-Toggle für Export-Selektion.
  const toggleClipSelection = (id: string) => {
    const next = new Set(selectedClipIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedClipIds(next);
    haptic.selection();
  };
  const selectedClipsInOrder = clips.filter((c) => selectedClipIds.has(c.id));
  const selectedCount = selectedClipsInOrder.length;
  const showClipSelector = clips.length >= 2;
  const safeIdx = Math.min(selectedClipIdx, Math.max(0, clips.length - 1));
  const selectedClip = clips[safeIdx];
  const projectSourceUris = project.sourceUris ?? [];
  const isMultiSource = projectSourceUris.length >= 2;

  // Thumbnail-Auto-Generate (Phase 9.5.8.3): wenn ein clip noch kein thumbUri
  // hat, extrahiere on-demand sequenziell. Deckt Multi-Clip-Projects ab wo
  // der Initial-Extract beim Import gefailt ist (Codec) UND alte Projekte
  // ohne thumbnails. Läuft 1× pro project-Mount.
  useEffect(() => {
    const needsThumb = (clips ?? []).some((c, i) => {
      if (c.thumbUri) return false;
      // Phase A3.11 (2026-05-17): bei kind='highlight' nimm clip.sourceIdx
      // als source-Mapping (statt one-to-one i==sourceIdx).
      const explicitSrcIdx = c.sourceIdx;
      const src =
        explicitSrcIdx !== undefined
          ? projectSourceUris[explicitSrcIdx]
          : isMultiSource
            ? projectSourceUris[i]
            : project.sourceUri;
      return !!src;
    });
    if (!needsThumb) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < clips.length; i++) {
        if (cancelled) return;
        const c = clips[i];
        if (c.thumbUri) continue;
        const explicitSrcIdx = c.sourceIdx;
        const sourceForClip =
          explicitSrcIdx !== undefined
            ? projectSourceUris[explicitSrcIdx]
            : isMultiSource
              ? projectSourceUris[i]
              : project.sourceUri;
        if (!sourceForClip) continue;
        // Frame-Zeit: 500ms ab Clip-Start (vermeidet schwarzen Intro-Frame).
        const timeMs = Math.max(0, Math.round((c.startSec || 0) * 1000 + 500));
        const t = await extractVideoThumbnail(sourceForClip, timeMs).catch(() => null);
        if (!t || cancelled) continue;
        const latest = useProjectsStore.getState().projects.find((p) => p.id === project.id);
        if (!latest) return;
        const nextClips = (latest.clips ?? []).map((cc) =>
          cc.id === c.id ? { ...cc, thumbUri: t } : cc,
        );
        updateProject(project.id, {
          clips: nextClips,
          thumbUri: i === 0 && !latest.thumbUri ? t : latest.thumbUri,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, clips.length]);
  // Phase A3.10.3 (2026-05-17): AI-Highlight-Clips in Multi-Clip-Projects
  // haben einen expliziten `sourceIdx` der NICHT auf den one-to-one source
  // mapping passt. Resolve hier — falls clip.sourceIdx gesetzt + valid:
  // nimm diese source + clip's eigene trim-Range. Sonst legacy-Verhalten.
  const clipSourceIdx = selectedClip?.sourceIdx;
  const hasExplicitSourceIdx =
    clipSourceIdx !== undefined && projectSourceUris[clipSourceIdx] !== undefined;
  const effectiveSourceUri = hasExplicitSourceIdx
    ? projectSourceUris[clipSourceIdx!]
    : isMultiSource
      ? projectSourceUris[Math.min(safeIdx, projectSourceUris.length - 1)]
      : project.sourceUri;
  // Trim-Werte:
  //   Explicit sourceIdx (A3.10.3 AI-Highlight in Multi-Clip): Trim = clip.start/end.
  //   Multi-Source legacy (clip-per-file): kein Trim — volle file-Länge.
  //   Single-Source-with-clips (Highlights): Trim = clip start/end.
  const effectiveTrimStart = hasExplicitSourceIdx
    ? (selectedClip?.startSec ?? 0)
    : isMultiSource
      ? 0
      : (selectedClip?.startSec ?? project.trimStart ?? 0);
  const effectiveTrimEnd = hasExplicitSourceIdx
    ? (selectedClip?.endSec ?? 0)
    : isMultiSource
      ? (selectedClip?.endSec ?? project.durationSec)
      : (selectedClip?.endSec ?? project.trimEnd ?? (project.durationSec > 60 ? 60 : project.durationSec));

  const pickIntro = async () => {
    haptic.medium();
    const picked = await pickVideoFromFiles({ maxDurationSec: 30 });
    if (picked) {
      // Phase Builder-5: appStore.introDefaults beim Pick anwenden — damit
      // User die overlay-Position nicht jedes Mal neu einstellen muss.
      // Phase A4.c (2026-05-18): Fallback-Defaults sind jetzt 'bottom'-Preset
      // (x=0.5, y=1, scale=0.4) statt fullscreen. Grund: bei scale=1.0
      // haben X/Y-Slider keinen Effekt (intro=canvas), Slider wirken un-
      // intuitiv tot. Mit scale=0.4 sieht User sofort wie Sliders wirken.
      const defaults = useAppStore.getState().introDefaults;
      updateProject(project.id, {
        intro: {
          path: picked.uri,
          filename: picked.filename ?? 'video',
          mode: defaults?.mode ?? introMode,
          x: defaults?.x ?? 0.5,
          y: defaults?.y ?? 1.0,
          scale: defaults?.scale ?? 0.4,
          durationSec: defaults?.durationSec ?? 3,
        },
      });
      haptic.success();
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 9:16-Aspect-Preview ganz oben (User-Wunsch Phase 9.5.8.1).
          Width 75% = identisch zur Modal-Preview-Card → User sieht
          Subtitle-Overlay in gleicher Proportion in beiden Previews. */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: '75%' }}>
          <LayoutPreview
            /* Re-Mount bei Clip-Wechsel: key inkludiert trim, sodass auch bei
               single-source-multi-clips (Highlights) der Player neu lädt und
               via seekToSec ab clip.startSec spielt. */
            key={`${effectiveSourceUri}-${effectiveTrimStart}`}
            layout={layout}
            sourceUri={effectiveSourceUri}
            seekToSec={effectiveTrimStart}
            thumbHue={project.thumbHue}
            thumbUri={selectedClip?.thumbUri ?? project.thumbUri}
            facecamRegion={facecamRegion}
            gameplayRegion={gameplayRegion}
            showOverlay={showOverlay}
            splitRatio={splitRatio}
            fullOffsetX={fullOffsetX}
            subtitles={subSettings}
            musicTracks={project.musicTracks?.map((m) => ({ path: m.path, volume: m.volume }))}
            introUri={project.intro?.path ?? undefined}
            introMode={project.intro?.mode ?? 'before'}
            introX={project.intro?.x ?? 0}
            introY={project.intro?.y ?? 0}
            introScale={project.intro?.scale ?? 1}
            introDurationSec={project.intro?.durationSec ?? 3}
            voiceOvers={project.voiceOvers?.map((vo) => ({
              path: vo.path,
              startSec: vo.startSec,
              volume: vo.volume,
            }))}
          />
        </View>
      </View>

      {/* Clip-Selector (Phase 9.5.8.1) — UNTER Preview: horizontal scrollbare
          Cards mit Thumbnail + Time-Badge + roter Active-Border. User wählt
          einen Clip → Preview + Export werden auf den Clip umgestellt. */}
      {showClipSelector && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#a1a1aa', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
              {t('tiktok.clipsHeader', 'CLIPS').toUpperCase()} · {clips.length}
              {selectedCount > 0 && (
                <Text style={{ color: '#ff1039' }}>
                  {'  ·  '}{selectedCount} {t('tiktok.selected', 'selected')}
                </Text>
              )}
            </Text>
            {/* Phase B6 (2026-05-18): Select-All / Clear-All Toggle. */}
            <Pressable
              onPress={() => {
                haptic.selection();
                if (selectedCount === clips.length) {
                  setSelectedClipIds(new Set());
                } else {
                  setSelectedClipIds(new Set(clips.map((c) => c.id)));
                }
              }}
              hitSlop={6}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700' }}>
                {selectedCount === clips.length
                  ? t('tiktok.clearAll', 'Clear all')
                  : t('tiktok.selectAll', 'Select all')}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}
          >
            {clips.map((c, i) => {
              const active = i === safeIdx;
              const isSelected = selectedClipIds.has(c.id);
              const dur = Math.max(0, c.endSec - c.startSec);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    haptic.selection();
                    setSelectedClipIdx(i);
                  }}
                  style={{
                    width: 150,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active
                      ? '#ff1039'
                      : isSelected
                        ? 'rgba(255,16,57,0.5)'
                        : 'rgba(255,255,255,0.08)',
                    backgroundColor: isSelected
                      ? 'rgba(255,16,57,0.08)'
                      : 'rgba(255,255,255,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      aspectRatio: 16 / 9,
                      backgroundColor: `hsl(${project.thumbHue} 35% 18%)`,
                      position: 'relative',
                    }}
                  >
                    {c.thumbUri && (
                      <Image
                        source={{ uri: c.thumbUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    )}
                    {/* Phase B6 (2026-05-18): Time-badge nach bottom-left
                        verschoben, top-left ist jetzt der Multi-Select-Checkbox. */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 6,
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                        {formatTimecode(dur)}
                      </Text>
                    </View>
                    {active && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: '#ff1039',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="play" size={12} color="#fff" />
                      </View>
                    )}
                    {/* Phase B6 (2026-05-18): Multi-Select-Checkbox top-left.
                        Separater Hit-Area: Card-Body-Tap = preview-select
                        (existing), Checkbox-Tap = export-multi-select-toggle.
                        Bei B6 sind Multi-Select-Clips farblich highlight'd. */}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleClipSelection(c.id);
                      }}
                      hitSlop={8}
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: selectedClipIds.has(c.id)
                          ? '#ff1039'
                          : 'rgba(0,0,0,0.65)',
                        borderWidth: 1.5,
                        borderColor: selectedClipIds.has(c.id)
                          ? '#ff1039'
                          : 'rgba(255,255,255,0.45)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selectedClipIds.has(c.id) && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </Pressable>
                    {/* Phase B5 (2026-05-18): Trim/Edit-Button. Öffnet TrimModal
                        für diesen Clip. stopPropagation damit der Card-Tap
                        (selectClip) nicht zusätzlich feuert. */}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        haptic.selection();
                        setEditingClipIdx(i);
                      }}
                      hitSlop={6}
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        right: 6,
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: 'rgba(0,0,0,0.75)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="cut-outline" size={13} color="#fff" />
                    </Pressable>
                  </View>
                  <View style={{ padding: 8 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}
                    >
                      {c.label || `Clip ${i + 1}`}
                    </Text>
                    <Text style={{ color: '#71717a', fontSize: 10, marginTop: 2 }}>
                      #{(i + 1).toString().padStart(2, '0')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Per-Project-Region-Override-Toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
            {t('tiktok.overrideRegions', 'Override default regions')}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 10 }}>
            {usingOverride
              ? t('tiktok.overrideOn', 'Using project-specific facecam + gameplay')
              : t('tiktok.overrideOff', 'Using settings defaults')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {/* Phase A4.c (2026-05-18): Edit-Button öffnet RegionPickerModal.
              Werte werden als project-overrides gespeichert (NICHT global). */}
          <Pressable
            onPress={() => {
              haptic.medium();
              setRegionModalOpen(true);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: pressed ? 'rgba(255,16,57,0.18)' : 'rgba(255,16,57,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.35)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            })}
          >
            <Ionicons name="create-outline" size={11} color="#ff1039" />
            <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700' }}>
              {t('tiktok.editRegions', 'Edit')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptic.selection();
              if (usingOverride) {
                // Override clearen
                updateProject(project.id, { facecamRegion: undefined, gameplayRegion: undefined });
              } else {
                // Aktuellen Default als Project-Override einfrieren
                updateProject(project.id, {
                  facecamRegion: defaultFacecam,
                  gameplayRegion: defaultGameplay,
                });
              }
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: usingOverride ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              borderColor: usingOverride ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.10)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: usingOverride ? '#ff1039' : '#a1a1aa',
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              {usingOverride ? t('common.on', 'ON') : t('common.off', 'OFF')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Layout */}
      <SectionHeader>{t('tiktok.layoutHeader', 'LAYOUT').toUpperCase()}</SectionHeader>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <LayoutOption
          icon="albums-outline"
          label={t('tiktok.layoutStacked', 'Stacked')}
          desc={t('tiktok.layoutStackedDesc', 'Facecam top, gameplay below')}
          active={layout === 'stacked'}
          onPress={() => {
            haptic.selection();
            setLayout('stacked');
          }}
        />
        <LayoutOption
          icon="square-outline"
          label={t('tiktok.layoutFull', 'Full')}
          desc={t('tiktok.layoutFullDesc', 'Single 9:16 crop')}
          active={layout === 'full'}
          onPress={() => {
            haptic.selection();
            setLayout('full');
          }}
        />
        <LayoutOption
          icon="grid-outline"
          label={t('tiktok.layoutSplit', 'Split')}
          desc={t('tiktok.layoutSplitDesc', 'Side-by-side regions')}
          active={layout === 'split'}
          onPress={() => {
            haptic.selection();
            setLayout('split');
          }}
        />
      </View>

      {/* Full-Layout: horizontaler Offset-Slider (Phase 9.5.8.4).
          Bei landscape-Source der zu 9:16 gecroppt wird, kann der User links/
          rechts den sichtbaren Ausschnitt verschieben. Default 0.5 = Mitte. */}
      {layout === 'full' && (
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
              {t('tiktok.fullOffsetX', 'Horizontal position')}
            </Text>
            <Text
              style={{
                color: '#a1a1aa',
                fontSize: 11,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
              }}
            >
              {fullOffsetX <= 0.05
                ? t('tiktok.fullOffsetLeft', 'Left')
                : fullOffsetX >= 0.95
                  ? t('tiktok.fullOffsetRight', 'Right')
                  : `${Math.round(fullOffsetX * 100)}%`}
            </Text>
          </View>
          <SimpleSlider
            value={fullOffsetX}
            min={0}
            max={1}
            step={0.05}
            onChange={setFullOffsetX}
            onCommit={(v) => {
              haptic.selection();
              updateProject(project.id, { fullOffsetX: v });
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}>
            <Text style={{ color: '#52525b', fontSize: 9 }}>{t('common.left', 'Left')}</Text>
            <Text style={{ color: '#52525b', fontSize: 9 }}>{t('common.center', 'Center')}</Text>
            <Text style={{ color: '#52525b', fontSize: 9 }}>{t('common.right', 'Right')}</Text>
          </View>
        </View>
      )}

      {/* Facecam-Größe (nur stacked + split) — analog Desktop's SplitRatioSlider.
          Live-Update der Pane-Aufteilung in der Preview, persistierte Commit
          auf Release. Default 0.4 = 40% Facecam, 60% Gameplay. */}
      {layout !== 'full' && (
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
              {t('tiktok.facecamSize', 'Facecam size')}
            </Text>
            <Text
              style={{
                color: '#a1a1aa',
                fontSize: 11,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
              }}
            >
              {`${Math.round(splitRatio * 100)}% · ${Math.round((1 - splitRatio) * 100)}%`}
            </Text>
          </View>
          <SimpleSlider
            value={splitRatio}
            min={0.2}
            max={0.8}
            step={0.05}
            onChange={setSplitRatio}
            onCommit={(v) => {
              haptic.selection();
              updateProject(project.id, { splitRatio: v });
            }}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 }}
          >
            <Text style={{ color: '#71717a', fontSize: 9 }}>
              {t('tiktok.facecamLabel', 'Facecam')}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 9 }}>
              {t('tiktok.gameplayLabel', 'Gameplay')}
            </Text>
          </View>
        </View>
      )}

      {/* Region-Cards — analog Desktop's FacecamEditor + GameplayEditor.
          Jede Card zeigt das Source-Frame mit dem aktuellen Region-Rect drauf
          plus Snap-Presets darunter. Tap auf einen Preset → updateProject
          (Project-Override). Stacked-Preview oben bleibt clean (kein Overlay). */}
      {layout !== 'full' && (
        <>
          <SectionHeader>
            {t('tiktok.facecamRegion', 'Facecam region (top)').toUpperCase()}
          </SectionHeader>
          <RegionPreviewCard
            title={t('tiktok.facecamRegion', 'Facecam region (top)')}
            thumbUri={project.thumbUri}
            region={facecamRegion}
            color="facecam"
            presets={(Object.keys(FACECAM_PRESETS) as FacecamPreset[]).map((id) => ({
              id,
              label: presetLabelFor(id, t),
              region: FACECAM_PRESETS[id],
            }))}
            activePresetId={matchPreset(facecamRegion, FACECAM_PRESETS)}
            onPresetSelect={(_id, region) => {
              updateProject(project.id, { facecamRegion: region });
            }}
          />
          <SectionHeader>
            {t('tiktok.gameplayRegion', 'Gameplay region (bottom)').toUpperCase()}
          </SectionHeader>
          <RegionPreviewCard
            title={t('tiktok.gameplayRegion', 'Gameplay region (bottom)')}
            thumbUri={project.thumbUri}
            region={gameplayRegion}
            color="gameplay"
            presets={(Object.keys(GAMEPLAY_PRESETS) as GameplayPreset[]).map((id) => ({
              id,
              label: presetLabelFor(id, t),
              region: GAMEPLAY_PRESETS[id],
            }))}
            activePresetId={matchPreset(gameplayRegion, GAMEPLAY_PRESETS)}
            onPresetSelect={(_id, region) => {
              if (region) updateProject(project.id, { gameplayRegion: region });
            }}
          />
        </>
      )}

      {/* Add-Ons */}
      <SectionHeader>{t('tiktok.addOnsHeader', 'ADD-ONS').toUpperCase()}</SectionHeader>
      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}
        >
          <View style={{ flex: 1 }}>
            <ToggleRow
              icon="chatbubble-ellipses-outline"
              label={t('tiktok.subtitles', 'Subtitles')}
              desc={t('tiktok.subtitlesDesc', 'Burn-in word-highlight subs')}
              value={subtitles}
              onChange={setSubtitles}
            />
          </View>
          <Pressable
            onPress={() => {
              haptic.light();
              setSubModalOpen(true);
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="options-outline" size={16} color="#a1a1aa" />
          </Pressable>
        </View>
        {/* Phase 9.6.7f — Edit-Cues-Button direkt im 9:16-Tab sichtbar wenn
            cues vorhanden, ohne Subtitle-Modal-Umweg. Bearbeitet einzelne
            Untertitel-Texte (Wörter pro Cue). */}
        {(subSettings.cues?.length ?? 0) > 0 && (
          <Pressable
            onPress={() => {
              haptic.medium();
              setTiktokCueEditorOpen(true);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: pressed ? 'rgba(255,16,57,0.18)' : 'rgba(255,16,57,0.10)',
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,16,57,0.25)',
            })}
          >
            <Ionicons name="create-outline" size={14} color="#ff1039" />
            <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
              {t('tiktok.editCuesInline', `Edit subtitle text (${subSettings.cues!.length} cues)`)}
            </Text>
          </Pressable>
        )}
        <Divider />
        <MultiAudioPicker
          tracks={musicTracks}
          shuffle={musicShuffle}
          onChange={setMusicTracks}
          onShuffleChange={setMusicShuffle}
          label={t('tiktok.music', 'Background music')}
          desc={t('tiktok.musicDesc', 'Add one or many tracks · drag to reorder · shuffle for random play')}
        />
        <Divider />
        <AssetPickerRow
          icon="play-skip-forward-outline"
          label={t('tiktok.intro', 'Intro video')}
          desc={t('tiktok.introDesc', 'Pick a short video to prepend or overlay')}
          assetName={introName}
          onPick={pickIntro}
          onClear={() => {
            setIntroUri(null);
            setIntroName(null);
          }}
        />
        {introUri && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingBottom: 6,
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <IntroModeChip
              label={t('tiktok.introModeBefore', 'Before video')}
              desc={t('tiktok.introModeBeforeDesc', 'Plays first, then main')}
              active={introMode === 'before'}
              onPress={() => {
                haptic.selection();
                setIntroMode('before');
              }}
            />
            <IntroModeChip
              label={t('tiktok.introModeOverlay', 'Overlay')}
              desc={t('tiktok.introModeOverlayDesc', 'Transparent over the first 3 s')}
              active={introMode === 'overlay'}
              onPress={() => {
                haptic.selection();
                setIntroMode('overlay');
              }}
            />
          </View>
        )}
        {/* Phase A4 (2026-05-17): scale/x/y/auto-fit jetzt auch im before-
            Mode aktiv (vorher hardcoded cover-W:H). Daher die Position-
            Controls in beiden Modi anzeigen. */}
        {introUri && (
          <IntroOverlayControls project={project} t={t} />
        )}
      </View>

      {/* Voice-Overs (TTS) — eigene Section analog Desktop's VoiceOversSection. */}
      <VoiceOversSection
        project={project}
        totalDurationHint={project.durationSec}
        title={t('tiktok.tts', 'TTS Voice-over')}
      />

      {/* Aktive Add-Ons Live-Indicator */}
      {(musicTracks.length > 0 || introUri || hasVoiceOvers || subtitles) && (
        <View
          style={{
            backgroundColor: 'rgba(255,16,57,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.18)',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 6,
          }}
        >
          <Text style={{ color: '#ff1039', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
            LIVE-PREVIEW APPLIES
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 16 }}>
            {[
              subtitles && t('tiktok.subtitles', 'Subtitles'),
              hasVoiceOvers && `${(project.voiceOvers ?? []).length} ${(project.voiceOvers ?? []).length === 1 ? 'TTS' : 'TTS tracks'}`,
              musicTracks.length > 0 && `${musicTracks.length} ${musicTracks.length === 1 ? 'track' : 'tracks'}${musicShuffle ? ' (shuffle)' : ''}`,
              introUri && `Intro · ${introMode}${introMode === 'overlay' ? ` · ${introPosition}` : ''}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' '}— {t('tiktok.previewHint', 'mixed into the final render via FFmpeg-native (Phase 9.6).')}
          </Text>
        </View>
      )}

      <Text
        style={{
          color: '#71717a',
          fontSize: 11,
          textAlign: 'center',
          marginTop: 4,
          lineHeight: 16,
        }}
      >
        {t(
          'tiktok.phaseHint',
          'Layout & add-ons are wired up — actual rendering ships with the FFmpeg native module (Phase 9.4.x).',
        )}
      </Text>

      <Pressable
        onPress={() => {
          if (!project.sourceUri) {
            haptic.warning();
            appAlert(
              t('tiktok.exportTitle', 'Export 9:16'),
              t('tiktok.exportNoSource', 'Dieses Projekt hat noch kein Source-Video. Erst Video importieren.'),
            );
            return;
          }
          haptic.medium();
          // ExportSettingsModal öffnet zuerst — User pickt Resolution/FPS/Bitrate,
          // confirmt → ExportScreen-Navigation startet mit den gewählten Settings.
          setPendingMultiExport(false);
          setExportModalOpen(true);
        }}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
          borderRadius: 14,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 6,
        })}
      >
        <Ionicons name="logo-tiktok" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          {isMultiSource
            ? t('tiktok.exportButtonSingle', 'Export current clip').replace(
                '{n}',
                String(safeIdx + 1),
              )
            : t('tiktok.exportButton', 'Export 9:16 reel')}
        </Text>
      </Pressable>

      {/* Phase B6 (2026-05-18): Multi-Select-9:16-Export.
          Sichtbar wenn ≥2 clips selected. Exportiert NUR die selected clips
          hintereinander, mit Intro nur am ersten + Musik durchgehend.
          Order: clips[]-order gefiltert nach selectedClipIds. */}
      {selectedCount >= 2 && (
        <Pressable
          onPress={() => {
            haptic.medium();
            setPendingMultiExport(true);
            setExportModalOpen(true);
          }}
          style={({ pressed }) => ({
            backgroundColor: pressed ? 'rgba(255,16,57,0.18)' : 'rgba(255,16,57,0.10)',
            borderRadius: 14,
            paddingVertical: 13,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 6,
            borderWidth: 1.5,
            borderColor: '#ff1039',
          })}
        >
          <Ionicons name="layers" size={16} color="#ff1039" />
          <Text style={{ color: '#ff1039', fontSize: 14, fontWeight: '700' }}>
            {t('tiktok.exportButtonSelected', 'Export {n} selected clips').replace(
              '{n}',
              String(selectedCount),
            )}
          </Text>
        </Pressable>
      )}

      {/* Subtitle-Settings-Modal — lazy mount. */}
      {subModalOpen && (
        <SubtitleSettingsModal
          visible={subModalOpen}
          settings={subSettings}
          onClose={() => setSubModalOpen(false)}
          onChange={(next) => updateProject(project.id, { subtitles: next })}
        />
      )}

      {/* Inline-Cue-Editor (Phase 9.6.7f) — direkt vom 9:16-Tab erreichbar. */}
      <CueEditorModal
        visible={tiktokCueEditorOpen}
        cues={subSettings.cues ?? []}
        sourceUris={project.sourceUris}
        onClose={() => setTiktokCueEditorOpen(false)}
        onSave={(nextCues) =>
          updateProject(project.id, { subtitles: { ...subSettings, cues: nextCues } })
        }
      />

      {/* Phase A4.c (2026-05-18): Region-Picker per-Project. Speichert nur
          ins project (NICHT in app-store / globale defaults). */}
      <RegionPickerModal
        visible={regionModalOpen}
        initialFacecam={facecamRegion}
        initialGameplay={gameplayRegion}
        onClose={() => setRegionModalOpen(false)}
        onSave={(fc, gp) => {
          updateProject(project.id, {
            facecamRegion: fc,
            gameplayRegion: gp,
          });
          setRegionModalOpen(false);
        }}
      />

      {/* Phase B5 (2026-05-18): TrimModal pro Clip. Save = update startSec/
          endSec. Split = clip wird in 2 Clips am Playhead aufgeteilt (gleiche
          sourceIdx, neue IDs). */}
      {editingClipIdx !== null && clips[editingClipIdx] && (() => {
        const editClip = clips[editingClipIdx];
        // Source-Resolution analog effectiveSourceUri-Logik.
        const explicitSrcIdx = editClip.sourceIdx;
        const trimSourceUri =
          explicitSrcIdx !== undefined && projectSourceUris[explicitSrcIdx] !== undefined
            ? projectSourceUris[explicitSrcIdx]
            : isMultiSource
              ? projectSourceUris[Math.min(editingClipIdx, projectSourceUris.length - 1)]
              : project.sourceUri;
        if (!trimSourceUri) return null;
        return (
          <TrimModal
            visible={true}
            sourceUri={trimSourceUri}
            initialStartSec={editClip.startSec}
            initialEndSec={editClip.endSec}
            sourceDuration={
              project.perClipDurations?.[
                explicitSrcIdx ?? editingClipIdx
              ] ?? undefined
            }
            clipLabel={editClip.label || `Clip ${editingClipIdx + 1}`}
            t={t}
            onClose={() => setEditingClipIdx(null)}
            onSave={(s, e) => {
              const idx = editingClipIdx;
              setEditingClipIdx(null);
              const latest = useProjectsStore.getState().projects.find(
                (p) => p.id === project.id,
              );
              if (!latest) return;
              const nextClips = (latest.clips ?? []).map((cc, i) =>
                i === idx ? { ...cc, startSec: s, endSec: e } : cc,
              );
              updateProject(project.id, { clips: nextClips });
            }}
            onSplit={(atSec) => {
              const idx = editingClipIdx;
              setEditingClipIdx(null);
              const latest = useProjectsStore.getState().projects.find(
                (p) => p.id === project.id,
              );
              if (!latest) return;
              const original = (latest.clips ?? [])[idx];
              if (!original) return;
              // Split: original wird zu zwei Clips. ID-Generierung analog
              // projectsStore.generateId.
              const newIdLeft = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
              const newIdRight = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}a`;
              const left: DemoClip = {
                ...original,
                id: newIdLeft,
                startSec: original.startSec,
                endSec: atSec,
                label: original.label
                  ? `${original.label} (1)`
                  : `Clip ${idx + 1}.1`,
              };
              const right: DemoClip = {
                ...original,
                id: newIdRight,
                startSec: atSec,
                endSec: original.endSec,
                label: original.label
                  ? `${original.label} (2)`
                  : `Clip ${idx + 1}.2`,
                // Neuer Clip braucht eigenes Thumb — wird via thumb-auto-gen
                // useEffect (Phase 9.5.8.3) ergänzt.
                thumbUri: undefined,
              };
              const nextClips = [...(latest.clips ?? [])];
              nextClips.splice(idx, 1, left, right);
              updateProject(project.id, { clips: nextClips });
            }}
          />
        );
      })()}

      {/* Export-Settings-Modal vor Export-Click. */}
      {exportModalOpen && effectiveSourceUri && (
        <ExportSettingsModal
          visible={exportModalOpen}
          initialSettings={exportSettings}
          onClose={() => setExportModalOpen(false)}
          onConfirm={(next, saveAsDefault) => {
            if (saveAsDefault) {
              void setExportSettingsStore(next);
            }
            setExportModalOpen(false);
            // Phase A3.4 (2026-05-17): Multi-Clip-9:16-Export.
            // pendingMultiExport=true → build builderItemPlan über alle source-
            // clips (jedem clip seine source-uri zuordnen) und route mit
            // mode='tiktok' + builderItemPlan. ExportScreen erkennt das und
            // nutzt den Multi-Source-Pfad mit project.tiktokLayout (statt
            // Builder's 'full' 16:9-Layout).
            if (pendingMultiExport && selectedClipsInOrder.length >= 2) {
              // Phase B6 (2026-05-18): Nur SELECTED clips exportieren.
              // Source-resolution per-clip:
              //   1. clip.sourceIdx (gesetzt bei AI-Highlight cross-source) → projectSourceUris[idx]
              //   2. multi-source legacy → projectSourceUris[clipIdx]
              //   3. single-source → project.sourceUri
              // Intro spielt nur am ersten Clip (Worker-Level: intro ist top-
              // level RenderSpec, vor concat appended). Musik geht durchgehend
              // (Worker mischt amix über die gesamte concat-Länge).
              const itemPlan = selectedClipsInOrder.map((c) => {
                const explicitSrcIdx = c.sourceIdx;
                let src: string | undefined;
                if (
                  explicitSrcIdx !== undefined &&
                  projectSourceUris[explicitSrcIdx] !== undefined
                ) {
                  src = projectSourceUris[explicitSrcIdx];
                } else if (isMultiSource) {
                  const clipIdx = clips.indexOf(c);
                  src = projectSourceUris[Math.min(clipIdx, projectSourceUris.length - 1)];
                } else {
                  src = project.sourceUri;
                }
                return {
                  sourceUri: src ?? '',
                  trimStart: c.startSec,
                  trimEnd: c.endSec,
                };
              }).filter((p) => p.sourceUri);
              setPendingMultiExport(false);
              if (itemPlan.length < 2) return;
              nav.navigate('Export', {
                sourceUri: itemPlan[0].sourceUri,
                projectId: project.id,
                trimStart: 0,
                trimEnd: project.durationSec,
                sourceDuration: project.durationSec,
                mode: 'tiktok',
                exportSettings: next,
                builderItemPlan: itemPlan,
              });
              return;
            }
            // Single-Clip-9:16-Export (legacy).
            nav.navigate('Export', {
              sourceUri: effectiveSourceUri,
              projectId: project.id,
              trimStart: effectiveTrimStart,
              trimEnd: effectiveTrimEnd,
              sourceDuration: project.durationSec,
              mode: project.mode ?? 'tiktok',
              exportSettings: next,
            });
          }}
        />
      )}
    </ScrollView>
  );
}

function LayoutPreview({
  layout,
  sourceUri,
  thumbHue,
  thumbUri,
  facecamRegion,
  gameplayRegion,
  showOverlay,
  splitRatio,
  fullOffsetX = 0.5,
  seekToSec = 0,
  subtitles,
  musicTracks,
  introUri,
  introMode,
  introX,
  introY,
  introScale,
  introDurationSec,
  voiceOvers,
}: {
  layout: Layout;
  sourceUri?: string;
  thumbHue: number;
  thumbUri?: string;
  facecamRegion: { x: number; y: number; w: number; h: number } | null;
  gameplayRegion: { x: number; y: number; w: number; h: number };
  showOverlay: boolean;
  splitRatio: number;
  fullOffsetX?: number;
  /** Phase 9.6.7f: Beim Highlight-Clip-Click springt das Video auf clip.startSec.
   *  Bei single-source-multi-clips (AI-Highlights) ändert sich nur seekToSec
   *  (sourceUri bleibt gleich) — der key={...seekToSec} im Parent erzwingt
   *  re-mount, beim onLoad seekt das Video. */
  seekToSec?: number;
  subtitles?: SubtitleSettings;
  musicTracks?: { path: string; volume: number }[];
  introUri?: string;
  /** Phase 9.6.6.1 — Intro overlay/position für Live-Preview. */
  introMode?: 'before' | 'overlay';
  introX?: number;
  introY?: number;
  introScale?: number;
  introDurationSec?: number;
  voiceOvers?: { path: string; startSec: number; volume: number }[];
}) {
  // Schaubild der drei Layouts. Echte Region-Composition (FFmpeg-Native) folgt
  // in einer nativen Phase — hier zeigen wir die Aufteilung via 1–2 Player +
  // farbige Labels, damit der User unmittelbar sieht was Stacked vs Split macht.
  if (!sourceUri) {
    return (
      <View
        style={{
          aspectRatio: 9 / 16,
          backgroundColor: `hsl(${thumbHue}, 40%, 18%)`,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="logo-tiktok" size={40} color="rgba(255,255,255,0.32)" />
      </View>
    );
  }

  if (layout === 'full') {
    return (
      <FullModePreview
        sourceUri={sourceUri}
        offsetX={fullOffsetX}
        aspect={9 / 16}
        seekToSec={seekToSec}
        thumbUri={thumbUri}
        subtitles={subtitles}
        musicTracks={musicTracks}
        voiceOvers={voiceOvers}
        introUri={introUri}
        introMode={introMode}
        introX={introX}
        introY={introY}
        introScale={introScale}
        introDurationSec={introDurationSec}
      />
    );
  }

  // stacked + split: ein gemeinsamer Wrapper mit zentralem Control-Overlay.
  // Beide Panes zeigen pixel-präzise den jeweiligen Region-Crop, ein gemeinsames
  // Play/Pause/Mute/Scrubber-Control sitzt darüber. Master-Slave-Sync sorgt
  // dafür, dass beide Videos parallel laufen und nicht driften.
  return (
    <StackedSplitPreview
      layout={layout}
      sourceUri={sourceUri}
      thumbUri={thumbUri}
      facecamRegion={facecamRegion}
      gameplayRegion={gameplayRegion}
      showOverlay={showOverlay}
      splitRatio={splitRatio}
      seekToSec={seekToSec}
      subtitles={subtitles}
      musicTracks={musicTracks}
      introUri={introUri}
      introMode={introMode}
      introX={introX}
      introY={introY}
      introScale={introScale}
      introDurationSec={introDurationSec}
      voiceOvers={voiceOvers}
    />
  );
}

/**
 * Full-Mode + Builder Preview (Phase 9.5.8.4 + Builder-3) — vereinheitlichter
 * Single-Source-Player mit allen Add-Ons:
 *  - 9:16 (aspect=9/16): horizontal-crop-transform via offsetX (landscape-Source).
 *  - 16:9 (aspect=16/9): direct cover-fit, kein transform.
 *  - Subtitle Overlay (Phase 9.5.6 settings)
 *  - Intro overlay (mode=before sequential, mode=overlay positioned + auto-hide)
 *  - Music + Voice-Over Audio-Player
 *  - Tap-to-Play + Replay-Button
 *
 * Wird in TikTokTab (layout=full) UND BuilderTab eingesetzt.
 */
function FullModePreview({
  sourceUri,
  sources,
  offsetX = 0.5,
  aspect = 9 / 16,
  seekToSec = 0,
  thumbUri,
  subtitles,
  musicTracks,
  voiceOvers,
  introUri,
  introMode = 'before',
  introX = 0,
  introY = 0,
  introScale = 1,
  introDurationSec = 3,
}: {
  sourceUri?: string;
  /** Phase Builder-5: Sequential-Playback-Liste. Wenn gesetzt + length>=1
   *  spielt die Preview alle items hintereinander ab (mit per-item trim).
   *  Für BuilderTab mit Highlights+Extras. */
  sources?: { uri: string; startSec: number; endSec: number }[];
  offsetX?: number;
  aspect?: number;
  seekToSec?: number;
  thumbUri?: string;
  subtitles?: SubtitleSettings;
  musicTracks?: { path: string; volume: number }[];
  voiceOvers?: { path: string; startSec: number; volume: number }[];
  introUri?: string;
  introMode?: 'before' | 'overlay';
  introX?: number;
  introY?: number;
  introScale?: number;
  introDurationSec?: number;
}) {
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [videosActive, setVideosActive] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [trackWidth, setTrackWidth] = useState(0);
  // Phase A4.f (2026-05-18): intro source-aspect (width/height) wird via
  // Video.onLoad.naturalSize captured. Math nutzt das um Position relativ zu
  // den VIDEO-Bounds zu berechnen (Y-Slider geht edge-to-edge).
  const [introSrcAspect, setIntroSrcAspect] = useState<number | null>(null);
  useEffect(() => {
    setIntroSrcAspect(null);
  }, [introUri]);
  // Phase Builder-5: sequential-playback state für Multi-Source-Builder.
  const [currentIdx, setCurrentIdx] = useState(0);
  // Phase B2 (2026-05-18): pendingSeekSec — wenn User per Drag-to-Seek auf
  // ein anderes item springt, hier den target-local-time merken. Video re-
  // mounted via key={activeUri}, im onLoad seeken wir dann dort hin.
  const [pendingSeekSec, setPendingSeekSec] = useState<number | null>(null);
  const videoRef = useRef<VideoRef>(null);
  const introRef = useRef<React.ComponentRef<typeof Video> | null>(null);
  const off = Math.min(1, Math.max(0, offsetX));
  const leftPct = -216 * off;
  const isPortrait = aspect < 1;
  // Active sequence-item: bei sources[] der currentIdx, sonst single sourceUri.
  const hasSequence = !!sources && sources.length > 0;
  const activeItem = hasSequence ? sources![currentIdx] : null;
  const activeUri = activeItem?.uri ?? sourceUri;
  const activeStart = activeItem ? activeItem.startSec : seekToSec;
  const activeEnd = activeItem && activeItem.endSec > 0 ? activeItem.endSec : -1;
  // Phase Builder-8: probed durations pro source-item (lazy via hidden video).
  // Erlaubt totalDur-Berechnung selbst wenn endSec=-1 für mehrere items.
  const [itemDurations, setItemDurations] = useState<Record<string, number>>({});
  const probeKey = (uri: string, idx: number) => `${idx}-${uri}`;

  // Cumulative-Scrubber für Sequence. totalDur = Σ aller trimmed item-Längen.
  // Bei item.endSec=-1 (sentinel "ganze Source"): nutze itemDurations[probe-key].
  const totalDur = useMemo(() => {
    if (!hasSequence) return durationSec;
    let total = 0;
    for (let i = 0; i < sources!.length; i++) {
      const item = sources![i];
      if (item.endSec > 0) {
        total += Math.max(0, item.endSec - item.startSec);
      } else {
        const probed = itemDurations[probeKey(item.uri, i)] ?? 0;
        if (probed > 0) {
          total += Math.max(0, probed - item.startSec);
        } else if (i === currentIdx && durationSec > 0) {
          total += Math.max(0, durationSec - item.startSec);
        } else {
          // Partial-unknown: kein hard return -1 mehr. User sieht zumindest
          // partial-total bis duration probed wurde.
        }
      }
    }
    return total;
  }, [hasSequence, sources, durationSec, currentIdx, itemDurations]);
  const cumulativeSec = useMemo(() => {
    if (!hasSequence) return currentSec;
    let cumul = 0;
    for (let i = 0; i < currentIdx && i < sources!.length; i++) {
      const item = sources![i];
      const realEnd = item.endSec > 0
        ? item.endSec
        : (itemDurations[probeKey(item.uri, i)] ?? item.startSec);
      cumul += Math.max(0, realEnd - item.startSec);
    }
    const itemStart = sources![currentIdx]?.startSec ?? 0;
    cumul += Math.max(0, currentSec - itemStart);
    return cumul;
  }, [hasSequence, sources, currentIdx, currentSec, itemDurations]);
  const displayDur = totalDur > 0 ? totalDur : durationSec;
  const displayCurrent = hasSequence ? cumulativeSec : currentSec;
  const ready = displayDur > 0;
  const progressPct = ready ? (displayCurrent / displayDur) * 100 : 0;

  // Phase Builder-8: probe duration für ALL items in sources[]. Hidden videos
  // mounten parallel + onLoad-Callback füllt itemDurations. Skipped wenn
  // endSec bekannt (kein probe nötig) oder bereits probed.
  const itemsToProbe = useMemo(() => {
    if (!hasSequence) return [];
    return sources!
      .map((item, i) => ({ ...item, idx: i }))
      .filter(
        (item) =>
          item.endSec <= 0 &&
          !itemDurations[probeKey(item.uri, item.idx)],
      );
  }, [hasSequence, sources, itemDurations]);

  // Auto-hide für Center-Controls — wie StackedSplitPreview.
  useEffect(() => {
    if (paused || !controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), STACKED_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [paused, controlsVisible, currentSec]);

  // Ref-Sync für PanResponder closures (wie StackedSplitPreview).
  // Phase B2 (2026-05-18): zusätzlich sources/itemDurations für multi-clip
  // drag-to-seek über die cumulative timeline.
  const stateRef = useRef({
    trackWidth,
    durationSec,
    displayDur,
    sources,
    itemDurations,
    currentIdx,
  });
  useEffect(() => {
    stateRef.current = {
      trackWidth,
      durationSec,
      displayDur,
      sources,
      itemDurations,
      currentIdx,
    };
  }, [trackWidth, durationSec, displayDur, sources, itemDurations, currentIdx]);

  const togglePlay = () => {
    if (!videosActive) {
      setVideosActive(true);
      setPaused(false);
      if (introUri && introMode === 'before') setIntroPlaying(true);
      if (introUri && introMode === 'overlay') {
        setIntroPlaying(true);
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    } else {
      setPaused((p) => !p);
    }
    setControlsVisible(true);
  };

  const skipBy = (delta: number) => {
    if (durationSec <= 0) return;
    const next = Math.max(0, Math.min(durationSec, currentSec + delta));
    videoRef.current?.seek(next);
    setCurrentSec(next);
    setControlsVisible(true);
    if (next === 0 && introUri) {
      setIntroPlaying(true);
      if (introMode === 'overlay') {
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    }
  };

  const seekFromTouch = (x: number) => {
    const {
      trackWidth: w,
      durationSec: d,
      displayDur: cumDur,
      sources: seqSources,
      itemDurations: probedDurations,
      currentIdx: idx,
    } = stateRef.current;
    if (w <= 0) return;
    const frac = Math.max(0, Math.min(1, x / w));
    // Phase B2 (2026-05-18): Multi-Clip Drag-to-Seek. Wenn sources[] gesetzt,
    // map cumulative-position → (item-idx, local-time). Sonst single-video.
    if (seqSources && seqSources.length > 1 && cumDur > 0) {
      const targetCumul = frac * cumDur;
      let acc = 0;
      for (let i = 0; i < seqSources.length; i++) {
        const it = seqSources[i];
        const realEnd = it.endSec > 0
          ? it.endSec
          : (probedDurations[`${i}-${it.uri}`] ?? it.startSec);
        const itDur = Math.max(0, realEnd - it.startSec);
        if (targetCumul <= acc + itDur || i === seqSources.length - 1) {
          const localSec = it.startSec + Math.max(0, targetCumul - acc);
          if (i !== idx) {
            setCurrentIdx(i);
            // Phase B2 (2026-05-18): pendingSeekSec → wird in onLoad nach
            // re-mount des Video-Elements consumed.
            setPendingSeekSec(localSec);
            setCurrentSec(localSec);
          } else {
            videoRef.current?.seek(localSec);
            setCurrentSec(localSec);
          }
          return;
        }
        acc += itDur;
      }
    }
    // Single-video Pfad (kein Sequence): direct seek.
    if (d <= 0) return;
    const sec = frac * d;
    videoRef.current?.seek(sec);
    setCurrentSec(sec);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => seekFromTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => seekFromTouch(evt.nativeEvent.locationX),
    }),
  ).current;

  const restartFromStart = () => {
    haptic.selection();
    // Bei Sequence: reset auf first item. Sonst nur seek auf seekToSec.
    if (hasSequence) {
      setCurrentIdx(0);
      const firstStart = sources![0].startSec ?? 0;
      videoRef.current?.seek(firstStart);
      setCurrentSec(firstStart);
    } else {
      videoRef.current?.seek(seekToSec);
      setCurrentSec(seekToSec);
    }
    try {
      introRef.current?.seek(0);
    } catch {
      /* ignore */
    }
    if (introUri) {
      setIntroPlaying(true);
      if (introMode === 'overlay') {
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    }
    setPaused(false);
    setControlsVisible(true);
  };

  // Auto-advance bei sequence + trim-end erreicht.
  const handleProgress = (currentTime: number) => {
    setCurrentSec(currentTime);
    if (hasSequence && activeEnd > 0 && currentTime >= activeEnd) {
      if (currentIdx < sources!.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        setPaused(true);
      }
    }
  };
  const handleVideoEnd = () => {
    if (hasSequence && currentIdx < sources!.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else if (hasSequence) {
      setPaused(true);
    }
  };

  // Phase A4.f (2026-05-18): scale referenziert die VIDEO-BREITE (nicht
  // eine quadratische scale-Box wie vor A4.f). Die Höhe ergibt sich aus
  // dem Source-Aspect, damit das gerenderte Video selbst den Canvas-Rand
  // erreicht (Y-Slider edge-to-edge auch bei aspect-mismatch).
  // Math:
  //   widthFrac = scale (0.2..1.0)
  //   heightFrac = widthFrac * canvasAspect / sourceAspect
  //   (heightFrac>1 case: cap → super-vertikale Intros)
  //   leftFrac = x * (1 - widthFrac), topFrac = y * (1 - heightFrac)
  // Worker (ffmpegArgs.ts) nutzt FFmpeg-`overlay=x=(W-w)*X:y=(H-h)*Y`
  // Expressions die das gleiche Resultat ergeben.
  const widthFracDesired = Math.max(0.2, Math.min(1, introScale));
  const srcAspect = introSrcAspect ?? aspect;
  let introWidthPct = widthFracDesired;
  let introHeightPct = widthFracDesired * aspect / srcAspect;
  if (introHeightPct > 1) {
    introWidthPct = introWidthPct / introHeightPct;
    introHeightPct = 1;
  }
  const introLeftPct = introX * (1 - introWidthPct);
  const introTopPct = introY * (1 - introHeightPct);
  const introStyle = {
    position: 'absolute' as const,
    left: `${introLeftPct * 100}%`,
    top: `${introTopPct * 100}%`,
    width: `${introWidthPct * 100}%`,
    height: `${introHeightPct * 100}%`,
  };

  return (
    <View
      style={{
        position: 'relative',
        aspectRatio: aspect,
        overflow: 'hidden',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: '#000',
      }}
    >
      {/* Video-Plane: bei 9:16 mit transform für horizontal-crop, bei 16:9 simple cover.
          key={activeUri} → re-mount bei source-change (sequential playback). */}
      {activeUri && videosActive ? (
        isPortrait ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '316%',
              left: `${leftPct}%` as `${number}%`,
            }}
          >
            <Video
              key={activeUri}
              ref={videoRef}
              source={{ uri: activeUri }}
              paused={paused || (introPlaying && introMode === 'before')}
              muted={muted}
              repeat={!hasSequence}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
              ignoreSilentSwitch="ignore"
              disableFocus
              onLoad={(d) => {
                setDurationSec(d.duration);
                // Phase B2: pendingSeekSec → drag-target hat Vorrang vor activeStart.
                const target =
                  pendingSeekSec !== null
                    ? pendingSeekSec
                    : activeStart > 0
                      ? activeStart
                      : 0;
                if (target > 0 && videoRef.current) videoRef.current.seek(target);
                if (pendingSeekSec !== null) setPendingSeekSec(null);
              }}
              onProgress={(d) => handleProgress(d.currentTime)}
              onEnd={handleVideoEnd}
              bufferConfig={{
                minBufferMs: 1500,
                maxBufferMs: 3000,
                bufferForPlaybackMs: 500,
                bufferForPlaybackAfterRebufferMs: 1500,
              }}
            />
          </View>
        ) : (
          <Video
            key={activeUri}
            ref={videoRef}
            source={{ uri: activeUri }}
            paused={paused || (introPlaying && introMode === 'before')}
            muted={muted}
            repeat={!hasSequence}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            ignoreSilentSwitch="ignore"
            disableFocus
            onLoad={(d) => {
              setDurationSec(d.duration);
              const start = activeStart > 0 ? activeStart : 0;
              if (start > 0 && videoRef.current) videoRef.current.seek(start);
            }}
            onProgress={(d) => handleProgress(d.currentTime)}
            onEnd={handleVideoEnd}
            bufferConfig={{
              minBufferMs: 1500,
              maxBufferMs: 3000,
              bufferForPlaybackMs: 500,
              bufferForPlaybackAfterRebufferMs: 1500,
            }}
          />
        )
      ) : thumbUri ? (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      {/* Subtitle-Overlay — gerendert wenn enabled, ausgeblendet während intro-before-phase. */}
      {subtitles?.enabled && videosActive && !(introPlaying && introMode === 'before') && (
        <SubtitleOverlay settings={subtitles} />
      )}

      {/* Intro-Video (Phase 9.6.6.1) — display:'none'-Toggle statt opacity damit
          das Element bei scale=100% (deckt main video komplett ab) zuverlässig
          aus dem Layout verschwindet. opacity:0 reichte in einigen RN-Versionen
          nicht (User-Report Phase Builder-5). */}
      {videosActive && introUri && (
        <Video
          key={`${introUri}-${introMode}`}
          ref={(r) => {
            introRef.current = r;
          }}
          source={{ uri: introUri }}
          paused={paused || !introPlaying}
          repeat={false}
          // Phase A4.d (2026-05-18): ALWAYS contain, kein Flip mehr.
          // Bug: contain→cover-Sprung bei scale=1 ist visuell dramatisch
          // (User-Report: "110% sieht aus wie 200%"). Mit always-contain ist
          // die Skalierung jetzt linear und entspricht Worker (siehe
          // ffmpegArgs.ts A4.d). Aspect-Pad wird bei aspect-mismatch sichtbar
          // bei jeder Scale-Stufe.
          resizeMode="contain"
          onLoad={(d: any) => {
            const ns = d?.naturalSize;
            if (ns && ns.width > 0 && ns.height > 0) {
              setIntroSrcAspect(ns.width / ns.height);
            }
          }}
          onEnd={() => setIntroPlaying(false)}
          onError={() => setIntroPlaying(false)}
          style={[
            introStyle as any,
            introPlaying ? { opacity: 1 } : { opacity: 0, display: 'none' },
          ]}
          bufferConfig={{
            minBufferMs: 3000,
            maxBufferMs: 6000,
            bufferForPlaybackMs: 500,
            bufferForPlaybackAfterRebufferMs: 1500,
          }}
          ignoreSilentSwitch="ignore"
          disableFocus
        />
      )}

      {/* Music + VO Audio (hidden) */}
      {videosActive && musicTracks && musicTracks.length > 0 && (
        <MusicPreviewPlayer
          uri={musicTracks[0].path}
          volume={musicTracks[0].volume}
          paused={paused || (introPlaying && introMode === 'before')}
        />
      )}
      {videosActive &&
        voiceOvers &&
        voiceOvers.map((vo, i) => (
          <VoiceOverPreviewPlayer
            key={`${vo.path}-${i}`}
            uri={vo.path}
            startSec={vo.startSec}
            volume={vo.volume}
            currentSec={currentSec}
            paused={paused || (introPlaying && introMode === 'before')}
          />
        ))}

      {/* Phase Builder-8: Hidden Probe-Videos für Duration aller items in
          sources[] mit endSec=-1. Pro item ein 1×1 onLoad → setItemDurations. */}
      {itemsToProbe.map((item) => (
        <Video
          key={`probe-${probeKey(item.uri, item.idx)}`}
          source={{ uri: item.uri }}
          paused
          muted
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
          onLoad={(d) => {
            const k = probeKey(item.uri, item.idx);
            setItemDurations((prev) =>
              prev[k] ? prev : { ...prev, [k]: d.duration },
            );
          }}
          onError={() => {
            /* silent fail — probe is best-effort */
          }}
        />
      ))}

      {/* Tap-Layer: toggelt controls. Vor erstem Play: tap = togglePlay. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!videosActive) {
            togglePlay();
            return;
          }
          if (ready) setControlsVisible((c) => !c);
        }}
      />

      {/* Mute-Pill oben rechts */}
      {ready && (
        <Pressable
          onPress={() => setMuted((m) => !m)}
          hitSlop={6}
          style={({ pressed }) => [
            stackedStyles.mutePill,
            { opacity: pressed ? 0.6 : 0.9 },
          ]}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-high'}
            size={16}
            color="#fff"
          />
        </Pressable>
      )}

      {/* Replay-Pill oben links */}
      {videosActive && (
        <Pressable
          onPress={restartFromStart}
          hitSlop={6}
          style={({ pressed }) => [
            stackedStyles.mutePill,
            { left: 10, right: undefined, opacity: pressed ? 0.6 : 0.9 },
          ]}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
        </Pressable>
      )}

      {/* Center-Controls: vor erstem Play big play-button, danach skip/play/skip. */}
      {!videosActive && (
        <View pointerEvents="box-none" style={stackedStyles.centerRow}>
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.playButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="play" size={28} color="#fff" />
          </Pressable>
        </View>
      )}
      {ready && controlsVisible && videosActive && (
        <View pointerEvents="box-none" style={stackedStyles.centerRow}>
          <Pressable
            onPress={() => skipBy(-STACKED_SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.skipButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="play-back" size={18} color="#fff" />
            <Text style={stackedStyles.skipLabel}>{STACKED_SKIP_SEC}s</Text>
          </Pressable>
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.playButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => skipBy(STACKED_SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.skipButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="play-forward" size={18} color="#fff" />
            <Text style={stackedStyles.skipLabel}>{STACKED_SKIP_SEC}s</Text>
          </Pressable>
        </View>
      )}

      {/* Bottom Scrubber — bei sequence cumulative (0..totalDur), bei single
          item normal (0..durationSec). Time-Labels zeigen displayCurrent /
          displayDur damit User die total length sieht statt nur current clip. */}
      {ready && (
        <View style={stackedStyles.bottomBar}>
          <Text style={stackedStyles.time}>{formatPreviewTime(displayCurrent)}</Text>
          <View
            style={stackedStyles.trackHit}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            <View style={stackedStyles.track}>
              <View
                style={[stackedStyles.trackFill, { width: `${progressPct}%` }]}
              />
            </View>
            <View style={[stackedStyles.thumb, { left: `${progressPct}%` }]} />
          </View>
          <Text style={stackedStyles.time}>{formatPreviewTime(displayDur)}</Text>
        </View>
      )}
    </View>
  );
}

const STACKED_SKIP_SEC = 5;
const STACKED_AUTO_HIDE_MS = 2500;

function StackedSplitPreview({
  layout,
  sourceUri,
  thumbUri,
  facecamRegion,
  gameplayRegion,
  showOverlay,
  splitRatio,
  seekToSec = 0,
  subtitles,
  musicTracks,
  introUri,
  introMode = 'before',
  introX = 0,
  introY = 0,
  introScale = 1,
  introDurationSec = 3,
  voiceOvers,
}: {
  layout: 'stacked' | 'split';
  sourceUri: string;
  /** project.thumbUri — Click-to-play-Poster. */
  thumbUri?: string;
  facecamRegion: { x: number; y: number; w: number; h: number } | null;
  gameplayRegion: { x: number; y: number; w: number; h: number };
  showOverlay: boolean;
  splitRatio: number;
  /** Phase 9.6.7f: seek-Position beim Mount (Highlight-Clip-Start). */
  seekToSec?: number;
  subtitles?: SubtitleSettings;
  /** Music-Tracks für Live-Preview-Audio (Phase 9.6.4). Spielt nur den ersten Track. */
  musicTracks?: { path: string; volume: number }[];
  /** Intro-Video für Live-Preview (Phase 9.6.6). Wird VOR der Stacked-Preview gezeigt. */
  introUri?: string;
  /** Phase 9.6.6.1 — Intro-Mode + Position/Scale für overlay-mode live-preview. */
  introMode?: 'before' | 'overlay';
  introX?: number;
  introY?: number;
  introScale?: number;
  introDurationSec?: number;
  /** Voice-Overs für Live-Preview-Audio (Phase 9.6.4). Synchron zur Master-Position. */
  voiceOvers?: { path: string; startSec: number; volume: number }[];
}) {
  const facecamRef = useRef<RegionCroppedVideoHandle>(null);
  const gameplayRef = useRef<RegionCroppedVideoHandle>(null);
  const introRef = useRef<React.ComponentRef<typeof Video> | null>(null);

  // Click-to-play (Phase 9.5.4-hotfix2): erst nach erstem Play mounten wir die
  // beiden <Video>-Decoder. Vorher zeigen die Panes nur das Poster (thumbUri),
  // sonst gibts auf Android Native-Crashes durch 2 simultane HEVC-Decoder.
  const [videosActive, setVideosActive] = useState(false);
  // Intro-Playback-Phase (Phase 9.6.6 Preview): wenn Intro vorhanden + User
  // tippt Play → erst spielt das Intro (full-screen), dann der Main-Stacked-Preview.
  const [introPlaying, setIntroPlaying] = useState(false);
  // Phase A4.f (2026-05-18): intro source-aspect (via onLoad.naturalSize)
  // — siehe FullModePreview-Erklärung.
  const [introSrcAspect, setIntroSrcAspect] = useState<number | null>(null);
  useEffect(() => {
    setIntroSrcAspect(null);
  }, [introUri]);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [trackWidth, setTrackWidth] = useState(0);

  // Ref auf volatilen State, damit der einmal-erstellte PanResponder die
  // aktuellen Werte liest (Closures würden sonst alte States cachen).
  const stateRef = useRef({ trackWidth, durationSec });
  useEffect(() => {
    stateRef.current = { trackWidth, durationSec };
  }, [trackWidth, durationSec]);

  // Auto-hide Controls während Playback.
  useEffect(() => {
    if (paused || !controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), STACKED_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [paused, controlsVisible, currentSec]);

  // Master = facecam-Pane (treibt Scrubber + Slave-Sync).
  const handleMasterLoad = (d: OnLoadData) => {
    setDurationSec(d.duration);
    // Phase 9.6.7f: Highlight-Clip-Start — beide Panes auf seekToSec springen.
    if (seekToSec > 0) {
      facecamRef.current?.seek(seekToSec);
      gameplayRef.current?.seek(seekToSec);
      setCurrentSec(seekToSec);
    }
  };
  const handleMasterProgress = (d: OnProgressData) => {
    setCurrentSec(d.currentTime);
    // Slave nur seeken wenn drift > 0.4s (Threshold im Handle selbst).
    gameplayRef.current?.syncTo(d.currentTime);
  };

  const togglePlay = () => {
    if (!videosActive) {
      // Erstes Play → mounten die Videos. Bei before-mode spielt das Intro
      // exklusiv zuerst; bei overlay-mode parallel mit dem Main-Video.
      setVideosActive(true);
      setPaused(false);
      if (introUri && introMode === 'before') setIntroPlaying(true);
      if (introUri && introMode === 'overlay') {
        // Overlay-Intro sichtbar machen, nach durationSec auto-fade.
        setIntroPlaying(true);
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    } else {
      setPaused((p) => !p);
    }
    setControlsVisible(true);
  };

  const skipBy = (delta: number) => {
    if (durationSec <= 0) return;
    const next = Math.max(0, Math.min(durationSec, currentSec + delta));
    facecamRef.current?.seek(next);
    gameplayRef.current?.seek(next);
    setCurrentSec(next);
    setControlsVisible(true);
    // Wenn User zum Anfang zurück skipt (currentSec=0) + Intro vorhanden →
    // Intro nochmal abspielen (analog Davinci-Resolve-Behaviour).
    if (next === 0 && introUri) {
      setIntroPlaying(true);
      if (introMode === 'overlay') {
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    }
  };

  // Explicit Restart-from-Start (Replay): seek alle Videos auf 0 + Intro neu
  // starten. Wichtig: das intro-<Video> hat onEnd → paused=true intern. Wir
  // müssen seek(0) auf den Intro-Ref machen sonst spielt's nicht.
  const restartFromStart = () => {
    haptic.selection();
    facecamRef.current?.seek(0);
    gameplayRef.current?.seek(0);
    try {
      introRef.current?.seek(0);
    } catch {
      /* ignore */
    }
    setCurrentSec(0);
    if (introUri) {
      setIntroPlaying(true);
      if (introMode === 'overlay') {
        setTimeout(() => setIntroPlaying(false), Math.max(500, introDurationSec * 1000));
      }
    }
    setPaused(false);
    setControlsVisible(true);
  };

  const seekFromTouch = (x: number) => {
    const { trackWidth: w, durationSec: d } = stateRef.current;
    if (w <= 0 || d <= 0) return;
    const frac = Math.max(0, Math.min(1, x / w));
    const sec = frac * d;
    facecamRef.current?.seek(sec);
    gameplayRef.current?.seek(sec);
    setCurrentSec(sec);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => seekFromTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => seekFromTouch(evt.nativeEvent.locationX),
    }),
  ).current;

  const isStacked = layout === 'stacked';
  const progressPct = durationSec > 0 ? (currentSec / durationSec) * 100 : 0;
  const ready = durationSec > 0;
  // Play-Button + Tap-Layer schon vor dem ersten Mount sichtbar — sonst kann
  // der User die Videos nie starten (no Decoder = no onLoad = ready bleibt false).
  const showPlayHint = !videosActive;

  return (
    <View
      style={{
        aspectRatio: 9 / 16,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: '#000',
      }}
    >
      {/* Pane-Layer: zwei RegionCroppedVideoPlayer in stacked / split-Anordnung.
          flex-Werte werden vom splitRatio getrieben — Top-Pane (Facecam) = ratio,
          Bottom-Pane (Gameplay) = 1 - ratio. Sub-Pixel-Werte fallen weg, weil RN
          flex auf integer-Pixels rundet. */}
      <View style={{ flex: 1, flexDirection: isStacked ? 'column' : 'row' }}>
        <View style={{ flex: splitRatio, position: 'relative' }}>
          <RegionCroppedVideoPlayer
            ref={facecamRef}
            uri={sourceUri}
            region={facecamRegion}
            paused={paused || (introPlaying && introMode === 'before')}
            muted={muted}
            enabled={videosActive}
            posterUri={thumbUri}
            onLoad={handleMasterLoad}
            onProgress={handleMasterProgress}
          />
          <PaneLabel color="#ff1039" label="FACECAM" />
        </View>
        <View
          style={
            isStacked
              ? { height: 2, backgroundColor: 'rgba(255,16,57,0.45)' }
              : { width: 2, backgroundColor: 'rgba(255,16,57,0.45)' }
          }
        />
        <View style={{ flex: 1 - splitRatio, position: 'relative' }}>
          <RegionCroppedVideoPlayer
            ref={gameplayRef}
            uri={sourceUri}
            region={gameplayRegion}
            paused={paused || (introPlaying && introMode === 'before')}
            muted={true /* Slave-Pane immer stumm — sonst spielt Audio doppelt. */}
            enabled={videosActive}
            posterUri={thumbUri}
          />
          <PaneLabel color="#60a5fa" label="GAMEPLAY" />
        </View>
      </View>

      {/* Subtitle-Overlay (Phase 9.5.6) — Pointer-Events:none damit Tap-Layer
          darunter erreichbar bleibt. Wird nur gezeigt wenn subtitles.enabled.
          Während Intro-Phase aus (Subtitle gehört zum Main-Clip). */}
      {subtitles && !introPlaying && <SubtitleOverlay settings={subtitles} />}

      {/* Intro-Video (Phase 9.6.6 + 9.6.6.1 Preview) — zwei Modi:
          - before: full-screen vor dem Main-Clip (resizeMode=cover, absoluteFill)
          - overlay: positioniert via x/y/scale, sichtbar für durationSec parallel
            zum Main. Nach Timeout opacity 0.
          Pre-mounted für weniger Stutter beim zweiten Play. */}
      {videosActive && introUri && (() => {
        const isOverlay = introMode === 'overlay';
        // Phase A4.f (2026-05-18): Position math basiert auf VIDEO-bounds
        // (siehe FullModePreview-Erklärung). StackedSplit canvas immer 9:16.
        const canvasAspect = 9 / 16;
        const widthFracDesired = isOverlay
          ? Math.max(0.2, Math.min(1, introScale))
          : 1;
        const srcAspect = introSrcAspect ?? canvasAspect;
        let widthPct = widthFracDesired;
        let heightPct = widthFracDesired * canvasAspect / srcAspect;
        if (heightPct > 1) {
          widthPct = widthPct / heightPct;
          heightPct = 1;
        }
        const leftPct = isOverlay ? introX * (1 - widthPct) : 0;
        const topPct = isOverlay ? introY * (1 - heightPct) : 0;
        const overlayStyle = isOverlay
          ? {
              position: 'absolute' as const,
              left: `${leftPct * 100}%`,
              top: `${topPct * 100}%`,
              width: `${widthPct * 100}%`,
              height: `${heightPct * 100}%`,
            }
          : StyleSheet.absoluteFill;
        return (
          <Video
            key={`${introUri}-${introMode}`}
            ref={(r) => { introRef.current = r; }}
            source={{ uri: introUri }}
            paused={paused || !introPlaying}
            repeat={false}
            // Phase A4.e (2026-05-18): ALWAYS contain im overlay-mode (selber
            // Fix wie A4.d in FullModePreview, der hier vergessen wurde). Vorher:
            // scale>1 flipte zu cover → "110% sieht wie 200% aus" User-Report.
            // Before-mode bleibt cover (fullscreen intro vor Main).
            resizeMode={introMode === 'overlay' ? 'contain' : 'cover'}
            onLoad={(d: any) => {
              const ns = d?.naturalSize;
              if (ns && ns.width > 0 && ns.height > 0) {
                setIntroSrcAspect(ns.width / ns.height);
              }
            }}
            onEnd={() => setIntroPlaying(false)}
            onError={() => setIntroPlaying(false)}
            style={[
              overlayStyle as any,
              introPlaying ? { opacity: 1 } : { opacity: 0, display: 'none' },
            ]}
            bufferConfig={{
              minBufferMs: 3000,
              maxBufferMs: 6000,
              bufferForPlaybackMs: 500,
              bufferForPlaybackAfterRebufferMs: 1500,
            }}
            ignoreSilentSwitch="ignore"
            disableFocus
          />
        );
      })()}

      {/* Music-Player (Phase 9.6.4 Preview) — IMMER gemounted wenn videosActive
          damit Audio pre-loaded ist. paused während Intro-Phase. */}
      {videosActive && musicTracks && musicTracks.length > 0 && (
        <MusicPreviewPlayer
          uri={musicTracks[0].path}
          volume={musicTracks[0].volume}
          paused={paused || (introPlaying && introMode === 'before')}
        />
      )}

      {/* Voice-Over-Player (Phase 9.6.4 Preview) — IMMER gemounted damit
          createAsync schon läuft bevor User reload tippt. paused=true während
          Intro-Phase oder generell paused. */}
      {videosActive &&
        voiceOvers &&
        voiceOvers.map((vo, i) => (
          <VoiceOverPreviewPlayer
            key={`${vo.path}-${i}`}
            uri={vo.path}
            startSec={vo.startSec}
            volume={vo.volume}
            currentSec={currentSec}
            paused={paused || (introPlaying && introMode === 'before')}
          />
        ))}

      {/* Tap-Layer: toggelt Controls-Sichtbarkeit. Vor erstem Play sind die
          Controls IMMER sichtbar (User braucht den Play-Button). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!videosActive) return; // vor erstem Play: Tap macht nichts (Play-Button ist gross genug)
          if (ready) setControlsVisible((c) => !c);
        }}
      />

      {/* Mute-Pill oben rechts — sobald ready. */}
      {ready && (
        <Pressable
          onPress={() => setMuted((m) => !m)}
          hitSlop={6}
          style={({ pressed }) => [
            stackedStyles.mutePill,
            { opacity: pressed ? 0.6 : 0.9 },
          ]}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-high'}
            size={16}
            color="#fff"
          />
        </Pressable>
      )}

      {/* Restart-Pill oben links — replay from start inkl. Intro. */}
      {videosActive && (
        <Pressable
          onPress={restartFromStart}
          hitSlop={6}
          style={({ pressed }) => [
            stackedStyles.mutePill,
            { left: 10, right: undefined, opacity: pressed ? 0.6 : 0.9 },
          ]}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
        </Pressable>
      )}

      {/* Center-Controls — Skip / Play / Skip. Vor erstem Play ist nur ein
          grosser Play-Button sichtbar (kein Skip, kein Scrubber — wir kennen
          die Dauer noch nicht). */}
      {showPlayHint && (
        <View pointerEvents="box-none" style={stackedStyles.centerRow}>
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.playButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="play" size={28} color="#fff" />
          </Pressable>
        </View>
      )}
      {ready && controlsVisible && (
        <View pointerEvents="box-none" style={stackedStyles.centerRow}>
          <Pressable
            onPress={() => skipBy(-STACKED_SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.skipButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="play-back" size={18} color="#fff" />
            <Text style={stackedStyles.skipLabel}>{STACKED_SKIP_SEC}s</Text>
          </Pressable>
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.playButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => skipBy(STACKED_SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [
              stackedStyles.skipButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="play-forward" size={18} color="#fff" />
            <Text style={stackedStyles.skipLabel}>{STACKED_SKIP_SEC}s</Text>
          </Pressable>
        </View>
      )}

      {/* Bottom Scrubber — auch sichtbar wenn Center-Controls ausgeblendet. */}
      {ready && (
        <View style={stackedStyles.bottomBar}>
          <Text style={stackedStyles.time}>{formatPreviewTime(currentSec)}</Text>
          <View
            style={stackedStyles.trackHit}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            <View style={stackedStyles.track}>
              <View
                style={[stackedStyles.trackFill, { width: `${progressPct}%` }]}
              />
            </View>
            <View style={[stackedStyles.thumb, { left: `${progressPct}%` }]} />
          </View>
          <Text style={stackedStyles.time}>{formatPreviewTime(durationSec)}</Text>
        </View>
      )}
    </View>
  );
}

function formatPreviewTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const stackedStyles = StyleSheet.create({
  mutePill: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  trackHit: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#ff1039',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});

function PaneLabel({ color, label }: { color: string; label: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 6, left: 6 }}>
      <View
        style={{
          paddingHorizontal: 7,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: 'rgba(0,0,0,0.55)',
          borderWidth: 1,
          borderColor: color,
        }}
      >
        <Text style={{ color, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 }}>{label}</Text>
      </View>
    </View>
  );
}

function LayoutOption({
  icon,
  label,
  desc,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        padding: 12,
        borderRadius: 14,
        backgroundColor: active ? 'rgba(255,16,57,0.12)' : 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: active ? 'rgba(255,16,57,0.45)' : 'rgba(255,255,255,0.08)',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={active ? '#ff1039' : '#a1a1aa'} />
      <Text
        style={{ color: active ? '#ff1039' : '#f1f2f2', fontSize: 12, fontWeight: '700' }}
      >
        {label}
      </Text>
      <Text style={{ color: '#71717a', fontSize: 10, lineHeight: 14 }}>{desc}</Text>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onChange(!value);
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={value ? '#ff1039' : '#a1a1aa'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: '#71717a', fontSize: 11 }}>{desc}</Text>
      </View>
      <View
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          backgroundColor: value ? '#ff1039' : 'rgba(255,255,255,0.10)',
          padding: 2,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#fff',
            transform: [{ translateX: value ? 16 : 0 }],
          }}
        />
      </View>
    </Pressable>
  );
}

function IntroModeChip({
  label,
  desc,
  active,
  onPress,
}: {
  label: string;
  desc: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        padding: 10,
        borderRadius: 10,
        backgroundColor: active ? 'rgba(255,16,57,0.12)' : 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: active ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
        gap: 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: active ? '#ff1039' : '#f1f2f2', fontSize: 11, fontWeight: '700' }}>
        {label}
      </Text>
      <Text style={{ color: '#71717a', fontSize: 9, lineHeight: 12 }}>{desc}</Text>
    </Pressable>
  );
}

function ReorderArrow({
  icon,
  disabled,
  onPress,
}: {
  icon: 'chevron-up' | 'chevron-down';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 24,
        height: 18,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={14} color="#a1a1aa" />
    </Pressable>
  );
}

function AssetPickerRow({
  icon,
  label,
  desc,
  assetName,
  onPick,
  onClear,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  assetName: string | null;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <Pressable
      onPress={onPick}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={assetName ? '#ff1039' : '#a1a1aa'} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: '#71717a', fontSize: 11 }}>
          {assetName ?? desc}
        </Text>
      </View>
      {assetName ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onClear();
          }}
          hitSlop={6}
          style={{ padding: 4 }}
        >
          <Ionicons name="close-circle" size={18} color="#71717a" />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#52525b" />
      )}
    </Pressable>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: '#a1a1aa',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginTop: 6,
      }}
    >
      {children}
    </Text>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginLeft: 44,
      }}
    />
  );
}

/* ─── IntroOverlayControls (Phase 9.6.6.1) ─────────────────────────
 * Position + Scale-Fine-Tuner für Intro-overlay-Mode. Persistent auf
 * project.intro.{x,y,scale}. Bietet 4 Quick-Presets + 3 Slider.
 */

const INTRO_OVERLAY_PRESETS: Record<
  'top' | 'center' | 'bottom' | 'full',
  { x: number; y: number; scale: number }
> = {
  top:    { x: 0.5, y: 0,   scale: 0.4 },
  center: { x: 0.5, y: 0.5, scale: 0.4 },
  bottom: { x: 0.5, y: 1,   scale: 0.4 },
  full:   { x: 0,   y: 0,   scale: 1.0 },
};

function activeIntroPreset(
  x: number,
  y: number,
  scale: number,
): 'top' | 'center' | 'bottom' | 'full' | null {
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.02;
  for (const [name, p] of Object.entries(INTRO_OVERLAY_PRESETS) as [
    'top' | 'center' | 'bottom' | 'full',
    { x: number; y: number; scale: number },
  ][]) {
    if (eq(p.x, x) && eq(p.y, y) && eq(p.scale, scale)) return name;
  }
  return null;
}

function IntroOverlayControls({
  project,
  t,
}: {
  project: DemoProject;
  t: (k: string, f?: string) => string;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const setIntroDefaults = useAppStore((s) => s.setIntroDefaults);
  const introDefaults = useAppStore((s) => s.introDefaults);
  // Local state nur als initial-seed beim Mount. Slider-Drags updaten local
  // (smooth UI); commit schreibt JEWEILS NUR die geänderte Achse zum project
  // — kein Cross-Talk mehr (vorheriger Bug: Y-Commit setzte X auf stale localX).
  // Phase A4.e (2026-05-18): localScale auf max 1.0 gecapped (slider-range
  // 0.2..1.0). Legacy-Projects mit scale>1 → trotzdem auf 1.0 darstellen
  // damit Slider nicht "stuck at max" wirkt.
  const [localX, setLocalX] = useState(() => project.intro?.x ?? 0);
  const [localY, setLocalY] = useState(() => project.intro?.y ?? 0);
  const [localScale, setLocalScale] = useState(() => Math.min(1, project.intro?.scale ?? 1));
  const [localDuration, setLocalDuration] = useState(() => project.intro?.durationSec ?? 3);

  // Wenn das Project von außen die Intro zurücksetzt (z.B. neues Intro
  // gepickt) → local-state seed neu. Dependency auf `intro?.path` damit
  // wir nicht bei jedem x/y/scale-Update re-seedn.
  useEffect(() => {
    setLocalX(project.intro?.x ?? 0);
    setLocalY(project.intro?.y ?? 0);
    setLocalScale(Math.min(1, project.intro?.scale ?? 1));
    setLocalDuration(project.intro?.durationSec ?? 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.intro?.path]);

  const activePreset = activeIntroPreset(localX, localY, localScale);

  const commitOne = (key: 'x' | 'y' | 'scale' | 'durationSec', v: number) => {
    if (!project.intro) return;
    // Lese den FRISCHEN Project-State um cross-state-talk zu vermeiden bei
    // schnellen aufeinanderfolgenden Commits.
    const latest = useProjectsStore.getState().projects.find((p) => p.id === project.id);
    const currentIntro = latest?.intro ?? project.intro;
    updateProject(project.id, {
      intro: { ...currentIntro, [key]: v },
    });
  };

  const applyPreset = (name: 'top' | 'center' | 'bottom' | 'full') => {
    const p = INTRO_OVERLAY_PRESETS[name];
    setLocalX(p.x);
    setLocalY(p.y);
    setLocalScale(p.scale);
    if (project.intro) {
      updateProject(project.id, {
        intro: { ...project.intro, x: p.x, y: p.y, scale: p.scale },
      });
    }
  };

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
      <Text style={{ color: '#71717a', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
        {t('intro.positionHeader', 'POSITION')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['top', 'center', 'bottom', 'full'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              haptic.selection();
              applyPreset(p);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor:
                activePreset === p ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor:
                activePreset === p ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: activePreset === p ? '#ff1039' : '#f1f2f2',
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'capitalize',
              }}
            >
              {t(`intro.preset.${p}`, p)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Fine-Tune Slider */}
      <View style={{ gap: 6, marginTop: 4 }}>
        <SliderLabelRow
          label={t('intro.sliderX', 'Horizontal')}
          value={`${Math.round(localX * 100)}%`}
        />
        <SimpleSlider
          value={localX}
          min={0}
          max={1}
          step={0.05}
          onChange={setLocalX}
          onCommit={(v) => {
            haptic.selection();
            commitOne('x', v);
          }}
        />
        <SliderLabelRow
          label={t('intro.sliderY', 'Vertical')}
          value={`${Math.round(localY * 100)}%`}
        />
        <SimpleSlider
          value={localY}
          min={0}
          max={1}
          step={0.05}
          onChange={setLocalY}
          onCommit={(v) => {
            haptic.selection();
            commitOne('y', v);
          }}
        />
        <SliderLabelRow
          label={t('intro.sliderScale', 'Scale')}
          value={`${Math.round(localScale * 100)}%`}
        />
        <SimpleSlider
          value={localScale}
          min={0.2}
          max={1}
          step={0.05}
          onChange={setLocalScale}
          onCommit={(v) => {
            haptic.selection();
            commitOne('scale', Math.min(1, v));
          }}
        />
        {/* Phase A4.e (2026-05-18): Slider gecapped auf max=1.0. Vorher max=4
            verursachte "200% bei 110%" render-bug (StackedSplit cover-flip
            + RN-quirk). Now: scale=1.0 = full canvas, X/Y wirken erst <100%. */}
        {Math.abs(localScale - 1) < 0.01 && (
          <Text style={{ color: '#71717a', fontSize: 10, lineHeight: 14, marginTop: 2 }}>
            {t(
              'intro.sliderHintFullScale',
              'At 100% the intro fills the canvas — move Scale below 100% to use Horizontal/Vertical sliders.',
            )}
          </Text>
        )}
        <SliderLabelRow
          label={t('intro.sliderDuration', 'Duration')}
          value={`${localDuration.toFixed(1)}s`}
        />
        <SimpleSlider
          value={localDuration}
          min={0.5}
          max={30}
          step={0.5}
          onChange={setLocalDuration}
          onCommit={(v) => {
            haptic.selection();
            commitOne('durationSec', v);
          }}
        />
      </View>

      {/* Phase Builder-5: Save-as-default. Speichert aktuelle Position (mode +
          x/y/scale + durationSec) als appStore.introDefaults. Beim nächsten
          Intro-Pick werden diese Werte als initial verwendet. */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Pressable
          onPress={() => {
            haptic.selection();
            const intro = project.intro;
            if (!intro) return;
            void setIntroDefaults({
              mode: intro.mode ?? 'overlay',
              x: intro.x ?? 0,
              y: intro.y ?? 0,
              scale: intro.scale ?? 1,
              durationSec: intro.durationSec ?? 3,
            });
            haptic.success();
          }}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: 'rgba(255,16,57,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.32)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="bookmark-outline" size={12} color="#ff1039" />
          <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700' }}>
            {t('intro.saveDefault', 'Save as default')}
          </Text>
        </Pressable>
        {introDefaults && (
          <Pressable
            onPress={() => {
              haptic.light();
              void setIntroDefaults(null);
            }}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: '#a1a1aa', fontSize: 11, fontWeight: '600' }}>
              {t('intro.clearDefault', 'Clear')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ─── ExtraTrimEditor (Phase Builder-3) ────────────────────────────
 * Inline-Trim-Editor pro extra-Video. Probt Duration lazy via hidden
 * <Video onLoad>. Zwei SimpleSlider (start, end). Live-clamp: end >= start+0.5.
 * Persistiert auf project.builderExtras[*].{trimStart,trimEnd,durationSec}.
 */

function ExtraTrimEditor({
  projectId,
  extra,
  t,
}: {
  projectId: string;
  extra: ProjectExtraVideo;
  t: (k: string, f?: string) => string;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const duration = extra.durationSec ?? 0;
  const knownDuration = duration > 0;

  // Probe duration via hidden Video onLoad — nur 1× pro extra.
  const probedRef = useRef(false);

  // Local state für smooth slider drag.
  const [localStart, setLocalStart] = useState(extra.trimStart ?? 0);
  const [localEnd, setLocalEnd] = useState(extra.trimEnd ?? duration);
  useEffect(() => {
    setLocalStart(extra.trimStart ?? 0);
    setLocalEnd(extra.trimEnd ?? extra.durationSec ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra.id, extra.durationSec]);

  const commitTrim = (next: { start?: number; end?: number }) => {
    const latest = useProjectsStore.getState().projects.find((p) => p.id === projectId);
    const extras = (latest?.builderExtras ?? []).map((e) =>
      e.id === extra.id
        ? {
            ...e,
            trimStart: next.start !== undefined ? next.start : e.trimStart,
            trimEnd: next.end !== undefined ? next.end : e.trimEnd,
          }
        : e,
    );
    updateProject(projectId, { builderExtras: extras });
  };

  const onProbedDuration = (d: number) => {
    if (probedRef.current || !Number.isFinite(d) || d <= 0) return;
    probedRef.current = true;
    const latest = useProjectsStore.getState().projects.find((p) => p.id === projectId);
    const extras = (latest?.builderExtras ?? []).map((e) =>
      e.id === extra.id
        ? {
            ...e,
            durationSec: d,
            trimStart: e.trimStart ?? 0,
            trimEnd: e.trimEnd ?? d,
          }
        : e,
    );
    updateProject(projectId, { builderExtras: extras });
  };

  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      {/* Hidden video for duration probe — width/height 1×1, opacity 0. */}
      {!knownDuration && (
        <Video
          source={{ uri: extra.path }}
          paused
          muted
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}
          onLoad={(d) => onProbedDuration(d.duration)}
          onError={() => {
            /* probe failed silently */
          }}
        />
      )}
      {!knownDuration ? (
        <Text style={{ color: '#71717a', fontSize: 10, fontStyle: 'italic' }}>
          {t('builder.probingDuration', 'Probing duration…')}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#a1a1aa', fontSize: 10, fontWeight: '600' }}>
              {t('builder.extraTrim', 'Trim')}
            </Text>
            <Text
              style={{
                color: '#71717a',
                fontSize: 10,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatTimecode(localStart)} → {formatTimecode(localEnd)} ·{' '}
              {formatDuration(Math.max(0, localEnd - localStart))}
            </Text>
          </View>
          <SimpleSlider
            value={localStart}
            min={0}
            max={Math.max(0.1, duration - 0.5)}
            step={0.1}
            onChange={(v) => {
              setLocalStart(v);
              if (v > localEnd - 0.5) setLocalEnd(Math.min(duration, v + 0.5));
            }}
            onCommit={(v) => {
              haptic.selection();
              commitTrim({ start: v, end: Math.max(v + 0.5, localEnd) });
            }}
          />
          <SimpleSlider
            value={localEnd}
            min={Math.min(duration, localStart + 0.5)}
            max={duration}
            step={0.1}
            onChange={setLocalEnd}
            onCommit={(v) => {
              haptic.selection();
              commitTrim({ end: v });
            }}
          />
        </>
      )}
    </View>
  );
}

function SliderLabelRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: '#a1a1aa', fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <Text
        style={{
          color: '#71717a',
          fontSize: 10,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/* ─── BuilderTab ──────────────────────────────────────────────── */

function BuilderTab({
  project,
  selectedClipIds,
  t,
}: {
  project: DemoProject;
  selectedClipIds: Set<string>;
  t: (k: string, f?: string) => string;
}) {
  const nav = useNavigation<Nav>();
  const updateProject = useProjectsStore((s) => s.updateProject);

  // Phase Builder-3: Builder-Items = selected Highlight-Clips + Extra-Videos
  // gemischt in clipOrder. Type-Discriminator-Union für Render-Loop.
  type BuilderItem =
    | { kind: 'clip'; id: string; clip: DemoClip }
    | { kind: 'extra'; id: string; extra: ProjectExtraVideo };

  const extras = project.builderExtras ?? [];
  const orderedItems = useMemo<BuilderItem[]>(() => {
    const clipsMap = new Map(project.clips.map((c) => [c.id, c]));
    const extrasMap = new Map(extras.map((e) => [e.id, e]));
    // Iteration: erst über clipOrder (für gewünschte Reihenfolge), dann
    // catch-up der nicht-orderten selected clips + neuer extras. Wichtig:
    // wenn clipOrder LEER ist (z.B. nach extra-delete bei pure-highlight-
    // projects), dürfen wir nicht alle selected clips verlieren.
    const order = project.clipOrder ?? [];
    const out: BuilderItem[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      const clip = clipsMap.get(id);
      if (clip && selectedClipIds.has(clip.id)) {
        out.push({ kind: 'clip', id, clip });
        continue;
      }
      const extra = extrasMap.get(id);
      if (extra) {
        out.push({ kind: 'extra', id, extra });
      }
    }
    // Selected highlights die nicht in clipOrder waren → in original-Reihenfolge anhängen.
    for (const clip of project.clips) {
      if (!seen.has(clip.id) && selectedClipIds.has(clip.id)) {
        out.push({ kind: 'clip', id: clip.id, clip });
        seen.add(clip.id);
      }
    }
    // Extras die nicht in clipOrder sind → ans Ende.
    for (const e of extras) {
      if (!seen.has(e.id)) {
        out.push({ kind: 'extra', id: e.id, extra: e });
      }
    }
    return out;
  }, [project.clips, project.clipOrder, extras, selectedClipIds]);

  // selected = nur die Highlight-Clips (für Export-Pfad-Detection).
  const selected = orderedItems
    .filter((i): i is { kind: 'clip'; id: string; clip: DemoClip } => i.kind === 'clip')
    .map((i) => i.clip);
  const totalDuration = orderedItems.reduce((s, i) => {
    if (i.kind === 'clip') return s + (i.clip.endSec - i.clip.startSec);
    return s; // Extras: Duration unbekannt bis Probe — wird nicht in totalDuration einbezogen.
  }, 0);
  const hasExtras = orderedItems.some((i) => i.kind === 'extra');

  // Add-Ons aus project.* lesen (analog TikTokTab — persistent über Tab-Wechsel,
  // App-Restart und Multi-Tab-Sync). Phase Builder-1.
  const subSettings: SubtitleSettings = { ...DEFAULT_SUBTITLES, ...project.subtitles };
  const subtitles = subSettings.enabled;
  const setSubtitles = (next: boolean) => {
    updateProject(project.id, { subtitles: { ...subSettings, enabled: next } });
  };
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [builderCueEditorOpen, setBuilderCueEditorOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  // Phase B0 (2026-05-18): Trim-Modal-State für Highlight-Clips in Builder.
  // Parität mit 9:16-Tab — Scissors-Button auf jedem Clip-Item.
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const exportSettings = useAppStore((s) => s.exportSettings);
  const setExportSettingsStore = useAppStore((s) => s.setExportSettings);
  const hasVoiceOvers = (project.voiceOvers ?? []).length > 0;

  const musicTracks: AudioTrack[] = (project.musicTracks ?? []).map((m) => ({
    uri: m.path,
    filename: m.filename ?? 'audio',
    volume: m.volume,
  }));
  const setMusicTracks = (next: AudioTrack[]) => {
    updateProject(project.id, {
      musicTracks: next.map((tr) => ({
        path: tr.uri,
        filename: tr.filename,
        volume: tr.volume ?? 0.6,
      })),
    });
  };
  const musicShuffle = project.musicShuffle ?? false;
  const setMusicShuffle = (next: boolean) => {
    updateProject(project.id, { musicShuffle: next });
  };
  const introUri = project.intro?.path ?? null;
  const introName = project.intro?.filename ?? null;
  const introMode = project.intro?.mode ?? 'before';
  const setIntroMode = (mode: 'before' | 'overlay') => {
    if (project.intro) {
      updateProject(project.id, { intro: { ...project.intro, mode } });
    }
  };
  const setIntroUri = (uri: string | null) => {
    if (uri) {
      updateProject(project.id, {
        intro: { path: uri, filename: introName ?? undefined, mode: introMode },
      });
    } else {
      updateProject(project.id, { intro: undefined });
    }
  };
  // Overlay-Position (UI-only bis Phase 9.6.6.1 Intro x/y).
  const [introPosition, setIntroPosition] = useState<'top' | 'center' | 'bottom' | 'full'>('full');

  const moveItem = (itemId: string, direction: -1 | 1) => {
    haptic.selection();
    const ids = orderedItems.map((i) => i.id);
    const idx = ids.indexOf(itemId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    // Restliche clips (unselected) ans Ende, damit clipOrder vollständig bleibt.
    const restIds = project.clips
      .map((c) => c.id)
      .filter((id) => !ids.includes(id));
    updateProject(project.id, { clipOrder: [...ids, ...restIds] });
  };

  const addExtraVideo = async () => {
    haptic.medium();
    const picked = await pickVideoFromFiles({});
    if (!picked) return;
    // pickVideoFromFiles macht schon persistInDocuments → picked.uri ist
    // schon ein file:// in documentDirectory/imports/.
    const newExtra: ProjectExtraVideo = {
      id: `extra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      path: picked.uri,
      filename: picked.filename ?? 'video',
    };
    const nextExtras = [...extras, newExtra];
    // ID an clipOrder anhängen (ans Ende der Reihenfolge).
    const currentOrder = project.clipOrder ?? [
      ...project.clips.map((c) => c.id),
      ...extras.map((e) => e.id),
    ];
    updateProject(project.id, {
      builderExtras: nextExtras,
      clipOrder: [...currentOrder, newExtra.id],
    });
    haptic.success();
  };

  const removeExtra = (extraId: string) => {
    haptic.light();
    const nextExtras = extras.filter((e) => e.id !== extraId);
    const nextOrder = (project.clipOrder ?? []).filter((id) => id !== extraId);
    updateProject(project.id, {
      builderExtras: nextExtras,
      clipOrder: nextOrder,
    });
  };

  const pickIntro = async () => {
    haptic.medium();
    const picked = await pickVideoFromFiles({ maxDurationSec: 30 });
    if (picked) {
      // Phase Builder-5: appStore.introDefaults anwenden.
      const defaults = useAppStore.getState().introDefaults;
      updateProject(project.id, {
        intro: {
          path: picked.uri,
          filename: picked.filename ?? 'video',
          mode: defaults?.mode ?? introMode,
          x: defaults?.x,
          y: defaults?.y,
          scale: defaults?.scale,
          durationSec: defaults?.durationSec,
        },
      });
      haptic.success();
    }
  };

  if (orderedItems.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Ionicons name="construct-outline" size={32} color="rgba(255,255,255,0.32)" />
        <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
          {t('builder.emptyTitle', 'Pick clips first')}
        </Text>
        <Text
          style={{
            color: '#a1a1aa',
            fontSize: 12,
            textAlign: 'center',
            maxWidth: 300,
            lineHeight: 17,
          }}
        >
          {t(
            'builder.emptyBody',
            'Switch to the Highlights tab, select the clips you want to combine, then tap "Build YouTube video".',
          )}
        </Text>
        <Pressable
          onPress={addExtraVideo}
          style={({ pressed }) => ({
            marginTop: 4,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: 'rgba(255,16,57,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.40)',
            opacity: pressed ? 0.7 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          })}
        >
          <Ionicons name="add" size={14} color="#ff1039" />
          <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
            {t('builder.addExtra', 'Add extra video')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Phase Builder-5 Preview — 16:9 mit Sequential-Playback aller items.
          Highlights + Extras spielen in clipOrder hintereinander mit ihrem
          jeweiligen Trim-Range. Subtitle/Music/TTS/Intro liegen drüber. */}
      {(() => {
        const projectSourceUris = project.sourceUris ?? [];
        const isMultiSrc = projectSourceUris.length >= 2;
        const clipIdxById = new Map<string, number>();
        (project.clips ?? []).forEach((c, i) => clipIdxById.set(c.id, i));
        const previewSources = orderedItems
          .map((item) => {
            if (item.kind === 'clip') {
              // Phase A3.11 (2026-05-17): bei kind='highlight' nutze
              // clip.sourceIdx (explicit). Sonst legacy one-to-one i==srcIdx.
              const explicitSrcIdx = item.clip.sourceIdx;
              const clipIdx = clipIdxById.get(item.clip.id);
              const srcIdx = explicitSrcIdx ?? clipIdx;
              const uri =
                isMultiSrc && srcIdx !== undefined && projectSourceUris[srcIdx]
                  ? projectSourceUris[srcIdx]
                  : project.sourceUri;
              if (!uri) return null;
              const hasTrim = item.clip.endSec > item.clip.startSec;
              return {
                uri,
                startSec: item.clip.startSec,
                endSec: hasTrim ? item.clip.endSec : -1,
              };
            }
            return {
              uri: item.extra.path,
              startSec: item.extra.trimStart ?? 0,
              endSec: item.extra.trimEnd ?? item.extra.durationSec ?? -1,
            };
          })
          .filter((s): s is { uri: string; startSec: number; endSec: number } => !!s);
        if (previewSources.length === 0) return null;
        return (
          <FullModePreview
            key={previewSources.map((s) => s.uri).join('|')}
            sources={previewSources}
            aspect={16 / 9}
            seekToSec={previewSources[0].startSec}
            thumbUri={project.thumbUri}
            subtitles={subSettings}
            musicTracks={(project.musicTracks ?? []).map((m) => ({ path: m.path, volume: m.volume }))}
            voiceOvers={(project.voiceOvers ?? []).map((vo) => ({
              path: vo.path,
              startSec: vo.startSec,
              volume: vo.volume,
            }))}
            introUri={project.intro?.path ?? undefined}
            introMode={project.intro?.mode ?? 'before'}
            introX={project.intro?.x ?? 0}
            introY={project.intro?.y ?? 0}
            introScale={project.intro?.scale ?? 1}
            introDurationSec={project.intro?.durationSec ?? 3}
          />
        );
      })()}

      <View style={{ gap: 4 }}>
        <Text style={{ color: '#f1f2f2', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>
          {t('builder.title', 'YouTube Builder')}
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 12 }}>
          {selected.length} {t('builder.clipsSelected', 'clips')} · {formatDuration(totalDuration)}{' '}
          {t('builder.total', 'total')}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        {orderedItems.map((item, idx) => {
          const isExtra = item.kind === 'extra';
          return (
            <View
              key={item.id}
              style={{
                gap: 8,
                padding: 12,
                borderRadius: 14,
                backgroundColor: isExtra ? 'rgba(255,16,57,0.06)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: isExtra ? 'rgba(255,16,57,0.25)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ gap: 4 }}>
                  <ReorderArrow
                    icon="chevron-up"
                    disabled={idx === 0}
                    onPress={() => moveItem(item.id, -1)}
                  />
                  <ReorderArrow
                    icon="chevron-down"
                    disabled={idx === orderedItems.length - 1}
                    onPress={() => moveItem(item.id, 1)}
                  />
                </View>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255,16,57,0.18)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={isExtra ? 'film-outline' : 'sparkles-outline'}
                    size={14}
                    color="#ff1039"
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
                    {item.kind === 'clip' ? item.clip.label : (item.extra.filename ?? t('builder.extraLabel', 'Extra video'))}
                  </Text>
                  <Text style={{ color: '#71717a', fontSize: 11, fontVariant: ['tabular-nums'] }}>
                    {item.kind === 'clip'
                      ? `${formatTimecode(item.clip.startSec)} → ${formatTimecode(item.clip.endSec)} · ${formatDuration(item.clip.endSec - item.clip.startSec)}`
                      : item.extra.durationSec
                        ? `${formatTimecode(item.extra.trimStart ?? 0)} → ${formatTimecode(item.extra.trimEnd ?? item.extra.durationSec)} · ${formatDuration((item.extra.trimEnd ?? item.extra.durationSec) - (item.extra.trimStart ?? 0))}`
                        : t('builder.extraBadge', 'Extra · added video')}
                  </Text>
                </View>
                {/* Phase B0 (2026-05-18): Scissors-Trim auf Highlight-Clips
                    (Parität mit 9:16-Tab). Extras haben separaten Inline-
                    Editor (ExtraTrimEditor) unten. */}
                {item.kind === 'clip' && (
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      setEditingClipId(item.clip.id);
                    }}
                    hitSlop={6}
                    style={({ pressed }) => ({
                      padding: 6,
                      borderRadius: 8,
                      backgroundColor: pressed ? 'rgba(255,16,57,0.18)' : 'transparent',
                    })}
                  >
                    <Ionicons name="cut-outline" size={16} color="#a1a1aa" />
                  </Pressable>
                )}
                {isExtra && (
                  <Pressable onPress={() => removeExtra(item.id)} hitSlop={6} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={18} color="#71717a" />
                  </Pressable>
                )}
              </View>
              {/* Phase Builder-3: Trim-Editor inline pro Extra. Probe duration
                  lazy + 2 SimpleSlider (start, end). */}
              {isExtra && (
                <ExtraTrimEditor projectId={project.id} extra={item.extra} t={t} />
              )}
            </View>
          );
        })}
        {/* Add-Extra-Video-Button (Phase Builder-3) */}
        <Pressable
          onPress={addExtraVideo}
          style={({ pressed }) => ({
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: 'rgba(255,16,57,0.10)',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: 'rgba(255,16,57,0.40)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="add" size={16} color="#ff1039" />
          <Text style={{ color: '#ff1039', fontSize: 13, fontWeight: '700' }}>
            {t('builder.addExtra', 'Add extra video')}
          </Text>
        </Pressable>
      </View>

      {/* Phase A3.9 (2026-05-17): AI-Highlights als wählbare Quick-Adds.
          Sichtbar wenn aiHighlights vorhanden. Pro Tap wird ein extra mit
          dem highlight-range zu builderExtras + clipOrder hinzugefügt. */}
      {(project.aiHighlights?.length ?? 0) > 0 && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={13} color="#ff1039" />
            <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
              {t('builder.aiHighlightsHeading', 'AI HIGHLIGHTS — TAP TO ADD')} · {project.aiHighlights!.length}
            </Text>
          </View>
          {project.aiHighlights!.map((h, idx) => {
            const resolved = resolveHighlightSource(h, project);
            const disabled = !resolved;
            return (
              <Pressable
                key={`builder-ai-${idx}`}
                disabled={disabled}
                onPress={() => {
                  if (!resolved) return;
                  haptic.medium();
                  const newExtra: ProjectExtraVideo = {
                    id: `extra-ai-${Date.now().toString(36)}-${idx}`,
                    path: resolved.uri,
                    filename: `AI · ${(h.label || `Highlight ${idx + 1}`).slice(0, 50)}`,
                    durationSec: Math.max(0, resolved.trimEnd - resolved.trimStart),
                    trimStart: resolved.trimStart,
                    trimEnd: resolved.trimEnd,
                  };
                  updateProject(project.id, {
                    builderExtras: [...(project.builderExtras ?? []), newExtra],
                    clipOrder: [...(project.clipOrder ?? []), newExtra.id],
                  });
                  haptic.success();
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: disabled
                    ? 'rgba(255,255,255,0.03)'
                    : pressed
                      ? 'rgba(255,16,57,0.18)'
                      : 'rgba(255,16,57,0.08)',
                  borderWidth: 1,
                  borderColor: disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,16,57,0.30)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  opacity: disabled ? 0.5 : 1,
                })}
              >
                <Ionicons name="add-circle-outline" size={16} color={disabled ? '#52525b' : '#ff1039'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {h.label || `Highlight ${idx + 1}`}
                  </Text>
                  <Text style={{ color: '#71717a', fontSize: 10 }}>
                    {formatTime(h.startSec)}–{formatTime(h.endSec)} · {Math.round((h.endSec - h.startSec))}s · {Math.round(h.score * 100)}%
                    {disabled && ` · ${t('builder.aiCrossClipShort', 'cross-clip')}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Add-Ons — gleicher Pattern wie TikTok-Tab, nur ohne Stacking weil 16:9. */}
      <SectionHeader>{t('builder.addOnsHeader', 'ADD-ONS').toUpperCase()}</SectionHeader>
      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
          <View style={{ flex: 1 }}>
            <ToggleRow
              icon="chatbubble-ellipses-outline"
              label={t('builder.subtitles', 'Subtitles')}
              desc={t('builder.subtitlesDesc', 'Burn-in word-highlight subs')}
              value={subtitles}
              onChange={setSubtitles}
            />
          </View>
          <Pressable
            onPress={() => {
              haptic.light();
              setSubModalOpen(true);
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="options-outline" size={16} color="#a1a1aa" />
          </Pressable>
        </View>
        {(subSettings.cues?.length ?? 0) > 0 && (
          <Pressable
            onPress={() => {
              haptic.medium();
              setBuilderCueEditorOpen(true);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: pressed ? 'rgba(255,16,57,0.18)' : 'rgba(255,16,57,0.10)',
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,16,57,0.25)',
            })}
          >
            <Ionicons name="create-outline" size={14} color="#ff1039" />
            <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
              {t('builder.editCuesInline', `Edit subtitle text (${subSettings.cues!.length} cues)`)}
            </Text>
          </Pressable>
        )}
        <Divider />
        <MultiAudioPicker
          tracks={musicTracks}
          shuffle={musicShuffle}
          onChange={setMusicTracks}
          onShuffleChange={setMusicShuffle}
          label={t('builder.music', 'Background music')}
          desc={t('builder.musicDesc', 'Add one or many tracks · drag to reorder · shuffle for random play')}
        />
        <Divider />
        <AssetPickerRow
          icon="play-skip-forward-outline"
          label={t('builder.intro', 'Intro video')}
          desc={t('builder.introDesc', 'Pick a short video to prepend or overlay')}
          assetName={introName}
          onPick={pickIntro}
          onClear={() => setIntroUri(null)}
        />
        {introUri && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingBottom: 6,
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <IntroModeChip
              label={t('builder.introModeBefore', 'Before video')}
              desc={t('builder.introModeBeforeDesc', 'Plays first, then main')}
              active={introMode === 'before'}
              onPress={() => {
                haptic.selection();
                setIntroMode('before');
              }}
            />
            <IntroModeChip
              label={t('builder.introModeOverlay', 'Overlay')}
              desc={t('builder.introModeOverlayDesc', 'Transparent over the first 3 s')}
              active={introMode === 'overlay'}
              onPress={() => {
                haptic.selection();
                setIntroMode('overlay');
              }}
            />
          </View>
        )}
        {/* Phase A4 (2026-05-17): scale/x/y/auto-fit jetzt auch im before-
            Mode aktiv (vorher hardcoded cover-W:H). Daher die Position-
            Controls in beiden Modi anzeigen. */}
        {introUri && (
          <IntroOverlayControls project={project} t={t} />
        )}
      </View>

      {/* Voice-Overs (TTS) — eigene Section analog Desktop's VoiceOversSection. */}
      <VoiceOversSection
        project={project}
        totalDurationHint={totalDuration > 0 ? totalDuration : project.durationSec}
        title={t('builder.tts', 'TTS Voice-over')}
      />

      {(musicTracks.length > 0 || introUri || hasVoiceOvers || subtitles) && (
        <View
          style={{
            backgroundColor: 'rgba(255,16,57,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.18)',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            gap: 6,
          }}
        >
          <Text style={{ color: '#ff1039', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
            LIVE-PREVIEW APPLIES
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 16 }}>
            {[
              subtitles && t('builder.subtitles', 'Subtitles'),
              hasVoiceOvers && `${(project.voiceOvers ?? []).length} ${(project.voiceOvers ?? []).length === 1 ? 'TTS' : 'TTS tracks'}`,
              musicTracks.length > 0 && `${musicTracks.length} ${musicTracks.length === 1 ? 'track' : 'tracks'}${musicShuffle ? ' (shuffle)' : ''}`,
              introUri && `Intro · ${introMode}${introMode === 'overlay' ? ` · ${introPosition}` : ''}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            {' '}— {t('builder.previewHint', 'mixed into the final render via FFmpeg-native (Phase 9.6).')}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => {
          // Export valid wenn ein source (single/multi) ODER mindestens ein extra da ist.
          const hasAnySource =
            !!project.sourceUri ||
            (project.sourceUris && project.sourceUris.length > 0) ||
            hasExtras;
          if (!hasAnySource) {
            haptic.warning();
            appAlert(
              t('builder.exportTitle', 'Export 16:9'),
              t('builder.exportNoSource', 'Dieses Projekt hat noch kein Source-Video. Erst Video importieren.'),
            );
            return;
          }
          haptic.medium();
          setExportModalOpen(true);
        }}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
          borderRadius: 14,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
        })}
      >
        <Ionicons name="hammer" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
          {t('builder.exportButton', 'Build 16:9 video')}
        </Text>
      </Pressable>

      <Text
        style={{
          color: '#71717a',
          fontSize: 11,
          textAlign: 'center',
          marginTop: 4,
          lineHeight: 16,
        }}
      >
        {t(
          'builder.reorderHint',
          'Use the up/down arrows above to set the clip order — the final cut concatenates them in that order.',
        )}
      </Text>

      {/* Subtitle-Settings-Modal — lazy mount. */}
      {subModalOpen && (
        <SubtitleSettingsModal
          visible={subModalOpen}
          settings={subSettings}
          onClose={() => setSubModalOpen(false)}
          onChange={(next) => updateProject(project.id, { subtitles: next })}
        />
      )}

      <CueEditorModal
        visible={builderCueEditorOpen}
        cues={subSettings.cues ?? []}
        sourceUris={project.sourceUris}
        onClose={() => setBuilderCueEditorOpen(false)}
        onSave={(nextCues) =>
          updateProject(project.id, { subtitles: { ...subSettings, cues: nextCues } })
        }
      />

      {/* Phase B0 (2026-05-18): TrimModal für Highlight-Clips im Builder.
          Parität mit 9:16-Tab — selber TrimModal, gleiche Save/Split-Logik. */}
      {editingClipId && (() => {
        const editClip = project.clips.find((c) => c.id === editingClipId);
        if (!editClip) return null;
        const projectSourceUris = project.sourceUris ?? [];
        const isMultiSrc = projectSourceUris.length >= 2;
        const explicitSrcIdx = editClip.sourceIdx;
        const clipIdx = project.clips.indexOf(editClip);
        const trimSourceUri =
          explicitSrcIdx !== undefined && projectSourceUris[explicitSrcIdx]
            ? projectSourceUris[explicitSrcIdx]
            : isMultiSrc
              ? projectSourceUris[Math.min(clipIdx, projectSourceUris.length - 1)]
              : project.sourceUri;
        if (!trimSourceUri) return null;
        return (
          <TrimModal
            visible={true}
            sourceUri={trimSourceUri}
            initialStartSec={editClip.startSec}
            initialEndSec={editClip.endSec}
            sourceDuration={
              project.perClipDurations?.[explicitSrcIdx ?? clipIdx] ?? undefined
            }
            clipLabel={editClip.label || `Clip ${clipIdx + 1}`}
            t={t}
            onClose={() => setEditingClipId(null)}
            onSave={(s, e) => {
              setEditingClipId(null);
              const latest = useProjectsStore.getState().projects.find(
                (p) => p.id === project.id,
              );
              if (!latest) return;
              const nextClips = (latest.clips ?? []).map((cc) =>
                cc.id === editClip.id ? { ...cc, startSec: s, endSec: e } : cc,
              );
              updateProject(project.id, { clips: nextClips });
            }}
            onSplit={(atSec) => {
              setEditingClipId(null);
              const latest = useProjectsStore.getState().projects.find(
                (p) => p.id === project.id,
              );
              if (!latest) return;
              const original = (latest.clips ?? []).find((c) => c.id === editClip.id);
              if (!original) return;
              const newIdLeft = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
              const newIdRight = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}a`;
              const left: DemoClip = {
                ...original,
                id: newIdLeft,
                startSec: original.startSec,
                endSec: atSec,
                label: original.label ? `${original.label} (1)` : `Clip ${clipIdx + 1}.1`,
              };
              const right: DemoClip = {
                ...original,
                id: newIdRight,
                startSec: atSec,
                endSec: original.endSec,
                label: original.label ? `${original.label} (2)` : `Clip ${clipIdx + 1}.2`,
                thumbUri: undefined,
              };
              const origIdx = (latest.clips ?? []).findIndex((c) => c.id === editClip.id);
              const nextClips = [...(latest.clips ?? [])];
              nextClips.splice(origIdx, 1, left, right);
              updateProject(project.id, { clips: nextClips });
            }}
          />
        );
      })()}

      {exportModalOpen && (project.sourceUri || (project.sourceUris && project.sourceUris.length > 0) || hasExtras) && (
        <ExportSettingsModal
          visible={exportModalOpen}
          initialSettings={exportSettings}
          onClose={() => setExportModalOpen(false)}
          onConfirm={(next, saveAsDefault) => {
            if (saveAsDefault) {
              void setExportSettingsStore(next);
            }
            setExportModalOpen(false);
            // Export-Pfad-Detection (Phase Builder-3 unified per-source-trim):
            //  Wir bauen IMMER `builderItemPlan[]` aus orderedItems — pro item
            //  ein { sourceUri, trimStart, trimEnd }. Der ExportScreen dedupes
            //  sourceUris[] und mapped trims auf clips[].src-indices.
            //  Damit funktioniert: pure single-source highlights, multi-source
            //  highlights, gemischte highlights+extras, alle MIT trim.
            const projectSourceUris = project.sourceUris ?? [];
            const projectClips = project.clips ?? [];
            const isMultiSource = projectSourceUris.length >= 2;
            const clipIndexById = new Map<string, number>();
            projectClips.forEach((c, i) => clipIndexById.set(c.id, i));

            const builderItemPlan = orderedItems
              .map((item) => {
                if (item.kind === 'clip') {
                  // Phase A3.11: AI-Highlight clips haben sourceIdx; legacy
                  // clips nutzen clip-index als source-index.
                  const explicitSrcIdx = item.clip.sourceIdx;
                  const idx = clipIndexById.get(item.clip.id);
                  const srcIdx = explicitSrcIdx ?? idx;
                  const uri =
                    isMultiSource && srcIdx !== undefined && projectSourceUris[srcIdx]
                      ? projectSourceUris[srcIdx]
                      : project.sourceUri;
                  if (!uri) return null;
                  // Multi-Clip-Import legt clips mit endSec=0 an (DocumentPicker
                  // liefert keine Duration). Wenn 0 oder <= startSec → -1 als
                  // sentinel für "ganze File" (ExportScreen mapped auf big trim).
                  const hasValidTrim = item.clip.endSec > item.clip.startSec;
                  return {
                    sourceUri: uri,
                    trimStart: item.clip.startSec,
                    trimEnd: hasValidTrim ? item.clip.endSec : -1,
                  };
                }
                // Extra: trim if set, sonst full (0..durationSec or undefined).
                return {
                  sourceUri: item.extra.path,
                  trimStart: item.extra.trimStart ?? 0,
                  trimEnd: item.extra.trimEnd ?? item.extra.durationSec ?? -1,
                };
              })
              .filter((p): p is { sourceUri: string; trimStart: number; trimEnd: number } => !!p);

            const firstClip = selected[0];
            const lastClip = selected[selected.length - 1];
            nav.navigate('Export', {
              sourceUri: builderItemPlan[0]?.sourceUri ?? project.sourceUri ?? '',
              projectId: project.id,
              trimStart: firstClip?.startSec ?? 0,
              trimEnd: lastClip?.endSec ?? project.durationSec,
              sourceDuration: project.durationSec,
              mode: 'builder',
              exportSettings: next,
              builderItemPlan,
            });
          }}
        />
      )}
    </ScrollView>
  );
}

/* ─── Hero-Placeholder für Demo-Projekte ohne sourceUri ────────── */

function PlaceholderHero({ project }: { project: DemoProject }) {
  return (
    <View
      style={{
        aspectRatio: 16 / 10,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: `hsl(${project.thumbHue}, 40%, 18%)`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: 'rgba(255,255,255,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="play" size={28} color="#fff" />
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.65)',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
          {formatDuration(project.durationSec)}
        </Text>
      </View>
    </View>
  );
}

/* ─── Region-Preset Helpers ─────────────────────────────────────── */

/** Findet den passenden Preset zur aktuellen Region (epsilon-Vergleich). */
function matchPreset<T extends string>(
  region: Region | null,
  presets: Record<T, Region | null>,
): T | null {
  for (const key of Object.keys(presets) as T[]) {
    const p = presets[key];
    if (p === null && region === null) return key;
    if (
      p &&
      region &&
      Math.abs(p.x - region.x) < 0.015 &&
      Math.abs(p.y - region.y) < 0.015 &&
      Math.abs(p.w - region.w) < 0.015 &&
      Math.abs(p.h - region.h) < 0.015
    ) {
      return key;
    }
  }
  return null;
}

/** Kompakte Pill-Labels analog Desktop's Snap-Buttons (TL/TR/BL/BR/None / Center/Bottom/...). */
function presetLabelFor(
  id: FacecamPreset | GameplayPreset,
  t: (k: string, f?: string) => string,
): string {
  switch (id) {
    case 'top-left':     return t('region.snapTL', 'TL');
    case 'top-right':    return t('region.snapTR', 'TR');
    case 'bottom-left':  return t('region.snapBL', 'BL');
    case 'bottom-right': return t('region.snapBR', 'BR');
    case 'none':         return t('region.snapNone', 'None');
    case 'center':       return t('region.snapCenter', 'Center');
    case 'bottom':       return t('region.snapBottom', 'Bottom');
    case 'stretch':      return t('region.snapStretch', 'Stretch');
    case 'full':         return t('region.snapFull', 'Full');
    default:             return id;
  }
}

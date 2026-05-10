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
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
} from 'react-native';
import type { OnLoadData, OnProgressData } from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { VideoPlayer } from '../components/VideoPlayer';
import {
  formatDuration,
  formatTimecode,
  type DemoClip,
  type DemoProject,
  type ProjectMode,
  type SourceType,
} from '../data/demoProjects';
import { useProject, useProjectsStore } from '../stores/projectsStore';
import { useAppStore } from '../stores/appStore';
import { RegionOverlay } from '../components/RegionOverlay';
import {
  RegionCroppedVideoPlayer,
  type RegionCroppedVideoHandle,
} from '../components/RegionCroppedVideoPlayer';
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

  useEffect(() => {
    sounds.projectOpen();
  }, [params.projectId]);

  const onDelete = () => {
    if (!project) return;
    haptic.warning();
    Alert.alert(
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
      {activeTab === 'tiktok' && <TikTokTab project={project} t={t} />}
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
  const totalDuration = project.clips.reduce((s, c) => s + (c.endSec - c.startSec), 0);
  const avgScore = project.clips.length
    ? Math.round((project.clips.reduce((s, c) => s + c.score, 0) / project.clips.length) * 100)
    : 0;
  const selectedCount = selectedClipIds.size;
  const allSelected = selectedCount > 0 && selectedCount === project.clips.length;

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
      {/* Hero */}
      {project.sourceUri ? (
        <VideoPlayer uri={project.sourceUri} />
      ) : (
        <PlaceholderHero project={project} />
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
              onToggle={() => toggleClip(clip.id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function SelectableClipRow({
  index,
  clip,
  hue,
  selected,
  onToggle,
}: {
  index: number;
  clip: DemoClip;
  hue: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const scorePct = Math.round(clip.score * 100);
  const len = clip.endSec - clip.startSec;
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: selected ? 'rgba(255,16,57,0.08)' : 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? 'rgba(255,16,57,0.32)' : 'rgba(255,255,255,0.08)',
        padding: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
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

  const seek = (sec: number) => setSeekTo(sec + Math.random() * 1e-9);

  const onAddClip = () => {
    if (markIn == null || markOut == null) {
      haptic.error();
      return;
    }
    if (markOut <= markIn) {
      haptic.error();
      Alert.alert(
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

  if (!project.sourceUri) {
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

      <VideoPlayer
        uri={project.sourceUri}
        seekTo={seekTo}
        onProgress={(sec) => setCurrentSec(sec)}
      />

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
  t,
}: {
  project: DemoProject;
  t: (k: string, f?: string) => string;
}) {
  const updateProject = useProjectsStore((s) => s.updateProject);
  const defaultFacecam = useAppStore((s) => s.facecamRegion);
  const defaultGameplay = useAppStore((s) => s.gameplayRegion);

  // Per-Project-Override: wenn am Project gesetzt → benutzen, sonst Settings-Default.
  const facecamRegion =
    project.facecamRegion !== undefined ? project.facecamRegion : defaultFacecam;
  const gameplayRegion = project.gameplayRegion ?? defaultGameplay;
  const usingOverride = project.gameplayRegion != null || project.facecamRegion !== undefined;

  const [layout, setLayout] = useState<Layout>('stacked');
  const [subtitles, setSubtitles] = useState(true);
  const [tts, setTts] = useState(false);
  const [musicTracks, setMusicTracks] = useState<AudioTrack[]>([]);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [introUri, setIntroUri] = useState<string | null>(null);
  const [introName, setIntroName] = useState<string | null>(null);
  const [introMode, setIntroMode] = useState<'before' | 'overlay'>('before');
  const [introPosition, setIntroPosition] = useState<'top' | 'center' | 'bottom' | 'full'>('full');
  const [showOverlay, setShowOverlay] = useState(true);

  const pickIntro = async () => {
    haptic.medium();
    const picked = await pickVideoFromFiles({ maxDurationSec: 30 });
    if (picked) {
      setIntroUri(picked.uri);
      setIntroName(picked.filename ?? 'video');
      haptic.success();
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 9:16-Aspect-Preview mit Layout-spezifischer Darstellung. */}
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: '65%' }}>
          <LayoutPreview
            layout={layout}
            sourceUri={project.sourceUri}
            thumbHue={project.thumbHue}
            facecamRegion={facecamRegion}
            gameplayRegion={gameplayRegion}
            showOverlay={showOverlay}
          />
        </View>
      </View>

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

      {/* Hide-Overlay-Toggle — sinnvoll bei Stacked, da man dann die echte
          Komposition statt der Schaubild-Kästen sehen will. */}
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
            {t('tiktok.showRegions', 'Show region overlay')}
          </Text>
          <Text style={{ color: '#71717a', fontSize: 10 }}>
            {t(
              'tiktok.showRegionsHint',
              'Toggle the red/blue boxes off when you want to see the clean composition.',
            )}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            haptic.selection();
            setShowOverlay((v) => !v);
          }}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: showOverlay ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: showOverlay ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.10)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              color: showOverlay ? '#ff1039' : '#a1a1aa',
              fontSize: 11,
              fontWeight: '700',
            }}
          >
            {showOverlay ? t('common.on', 'ON') : t('common.off', 'OFF')}
          </Text>
        </Pressable>
      </View>

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
        <ToggleRow
          icon="chatbubble-ellipses-outline"
          label={t('tiktok.subtitles', 'Subtitles')}
          desc={t('tiktok.subtitlesDesc', 'Burn-in word-highlight subs')}
          value={subtitles}
          onChange={setSubtitles}
        />
        <Divider />
        <ToggleRow
          icon="mic-outline"
          label={t('tiktok.tts', 'TTS Voice-over')}
          desc={t('tiktok.ttsDesc', 'AI-generated narration over the clip')}
          value={tts}
          onChange={setTts}
        />
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
        {introUri && introMode === 'overlay' && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingBottom: 6,
              gap: 6,
            }}
          >
            <Text style={{ color: '#71717a', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
              POSITION
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(['top', 'center', 'bottom', 'full'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    haptic.selection();
                    setIntroPosition(p);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor:
                      introPosition === p ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.04)',
                    borderWidth: 1,
                    borderColor:
                      introPosition === p ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: introPosition === p ? '#ff1039' : '#f1f2f2',
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'capitalize',
                    }}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Aktive Add-Ons Live-Indicator */}
      {(musicTracks.length > 0 || introUri || tts || subtitles) && (
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
              tts && t('tiktok.tts', 'TTS'),
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
          haptic.medium();
          Alert.alert(
            t('tiktok.exportTitle', 'Export 9:16'),
            t(
              'tiktok.exportSoonBody',
              'Picks every selected highlight, applies the layout + add-ons, exports as a single 9:16 reel. Wired up with the FFmpeg native bridge.',
            ),
          );
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
          {t('tiktok.exportButton', 'Export 9:16 reel')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function LayoutPreview({
  layout,
  sourceUri,
  thumbHue,
  facecamRegion,
  gameplayRegion,
  showOverlay,
}: {
  layout: Layout;
  sourceUri?: string;
  thumbHue: number;
  facecamRegion: { x: number; y: number; w: number; h: number } | null;
  gameplayRegion: { x: number; y: number; w: number; h: number };
  showOverlay: boolean;
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
      <View style={{ position: 'relative' }}>
        <VideoPlayer uri={sourceUri} resizeMode="cover" aspectRatio={9 / 16} />
        {showOverlay && (
          <RegionOverlay facecam={facecamRegion} gameplay={gameplayRegion} />
        )}
      </View>
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
      facecamRegion={facecamRegion}
      gameplayRegion={gameplayRegion}
      showOverlay={showOverlay}
    />
  );
}

const STACKED_SKIP_SEC = 5;
const STACKED_AUTO_HIDE_MS = 2500;

function StackedSplitPreview({
  layout,
  sourceUri,
  facecamRegion,
  gameplayRegion,
  showOverlay,
}: {
  layout: 'stacked' | 'split';
  sourceUri: string;
  facecamRegion: { x: number; y: number; w: number; h: number } | null;
  gameplayRegion: { x: number; y: number; w: number; h: number };
  showOverlay: boolean;
}) {
  const facecamRef = useRef<RegionCroppedVideoHandle>(null);
  const gameplayRef = useRef<RegionCroppedVideoHandle>(null);

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
  };
  const handleMasterProgress = (d: OnProgressData) => {
    setCurrentSec(d.currentTime);
    // Slave nur seeken wenn drift > 0.4s (Threshold im Handle selbst).
    gameplayRef.current?.syncTo(d.currentTime);
  };

  const togglePlay = () => {
    setPaused((p) => !p);
    setControlsVisible(true);
  };

  const skipBy = (delta: number) => {
    if (durationSec <= 0) return;
    const next = Math.max(0, Math.min(durationSec, currentSec + delta));
    facecamRef.current?.seek(next);
    gameplayRef.current?.seek(next);
    setCurrentSec(next);
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
      {/* Pane-Layer: zwei RegionCroppedVideoPlayer in stacked / split-Anordnung. */}
      <View style={{ flex: 1, flexDirection: isStacked ? 'column' : 'row' }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <RegionCroppedVideoPlayer
            ref={facecamRef}
            uri={sourceUri}
            region={facecamRegion}
            paused={paused}
            muted={muted}
            onLoad={handleMasterLoad}
            onProgress={handleMasterProgress}
          />
          <PaneLabel color="#ff1039" label="FACECAM" />
          {showOverlay && facecamRegion && isStacked && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <RegionOverlay facecam={facecamRegion} />
            </View>
          )}
        </View>
        <View
          style={
            isStacked
              ? { height: 2, backgroundColor: 'rgba(255,16,57,0.45)' }
              : { width: 2, backgroundColor: 'rgba(255,16,57,0.45)' }
          }
        />
        <View style={{ flex: 1, position: 'relative' }}>
          <RegionCroppedVideoPlayer
            ref={gameplayRef}
            uri={sourceUri}
            region={gameplayRegion}
            paused={paused}
            muted={true /* Slave-Pane immer stumm — sonst spielt Audio doppelt. */}
          />
          <PaneLabel color="#60a5fa" label="GAMEPLAY" />
          {showOverlay && isStacked && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <RegionOverlay gameplay={gameplayRegion} />
            </View>
          )}
        </View>
      </View>

      {/* Tap-Layer: toggelt Controls-Sichtbarkeit. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => ready && setControlsVisible((c) => !c)}
      />

      {/* Mute-Pill oben rechts — immer sichtbar wenn ready. */}
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

      {/* Center-Controls — Skip / Play / Skip */}
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
  const updateProject = useProjectsStore((s) => s.updateProject);
  const [tts, setTts] = useState(false);
  const [musicTracks, setMusicTracks] = useState<AudioTrack[]>([]);
  const [musicShuffle, setMusicShuffle] = useState(false);
  const [introUri, setIntroUri] = useState<string | null>(null);
  const [introName, setIntroName] = useState<string | null>(null);
  const [introMode, setIntroMode] = useState<'before' | 'overlay'>('before');
  const [introPosition, setIntroPosition] = useState<'top' | 'center' | 'bottom' | 'full'>('full');

  // Stabile Reihenfolge der ausgewählten Clips:
  // 1. clipOrder am Project bevorzugen (User hat reordered)
  // 2. sonst original-Reihenfolge aus project.clips
  const orderedSelectedClips = useMemo(() => {
    const inOrder = project.clipOrder
      ? project.clipOrder.map((id) => project.clips.find((c) => c.id === id)).filter(Boolean) as DemoClip[]
      : project.clips;
    return inOrder.filter((c) => selectedClipIds.has(c.id));
  }, [project.clips, project.clipOrder, selectedClipIds]);
  const selected = orderedSelectedClips;
  const totalDuration = selected.reduce((s, c) => s + (c.endSec - c.startSec), 0);

  const moveClip = (clipId: string, direction: -1 | 1) => {
    haptic.selection();
    const ids = selected.map((c) => c.id);
    const idx = ids.indexOf(clipId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    // Den restlichen project.clips an die User-Order anhängen damit nichts verloren geht.
    const restIds = project.clips.map((c) => c.id).filter((id) => !ids.includes(id));
    updateProject(project.id, { clipOrder: [...ids, ...restIds] });
  };

  const pickIntro = async () => {
    haptic.medium();
    const picked = await pickVideoFromFiles({ maxDurationSec: 30 });
    if (picked) {
      setIntroUri(picked.uri);
      setIntroName(picked.filename ?? 'video');
      haptic.success();
    }
  };

  if (selected.length === 0) {
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
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 140, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Source-Preview — der erste ausgewählte Clip wird abgespielt; sobald
          FFmpeg-Native lebt, wird's eine echte concat-Vorschau. */}
      {project.sourceUri && <VideoPlayer uri={project.sourceUri} seekTo={selected[0]?.startSec} />}

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
        {selected.map((clip, idx) => (
          <View
            key={clip.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <View style={{ gap: 4 }}>
              <ReorderArrow
                icon="chevron-up"
                disabled={idx === 0}
                onPress={() => moveClip(clip.id, -1)}
              />
              <ReorderArrow
                icon="chevron-down"
                disabled={idx === selected.length - 1}
                onPress={() => moveClip(clip.id, 1)}
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
              <Text style={{ color: '#ff1039', fontSize: 11, fontWeight: '800' }}>{idx + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
                {clip.label}
              </Text>
              <Text style={{ color: '#71717a', fontSize: 11, fontVariant: ['tabular-nums'] }}>
                {formatTimecode(clip.startSec)} → {formatTimecode(clip.endSec)} ·{' '}
                {formatDuration(clip.endSec - clip.startSec)}
              </Text>
            </View>
          </View>
        ))}
      </View>

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
        <ToggleRow
          icon="mic-outline"
          label={t('builder.tts', 'TTS Voice-over')}
          desc={t('builder.ttsDesc', 'AI-generated narration over the combined cut')}
          value={tts}
          onChange={setTts}
        />
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
        {introUri && introMode === 'overlay' && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 6 }}>
            <Text style={{ color: '#71717a', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
              POSITION
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(['top', 'center', 'bottom', 'full'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    haptic.selection();
                    setIntroPosition(p);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor:
                      introPosition === p ? 'rgba(255,16,57,0.18)' : 'rgba(255,255,255,0.04)',
                    borderWidth: 1,
                    borderColor:
                      introPosition === p ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: introPosition === p ? '#ff1039' : '#f1f2f2',
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'capitalize',
                    }}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {(musicTracks.length > 0 || introUri || tts) && (
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
              tts && 'TTS',
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
          haptic.medium();
          Alert.alert(
            t('builder.exportTitle', 'Build & export'),
            t(
              'builder.exportSoonBody',
              'Combines selected clips in order with optional intro/music/TTS into a single 16:9 MP4. Wired up with the FFmpeg native bridge.',
            ),
          );
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
          {t('builder.exportButton', 'Build combined video')}
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
          'Drag-to-reorder ships next phase. Today the order matches the Highlights tab.',
        )}
      </Text>
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

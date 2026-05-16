/**
 * AddVideoProjectScreen — Mobile-Pendant zum Desktop ImportDialog.
 *
 * Drei Sektionen analog Desktop (siehe Referenz-Screenshot):
 *  ⚡ Quick 9:16 Clip  — kein AI, kein API. Pick + direct TikTok-Tab.
 *  ─────  AUTO MODE · AI FINDS HIGHLIGHTS  ─────
 *      Video Type: Gaming / Podcast / Auto (Chips)
 *      Single video file → File-Picker → Highlights-Tab
 *      YouTube / Twitch URL + Import-Button (Stub)
 *  ─────  MANUAL MODE · COMBINE MULTIPLE READY CLIPS  ─────
 *      Import multiple clips → Multi-File-Picker → Manual-Tab
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import {
  pickVideoFromGallery,
  pickVideoFromFiles,
  pickMultipleVideosFromFiles,
  pickMultipleVideosFromGallery,
  type PickedVideo,
} from '../lib/mediaPicker';
import { extractVideoThumbnail } from '../lib/thumbnails';
import {
  useProjects,
  useProjectsStore,
  type ProjectMode,
  type VideoType,
  type SourceType,
} from '../stores/projectsStore';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import { downloadFromUrl, isYoutubeOrTwitchUrl } from '../lib/youtube';
import { useProjectLimit } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddVideoProject'>;

const MAX_DURATION_SEC = 600;

const TAB_FOR_MODE: Record<ProjectMode, 'highlights' | 'manual' | 'tiktok' | 'builder'> = {
  highlights: 'highlights',
  manual: 'manual',
  tiktok: 'tiktok',
  builder: 'builder',
};

export function AddVideoProjectScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const addProject = useProjectsStore((s) => s.addProject);
  const projects = useProjects();
  // Phase A5: Project-Limit (Creator=25, Pro/Lifetime=∞).
  const { canCreate, limit } = useProjectLimit(projects.length);
  const openUpgrade = useUpgradeModal((s) => s.open);
  const [videoType, setVideoType] = useState<VideoType>('gaming');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [urlPhase, setUrlPhase] = useState<'requesting' | 'downloading' | null>(null);
  const [urlProgress, setUrlProgress] = useState(0);

  // Phase A5: Project-Limit-Gate. Bei Creator über 25 Projects → Alert +
  // Upgrade-Modal. Pro/Lifetime: canCreate immer true (limit=Infinity).
  const ensureCanCreate = (): boolean => {
    if (canCreate) return true;
    const limitStr = Number.isFinite(limit) ? String(limit) : '∞';
    Alert.alert(
      t('projectLimit.reachedShort', 'Limit reached') + ` (${limitStr})`,
      t(
        'projectLimit.reachedHint',
        'Limit reached — upgrade to Pro for unlimited projects',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('upgradeModal.upgradeNow', 'Upgrade now'),
          onPress: () => openUpgrade('unlimited_projects'),
        },
      ],
    );
    return false;
  };

  const askSource = (): Promise<'gallery' | 'files' | null> => {
    return new Promise((resolve) => {
      Alert.alert(
        t('addProject.sourceSheetTitle', 'Pick a source'),
        t('addProject.sourceSheetBody', 'Where is the video you want to import?'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(null) },
          { text: t('addProject.sourceFiles', 'Files'), onPress: () => resolve('files') },
          { text: t('addProject.sourceGallery', 'Gallery'), onPress: () => resolve('gallery') },
        ],
      );
    });
  };

  const createFromFile = async (
    mode: ProjectMode,
    options: { videoType?: VideoType } = {},
  ) => {
    if (!ensureCanCreate()) return;
    const source = await askSource();
    if (!source) return;
    setBusy(mode);
    try {
      const picker = source === 'files' ? pickVideoFromFiles : pickVideoFromGallery;
      const picked = await picker({ maxDurationSec: MAX_DURATION_SEC });
      if (!picked) return;
      const baseName = (picked.filename ?? 'New project').replace(/\.[^.]+$/, '');
      const project = addProject({
        title: baseName,
        durationSec: picked.durationSec,
        sourceUri: picked.uri,
        sourceType: 'file',
        mode,
        videoType: options.videoType,
      });
      const initialEnd = picked.durationSec > 0 ? picked.durationSec : 0;
      useProjectsStore.getState().updateProject(project.id, {
        status: 'ready',
        clips: [
          {
            id: `c-${Date.now().toString(36)}`,
            startSec: 0,
            endSec: initialEnd,
            label: 'Imported clip',
            score: 1,
          },
        ],
      });

      // Async Thumbnail-Extraktion — blockiert nicht das Navigieren. Wenn das
      // Native-Modul noch nicht verlinkt ist (Rebuild nötig) ist's no-op und
      // die Card fällt auf Hue-Tint zurück.
      void extractVideoThumbnail(picked.uri, 1000).then((thumbUri) => {
        if (thumbUri) {
          useProjectsStore.getState().updateProject(project.id, { thumbUri });
        }
      });
      haptic.success();
      nav.replace('ProjectDetail', {
        projectId: project.id,
        initialTab: TAB_FOR_MODE[mode],
      });
    } catch (err: any) {
      haptic.error();
      Alert.alert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  };

  const onUrlImport = async () => {
    const u = url.trim();
    if (!u || busy) return;
    if (!isYoutubeOrTwitchUrl(u)) {
      haptic.error();
      Alert.alert(
        t('addProject.urlInvalidTitle', 'Invalid URL'),
        t('addProject.urlInvalidBody', 'Please enter a YouTube or Twitch URL.'),
      );
      return;
    }
    if (!ensureCanCreate()) return;
    haptic.medium();
    setBusy('url');
    setUrlPhase('requesting');
    setUrlProgress(0);
    try {
      const result = await downloadFromUrl({
        url: u,
        onPhase: setUrlPhase,
        onProgress: setUrlProgress,
      });
      const title = (result.title || u).slice(0, 80);
      const project = addProject({
        title,
        durationSec: result.durationSec,
        sourceUri: result.uri,
        sourceType: 'url',
        mode: 'highlights',
        videoType,
      });
      useProjectsStore.getState().updateProject(project.id, {
        status: 'ready',
        clips: [
          {
            id: `c-${Date.now().toString(36)}`,
            startSec: 0,
            endSec: result.durationSec,
            label: 'Imported clip',
            score: 1,
          },
        ],
      });
      void extractVideoThumbnail(result.uri, 1000).then((thumbUri) => {
        if (thumbUri) {
          useProjectsStore.getState().updateProject(project.id, { thumbUri });
        }
      });
      haptic.success();
      setUrl('');
      nav.replace('ProjectDetail', { projectId: project.id, initialTab: 'highlights' });
    } catch (err: any) {
      haptic.error();
      Alert.alert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
      setUrlPhase(null);
      setUrlProgress(0);
    }
  };

  const onMultiClipImport = async () => {
    if (busy) return;
    if (!ensureCanCreate()) return;
    const source = await askSource();
    if (!source) return;
    haptic.medium();
    setBusy('multi');
    try {
      const picker = source === 'gallery' ? pickMultipleVideosFromGallery : pickMultipleVideosFromFiles;
      const picked = await picker({ maxDurationSec: MAX_DURATION_SEC });
      if (picked.length === 0) return;
      if (picked.length < 2) {
        Alert.alert(
          t('addProject.multiTooFewTitle', 'Pick at least 2 clips'),
          t('addProject.multiTooFewBody', 'Multi-clip mode needs 2 or more videos to concatenate.'),
        );
        return;
      }
      const totalDur = picked.reduce((sum, p) => sum + (p.durationSec || 0), 0);
      const project = addProject({
        title: `Multi-Clip (${picked.length})`,
        durationSec: totalDur,
        sourceUri: picked[0].uri,
        sourceUris: picked.map((p) => p.uri),
        sourceType: 'multi-clip',
        mode: 'highlights',
      });
      useProjectsStore.getState().updateProject(project.id, {
        status: 'ready',
        clips: picked.map((p, i) => ({
          id: `c${i}-${Date.now().toString(36)}`,
          startSec: 0,
          endSec: p.durationSec || 0,
          label: p.filename ?? `Clip ${i + 1}`,
          score: 1,
        })),
      });
      // Async Thumbnails: sequenziell statt parallel — auf Vivo+Mediatek crasht
      // der HEVC-Decoder bei parallel-extract, plus sequenziell schreibt die
      // store-updates incremental sodass User sofort die ersten thumbs sieht.
      void (async () => {
        for (let i = 0; i < picked.length; i++) {
          const t = await extractVideoThumbnail(picked[i].uri, 1000).catch(() => null);
          if (!t) continue;
          const cur = useProjectsStore.getState().projects.find((pr) => pr.id === project.id);
          if (!cur) return;
          const nextClips = (cur.clips ?? []).map((c, idx) =>
            idx === i ? { ...c, thumbUri: t } : c,
          );
          useProjectsStore.getState().updateProject(project.id, {
            clips: nextClips,
            // Project-Thumbnail = erstes Clip-Thumbnail (für Library-Card).
            thumbUri: i === 0 ? t : (cur.thumbUri ?? undefined),
          });
        }
      })();
      haptic.success();
      nav.replace('ProjectDetail', { projectId: project.id, initialTab: 'highlights' });
    } catch (err: any) {
      haptic.error();
      Alert.alert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0d0509' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
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
          <Text
            style={{
              flex: 1,
              color: '#f1f2f2',
              fontSize: 18,
              fontWeight: '700',
              paddingLeft: 12,
              letterSpacing: -0.3,
            }}
          >
            {t('addProject.title', 'Add Video Project')}
          </Text>
          <Pressable
            onPress={() => nav.goBack()}
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
            <Ionicons name="close" size={18} color="#f1f2f2" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ⚡ QUICK 9:16 */}
          <SectionLabel>
            <Ionicons name="flash" size={11} color="#ff1039" />{' '}
            <Text style={{ color: '#ff1039' }}>
              {t('addProject.quickHeader', 'QUICK 9:16 · NO ANALYZE, NO API USAGE')}
            </Text>
          </SectionLabel>
          <BigOptionCard
            highlight
            icon="film"
            title={t('addProject.quickTitle', 'Quick 9:16 Clip')}
            subtitle={t('addProject.quickSubtitle', 'Ready clip → trim, facecam, export. No AI.')}
            loading={busy === 'tiktok'}
            onPress={() => createFromFile('tiktok')}
          />

          <OrDivider t={t} />

          {/* AUTO MODE */}
          <SectionLabel>
            {t('addProject.autoHeader', 'AUTO MODE · AI FINDS HIGHLIGHTS')}
          </SectionLabel>

          <FieldLabel>{t('addProject.videoTypeLabel', 'VIDEO TYPE')}</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TypeChip
              label={t('addProject.typeGaming', 'Gaming')}
              desc={t('addProject.typeGamingDesc', 'Audio-spike detection (shots, reactions)')}
              active={videoType === 'gaming'}
              onPress={() => {
                haptic.selection();
                setVideoType('gaming');
              }}
            />
            <TypeChip
              label={t('addProject.typePodcast', 'Podcast')}
              desc={t('addProject.typePodcastDesc', 'AI finds strong statements (OpenAI key)')}
              active={videoType === 'podcast'}
              onPress={() => {
                haptic.selection();
                setVideoType('podcast');
              }}
            />
            <TypeChip
              label={t('addProject.typeAuto', 'Auto')}
              desc={t('addProject.typeAutoDesc', 'App decides automatically')}
              active={videoType === 'auto'}
              onPress={() => {
                haptic.selection();
                setVideoType('auto');
              }}
            />
          </View>

          <BigOptionCard
            highlight
            icon="film-outline"
            title={t('addProject.singleFileTitle', 'Single video file')}
            subtitle={t('addProject.singleFileSubtitle', 'Long-form clip → AI extracts highlights')}
            loading={busy === 'highlights'}
            onPress={() => createFromFile('highlights', { videoType })}
          />

          {/* URL Row */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                paddingHorizontal: 14,
                justifyContent: 'center',
              }}
            >
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder={t('addProject.urlPlaceholder', 'YouTube / Twitch URL…')}
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                editable={busy !== 'url'}
                style={{ color: '#f1f2f2', fontSize: 13, paddingVertical: 12 }}
              />
            </View>
            <Pressable
              onPress={onUrlImport}
              disabled={!url.trim() || busy === 'url'}
              style={({ pressed }) => ({
                paddingHorizontal: 18,
                borderRadius: 12,
                backgroundColor: !url.trim() || busy === 'url'
                  ? 'rgba(255,255,255,0.06)'
                  : pressed
                    ? '#cc0d2e'
                    : '#ff1039',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !url.trim() || busy === 'url' ? 0.5 : 1,
              })}
            >
              <Text
                style={{
                  color: !url.trim() || busy === 'url' ? '#a1a1aa' : '#fff',
                  fontSize: 13,
                  fontWeight: '700',
                }}
              >
                {busy === 'url'
                  ? t('common.busy', 'Working…')
                  : t('addProject.importButton', 'Import')}
              </Text>
            </Pressable>
          </View>
          {busy === 'url' && (
            <View style={{ gap: 4 }}>
              <Text style={{ color: '#71717a', fontSize: 11 }}>
                {urlPhase === 'requesting'
                  ? t('addProject.urlPhaseRequesting', 'Server downloading from YouTube/Twitch…')
                  : t('addProject.urlPhaseDownloading', `Downloading to phone… ${Math.round(urlProgress * 100)}%`)}
              </Text>
              <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: urlPhase === 'downloading' ? `${Math.round(urlProgress * 100)}%` : '40%',
                    backgroundColor: '#ff1039',
                  }}
                />
              </View>
            </View>
          )}

          <OrDivider t={t} />

          {/* MANUAL MODE */}
          <SectionLabel>
            {t('addProject.manualHeader', 'MANUAL MODE · COMBINE MULTIPLE READY CLIPS')}
          </SectionLabel>
          <BigOptionCard
            icon="cube-outline"
            title={t('addProject.multiClipTitle', 'Import multiple clips')}
            subtitle={t('addProject.multiClipSubtitle', 'Skip analysis · order, intro, music, render')}
            loading={busy === 'multi'}
            onPress={onMultiClipImport}
          />

          {/* Single-Clip Manual ist die einfache MVP-Variante */}
          <Pressable
            onPress={() => createFromFile('manual')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              backgroundColor: 'rgba(255,255,255,0.03)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="cut-outline" size={16} color="#a1a1aa" />
            <Text style={{ flex: 1, color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
              {t(
                'addProject.manualSingleHint',
                'Or pick a single video and mark highlights manually',
              )}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#52525b" />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/* ─── Sub-Components ──────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
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

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: '#71717a',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}

function OrDivider({ t }: { t: (k: string, f?: string) => string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      <Text style={{ color: '#52525b', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }}>
        {t('common.or', 'OR').toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
    </View>
  );
}

function BigOptionCard({
  icon,
  title,
  subtitle,
  highlight,
  loading,
  onPress,
  soonBadge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  highlight?: boolean;
  loading: boolean;
  onPress: () => void;
  soonBadge?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: highlight ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
        opacity: loading ? 0.55 : pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: highlight ? 'rgba(255,16,57,0.15)' : 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: highlight ? 'rgba(255,16,57,0.32)' : 'rgba(255,255,255,0.10)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={22} color={highlight ? '#ff1039' : '#f1f2f2'} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>
            {title}
          </Text>
          {soonBadge && (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
              }}
            >
              <Text
                style={{
                  color: '#a1a1aa',
                  fontSize: 9,
                  fontWeight: '800',
                  letterSpacing: 0.4,
                }}
              >
                SOON
              </Text>
            </View>
          )}
        </View>
        <Text style={{ color: '#a1a1aa', fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#52525b" />
    </Pressable>
  );
}

function TypeChip({
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
        padding: 12,
        borderRadius: 12,
        backgroundColor: active ? 'rgba(255,16,57,0.12)' : 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: active ? 'rgba(255,16,57,0.45)' : 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        gap: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: active ? '#ff1039' : '#f1f2f2',
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{ color: '#71717a', fontSize: 9, lineHeight: 12, textAlign: 'center' }}
      >
        {desc}
      </Text>
    </Pressable>
  );
}

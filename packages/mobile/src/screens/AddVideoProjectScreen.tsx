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
import { appAlert } from '../components/AppAlert';
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
import { useColors } from '../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddVideoProject'>;

const MAX_DURATION_SEC = 600;

const TAB_FOR_MODE: Record<ProjectMode, 'highlights' | 'manual' | 'tiktok' | 'builder'> = {
  highlights: 'highlights',
  manual: 'manual',
  tiktok: 'tiktok',
  builder: 'builder',
};

export function AddVideoProjectScreen() {
  const colors = useColors();
  const nav = useNavigation<Nav>();
  const t = useT();
  const addProject = useProjectsStore((s) => s.addProject);
  const projects = useProjects();
  // Phase A5: Project-Limit (Creator=25, Pro/Lifetime=∞).
  const { canCreate, limit } = useProjectLimit(projects.length);
  const openUpgrade = useUpgradeModal((s) => s.open);
  const [videoType, setVideoType] = useState<VideoType>('gaming');
  // Phase A3.7 (2026-05-17): URLs als Array statt single-line. Dynamische
  // Reihen mit +-Button für neue URL und ⊖-Button zum Entfernen pro Reihe.
  const [urls, setUrls] = useState<string[]>(['']);
  const [busy, setBusy] = useState<string | null>(null);
  const [urlPhase, setUrlPhase] = useState<'requesting' | 'downloading' | null>(null);
  const [urlProgress, setUrlProgress] = useState(0);
  // Phase A3.3: Multi-URL-Import — Progress über mehrere URLs.
  const [multiUrlProgress, setMultiUrlProgress] = useState<{ current: number; total: number } | null>(null);

  // Phase A3.7: Helper für URL-Array-Manipulation.
  const updateUrlAt = (i: number, v: string) => {
    setUrls((prev) => prev.map((u, j) => (j === i ? v : u)));
  };
  const addUrlRow = () => {
    haptic.light();
    setUrls((prev) => [...prev, '']);
  };
  const removeUrlRow = (i: number) => {
    if (urls.length <= 1) return; // mindestens 1 Reihe muss bleiben
    haptic.light();
    setUrls((prev) => prev.filter((_, j) => j !== i));
  };
  const trimmedUrls = urls.map((u) => u.trim()).filter((u) => u.length > 0);
  const canImportUrls = trimmedUrls.length > 0 && busy !== 'url';

  // Phase A5: Project-Limit-Gate. Bei Creator über 25 Projects → Alert +
  // Upgrade-Modal. Pro/Lifetime: canCreate immer true (limit=Infinity).
  const ensureCanCreate = (): boolean => {
    if (canCreate) return true;
    const limitStr = Number.isFinite(limit) ? String(limit) : '∞';
    appAlert(
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
      appAlert(
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
      appAlert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  };

  const onUrlImport = async () => {
    // Phase A3.3 (2026-05-17) + A3.7 (UI-Erweiterung): Multi-URL-Import.
    // urls[] kommt vom dynamischen Input-Array (siehe addUrlRow/removeUrlRow).
    // Bei 1 URL → Single-Project (legacy). Bei N>1 → Multi-Clip-Project.
    const lines = trimmedUrls;
    if (lines.length === 0 || busy) return;
    // Pre-validate alle URLs
    for (const u of lines) {
      if (!isYoutubeOrTwitchUrl(u)) {
        haptic.error();
        appAlert(
          t('addProject.urlInvalidTitle', 'Invalid URL'),
          `${u.slice(0, 80)}\n\n${t('addProject.urlInvalidBody', 'Please enter a YouTube or Twitch URL.')}`,
        );
        return;
      }
    }
    if (!ensureCanCreate()) return;
    haptic.medium();
    setBusy('url');
    const results: Array<{ uri: string; durationSec: number; title: string }> = [];
    try {
      // Sequenziell pro URL downloaden
      for (let i = 0; i < lines.length; i++) {
        if (lines.length > 1) setMultiUrlProgress({ current: i, total: lines.length });
        setUrlPhase('requesting');
        setUrlProgress(0);
        const result = await downloadFromUrl({
          url: lines[i],
          onPhase: setUrlPhase,
          onProgress: setUrlProgress,
        });
        results.push(result);
      }

      if (results.length === 1) {
        // Single-URL — legacy single-clip-project
        const single = results[0];
        const title = (single.title || lines[0]).slice(0, 80);
        const project = addProject({
          title,
          durationSec: single.durationSec,
          sourceUri: single.uri,
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
              endSec: single.durationSec,
              label: 'Imported clip',
              score: 1,
            },
          ],
        });
        void extractVideoThumbnail(single.uri, 1000).then((thumbUri) => {
          if (thumbUri) {
            useProjectsStore.getState().updateProject(project.id, { thumbUri });
          }
        });
        haptic.success();
        setUrls(['']);
        nav.replace('ProjectDetail', { projectId: project.id, initialTab: 'highlights' });
      } else {
        // Multi-URL — wie Multi-Clip-Import strukturiert
        const totalDur = results.reduce((s, r) => s + r.durationSec, 0);
        const project = addProject({
          title: `Multi-URL (${results.length})`,
          durationSec: totalDur,
          sourceUri: results[0].uri,
          sourceUris: results.map((r) => r.uri),
          sourceType: 'multi-clip',
          mode: 'highlights',
          videoType,
        });
        useProjectsStore.getState().updateProject(project.id, {
          status: 'ready',
          clips: results.map((r, i) => ({
            id: `c${i}-${Date.now().toString(36)}`,
            startSec: 0,
            endSec: r.durationSec,
            label: r.title?.slice(0, 60) || `Clip ${i + 1}`,
            score: 1,
          })),
        });
        // Sequential thumbs (HEVC 1-Decoder Constraint analog onMultiClipImport)
        void (async () => {
          for (let i = 0; i < results.length; i++) {
            const tUri = await extractVideoThumbnail(results[i].uri, 1000).catch(() => null);
            if (!tUri) continue;
            const cur = useProjectsStore.getState().projects.find((pr) => pr.id === project.id);
            if (!cur) return;
            const nextClips = (cur.clips ?? []).map((c, idx) =>
              idx === i ? { ...c, thumbUri: tUri } : c,
            );
            useProjectsStore.getState().updateProject(project.id, {
              clips: nextClips,
              thumbUri: i === 0 ? tUri : (cur.thumbUri ?? undefined),
            });
          }
        })();
        haptic.success();
        setUrls(['']);
        nav.replace('ProjectDetail', { projectId: project.id, initialTab: 'highlights' });
      }
    } catch (err: any) {
      haptic.error();
      appAlert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
      setUrlPhase(null);
      setUrlProgress(0);
      setMultiUrlProgress(null);
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
        appAlert(
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
      appAlert(t('import.failedTitle', 'Import failed'), err?.message ?? String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
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
              color: colors.text.primary,
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
              backgroundColor: colors.bg.elevated,
              borderWidth: 1,
              borderColor: colors.border.subtle,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="close" size={18} color={colors.text.primary} />
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

          {/* URL Rows — Phase A3.7: dynamische Input-Liste mit +/⊖ Buttons */}
          <View style={{ gap: 6 }}>
            {urls.map((u, i) => (
              <View key={`url-row-${i}`} style={{ flexDirection: 'row', gap: 6 }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: colors.bg.elevated,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border.subtle,
                    paddingHorizontal: 14,
                    justifyContent: 'center',
                  }}
                >
                  <TextInput
                    value={u}
                    onChangeText={(v) => updateUrlAt(i, v)}
                    placeholder={t('addProject.urlPlaceholder', 'YouTube / Twitch URL…')}
                    placeholderTextColor="#52525b"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={busy !== 'url'}
                    style={{ color: colors.text.primary, fontSize: 13, paddingVertical: 12 }}
                  />
                </View>
                {urls.length > 1 && (
                  <Pressable
                    onPress={() => removeUrlRow(i)}
                    disabled={busy === 'url'}
                    style={({ pressed }) => ({
                      width: 44,
                      borderRadius: 12,
                      backgroundColor: pressed ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(239,68,68,0.4)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: busy === 'url' ? 0.4 : 1,
                    })}
                    accessibilityLabel={t('addProject.urlRemove', 'Remove URL')}
                  >
                    <Ionicons name="remove" size={18} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            ))}

            {/* Add-URL + Import Buttons */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              <Pressable
                onPress={addUrlRow}
                disabled={busy === 'url'}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 11,
                  borderRadius: 12,
                  backgroundColor: pressed ? colors.border.subtle : colors.bg.elevated,
                  borderWidth: 1,
                  borderColor: colors.border.subtle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  opacity: busy === 'url' ? 0.4 : 1,
                })}
              >
                <Ionicons name="add" size={15} color="#a1a1aa" />
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '700' }}>
                  {t('addProject.urlAddRow', 'Add URL')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onUrlImport}
                disabled={!canImportUrls}
                style={({ pressed }) => ({
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  backgroundColor: !canImportUrls
                    ? colors.bg.elevated
                    : pressed
                      ? '#cc0d2e'
                      : '#ff1039',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !canImportUrls ? 0.5 : 1,
                  minWidth: 100,
                })}
              >
                <Text
                  style={{
                    color: !canImportUrls ? '#a1a1aa' : '#fff',
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
          </View>
          {busy === 'url' && (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                {urlPhase === 'requesting'
                  ? t('addProject.urlPhaseRequesting', 'Server downloading from YouTube/Twitch…')
                  : t('addProject.urlPhaseDownloading', `Downloading to phone… ${Math.round(urlProgress * 100)}%`)}
              </Text>
              <View style={{ height: 4, backgroundColor: colors.bg.elevated, borderRadius: 2, overflow: 'hidden' }}>
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
              borderColor: colors.border.subtle,
              backgroundColor: 'rgba(255,255,255,0.03)',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="cut-outline" size={16} color="#a1a1aa" />
            <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
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
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.text.secondary,
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
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.text.tertiary,
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
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.bg.elevated }} />
      <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }}>
        {t('common.or', 'OR').toUpperCase()}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.bg.elevated }} />
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
  const colors = useColors();
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
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: highlight ? 'rgba(255,16,57,0.4)' : colors.border.subtle,
        opacity: loading ? 0.55 : pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: highlight ? 'rgba(255,16,57,0.15)' : colors.bg.elevated,
          borderWidth: 1,
          borderColor: highlight ? 'rgba(255,16,57,0.32)' : colors.border.subtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={22} color={highlight ? '#ff1039' : '#f1f2f2'} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>
            {title}
          </Text>
          {soonBadge && (
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: colors.bg.elevated,
                borderWidth: 1,
                borderColor: colors.border.subtle,
              }}
            >
              <Text
                style={{
                  color: colors.text.secondary,
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
        <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 17 }}>{subtitle}</Text>
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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        padding: 12,
        borderRadius: 12,
        backgroundColor: active ? 'rgba(255,16,57,0.12)' : colors.bg.elevated,
        borderWidth: 1,
        borderColor: active ? 'rgba(255,16,57,0.45)' : colors.border.subtle,
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
        style={{ color: colors.text.tertiary, fontSize: 9, lineHeight: 12, textAlign: 'center' }}
      >
        {desc}
      </Text>
    </Pressable>
  );
}

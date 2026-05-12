/**
 * Export-Screen — startet FFmpeg-Export, zeigt Progress, Save-to-Camera-Roll.
 *
 * Visual: Glass-Card, BackgroundGlow, phasen-spezifische Status-Icons + Texte.
 * Strings via t() (Fallback EN). Logik unverändert: ensureLocalCopy → exportMobile →
 * saveToCameraRoll, mit Cancel-Knopf während des Renders.
 *
 * Phase 9.4.16: bei "done" wird eine lokale Notification gefeuert, damit der User
 * auch mit App im Hintergrund informiert wird.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { ensureLocalCopy, saveToCameraRoll } from '../lib/mediaPicker';
import { runRenderJob } from '../lib/renderJob';
import { buildTikTokExportArgs } from '@fiano/shared/ffmpegArgs';
import { buildAssSubtitle } from '@fiano/shared/assBuilder';
import { useAppStore } from '../stores/appStore';
import { useProject } from '../stores/projectsStore';
import { DEFAULT_SPLIT_RATIO } from '../data/demoProjects';
import { BrandButton } from '../components/BrandButton';
import { ProgressBar } from '../components/ProgressBar';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useJobStore } from '../stores/jobStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useProjectsStore } from '../stores/projectsStore';
import { scheduleLocalNotification } from '../lib/pushNotifications';
import { useT } from '../lib/i18n';
import * as sounds from '../lib/sounds';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Export'>;
type R = RouteProp<RootStackParamList, 'Export'>;

type Phase = 'idle' | 'uploading' | 'rendering' | 'saving' | 'done' | 'failed' | 'canceled';

/**
 * Splittet eine Cue in N-Wort-Chunks (Phase 9.6.7g). Time-Range wird proportional
 * verteilt: chunk i bekommt [start + i*chunkDur, start + (i+1)*chunkDur].
 * Wenn maxWords >= cue.words.length → nur 1 chunk (unverändert).
 */
function chunkCueByWords(
  cue: { startSec: number; endSec: number; text: string },
  maxWords: number,
): { startSec: number; endSec: number; text: string }[] {
  const words = cue.text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [cue];
  const totalDur = Math.max(0.1, cue.endSec - cue.startSec);
  const out: { startSec: number; endSec: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const chunkWords = words.slice(i, i + maxWords);
    const fracStart = i / words.length;
    const fracEnd = Math.min(1, (i + chunkWords.length) / words.length);
    out.push({
      startSec: cue.startSec + fracStart * totalDur,
      endSec: cue.startSec + fracEnd * totalDur,
      text: chunkWords.join(' '),
    });
  }
  return out;
}

export function ExportScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const { params } = useRoute<R>();
  const setCurrent = useJobStore((s) => s.setCurrent);
  const setPercent = useJobStore((s) => s.setPercent);
  const job = useJobStore((s) => s.current);
  const addNotification = useNotificationsStore((s) => s.add);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const project = useProject(params.projectId);
  const defaultFacecam = useAppStore((s) => s.facecamRegion);
  const defaultGameplay = useAppStore((s) => s.gameplayRegion);
  const storeExportSettings = useAppStore((s) => s.exportSettings);
  // Wenn ExportSettingsModal Per-Export-Override mitgibt → nutze die.
  const exportSettings = params.exportSettings ?? storeExportSettings;

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedAssetUri, setSavedAssetUri] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, []);

  const run = async () => {
    setPhase('uploading');
    setError(null);
    setPercent(0);
    const isBuilder = params.mode === 'builder';
    const outputName = `fiano-${isBuilder ? '16x9' : Date.now()}-${Date.now()}.mp4`;
    setCurrent({ id: outputName, step: 'export', percent: 0, outputPath: outputName });

    try {
      // 1. Lokale Source sicherstellen (file://-URI nicht asset://).
      // Builder-Mode hat zwei Pfade:
      //   a) Single-Source + builderClipIds → per-clip-trim+concat im filter_complex.
      //   b) Multi-Source + builderSourceUris → Server `srcs[]`-concat (Phase Builder-2).
      const isMultiSourceBuilder =
        isBuilder &&
        !!params.builderSourceUris &&
        params.builderSourceUris.length >= 2;
      const localSrc = await ensureLocalCopy(params.sourceUri);
      const localSrcUris: string[] = isMultiSourceBuilder
        ? await Promise.all(params.builderSourceUris!.map((u) => ensureLocalCopy(u)))
        : [];

      // 2. Layout + Regions + Subtitle vom Project ableiten.
      //    Builder-Mode: layout=full (16:9 Cover-Crop) ohne facecam/gameplay-split.
      const layout = isBuilder ? 'full' : (project?.tiktokLayout ?? 'stacked');
      const facecamRegion = project?.facecamRegion ?? defaultFacecam ?? { x: 0.06, y: 0.06, w: 0.28, h: 0.32 };
      const gameplayRegion = project?.gameplayRegion ?? defaultGameplay;
      const splitRatio = project?.splitRatio ?? DEFAULT_SPLIT_RATIO;

      // 2b. Builder-Mode: clips[] aus project.clips + params.builderClipIds bauen.
      //     Reihenfolge bleibt wie übergeben (UI hat schon nach clipOrder sortiert).
      //     Bei Multi-Source-Builder ist builderClipIds undefined — der Server
      //     konkateniert dann komplette Files via `srcs[]` ohne per-clip-trim.
      const builderClips =
        isBuilder &&
        !isMultiSourceBuilder &&
        params.builderClipIds &&
        params.builderClipIds.length > 0
          ? params.builderClipIds
              .map((id) => project?.clips?.find((c) => c.id === id))
              .filter(Boolean)
              .map((c) => ({ startSec: c!.startSec, endSec: c!.endSec }))
          : [];

      // 3. Subtitle-Burn-In (Phase 9.6.7a + 9.6.7g + 9.6.7h):
      //    - Wenn enabled UND cues vorhanden → libass via .ass-Datei (volle
      //      Style-Parität: Glow, Drop-Shadow, Layered, Gradient-Approx).
      //    - chunking nach maxWordsPerChunk passiert vor dem ass-Build.
      //    - Fallback (kein assContent): drawtext (legacy, color+stroke+pos).
      const subSettings = project?.subtitles;
      const rawCues = subSettings?.cues ?? [];
      const maxWords = subSettings?.maxWordsPerChunk ?? 0;
      const chunkedCues =
        maxWords > 0 && maxWords < 99
          ? rawCues.flatMap((c) => chunkCueByWords(c, maxWords))
          : rawCues;
      const subEnabled = subSettings?.enabled === true && chunkedCues.length > 0;
      // Optional override für ass: standardmäßig libass an wenn cues + enabled.
      const useAss = subEnabled;
      // Legacy-Fallback-Args (drawtext) für hasAss=false-Fall (z.B. wenn user
      // settings nur `text` ohne cues haben — heute nicht vorhanden, aber für
      // Vorwärts-Compat).
      const fontColor = subSettings?.useGradient
        ? subSettings.gradientFrom ?? subSettings.textColor ?? '#ffffff'
        : subSettings?.textColor ?? '#ffffff';
      const subtitleArg = subEnabled
        ? useAss
          ? {
              text: '',
              assPath: '{ASS}',
            }
          : {
              text: '',
              cues: chunkedCues.map((c) => ({
                startSec: c.startSec,
                endSec: c.endSec,
                text: subSettings!.uppercase ? c.text.toUpperCase() : c.text,
              })),
              fontSize: subSettings!.fontSize ?? 64,
              color: fontColor,
              strokeColor: subSettings!.strokeColor ?? '#000000',
              strokeWidth: subSettings!.strokeEnabled === true ? subSettings!.strokeWidth ?? 4 : 0,
              position: subSettings!.position as 'top' | 'center' | 'bottom' | undefined,
              uppercase: false,
            }
        : undefined;

      // 4. Add-Ons: Music + Voice-Overs + Intro vom Project ablesen.
      const musicTracks = project?.musicTracks ?? [];
      const intro = project?.intro;
      const voiceOvers = project?.voiceOvers ?? [];

      // 5. ExportSettings → Width/Height/FPS/Bitrate aus appStore.
      //    Builder = 16:9 landscape, TikTok = 9:16 portrait.
      const [w, h] = (() => {
        switch (exportSettings.resolution) {
          case '720p':  return isBuilder ? [1280, 720]  : [720, 1280];
          case '1080p': return isBuilder ? [1920, 1080] : [1080, 1920];
          case '4k':    return isBuilder ? [3840, 2160] : [2160, 3840];
          default:      return isBuilder ? [1920, 1080] : [1080, 1920];
        }
      })();

      // 5b. ASS-Subtitle (Phase 9.6.7h): jetzt mit echten W/H bauen. PlayResX/Y
      //     in der .ass-Datei = Output-Resolution, libass scaliert die Schrift-
      //     Größen entsprechend.
      const assContent = useAss
        ? buildAssSubtitle({
            settings: subSettings!,
            cues: chunkedCues,
            width: w,
            height: h,
          })
        : undefined;

      // 6. FFmpeg-Args mit ALLEN Platzhaltern ({SRC}, {DST}, {INTRO}, {MUSIC_N}, {VO_N}).
      //    Builder-Mode: clips[] hat Vorrang ggü. trimStart/trimEnd — per-clip
      //    trim+concat im filter_complex (siehe ffmpegArgs.ts).
      // Multi-Source: srcs[]-Platzhalter ({SRC_0}, {SRC_1}, ...); sonst legacy src={SRC}.
      const srcPlaceholders = isMultiSourceBuilder
        ? localSrcUris.map((_, i) => `{SRC_${i}}`)
        : undefined;
      const args = buildTikTokExportArgs(
        {
          src: srcPlaceholders ? srcPlaceholders[0] : '{SRC}',
          srcs: srcPlaceholders,
          dst: '{DST}',
          trimStart: params.trimStart,
          trimEnd: params.trimEnd,
          width: w,
          height: h,
          fps: exportSettings.fps,
          bitrate: exportSettings.bitrate,
          encoder: 'software',
          layout,
          facecamRegion: { x: facecamRegion.x, y: facecamRegion.y, w: facecamRegion.w, h: facecamRegion.h },
          gameplayRegion: { x: gameplayRegion.x, y: gameplayRegion.y, w: gameplayRegion.w, h: gameplayRegion.h },
          splitRatio,
          fullOffsetX: project?.fullOffsetX,
          subtitle: subtitleArg,
          music: musicTracks.map((m, i) => ({ path: `{MUSIC_${i}}`, volume: m.volume })),
          voiceOvers: voiceOvers.map((vo, i) => ({
            path: `{VO_${i}}`,
            startSec: vo.startSec,
            volume: vo.volume,
          })),
          intro: intro
            ? {
                path: '{INTRO}',
                mode: intro.mode ?? 'before',
                scale: intro.scale,
                x: intro.x,
                y: intro.y,
                durationSec: intro.durationSec,
              }
            : undefined,
          clips: builderClips.length > 0 ? builderClips : undefined,
        },
        'other',
      );

      // 7. Cloud-Render: Multi-Input Upload → Render → Download
      const result = await runRenderJob({
        inputs: {
          // Single-Source: legacy sourceUri. Multi-Source-Builder: sourceUris[].
          sourceUri: isMultiSourceBuilder ? undefined : localSrc,
          sourceUris: isMultiSourceBuilder ? localSrcUris : undefined,
          introUri: intro?.path,
          musicUris: musicTracks.map((m) => m.path),
          voiceOverUris: voiceOvers.map((vo) => vo.path),
          assContent,
        },
        args,
        projectId: params.projectId ?? 'no-project',
        outputName,
        onUploadProgress: (frac) => {
          setPercent(frac * 30);
          if (frac >= 1) setPhase('rendering');
        },
      });

      // 4. Render-Done — Progress 30→90 wurde während Server-Render gehalten.
      setPercent(90);
      setPhase('saving');

      // 5. Save zu Camera-Roll
      const assetUri = await saveToCameraRoll(result.localUri);
      setSavedAssetUri(assetUri);
      setPercent(100);
      setPhase('done');
      sounds.exportDone();

      // Projekt-Status: ready, mit erstem Clip aus dem Trim-Range.
      if (params.projectId) {
        updateProject(params.projectId, {
          status: 'ready',
          clips: [
            {
              id: 'c1',
              startSec: 0,
              endSec: params.trimEnd - params.trimStart,
              label: 'Imported clip',
              score: 0.9,
            },
          ],
        });
      }

      const doneBody = isBuilder
        ? t('export.notifBodyBuilder', '16:9 video saved to your camera roll.')
        : t('export.notifBody', '9:16 clip saved to your camera roll.');
      addNotification({
        icon: 'cloud-done-outline',
        iconColor: '#22c55e',
        iconBg: 'rgba(34,197,94,0.15)',
        title: t('export.notifTitle', 'Export complete'),
        body: doneBody,
        time: t('common.justNow', 'Just now'),
      });
      void scheduleLocalNotification({
        title: t('export.notifTitle', 'Export complete'),
        body: doneBody,
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg === 'aborted') {
        setPhase('canceled');
        if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: 'Canceled' });
      } else {
        setError(msg);
        setPhase('failed');
        sounds.error();
        if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: msg });
      }
    } finally {
      setCurrent(null);
    }
  };

  const onCancel = () => {
    // Cloud-Render auf Server kann mobile-seitig nicht cancelled werden — der Worker
    // läuft seinen ffmpeg-Job zu Ende. Wir setzen mobile-seitig 'canceled' damit User
    // raus aus dem Screen kann. Server-side cleanup nach MAX_DURATION_SEC.
    setPhase('canceled');
    if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: 'Canceled by user' });
  };

  const meta = phaseMeta(phase, t, params.mode === 'builder');

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
        <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>
          {t('export.title', 'Export')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        {/* Status-Card */}
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 22,
            padding: 22,
            gap: 16,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              backgroundColor: meta.iconBg,
              borderWidth: 1,
              borderColor: meta.ringColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={meta.icon} size={34} color={meta.iconColor} />
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#f1f2f2', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>
              {meta.title}
            </Text>
            {meta.subtitle && (
              <Text
                style={{
                  color: '#a1a1aa',
                  fontSize: 12,
                  textAlign: 'center',
                  lineHeight: 17,
                  maxWidth: 280,
                }}
              >
                {meta.subtitle}
              </Text>
            )}
          </View>

          {(phase === 'uploading' || phase === 'rendering' || phase === 'saving') && (
            <View style={{ width: '100%', gap: 8 }}>
              <ProgressBar percent={job?.percent ?? 0} />
              <Text
                style={{
                  color: '#a1a1aa',
                  fontSize: 12,
                  textAlign: 'center',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {Math.round(job?.percent ?? 0)} %
              </Text>
            </View>
          )}
        </View>

        {/* Failure-Detail */}
        {phase === 'failed' && (
          <View
            style={{
              backgroundColor: 'rgba(255,16,57,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.22)',
              borderRadius: 14,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: '#ff5571', fontSize: 12, fontWeight: '700' }}>
              {t('export.errorDetail', 'Error detail')}
            </Text>
            <Text style={{ color: '#f1f2f2', fontSize: 12, lineHeight: 18 }}>{error}</Text>
            <Text style={{ color: '#71717a', fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {t(
                'export.phaseNote',
                'Check ob EXPO_PUBLIC_RENDER_WORKER_URL gesetzt ist und der /health-Endpoint antwortet (siehe services/render-worker/README.md).',
              )}
            </Text>
          </View>
        )}

        {/* Action-Row */}
        <View style={{ gap: 10, marginTop: 'auto' }}>
          {(phase === 'uploading' || phase === 'rendering' || phase === 'saving') && (
            <BrandButton
              title={t('common.cancel', 'Cancel')}
              variant="secondary"
              onPress={onCancel}
              icon={<Ionicons name="stop-circle-outline" size={16} color="#f1f2f2" />}
            />
          )}

          {phase === 'done' && (
            <BrandButton
              title={t('export.backToHome', 'Back to home')}
              onPress={() => nav.popToTop()}
              icon={<Ionicons name="home-outline" size={16} color="#fff" />}
            />
          )}

          {phase === 'canceled' && (
            <BrandButton
              title={t('common.back', 'Back')}
              variant="secondary"
              onPress={() => nav.goBack()}
              icon={<Ionicons name="arrow-back" size={16} color="#f1f2f2" />}
            />
          )}

          {phase === 'failed' && (
            <BrandButton
              title={t('common.back', 'Back')}
              variant="secondary"
              onPress={() => nav.goBack()}
              icon={<Ionicons name="arrow-back" size={16} color="#f1f2f2" />}
            />
          )}
        </View>

        {savedAssetUri && (
          <Text
            numberOfLines={1}
            style={{ color: '#52525b', fontSize: 10, textAlign: 'center' }}
          >
            {savedAssetUri}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function phaseMeta(
  phase: Phase,
  t: (k: string, f?: string) => string,
  isBuilder = false,
): {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  ringColor: string;
  title: string;
  subtitle?: string;
} {
  switch (phase) {
    case 'uploading':
      return {
        icon: 'cloud-upload-outline',
        iconColor: '#60a5fa',
        iconBg: 'rgba(96,165,250,0.15)',
        ringColor: 'rgba(96,165,250,0.32)',
        title: t('export.phaseUploading', 'Lade Source zur Cloud…'),
        subtitle: t('export.phaseUploadingSub', 'Source-Video wird zum Render-Worker geschickt.'),
      };
    case 'rendering':
      return {
        icon: 'sync',
        iconColor: '#ff1039',
        iconBg: 'rgba(255,16,57,0.12)',
        ringColor: 'rgba(255,16,57,0.32)',
        title: isBuilder
          ? t('export.phaseRendering16x9', 'Rendere 16:9 in der Cloud…')
          : t('export.phaseRendering', 'Rendere 9:16 in der Cloud…'),
        subtitle: t('export.phaseRenderingSub', 'FFmpeg läuft auf dem Render-Worker. Dauert ~30s pro Minute Clip.'),
      };
    case 'saving':
      return {
        icon: 'save-outline',
        iconColor: '#60a5fa',
        iconBg: 'rgba(96,165,250,0.15)',
        ringColor: 'rgba(96,165,250,0.32)',
        title: t('export.phaseSaving', 'Saving to gallery…'),
      };
    case 'done':
      return {
        icon: 'checkmark-circle',
        iconColor: '#22c55e',
        iconBg: 'rgba(34,197,94,0.15)',
        ringColor: 'rgba(34,197,94,0.32)',
        title: t('export.phaseDone', 'Done'),
        subtitle: t('export.phaseDoneSub', 'Clip saved to your camera roll.'),
      };
    case 'canceled':
      return {
        icon: 'close-circle-outline',
        iconColor: '#a1a1aa',
        iconBg: 'rgba(255,255,255,0.06)',
        ringColor: 'rgba(255,255,255,0.12)',
        title: t('export.phaseCanceled', 'Canceled'),
      };
    case 'failed':
      return {
        icon: 'alert-circle-outline',
        iconColor: '#ff5571',
        iconBg: 'rgba(255,16,57,0.12)',
        ringColor: 'rgba(255,16,57,0.32)',
        title: t('export.phaseFailed', 'Export failed'),
      };
    default:
      return {
        icon: 'ellipse-outline',
        iconColor: '#a1a1aa',
        iconBg: 'rgba(255,255,255,0.06)',
        ringColor: 'rgba(255,255,255,0.12)',
        title: t('export.phaseIdle', 'Ready'),
      };
  }
}

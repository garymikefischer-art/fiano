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
import { buildMobileExportArgs } from '@fiano/shared/ffmpegArgs';
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

export function ExportScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const { params } = useRoute<R>();
  const setCurrent = useJobStore((s) => s.setCurrent);
  const setPercent = useJobStore((s) => s.setPercent);
  const job = useJobStore((s) => s.current);
  const addNotification = useNotificationsStore((s) => s.add);
  const updateProject = useProjectsStore((s) => s.updateProject);

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
    const outputName = `fiano-${Date.now()}.mp4`;
    setCurrent({ id: outputName, step: 'export', percent: 0, outputPath: outputName });

    try {
      // 1. Lokale Source sicherstellen (file://-URI nicht asset://)
      const localSrc = await ensureLocalCopy(params.sourceUri);

      // 2. FFmpeg-Args mit {SRC}/{DST}-Platzhaltern (Server ersetzt mit tmp-Pfaden)
      const args = buildMobileExportArgs(
        {
          src: '{SRC}',
          dst: '{DST}',
          trimStart: params.trimStart,
          trimEnd: params.trimEnd,
          width: 1080,
          height: 1920,
          fps: 30,
          bitrate: '10M',
          encoder: 'software', // libx264 server-side für Codec-Konsistenz
        },
        'other',
      );

      // 3. Cloud-Render: Upload → Render → Download
      const result = await runRenderJob({
        sourceUri: localSrc,
        args,
        projectId: params.projectId ?? 'no-project',
        outputName,
        onUploadProgress: (frac) => {
          // Upload-Phase = 0-30% Gesamtprogress (Render selbst ist sync auf Server,
          // kein per-frame-Progress verfügbar in der aktuellen API)
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

      addNotification({
        icon: 'cloud-done-outline',
        iconColor: '#22c55e',
        iconBg: 'rgba(34,197,94,0.15)',
        title: t('export.notifTitle', 'Export complete'),
        body: t('export.notifBody', '9:16 clip saved to your camera roll.'),
        time: t('common.justNow', 'Just now'),
      });
      void scheduleLocalNotification({
        title: t('export.notifTitle', 'Export complete'),
        body: t('export.notifBody', '9:16 clip saved to your camera roll.'),
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

  const meta = phaseMeta(phase, t);

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
        title: t('export.phaseRendering', 'Rendere 9:16 in der Cloud…'),
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

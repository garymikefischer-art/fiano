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

import { ensureLocalCopy, makeOutputPath, saveToCameraRoll } from '../lib/mediaPicker';
import { exportMobile, cancelFfmpeg } from '../lib/ffmpeg';
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

type Phase = 'idle' | 'exporting' | 'saving' | 'done' | 'failed' | 'canceled';

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
    setPhase('exporting');
    setError(null);
    const dst = makeOutputPath(`fiano-${Date.now()}.mp4`);
    setCurrent({ id: dst, step: 'export', percent: 0, outputPath: dst });

    try {
      const localSrc = await ensureLocalCopy(params.sourceUri);
      await exportMobile(
        {
          src: localSrc,
          dst,
          trimStart: params.trimStart,
          trimEnd: params.trimEnd,
          width: 1080,
          height: 1920,
          fps: 30,
          bitrate: '10M',
          encoder: 'hardware',
        },
        {
          expectedDuration: params.trimEnd - params.trimStart,
          onProgress: setPercent,
        },
      );

      setPhase('saving');
      const assetUri = await saveToCameraRoll(dst);
      setSavedAssetUri(assetUri);
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
    cancelFfmpeg();
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

          {(phase === 'exporting' || phase === 'saving') && (
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
                'UI is complete — the native FFmpeg bridge (iOS Swift Package + Android NDK) lands in Phase 9.4.x. Clip will export then.',
              )}
            </Text>
          </View>
        )}

        {/* Action-Row */}
        <View style={{ gap: 10, marginTop: 'auto' }}>
          {(phase === 'exporting' || phase === 'saving') && (
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
    case 'exporting':
      return {
        icon: 'sync',
        iconColor: '#ff1039',
        iconBg: 'rgba(255,16,57,0.12)',
        ringColor: 'rgba(255,16,57,0.32)',
        title: t('export.phaseExporting', 'Exporting 9:16…'),
        subtitle: t('export.phaseExportingSub', 'Rendering your clip locally — no upload.'),
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

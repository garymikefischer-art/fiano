/**
 * Export-Screen — startet FFmpeg-Export, zeigt Progress, Save-to-Camera-Roll am Ende.
 *
 * MVP-Pipeline:
 *   1. ensureLocalCopy → file:// in der Sandbox
 *   2. exportMobile → 9:16 Crop + Trim, ohne Subtitles (kommt in 9.4.x)
 *   3. saveToCameraRoll → User sieht das Video in Photos
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ensureLocalCopy, makeOutputPath, saveToCameraRoll } from '../lib/mediaPicker';
import { exportMobile, cancelFfmpeg } from '../lib/ffmpeg';
import { BrandButton } from '../components/BrandButton';
import { ProgressBar } from '../components/ProgressBar';
import { useJobStore } from '../stores/jobStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Export'>;
type R = RouteProp<RootStackParamList, 'Export'>;

type Phase = 'idle' | 'exporting' | 'saving' | 'done' | 'failed' | 'canceled';

export function ExportScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<R>();
  const setCurrent = useJobStore((s) => s.setCurrent);
  const setPercent = useJobStore((s) => s.setPercent);
  const job = useJobStore((s) => s.current);

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

      // Phase 9.4.2: dieser Code-Pfad wird erst in 9.4.x erreicht (Native-FFmpeg).
      // Stub wirft heute eine Exception → "failed"-Phase mit verständlicher Message.
      setPhase('saving');
      const assetUri = await saveToCameraRoll(dst);
      setSavedAssetUri(assetUri);
      setPhase('done');
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg === 'aborted') {
        setPhase('canceled');
      } else {
        setError(msg);
        setPhase('failed');
      }
    } finally {
      setCurrent(null);
    }
  };

  const onCancel = () => {
    cancelFfmpeg();
  };

  return (
    <View className="flex-1 bg-fiano-bg p-6 gap-6">
      <View className="bg-fiano-panel border border-fiano-border rounded-2xl p-6 gap-4">
        <Text className="text-fiano-fg font-semibold text-lg">
          {phase === 'exporting'
            ? 'Exportiere 9:16…'
            : phase === 'saving'
              ? 'Speichere in Galerie…'
              : phase === 'done'
                ? '✓ Fertig'
                : phase === 'canceled'
                  ? 'Abgebrochen'
                  : phase === 'failed'
                    ? '✗ Fehler'
                    : 'Bereit'}
        </Text>

        {(phase === 'exporting' || phase === 'saving') && (
          <>
            <ProgressBar percent={job?.percent ?? 0} />
            <Text className="text-fiano-fg/60 text-sm">
              {Math.round(job?.percent ?? 0)}%
            </Text>
            <BrandButton title="Abbrechen" variant="secondary" onPress={onCancel} />
          </>
        )}

        {phase === 'done' && (
          <>
            <Text className="text-fiano-fg/70 text-sm">
              Das Video wurde in deiner Foto-Galerie gespeichert.
            </Text>
            <BrandButton
              title="Zum Start"
              onPress={() => nav.popToTop()}
            />
          </>
        )}

        {phase === 'canceled' && (
          <BrandButton
            title="Zurück"
            variant="secondary"
            onPress={() => nav.goBack()}
          />
        )}

        {phase === 'failed' && (
          <>
            <Text className="text-fiano-fg/80 text-sm leading-5 mb-2">{error}</Text>
            <Text className="text-fiano-fg/40 text-xs leading-5">
              Phase 9.4.2: UI-MVP ist live. FFmpeg-Native-Modul (iOS via Swift Package + Android NDK)
              folgt in Phase 9.4.x — der ExportScreen ist UI-vollständig und wartet nur auf den Native-Layer.
            </Text>
            <BrandButton title="Zurück" variant="secondary" onPress={() => nav.goBack()} />
          </>
        )}
      </View>

      {savedAssetUri && (
        <Text className="text-fiano-fg/40 text-xs">Asset: {savedAssetUri}</Text>
      )}
    </View>
  );
}

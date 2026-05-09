/**
 * Import-Screen — Picker → Trim → Export-Trigger.
 *
 * MVP minimal: zwei numerische Slider für Trim-Start/-Ende. Kein
 * react-native-video Preview im MVP (kommt in Phase 9.4.x). User sieht
 * Source-Duration und stellt Trim-Range ein, dann "Export starten".
 */

import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { pickVideo, type PickedVideo } from '../lib/mediaPicker';
import { BrandButton } from '../components/BrandButton';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Import'>;

const MAX_DURATION_SEC = 600; // 10min hard cap

export function ImportScreen() {
  const nav = useNavigation<Nav>();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [busy, setBusy] = useState(false);

  const onPick = async () => {
    setBusy(true);
    try {
      const picked = await pickVideo({ maxDurationSec: MAX_DURATION_SEC });
      if (!picked) return;
      setVideo(picked);
      setTrimStart(0);
      setTrimEnd(picked.durationSec);
    } catch (err: any) {
      Alert.alert('Import fehlgeschlagen', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const onContinue = () => {
    if (!video) return;
    if (trimEnd <= trimStart) {
      Alert.alert('Bitte Trim-Ende größer als Start setzen.');
      return;
    }
    nav.navigate('Export', {
      sourceUri: video.uri,
      trimStart,
      trimEnd,
      sourceDuration: video.durationSec,
    });
  };

  return (
    <ScrollView className="flex-1 bg-fiano-bg" contentContainerStyle={{ padding: 24, gap: 16 }}>
      {!video ? (
        <View className="items-center pt-16 gap-4">
          <Text className="text-fiano-fg text-lg font-semibold">Video importieren</Text>
          <Text className="text-fiano-fg/60 text-center">
            Wähle ein Video aus deiner Galerie. Max 10 Minuten Länge.
          </Text>
          <View className="w-full mt-4">
            <BrandButton title="Aus Galerie wählen" onPress={onPick} loading={busy} />
          </View>
        </View>
      ) : (
        <>
          <View className="bg-fiano-panel border border-fiano-border rounded-2xl p-4 gap-2">
            <Text className="text-fiano-fg/60 text-xs">Source</Text>
            <Text className="text-fiano-fg" numberOfLines={1}>
              {video.filename ?? 'video.mp4'}
            </Text>
            <Text className="text-fiano-fg/60 text-sm">
              Dauer: {formatTime(video.durationSec)} ·{' '}
              {video.width && video.height ? `${video.width}×${video.height}` : 'unknown'}
            </Text>
          </View>

          {/* Trim — MVP: Stepper, später Range-Slider */}
          <View className="bg-fiano-panel border border-fiano-border rounded-2xl p-4 gap-3">
            <Text className="text-fiano-fg font-semibold">Trim</Text>

            <Stepper
              label="Start"
              value={trimStart}
              max={video.durationSec}
              onChange={(v) => setTrimStart(Math.min(v, trimEnd - 0.1))}
            />
            <Stepper
              label="Ende"
              value={trimEnd}
              max={video.durationSec}
              onChange={(v) => setTrimEnd(Math.max(v, trimStart + 0.1))}
            />
            <Text className="text-fiano-fg/60 text-sm">
              Output-Länge: {formatTime(trimEnd - trimStart)}
            </Text>
          </View>

          <BrandButton title="Weiter zum Export" onPress={onContinue} />
          <BrandButton
            title="Anderes Video wählen"
            variant="secondary"
            onPress={onPick}
            loading={busy}
          />
        </>
      )}
    </ScrollView>
  );
}

function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-fiano-fg/80">{label}</Text>
      <View className="flex-row gap-2 items-center">
        <BrandButton
          title="-1s"
          variant="secondary"
          onPress={() => onChange(Math.max(0, value - 1))}
        />
        <Text className="text-fiano-fg w-16 text-center">{formatTime(value)}</Text>
        <BrandButton
          title="+1s"
          variant="secondary"
          onPress={() => onChange(Math.min(max, value + 1))}
        />
      </View>
    </View>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

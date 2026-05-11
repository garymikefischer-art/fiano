/**
 * VoiceOverPreviewPlayer — hidden Audio-Player der TTS-Voice-Overs synchron
 * zur Master-Video-Position abspielt. Analog Desktop's VoiceOverAudio in
 * TikTokPreview.tsx.
 *
 * Sync-Logic:
 *   - currentSec (vom Master-Video) wird via Prop reingegeben
 *   - Wenn currentSec >= vo.startSec UND playing → spiele audio mit currentTime
 *     = currentSec - vo.startSec
 *   - Bei pause → pausiere audio
 *   - Drift > 0.3s → seek
 */

import { useEffect, useRef, useState } from 'react';

type AvModule = typeof import('expo-av');
let cached: AvModule | null | undefined = undefined;
function getModule(): AvModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-av') as AvModule;
  } catch {
    cached = null;
  }
  return cached;
}

interface Props {
  uri: string;
  startSec: number;
  volume: number;
  /** Aktuelle Position im Master-Video (Sec). */
  currentSec: number;
  /** True wenn Master pausiert ist. */
  paused: boolean;
}

const DRIFT_THRESHOLD_SEC = 0.3;

export function VoiceOverPreviewPlayer({ uri, startSec, volume, currentSec, paused }: Props) {
  const soundRef = useRef<InstanceType<NonNullable<AvModule>['Audio']['Sound']> | null>(null);
  const mountedRef = useRef(true);
  const [loaded, setLoaded] = useState(false);

  // Load + unload — setLoaded triggert den Sync-useEffect damit Audio sofort
  // nach createAsync abgespielt wird (vorher Bug: TTS erst beim 2. Reload).
  useEffect(() => {
    mountedRef.current = true;
    setLoaded(false);
    const A = getModule();
    if (!A || !uri) return;

    (async () => {
      try {
        const { sound } = await A.Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, volume, isLooping: false },
        );
        if (!mountedRef.current) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        setLoaded(true);
      } catch (e) {
        console.warn('[VoiceOverPreview] load failed:', e);
      }
    })();

    return () => {
      mountedRef.current = false;
      void soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [uri]);

  // Volume sync
  useEffect(() => {
    void soundRef.current?.setVolumeAsync(volume).catch(() => {});
  }, [volume]);

  // Position + Play/Pause sync — bei jedem currentSec/paused/loaded-Update.
  // 'loaded' als Dep damit Sync feuert sobald createAsync fertig ist.
  useEffect(() => {
    if (!loaded) return;
    const snd = soundRef.current;
    if (!snd) return;

    (async () => {
      try {
        const offset = currentSec - startSec;
        if (paused) {
          await snd.pauseAsync();
          return;
        }
        if (offset < 0) {
          // Master ist noch vor startSec — Audio bleibt pausiert + bei 0.
          await snd.pauseAsync();
          await snd.setPositionAsync(0);
          return;
        }
        // Master ist im Voice-Over-Range. Sync wenn nötig.
        const status = await snd.getStatusAsync();
        if (!status.isLoaded) return;
        const targetMs = offset * 1000;
        const currentMs = status.positionMillis ?? 0;
        const driftMs = Math.abs(currentMs - targetMs);
        if (driftMs > DRIFT_THRESHOLD_SEC * 1000) {
          await snd.setPositionAsync(targetMs);
        }
        if (!status.isPlaying) {
          await snd.playAsync();
        }
      } catch {
        /* ignore */
      }
    })();
  }, [currentSec, paused, startSec, loaded]);

  return null;
}

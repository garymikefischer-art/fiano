/**
 * MusicPreviewPlayer — hidden Audio-Player der Music-Tracks parallel zum
 * Stacked-Video abspielt. Mit Volume + Loop. Wird gemounted wenn musicTracks
 * vorhanden + Stacked-Preview im Play-Mode ist.
 *
 * Multi-Track: spielt nur den ERSTEN Track ab (vereinfacht). Beim echten Export
 * mixt FFmpeg alle Tracks zusammen.
 */

import { useEffect, useRef } from 'react';

interface Props {
  uri: string;
  volume: number;
  paused: boolean;
}

/** Lazy-load expo-av damit fehlende Native-Module nicht zu Crash führen. */
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

export function MusicPreviewPlayer({ uri, volume, paused }: Props) {
  const soundRef = useRef<InstanceType<NonNullable<AvModule>['Audio']['Sound']> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const A = getModule();
    if (!A || !uri) return;

    (async () => {
      try {
        const { sound } = await A.Audio.Sound.createAsync(
          { uri },
          { shouldPlay: !paused, volume, isLooping: true },
        );
        if (!mountedRef.current) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch (e) {
        console.warn('[MusicPreviewPlayer] load failed:', e);
      }
    })();

    return () => {
      mountedRef.current = false;
      void soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [uri]);

  // Volume-Sync. expo-av expects 0..1 — clamp damit RangeError ausbleibt
  // wenn User-Setting (Music-Slider 0..1.5) > 1 ist.
  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume));
    void soundRef.current?.setVolumeAsync(v).catch(() => {});
  }, [volume]);

  // Play/Pause-Sync.
  useEffect(() => {
    if (!soundRef.current) return;
    if (paused) {
      void soundRef.current.pauseAsync().catch(() => {});
    } else {
      void soundRef.current.playAsync().catch(() => {});
    }
  }, [paused]);

  return null;
}

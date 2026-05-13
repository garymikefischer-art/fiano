/**
 * VoiceOverPreviewPlayer — hidden Audio-Player der TTS-Voice-Overs synchron
 * zur Master-Video-Position abspielt.
 *
 * Sync-Strategie (Phase 9.6.x fix):
 *   1. Audio-Mode beim Mount initialisieren (iOS Silent-Switch ignore, etc.)
 *   2. createAsync läuft async — nach resolve SOFORT initial sync attempt mit
 *      ref-Werten (umgeht useEffect-Race weil createAsync evtl. langsamer ist
 *      als initiale State-Setup).
 *   3. Danach reactive sync via useEffect für laufende currentSec/paused-Updates.
 *
 * Vorheriger Bug: User hörte TTS erst beim 2. Reload weil 1. Reload's
 * useEffect mit `loaded=false` returnte und createAsync erst danach fertig
 * war, ohne dass ein neues currentSec/paused den useEffect re-feuerte.
 */

import { useEffect, useRef } from 'react';

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
  // expo-av setVolumeAsync expects 0..1. UI-volume kann 0..1.5 (loud-TTS).
  // Clampen für die Preview — Export-Path (FFmpeg amix) ist unaffected.
  const previewVol = Math.max(0, Math.min(1, volume));
  const soundRef = useRef<InstanceType<NonNullable<AvModule>['Audio']['Sound']> | null>(null);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);

  // Refs für aktuelle Werte — nutzbar vom load-useEffect ohne dependency-loop.
  const currentSecRef = useRef(currentSec);
  const pausedRef = useRef(paused);
  const startSecRef = useRef(startSec);
  const volumeRef = useRef(previewVol);
  useEffect(() => { currentSecRef.current = currentSec; }, [currentSec]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { startSecRef.current = startSec; }, [startSec]);
  useEffect(() => { volumeRef.current = previewVol; }, [previewVol]);

  // Audio-Mode einmal beim Mount — sichert dass playback klappt auch wenn
  // iOS-Stille-Switch an oder Android-Audio-Session-Constraints.
  useEffect(() => {
    const A = getModule();
    if (!A) return;
    void A.Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // Load + initial sync attempt direkt nach createAsync-resolve.
  useEffect(() => {
    mountedRef.current = true;
    loadedRef.current = false;
    const A = getModule();
    if (!A || !uri) return;

    (async () => {
      try {
        const { sound } = await A.Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, volume: volumeRef.current, isLooping: false },
        );
        if (!mountedRef.current) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        loadedRef.current = true;
        // INITIAL SYNC — nutzt aktuelle ref-Werte (statt closure-deps). Wenn
        // beim Load der User bereits play tippt und currentSec >= startSec,
        // starten wir audio sofort. Ohne diesen Step: useEffect-Race —
        // playback erst beim NÄCHSTEN currentSec/paused-Change.
        await syncToCurrentState();
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

  // Reactive Sync — feuert bei jeder currentSec/paused-Änderung.
  useEffect(() => {
    if (!loadedRef.current) return;
    void syncToCurrentState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSec, paused, startSec]);

  // Volume sync — clamp auf 0..1 (expo-av), Export-Path unaffected.
  useEffect(() => {
    void soundRef.current?.setVolumeAsync(previewVol).catch(() => {});
  }, [previewVol]);

  /**
   * Sync das Audio zur aktuellen Master-Video-Position. Wird sowohl beim Load
   * (mit ref-Werten) als auch reactive (useEffect) gerufen.
   */
  async function syncToCurrentState() {
    const snd = soundRef.current;
    if (!snd) return;
    const cur = currentSecRef.current;
    const pse = pausedRef.current;
    const start = startSecRef.current;
    try {
      const offset = cur - start;
      if (pse) {
        await snd.pauseAsync();
        return;
      }
      if (offset < 0) {
        await snd.pauseAsync();
        await snd.setPositionAsync(0);
        return;
      }
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
  }

  return null;
}

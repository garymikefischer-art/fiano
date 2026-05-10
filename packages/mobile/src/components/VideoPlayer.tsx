/**
 * VideoPlayer — Inline-Preview mit Pro-Controls.
 *
 * - Scrub-bar: tap-to-seek + drag-to-scrub via PanResponder
 * - Skip ±5s Buttons + Big-Play/Pause in der Mitte (sichtbar wenn paused
 *   oder Controls eingeblendet sind, auto-hide nach 2.5 s im Playback)
 * - Mute-Toggle (Pill oben rechts)
 * - Loading-Spinner / Error-Overlay
 * - `seekTo`-Prop: external seek (Trim-Stepper, Clip-Liste-Tap)
 *
 * BufferConfig + disableFocus + seek-Guard schützen ExoPlayer auf Android
 * vor OOM und Race-Conditions bei high-bitrate-HEVC.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
} from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  uri: string;
  seekTo?: number;
  onProgress?: (currentSec: number) => void;
  onDuration?: (durationSec: number) => void;
  /** 'contain' (default, letterbox) oder 'cover' (crop). */
  resizeMode?: 'contain' | 'cover';
  /** Aspect-Ratio des Containers — default 16/9. Ignoriert wenn `fill`. */
  aspectRatio?: number;
  /** Wenn true: Container nutzt flex:1 statt aspectRatio (für Layouts wo
   * der Eltern-Container die Größe bestimmt, z.B. Stacked-Panels). */
  fill?: boolean;
}

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
}

const SKIP_SEC = 5;
const AUTO_HIDE_MS = 2500;

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { uri, seekTo, onProgress, onDuration, resizeMode = 'contain', aspectRatio = 16 / 9, fill = false },
  ref,
) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Ref auf den volatilen State, damit der einmal-erstellte PanResponder
  // immer die aktuellen Werte liest (Closures würden sonst alte States cachen).
  const stateRef = useRef({ loading, errorMsg, durationSec, trackWidth, paused });
  useEffect(() => {
    stateRef.current = { loading, errorMsg, durationSec, trackWidth, paused };
  }, [loading, errorMsg, durationSec, trackWidth, paused]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        setPaused(false);
        setControlsVisible(false);
      },
      pause: () => {
        setPaused(true);
        setControlsVisible(true);
      },
      seek: (sec: number) => videoRef.current?.seek(sec),
    }),
    [],
  );

  // URI-Wechsel → State zurücksetzen.
  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    setCurrentSec(0);
    setDurationSec(0);
    setPaused(true);
    setControlsVisible(true);
  }, [uri]);

  // External seek (Trim-Stepper, Clip-Tap). Auf Android crasht ExoPlayer
  // wenn man vor onLoad seekt → !loading-Guard.
  useEffect(() => {
    if (seekTo === undefined) return;
    if (loading || errorMsg) return;
    try {
      videoRef.current?.seek(seekTo);
      setCurrentSec(seekTo);
    } catch (e) {
      console.warn('[VideoPlayer] seek failed', e);
    }
  }, [seekTo, loading, errorMsg]);

  // Auto-hide-Controls während Playback.
  useEffect(() => {
    if (paused || !controlsVisible) return;
    const timer = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [paused, controlsVisible, currentSec]);

  const onVideoLoad = (data: OnLoadData) => {
    setLoading(false);
    setDurationSec(data.duration);
    onDuration?.(data.duration);
  };

  const onVideoProgress = (data: OnProgressData) => {
    setCurrentSec(data.currentTime);
    onProgress?.(data.currentTime);
  };

  const onVideoEnd = () => {
    setPaused(true);
    setControlsVisible(true);
  };

  const onVideoError = (data: OnVideoErrorData) => {
    setLoading(false);
    const raw =
      (data?.error as { errorString?: string; localizedDescription?: string })?.errorString
      ?? (data?.error as { localizedDescription?: string })?.localizedDescription
      ?? 'Video konnte nicht geladen werden';

    const isHevc = /hevc|h\.?265|hvc1/i.test(raw);
    const isDecodingFailed = /ERROR_CODE_DECODING_FAILED|MediaCodec.*decoder/i.test(raw);

    if (isHevc || isDecodingFailed) {
      setErrorMsg(
        'HEVC-Decoder fehlt auf diesem Gerät (typisch Android-Emulator). Test auf physischem Phone, iOS-Simulator oder Video lokal nach H.264 konvertieren.',
      );
    } else {
      setErrorMsg(raw);
    }
    console.warn('[VideoPlayer] error', JSON.stringify(data));
  };

  const togglePlay = () => {
    if (loading || errorMsg) return;
    setPaused((p) => !p);
    setControlsVisible(true); // immer Controls zeigen wenn user interagiert
  };

  const toggleControls = () => {
    if (loading || errorMsg) return;
    setControlsVisible((c) => !c);
  };

  const skipBy = (delta: number) => {
    if (loading || errorMsg) return;
    const next = Math.max(0, Math.min(durationSec, currentSec + delta));
    try {
      videoRef.current?.seek(next);
      setCurrentSec(next);
    } catch {
      /* ignore */
    }
    setControlsVisible(true);
  };

  // PanResponder für Tap+Drag auf der Scrub-Track.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => seekFromTouch(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => seekFromTouch(evt.nativeEvent.locationX),
    }),
  ).current;

  function seekFromTouch(x: number) {
    const { loading: isL, errorMsg: e, durationSec: d, trackWidth: w } = stateRef.current;
    if (isL || e || w <= 0 || d <= 0) return;
    const frac = Math.max(0, Math.min(1, x / w));
    const sec = frac * d;
    try {
      videoRef.current?.seek(sec);
      setCurrentSec(sec);
    } catch {
      /* ignore */
    }
  }

  const progressPct = durationSec > 0 ? (currentSec / durationSec) * 100 : 0;
  const showOverlayContent = !loading && !errorMsg && controlsVisible;

  return (
    <View style={[styles.container, fill ? { flex: 1 } : { aspectRatio }]}>
      <Video
        key={uri}
        ref={videoRef}
        source={{ uri }}
        paused={paused}
        muted={muted}
        resizeMode={resizeMode}
        onLoad={onVideoLoad}
        onProgress={onVideoProgress}
        onEnd={onVideoEnd}
        onError={onVideoError}
        progressUpdateInterval={500}
        bufferConfig={{
          minBufferMs: 5000,
          maxBufferMs: 10000,
          bufferForPlaybackMs: 1500,
          bufferForPlaybackAfterRebufferMs: 3000,
        }}
        disableFocus={true}
        ignoreSilentSwitch="ignore"
        style={StyleSheet.absoluteFill}
      />

      {/* Tap-Layer: toggelt Controls-Sichtbarkeit. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggleControls} />

      {/* Mute-Pill oben rechts — immer sichtbar wenn ready. */}
      {!loading && !errorMsg && (
        <Pressable
          onPress={() => setMuted((m) => !m)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.mutePill,
            { opacity: pressed ? 0.6 : 0.9 },
          ]}
        >
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-high'}
            size={16}
            color="#fff"
          />
        </Pressable>
      )}

      {/* Center-Controls — Skip / Play / Skip */}
      {showOverlayContent && (
        <View pointerEvents="box-none" style={styles.centerRow}>
          <Pressable
            onPress={() => skipBy(-SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="play-back" size={18} color="#fff" />
            <Text style={styles.skipLabel}>{SKIP_SEC}s</Text>
          </Pressable>
          <Pressable
            onPress={togglePlay}
            hitSlop={6}
            style={({ pressed }) => [styles.playButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => skipBy(SKIP_SEC)}
            hitSlop={6}
            style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="play-forward" size={18} color="#fff" />
            <Text style={styles.skipLabel}>{SKIP_SEC}s</Text>
          </Pressable>
        </View>
      )}

      {loading && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#ff1039" />
        </View>
      )}

      {errorMsg && (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Ionicons name="alert-circle" size={28} color="#ff5571" />
          <Text style={styles.errorText} numberOfLines={3}>
            {errorMsg}
          </Text>
        </View>
      )}

      {/* Bottom-Scrubber + Times — auch sichtbar wenn Controls ausgeblendet,
          aber nur wenn ready (kein Spinner / Error). */}
      {!loading && !errorMsg && (
        <View style={styles.bottomBar}>
          <Text style={styles.time}>{formatTime(currentSec)}</Text>
          <View
            style={styles.trackHit}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progressPct}%` }]} />
            </View>
            <View style={[styles.thumb, { left: `${progressPct}%` }]} />
          </View>
          <Text style={styles.time}>{formatTime(durationSec)}</Text>
        </View>
      )}
    </View>
  );
});

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mutePill: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  skipButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 36,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  trackHit: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#ff1039',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});

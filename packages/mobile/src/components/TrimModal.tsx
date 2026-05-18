/**
 * TrimModal (Phase B5 — 2026-05-18).
 *
 * Modal zum Trimmen eines einzelnen Clips:
 *  - Video-Preview mit Scrubber + Play/Pause
 *  - Dual-Handle-Range-Slider (Start/End) auf der Source-Timeline
 *  - "Split here at playhead" — schneidet den Clip in 2 Clips am aktuellen
 *    Playhead. UI schließt sich, ruft onSplit(atSec) auf.
 *  - "Save" — übernimmt Start/End in den Clip.
 *
 * Math: alle Werte in Sekunden auf der SOURCE-Timeline (0..sourceDuration).
 *
 * Trade-off: bewusst KEIN eigenes Sub-Range-Schema im Clip — Mid-Cut wird
 * via Split realisiert (1 Clip wird zu 2), beide referenzieren weiterhin
 * die gleiche Source via sourceIdx. Damit bleibt das DemoClip-Schema
 * abwärtskompatibel.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Video, { type VideoRef, type OnLoadData, type OnProgressData } from 'react-native-video';

import { BackgroundGlow } from './BackgroundGlow';
import { haptic } from '../lib/haptics';
import { useColors } from '../lib/theme';

interface Props {
  visible: boolean;
  /** Source-Video URI (file://...). */
  sourceUri: string;
  /** Aktueller Clip-Startwert (Sekunden in Source-Timeline). */
  initialStartSec: number;
  /** Aktueller Clip-Endwert (Sekunden in Source-Timeline). */
  initialEndSec: number;
  /** Volle Source-Dauer (Sekunden). Wenn 0/undefined → wird via onLoad ermittelt. */
  sourceDuration?: number;
  /** Clip-Label für Modal-Header. */
  clipLabel: string;
  onClose: () => void;
  /** Save = nur trim (kein split). */
  onSave: (startSec: number, endSec: number) => void;
  /** Split at given playhead-Sekunde. Erzeugt 2 Clips: [start..atSec] + [atSec..end]. */
  onSplit: (atSec: number) => void;
  t: (k: string, f?: string) => string;
}

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ds = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ds}`;
}

export function TrimModal({
  visible,
  sourceUri,
  initialStartSec,
  initialEndSec,
  sourceDuration: sourceDurationProp,
  clipLabel,
  onClose,
  onSave,
  onSplit,
  t,
}: Props) {
  const videoRef = useRef<VideoRef>(null);
  // Phase B3 (2026-05-18): theme-aware modal-surface.
  const colors = useColors();

  // Source-Duration: wird via onLoad ermittelt, falls nicht via Prop gegeben.
  const [sourceDuration, setSourceDuration] = useState<number>(sourceDurationProp ?? 0);
  const [startSec, setStartSec] = useState<number>(initialStartSec);
  const [endSec, setEndSec] = useState<number>(initialEndSec);
  const [currentSec, setCurrentSec] = useState<number>(initialStartSec);
  const [paused, setPaused] = useState(true);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (visible) {
      setStartSec(initialStartSec);
      setEndSec(initialEndSec);
      setCurrentSec(initialStartSec);
      setPaused(true);
      // sourceDuration reset auf prop (wird ggf. von onLoad überschrieben)
      setSourceDuration(sourceDurationProp ?? 0);
    }
  }, [visible, initialStartSec, initialEndSec, sourceDurationProp]);

  // Refs für PanResponder closures (verhindert stale State).
  const stateRef = useRef({ trackWidth, sourceDuration, startSec, endSec });
  useEffect(() => {
    stateRef.current = { trackWidth, sourceDuration, startSec, endSec };
  }, [trackWidth, sourceDuration, startSec, endSec]);

  const handleLoad = (d: OnLoadData) => {
    if (sourceDuration <= 0 && d.duration > 0) {
      setSourceDuration(d.duration);
      // initial seek auf initialStartSec
      videoRef.current?.seek(initialStartSec);
    }
  };

  const handleProgress = (d: OnProgressData) => {
    setCurrentSec(d.currentTime);
    // Auto-stop am end-Handle.
    if (d.currentTime >= endSec && !paused) {
      setPaused(true);
      videoRef.current?.seek(startSec);
    }
  };

  // ─── Range-Slider (Dual Handle) ──────────────────────────────────
  // Click/Drag-Handler. Bestimmt welches Handle bewegt wird basierend auf
  // Nähe zum Tap-Punkt.

  const secFromX = (x: number): number => {
    const { trackWidth: w, sourceDuration: dur } = stateRef.current;
    if (w <= 0 || dur <= 0) return 0;
    const frac = Math.max(0, Math.min(1, x / w));
    return frac * dur;
  };

  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        const sec = secFromX(x);
        const { startSec: s, endSec: e } = stateRef.current;
        // Welches Handle ist näher?
        const dStart = Math.abs(sec - s);
        const dEnd = Math.abs(sec - e);
        const which = dStart <= dEnd ? 'start' : 'end';
        setActiveHandle(which);
        if (which === 'start') {
          const ns = Math.max(0, Math.min(sec, e - 0.1));
          setStartSec(ns);
          videoRef.current?.seek(ns);
          setCurrentSec(ns);
        } else {
          const ne = Math.max(s + 0.1, Math.min(sec, stateRef.current.sourceDuration));
          setEndSec(ne);
          videoRef.current?.seek(ne);
          setCurrentSec(ne);
        }
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const sec = secFromX(x);
        const { startSec: s, endSec: e, sourceDuration: dur } = stateRef.current;
        if (activeHandle === 'start') {
          const ns = Math.max(0, Math.min(sec, e - 0.1));
          setStartSec(ns);
          videoRef.current?.seek(ns);
          setCurrentSec(ns);
        } else if (activeHandle === 'end') {
          const ne = Math.max(s + 0.1, Math.min(sec, dur));
          setEndSec(ne);
          videoRef.current?.seek(ne);
          setCurrentSec(ne);
        }
      },
      onPanResponderRelease: () => {
        setActiveHandle(null);
        haptic.selection();
      },
      onPanResponderTerminate: () => {
        setActiveHandle(null);
      },
    }),
  ).current;

  // Playhead = unabhängig vom Range-Handle, eigener Tap-Layer ÜBER der Track.
  // Hier nutzen wir einen separaten Pressable über dem Range — Single-Tap
  // verschiebt den Playhead OHNE Range-Handles zu bewegen.

  const seekToTap = (x: number) => {
    const sec = secFromX(x);
    const clamped = Math.max(0, Math.min(sec, stateRef.current.sourceDuration));
    videoRef.current?.seek(clamped);
    setCurrentSec(clamped);
  };

  // ─── Actions ─────────────────────────────────────────────────────
  const onSavePress = () => {
    haptic.success();
    onSave(startSec, endSec);
  };

  const onSplitPress = () => {
    // Validity-Check: Playhead muss zwischen Start und End liegen, mit
    // minimum 0.1s Abstand zu beiden Rändern (sonst entstehen Zero-Length-Clips).
    if (currentSec <= startSec + 0.1 || currentSec >= endSec - 0.1) {
      haptic.error();
      return;
    }
    haptic.success();
    onSplit(currentSec);
  };

  const durSec = Math.max(0, endSec - startSec);
  const startFrac = sourceDuration > 0 ? (startSec / sourceDuration) * 100 : 0;
  const endFrac = sourceDuration > 0 ? (endSec / sourceDuration) * 100 : 100;
  const playheadFrac = sourceDuration > 0 ? (currentSec / sourceDuration) * 100 : 0;
  const splitAllowed =
    currentSec > startSec + 0.1 && currentSec < endSec - 0.1 && sourceDuration > 0;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top', 'bottom']}>
        <BackgroundGlow />

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color="#f1f2f2" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title}>{t('trim.title', 'Trim clip')}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {clipLabel}
            </Text>
          </View>
          <Pressable onPress={onSavePress} hitSlop={10} style={styles.headerBtn}>
            <Text style={{ color: '#ff1039', fontSize: 14, fontWeight: '700' }}>
              {t('common.save', 'Save')}
            </Text>
          </Pressable>
        </View>

        {/* Video Preview */}
        <View style={styles.previewWrap}>
          <View style={styles.previewBox}>
            <Video
              ref={videoRef}
              source={{ uri: sourceUri }}
              paused={paused}
              muted={false}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
              onLoad={handleLoad}
              onProgress={handleProgress}
              ignoreSilentSwitch="ignore"
              repeat={false}
              bufferConfig={{
                minBufferMs: 1500,
                maxBufferMs: 3000,
                bufferForPlaybackMs: 500,
                bufferForPlaybackAfterRebufferMs: 1500,
              }}
            />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setPaused((p) => !p)}
            >
              {paused && (
                <View style={styles.playOverlay}>
                  <Ionicons name="play" size={48} color="rgba(255,255,255,0.85)" />
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Time-info row */}
        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.timeLabel}>{t('trim.start', 'Start')}</Text>
            <Text style={styles.timeValue}>{fmtTime(startSec)}</Text>
          </View>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.timeLabel}>{t('trim.playhead', 'Playhead')}</Text>
            <Text style={[styles.timeValue, { color: '#ff1039' }]}>{fmtTime(currentSec)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.timeLabel}>{t('trim.end', 'End')}</Text>
            <Text style={styles.timeValue}>{fmtTime(endSec)}</Text>
          </View>
        </View>

        {/* Range Slider */}
        <View style={styles.sliderArea}>
          <Text style={styles.sliderHint}>
            {t(
              'trim.dragHint',
              'Drag the red handles to set Start/End. Tap track to move playhead.',
            )}
          </Text>
          {/* Range Slider mit zwei Handles + Playhead */}
          <View
            style={styles.sliderTrack}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          >
            {/* Track Background */}
            <View style={styles.trackBg} />
            {/* Selected Range (between handles) */}
            <View
              style={[
                styles.trackSelected,
                { left: `${startFrac}%`, width: `${Math.max(0, endFrac - startFrac)}%` },
              ]}
            />
            {/* Playhead vertical line */}
            <View
              pointerEvents="none"
              style={[
                styles.playheadLine,
                { left: `${playheadFrac}%` },
              ]}
            />
            {/* Start Handle */}
            <View
              pointerEvents="none"
              style={[styles.handle, { left: `${startFrac}%` }]}
            />
            {/* End Handle */}
            <View
              pointerEvents="none"
              style={[styles.handle, { left: `${endFrac}%` }]}
            />
            {/* Pan-Handler-Overlay (fängt drags für nearest handle ab) */}
            <View
              style={StyleSheet.absoluteFill}
              {...handlePanResponder.panHandlers}
            />
          </View>

          {/* Separate Playhead-Scrubber: tap to seek (independent of handles) */}
          <Text style={[styles.sliderHint, { marginTop: 18 }]}>
            {t('trim.playheadHint', 'Tap below to move only the playhead (for split):')}
          </Text>
          <Pressable
            style={styles.playheadTrack}
            onPress={(e) => seekToTap(e.nativeEvent.locationX)}
          >
            <View style={styles.trackBg} />
            <View
              pointerEvents="none"
              style={[styles.playheadDot, { left: `${playheadFrac}%` }]}
            />
          </Pressable>

          {/* Split Button */}
          <Pressable
            onPress={onSplitPress}
            disabled={!splitAllowed}
            style={({ pressed }) => [
              styles.splitBtn,
              {
                backgroundColor: !splitAllowed
                  ? 'rgba(255,255,255,0.06)'
                  : pressed
                  ? 'rgba(255,16,57,0.45)'
                  : 'rgba(255,16,57,0.25)',
                borderColor: !splitAllowed
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(255,16,57,0.6)',
              },
            ]}
          >
            <Ionicons
              name="cut-outline"
              size={16}
              color={splitAllowed ? '#ff1039' : '#71717a'}
            />
            <Text
              style={[
                styles.splitText,
                { color: splitAllowed ? '#ff1039' : '#71717a' },
              ]}
            >
              {t('trim.splitHere', 'Split here at playhead')}
            </Text>
          </Pressable>
          <Text style={styles.splitInfo}>
            {t('trim.duration', 'Selected duration')}: {fmtTime(durSec)}
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBtn: {
    padding: 6,
    minWidth: 50,
  },
  title: {
    color: '#f1f2f2',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 1,
    maxWidth: 220,
  },
  previewWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  previewBox: {
    aspectRatio: 9 / 16,
    width: '60%',
    alignSelf: 'center',
    backgroundColor: '#000',
    borderRadius: 14,
    overflow: 'hidden',
  },
  playOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  timeRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  timeLabel: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  timeValue: {
    color: '#f1f2f2',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  sliderArea: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  sliderHint: {
    color: '#71717a',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  sliderTrack: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
  },
  trackSelected: {
    position: 'absolute',
    top: 17,
    height: 6,
    backgroundColor: 'rgba(255,16,57,0.55)',
    borderRadius: 3,
  },
  playheadLine: {
    position: 'absolute',
    top: 4,
    width: 2,
    height: 32,
    backgroundColor: '#ff1039',
    marginLeft: -1,
  },
  handle: {
    position: 'absolute',
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    marginLeft: -11,
    borderWidth: 2,
    borderColor: '#ff1039',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  playheadTrack: {
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  playheadDot: {
    position: 'absolute',
    top: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff1039',
    marginLeft: -6,
  },
  splitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 16,
  },
  splitText: {
    fontSize: 13,
    fontWeight: '700',
  },
  splitInfo: {
    color: '#a1a1aa',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
});

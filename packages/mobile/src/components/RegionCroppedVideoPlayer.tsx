/**
 * RegionCroppedVideoPlayer — display-only Video, das nur einen Region-Ausschnitt
 * (x/y/w/h, 0..1) cover-gefüllt im Pane zeigt.
 *
 * Nutzung: Stacked / Split 9:16-Preview. Top-Pane bekommt facecamRegion,
 * Bottom-Pane gameplayRegion → User sieht in der Live-Preview pixel-präzise
 * was im Export landet (analog Desktop's Canvas-basierter TikTokPreview).
 *
 * Math (cover-fit):
 *   scale = max(paneW / (region.w * srcW), paneH / (region.h * srcH))
 *   left  = paneW/2 - (region.x + region.w/2) * srcW * scale
 *   top   = paneH/2 - (region.y + region.h/2) * srcH * scale
 *
 * `resizeMode="stretch"` weil wir die Native-Auflösung selbst setzen — das Video
 * wird hardware-bilinear hochskaliert.
 *
 * Click-to-play (Phase 9.5.4-hotfix2): wenn `enabled === false` rendern wir
 * stattdessen das `posterUri`-Image — KEIN <Video>-Element wird gemountet.
 * Sonst hatten wir auf Android 2 simultane Decoder + ExoPlayer-Native-Crash.
 * Parent (StackedSplitPreview) startet die Videos erst auf Tap.
 *
 * KEINE eingebauten Controls — der Parent liefert ein gemeinsames Control-
 * Overlay für beide Panes. Master-Slave-Sync via `syncTo()` auf der ref.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
} from 'react-native-video';

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  uri: string;
  /** Region im Source (0..1). Wenn invalid (w*h===0) oder null → full-cover-Fallback. */
  region: Region | null;
  /** Default true. Wenn false: Source-Audio läuft. */
  muted?: boolean;
  /** Default false. Wenn true: Video pausiert. */
  paused?: boolean;
  /** Wird einmal gefired wenn das Video Maße + Dauer kennt. Master-Pane nutzt das. */
  onLoad?: (data: OnLoadData) => void;
  /** Tickt während Playback (~250ms). Master-Pane treibt damit den globalen Scrubber. */
  onProgress?: (data: OnProgressData) => void;
  /** Wenn false: rendere statt <Video> das poster-Image. Default true.
   *  Click-to-play-Pattern: erst nach User-Geste mounten wir den Video-Decoder. */
  enabled?: boolean;
  /** Statisches Vorschau-Bild (z.B. project.thumbUri). Wird gezeigt wenn enabled=false
   *  oder solange wir noch keine Source-Maße haben. Wird auch fürs cover-cropping
   *  via Image.getSize verwendet. */
  posterUri?: string;
}

export interface RegionCroppedVideoHandle {
  /** Hartes Seek auf eine bestimmte Sekunde. No-op wenn !enabled. */
  seek: (sec: number) => void;
  /** Sanfter Sync: nur seek wenn drift zur eigenen currentTime > 0.4s. No-op wenn !enabled. */
  syncTo: (masterSec: number) => void;
}

const SYNC_THRESHOLD_SEC = 0.4;

export const RegionCroppedVideoPlayer = forwardRef<RegionCroppedVideoHandle, Props>(
  function RegionCroppedVideoPlayer(
    {
      uri,
      region,
      muted = true,
      paused = false,
      onLoad,
      onProgress,
      enabled = true,
      posterUri,
    },
    ref,
  ) {
    const videoRef = useRef<VideoRef>(null);
    const currentSecRef = useRef(0);
    const [paneSize, setPaneSize] = useState<{ w: number; h: number } | null>(null);
    const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
    const [posterSize, setPosterSize] = useState<{ w: number; h: number } | null>(null);
    const [errored, setErrored] = useState(false);

    // Source-Maße für Region-Crop-Math beim Poster (Image.getSize ist async).
    // Wir laden das nur wenn !enabled (Click-to-play-Mode) — sobald Video aktiv ist,
    // kommen die Maße via onLoad.naturalSize, und Image wird nicht mehr gezeigt.
    useEffect(() => {
      if (enabled) return;
      if (!posterUri) {
        setPosterSize(null);
        return;
      }
      let cancelled = false;
      Image.getSize(
        posterUri,
        (w, h) => {
          if (!cancelled && w > 0 && h > 0) setPosterSize({ w, h });
        },
        () => {
          /* getSize-error: bleibt null, Image rendert cover-fit als Fallback */
        },
      );
      return () => {
        cancelled = true;
      };
    }, [enabled, posterUri]);

    useImperativeHandle(
      ref,
      () => ({
        seek: (sec: number) => {
          if (!enabled) return;
          videoRef.current?.seek(sec);
          currentSecRef.current = sec;
        },
        syncTo: (masterSec: number) => {
          if (!enabled) return;
          const drift = Math.abs(masterSec - currentSecRef.current);
          if (drift > SYNC_THRESHOLD_SEC) {
            videoRef.current?.seek(masterSec);
            currentSecRef.current = masterSec;
          }
        },
      }),
      [enabled],
    );

    const validRegion =
      region != null && region.w > 0 && region.h > 0 ? clampRegion(region) : null;

    // Region-Crop-Layout: für Video aus videoSize, fürs Poster aus posterSize.
    // Mit largeHeap=true (app.config.js) verkraftet der Heap die 2-4× größere
    // Image-Surface beim Region-Crop. Ohne largeHeap hatte es den Heap gesprengt.
    const srcSize = enabled ? videoSize : posterSize;
    const layout = computeLayout(paneSize, srcSize, validRegion);

    return (
      <View
        style={styles.pane}
        onLayout={(e) =>
          setPaneSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {enabled && !errored && (
          <Video
            key={uri}
            ref={videoRef}
            source={{ uri }}
            paused={paused}
            muted={muted}
            repeat
            resizeMode={layout ? 'stretch' : 'cover'}
            onLoad={(d: OnLoadData) => {
              const w = d.naturalSize?.width ?? 0;
              const h = d.naturalSize?.height ?? 0;
              if (w > 0 && h > 0) setVideoSize({ w, h });
              onLoad?.(d);
            }}
            onProgress={(d: OnProgressData) => {
              currentSecRef.current = d.currentTime;
              onProgress?.(d);
            }}
            onError={(_e: OnVideoErrorData) => setErrored(true)}
            progressUpdateInterval={250}
            bufferConfig={{
              // Klein gehalten weil zwei Decoder gleichzeitig laufen.
              minBufferMs: 1500,
              maxBufferMs: 3000,
              bufferForPlaybackMs: 800,
              bufferForPlaybackAfterRebufferMs: 1500,
            }}
            disableFocus={true}
            ignoreSilentSwitch="ignore"
            style={
              layout
                ? {
                    position: 'absolute',
                    left: layout.left,
                    top: layout.top,
                    width: layout.width,
                    height: layout.height,
                  }
                : StyleSheet.absoluteFill
            }
          />
        )}

        {/* Poster (Thumbnail) — wird gezeigt:
              - bei !enabled (Click-to-play, Stacked-Preview vor Tap-Play)
              - oder als Fallback solange das Video noch keine Maße hat
            Wenn layout berechnet ist (posterSize oder videoSize bekannt + Region
            valide), rendern wir mit Region-Crop-Math — User sieht den echten
            Ausschnitt schon vor dem Play. Sonst Fallback auf cover-fit. */}
        {(!enabled || (enabled && !videoSize)) && posterUri && (
          <Image
            source={{ uri: posterUri }}
            style={
              layout
                ? {
                    position: 'absolute',
                    left: layout.left,
                    top: layout.top,
                    width: layout.width,
                    height: layout.height,
                  }
                : StyleSheet.absoluteFill
            }
            resizeMode={layout ? 'stretch' : 'cover'}
          />
        )}

        {/* Loading-Indikator solange das Video noch nicht ready ist (enabled aber
            videoSize fehlt). Nur sichtbar wenn auch kein Poster verfügbar ist. */}
        {enabled && !errored && !videoSize && !posterUri && (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color="#ff1039" size="small" />
          </View>
        )}
      </View>
    );
  },
);

function clampRegion(r: Region): Region {
  const x = Math.max(0, Math.min(1, r.x));
  const y = Math.max(0, Math.min(1, r.y));
  const w = Math.max(0.01, Math.min(1 - x, r.w));
  const h = Math.max(0.01, Math.min(1 - y, r.h));
  return { x, y, w, h };
}

function computeLayout(
  pane: { w: number; h: number } | null,
  src: { w: number; h: number } | null,
  region: Region | null,
): { left: number; top: number; width: number; height: number } | null {
  if (!pane || !src || !region) return null;
  if (pane.w <= 0 || pane.h <= 0 || src.w <= 0 || src.h <= 0) return null;

  const regionPxW = region.w * src.w;
  const regionPxH = region.h * src.h;
  if (regionPxW <= 0 || regionPxH <= 0) return null;

  // Cover: max der zwei Skalen, damit die Region den Pane mindestens füllt.
  const scale = Math.max(pane.w / regionPxW, pane.h / regionPxH);

  const videoW = src.w * scale;
  const videoH = src.h * scale;

  const regionCenterXPostScale = (region.x + region.w / 2) * src.w * scale;
  const regionCenterYPostScale = (region.y + region.h / 2) * src.h * scale;

  const left = pane.w / 2 - regionCenterXPostScale;
  const top = pane.h / 2 - regionCenterYPostScale;

  return { left, top, width: videoW, height: videoH };
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

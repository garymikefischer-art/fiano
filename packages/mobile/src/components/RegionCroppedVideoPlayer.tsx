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
 * wird hardware-bilinear hochskaliert (faktor 2-4× sieht auf modern Phones ok aus).
 *
 * KEINE Controls — reine Visualisierung. Pro Default beide muted (in einem
 * Stacked-Preview spielt sonst Audio doppelt).
 */

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Video, { type OnLoadData, type OnVideoErrorData } from 'react-native-video';

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
}

export function RegionCroppedVideoPlayer({ uri, region, muted = true, paused = false }: Props) {
  const [paneSize, setPaneSize] = useState<{ w: number; h: number } | null>(null);
  const [srcSize, setSrcSize] = useState<{ w: number; h: number } | null>(null);
  const [errored, setErrored] = useState(false);

  const validRegion =
    region != null && region.w > 0 && region.h > 0
      ? clampRegion(region)
      : null;

  const layout = computeLayout(paneSize, srcSize, validRegion);

  return (
    <View
      style={styles.pane}
      onLayout={(e) =>
        setPaneSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {!errored && (
        <Video
          key={uri}
          source={{ uri }}
          paused={paused}
          muted={muted}
          repeat
          resizeMode={layout ? 'stretch' : 'cover'}
          onLoad={(d: OnLoadData) => {
            const w = d.naturalSize?.width ?? 0;
            const h = d.naturalSize?.height ?? 0;
            if (w > 0 && h > 0) setSrcSize({ w, h });
          }}
          onError={(_e: OnVideoErrorData) => setErrored(true)}
          progressUpdateInterval={1000}
          bufferConfig={{
            minBufferMs: 5000,
            maxBufferMs: 10000,
            bufferForPlaybackMs: 1500,
            bufferForPlaybackAfterRebufferMs: 3000,
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

      {/* Loading-Indikator solange wir noch keine Source-Maße haben (= onLoad nicht gefired). */}
      {!errored && !srcSize && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#ff1039" size="small" />
        </View>
      )}
    </View>
  );
}

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

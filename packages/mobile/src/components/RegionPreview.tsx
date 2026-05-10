/**
 * RegionPreview — kleine 16:9-Box mit visueller Darstellung der Capture-Regionen.
 *
 * Akzeptiert Region-Objects (x/y/w/h als 0..1) — wird in Settings als Mini-Preview
 * gezeigt und ist die exakt gleiche Visualisierung die im RegionPickerModal
 * verwendet wird (nur größer + draggable).
 */

import { StyleSheet, View } from 'react-native';

import type { Region } from '../stores/appStore';

interface Props {
  facecam?: Region | null;
  gameplay?: Region | null;
  width?: number;
}

export function RegionPreview({ facecam, gameplay, width = 96 }: Props) {
  return (
    <View style={[styles.box, { width, height: width * (9 / 16) }]}>
      {gameplay && <RegionRect region={gameplay} color="gameplay" />}
      {facecam && <RegionRect region={facecam} color="facecam" />}
    </View>
  );
}

function RegionRect({ region, color }: { region: Region; color: 'facecam' | 'gameplay' }) {
  const style = color === 'facecam' ? styles.facecam : styles.gameplay;
  return (
    <View
      style={[
        style,
        {
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.w * 100}%`,
          height: `${region.h * 100}%`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#0d0509',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  gameplay: {
    position: 'absolute',
    backgroundColor: 'rgba(96,165,250,0.35)',
    borderWidth: 1,
    borderColor: '#60a5fa',
    borderRadius: 2,
  },
  facecam: {
    position: 'absolute',
    backgroundColor: 'rgba(255,16,57,0.45)',
    borderWidth: 1,
    borderColor: '#ff1039',
    borderRadius: 2,
  },
});

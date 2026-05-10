/**
 * RegionOverlay — transparenter Absolute-Fill der Eltern-View, der nur die
 * Region-Rechtecke zeichnet (kein schwarzer BG wie bei RegionPreview).
 *
 * Wird auf den 9:16-VideoPlayer im TikTok-Tab gelegt damit man die Stack-
 * Positionen sieht ohne dass das Video selbst verdeckt wird.
 */

import { StyleSheet, View } from 'react-native';

import type { Region } from '../stores/appStore';

interface Props {
  facecam?: Region | null;
  gameplay?: Region | null;
}

export function RegionOverlay({ facecam, gameplay }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
  gameplay: {
    position: 'absolute',
    backgroundColor: 'rgba(96,165,250,0.18)',
    borderWidth: 1.5,
    borderColor: '#60a5fa',
    borderRadius: 2,
  },
  facecam: {
    position: 'absolute',
    backgroundColor: 'rgba(255,16,57,0.20)',
    borderWidth: 1.5,
    borderColor: '#ff1039',
    borderRadius: 2,
  },
});

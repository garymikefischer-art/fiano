/**
 * RegionPreviewCard — kleine Display-Karte mit dem Source-Thumbnail als
 * Hintergrund (16:9) und einem Region-Overlay drauf. Darunter eine Reihe
 * Snap-Preset-Pills + ein Live-Display der aktuellen W%×H%-Größe.
 *
 * Analog Desktop's FacecamEditor / GameplayEditor (TikTokTab.tsx). Drag-zum-
 * Resize lassen wir hier weg — fürs Drag öffnet der User den RegionPickerModal
 * via Settings → Capture Regions (vorhandene UX). Cards sind nur:
 *   1) Visualisierung der aktuellen Region auf dem Source-Thumbnail
 *   2) Schnell-Wechsel über Snap-Presets ohne Modal-Roundtrip
 *
 * WICHTIG: Wir nutzen <Image> mit project.thumbUri statt <Video>, sonst hätten
 * wir mit der Stacked-Preview oben 4 gleichzeitige Video-Decoder → Android-OOM
 * (256 MB heap). Thumbnail ist statisch, kostet ~kB.
 *
 * Card-Aspect ist hardcoded 16:9 (typische Gaming-Source-Aufnahme). Bei nicht-
 * 16:9-Quellen wird das Overlay leicht verzerrt — known limitation, der echte
 * Export rendert pixel-präzise.
 */

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../lib/haptics';

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Preset<T extends string> {
  id: T;
  label: string;
  region: Region | null;
}

interface Props<T extends string> {
  /** Header-Label, z.B. "FACECAM REGION (TOP)". */
  title: string;
  /** Vorab extrahiertes Thumbnail-File (project.thumbUri). Wenn fehlt → schwarzer Placeholder. */
  thumbUri?: string;
  /** Aktuelle Region (0..1). null = keine Region (z.B. Facecam disabled). */
  region: Region | null;
  /** "facecam" → roter Overlay-Stil, "gameplay" → blau. */
  color: 'facecam' | 'gameplay';
  /** Snap-Presets. Tap → onPresetSelect(id, region). */
  presets: Preset<T>[];
  /** Welcher Preset matched die aktuelle Region (nur für active-Highlight). */
  activePresetId?: T | null;
  /** Wird gerufen wenn ein Preset gewählt wird. */
  onPresetSelect: (id: T, region: Region | null) => void;
}

export function RegionPreviewCard<T extends string>({
  title,
  thumbUri,
  region,
  color,
  presets,
  activePresetId,
  onPresetSelect,
}: Props<T>) {
  const sizeLabel =
    region && region.w > 0 && region.h > 0
      ? `${Math.round(region.w * 100)}% × ${Math.round(region.h * 100)}%`
      : '—';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sizeLabel}>{sizeLabel}</Text>
      </View>

      <View style={styles.previewBox}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0509' }]} />
        )}
        {region && region.w > 0 && region.h > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.regionRect,
              color === 'facecam' ? styles.facecam : styles.gameplay,
              {
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.w * 100}%`,
                height: `${region.h * 100}%`,
              },
            ]}
          />
        )}
      </View>

      <View style={styles.presetRow}>
        {presets.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              haptic.selection();
              onPresetSelect(p.id, p.region);
            }}
            style={({ pressed }) => [
              styles.presetPill,
              p.id === activePresetId && styles.presetPillActive,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                styles.presetLabel,
                p.id === activePresetId && styles.presetLabelActive,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  sizeLabel: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  previewBox: {
    aspectRatio: 16 / 9,
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  regionRect: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 2,
  },
  facecam: {
    backgroundColor: 'rgba(255,16,57,0.22)',
    borderColor: '#ff1039',
  },
  gameplay: {
    backgroundColor: 'rgba(96,165,250,0.20)',
    borderColor: '#60a5fa',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  presetPillActive: {
    backgroundColor: 'rgba(255,16,57,0.16)',
    borderColor: 'rgba(255,16,57,0.5)',
  },
  presetLabel: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
  },
  presetLabelActive: {
    color: '#ff1039',
  },
});

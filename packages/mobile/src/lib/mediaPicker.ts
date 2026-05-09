/**
 * Video-Picker + Camera-Roll-Helpers.
 */

import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export interface PickedVideo {
  /** Local file:// URI in der App-Sandbox (kopierte Version). */
  uri: string;
  /** Original-Asset-URI vom Picker (kann für `react-native-video` direkt genutzt werden). */
  assetUri: string;
  durationSec: number;
  width?: number;
  height?: number;
  filename?: string;
  /** Filesize in bytes — wenn verfügbar. */
  size?: number;
}

/**
 * Öffnet den System-Picker und gibt das gewählte Video zurück.
 * Returns null wenn User canceled.
 *
 * MVP-Limit: max 10 min Länge → wir parsen Duration und werfen wenn drüber.
 */
export async function pickVideo(opts: { maxDurationSec?: number } = {}): Promise<PickedVideo | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Camera-Roll-Berechtigung verweigert. Bitte in den Einstellungen erlauben.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    quality: 1,
    videoMaxDuration: opts.maxDurationSec ?? 600,
    allowsMultipleSelection: false,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const duration = (asset.duration ?? 0) / 1000;

  if (opts.maxDurationSec && duration > opts.maxDurationSec) {
    throw new Error(`Video zu lang: ${Math.round(duration)}s (Max ${opts.maxDurationSec}s).`);
  }

  return {
    uri: asset.uri,
    assetUri: asset.uri,
    durationSec: duration,
    width: asset.width,
    height: asset.height,
    filename: asset.fileName ?? undefined,
    size: asset.fileSize,
  };
}

/**
 * Speichert ein gerendertes Video in der Camera Roll.
 * Returns: Asset-URI im PhotoKit (asset://...).
 */
export async function saveToCameraRoll(localUri: string): Promise<string> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Schreibrechte auf Camera Roll verweigert.');
  }
  const asset = await MediaLibrary.createAssetAsync(localUri);
  return asset.uri;
}

/**
 * Sandbox-Pfad für temporäre + finale Renders.
 * Kopiert ggf. die Source-Datei in die Sandbox falls sie außerhalb liegt
 * (manche iOS-Picker geben asset://... URIs die FFmpeg nicht direkt lesen kann).
 */
export async function ensureLocalCopy(uri: string, outName?: string): Promise<string> {
  if (uri.startsWith('file://')) {
    return uri;
  }
  const target = `${FileSystem.cacheDirectory}${outName ?? `import-${Date.now()}.mp4`}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

/**
 * Gibt einen Output-Pfad in der App-Sandbox zurück.
 */
export function makeOutputPath(name: string): string {
  return `${FileSystem.documentDirectory}${name}`;
}

/**
 * Räumt temp-Dateien älter als 24h aus dem Cache. Optional bei App-Start aufrufen.
 */
export async function cleanupOldTemp(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return;
  const items = await FileSystem.readDirectoryAsync(dir);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const item of items) {
    const info = await FileSystem.getInfoAsync(`${dir}${item}`);
    if (info.exists && info.modificationTime && info.modificationTime * 1000 < cutoff) {
      await FileSystem.deleteAsync(`${dir}${item}`, { idempotent: true }).catch(() => {});
    }
  }
}

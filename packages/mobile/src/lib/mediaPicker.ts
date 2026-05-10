/**
 * Video-Picker + Camera-Roll-Helpers.
 *
 * Zwei Quellen:
 *  - Galerie (expo-image-picker, Photos-/Gallery-Picker mit Video-Filter)
 *  - Dateien (expo-document-picker, System-File-Picker mit type=video/*)
 *
 * Beide liefern dasselbe PickedVideo-Shape, der ImportScreen behandelt sie identisch.
 * Document-Picker liefert keine Duration → der Player füllt sie via onDuration nach.
 */

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export interface PickedVideo {
  /** URI für react-native-video / FFmpeg-Eingabe. */
  uri: string;
  /** Original-Asset-URI vom Picker. */
  assetUri: string;
  durationSec: number;
  width?: number;
  height?: number;
  filename?: string;
  size?: number;
  /** Quelle des Pickers — informativ. */
  source: 'gallery' | 'files';
}

interface PickOpts {
  maxDurationSec?: number;
}

/**
 * Galerie-Picker (Photos / Camera Roll).
 */
export async function pickVideoFromGallery(opts: PickOpts = {}): Promise<PickedVideo | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Camera-Roll-Berechtigung verweigert. Bitte in den Einstellungen erlauben.');
  }

  // expo-image-picker 16: neues MediaType-Array-API (MediaTypeOptions deprecated).
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
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

  const persistentUri = await persistInDocuments(asset.uri, asset.fileName ?? undefined);

  return {
    uri: persistentUri,
    assetUri: asset.uri,
    durationSec: duration,
    width: asset.width,
    height: asset.height,
    filename: asset.fileName ?? undefined,
    size: asset.fileSize,
    source: 'gallery',
  };
}

export interface PickedAudio {
  uri: string;
  filename?: string;
  size?: number;
}

/**
 * Audio-Picker (Document-Picker mit Audio-Filter) für Music + Intro-Files.
 */
/**
 * Multi-Audio-Picker — ermöglicht mehrere Tracks auf einmal aufzunehmen.
 * Returnt leeres Array wenn User cancelt.
 */
export async function pickAudiosFromFiles(): Promise<PickedAudio[]> {
  const types = ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/ogg'];
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return [];
  const out: PickedAudio[] = [];
  for (const asset of result.assets) {
    const persistentUri = await persistInDocuments(asset.uri, asset.name ?? undefined);
    out.push({ uri: persistentUri, filename: asset.name ?? undefined, size: asset.size });
  }
  return out;
}

export async function pickAudioFromFiles(): Promise<PickedAudio | null> {
  // Auf Android filtert 'audio/*' manche Versionen zu aggressiv (zeigt 0 files)
  // → wir geben mehrere konkrete MIME-Types mit, Fallback auf '* / *'.
  const types = ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/ogg'];
  let result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: false,
  });
  // Wenn der User auf Android nichts findet, kann er den System-Picker erneut
  // aufrufen und manuelle Datei nach '*/*' wählen — wir machen das nicht
  // automatisch um nicht doppelt-Picker zu öffnen.
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const persistentUri = await persistInDocuments(asset.uri, asset.name ?? undefined);
  return { uri: persistentUri, filename: asset.name ?? undefined, size: asset.size };
}

/**
 * Files-Picker (Document-Picker mit Video-Filter).
 * Lokale Datei wird automatisch in den App-Cache kopiert (`copyToCacheDirectory`),
 * sodass der zurückgegebene URI ein stabiler file:// Pfad ist.
 */
export async function pickVideoFromFiles(opts: PickOpts = {}): Promise<PickedVideo | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['video/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const persistentUri = await persistInDocuments(asset.uri, asset.name ?? undefined);

  // DocumentPicker liefert keine Duration — bleibt 0, der Player füllt sie via
  // onDuration-Callback in ImportScreen nach.
  return {
    uri: persistentUri,
    assetUri: asset.uri,
    durationSec: 0,
    width: undefined,
    height: undefined,
    filename: asset.name ?? undefined,
    size: asset.size,
    source: 'files',
  };
}

/** Backwards-Compat-Alias — alte Aufrufer rufen `pickVideo` auf. */
export const pickVideo = pickVideoFromGallery;

/**
 * Kopiert eine gepickte Datei aus dem temporären Cache (wo expo-image-picker /
 * expo-document-picker sie ablegen) in den App-eigenen documentDirectory.
 *
 * Cache-Files werden vom OS regelmäßig gecleant — wenn wir die URI direkt am
 * Project speichern, hat das Projekt nach App-Restart oft eine tote URI und
 * der VideoPlayer zeigt schwarz. documentDirectory ist persistent.
 */
async function persistInDocuments(srcUri: string, name?: string): Promise<string> {
  if (!srcUri.startsWith('file://')) return srcUri;
  const dir = `${FileSystem.documentDirectory}imports/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    /* exists */
  }
  const safeName = (name ?? 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${dir}${Date.now()}-${safeName}`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
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

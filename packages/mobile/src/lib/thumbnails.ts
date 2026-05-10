/**
 * Video-Thumbnail-Helper (Phase 9.4.31).
 *
 * Lazy-Load von `expo-video-thumbnails` — wenn das Native-Modul (noch) nicht
 * gelinkt ist, returnen die Calls null statt zu crashen. Gleicher Pattern wie
 * pushNotifications.ts und sounds.ts.
 *
 * Der erzeugte Thumbnail wird sofort in documentDirectory persistiert,
 * sonst räumt das OS die Cache-Datei nach Restart.
 */

import * as FileSystem from 'expo-file-system';

type ThumbsModule = typeof import('expo-video-thumbnails');

let cached: ThumbsModule | null | undefined = undefined;
let warned = false;

function getModule(): ThumbsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-video-thumbnails') as ThumbsModule;
  } catch {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn(
        '[thumbnails] expo-video-thumbnails nicht verfügbar — Native-Build mit `npm run android` nötig.',
      );
    }
  }
  return cached;
}

/**
 * Extrahiert einen Frame an `timeMs` aus dem Source-Video, kopiert ihn nach
 * documentDirectory und gibt den persistenten URI zurück.
 *
 * Returns null wenn extraction fehlschlägt (z.B. unsupported codec, missing
 * native module). Der Caller fällt dann auf Hue-Placeholder zurück.
 */
export async function extractVideoThumbnail(
  sourceUri: string,
  timeMs: number = 1000,
): Promise<string | null> {
  const M = getModule();
  if (!M) return null;
  try {
    const { uri } = await M.getThumbnailAsync(sourceUri, {
      time: timeMs,
      quality: 0.7,
    });
    // Cache → documentDirectory persistieren
    const dir = `${FileSystem.documentDirectory}thumbs/`;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* exists */
    }
    const dest = `${dir}${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.warn('[thumbnails] extract failed', e);
    return null;
  }
}

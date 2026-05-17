/**
 * Video-Thumbnail-Helper (Phase 9.4.31 + Phase A2 Thumbnail-on-demand).
 *
 * Lazy-Load von `expo-video-thumbnails` — wenn das Native-Modul (noch) nicht
 * gelinkt ist, returnen die Calls null statt zu crashen. Gleicher Pattern wie
 * pushNotifications.ts und sounds.ts.
 *
 * Der erzeugte Thumbnail wird sofort in documentDirectory persistiert,
 * sonst räumt das OS die Cache-Datei nach Restart.
 *
 * ─── Phase A2 (2026-05-17) ───────────────────────────────────────────────
 * Auto-Backfill: beim App-Mount läuft `initThumbnailBackfill()` und scannt
 * den Projects-Store. Für jedes Project ohne `thumbUri` aber mit `sourceUri`
 * wird ein Frame extrahiert.
 *
 * Constraints:
 *   - Sequential Queue (Vivo V40 Lite: Mediatek HEVC = 1 Decoder, parallel
 *     extraction = OOM-Risk)
 *   - 150ms Pause zwischen Jobs (Decoder-Cleanup)
 *   - In-Memory `failed` Set damit broken-source-Projects nicht in loop
 *   - Dedup via `inProgress` + `queue.includes` Checks
 *   - Subscribed an store-changes — neue Projects werden automatisch
 *     enqueued (z.B. nach `addProject`)
 */

import * as FileSystem from 'expo-file-system';
import { useProjectsStore } from '../stores/projectsStore';

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

// ────────────────────────────────────────────────────────────────────────
// Phase A2: Thumbnail-on-demand Backfill
// ────────────────────────────────────────────────────────────────────────

/** Project-IDs die noch processed werden müssen. */
const queue: string[] = [];
/** Project-IDs die gerade extracted werden — dedup. */
const inProgress = new Set<string>();
/** Project-IDs die failed haben (broken source, unsupported codec) — kein retry pro session. */
const failed = new Set<string>();
/** Worker-Lock — verhindert parallel-loops. */
let workerActive = false;
/** Store-Subscription-Unsub-Handle. Wird von initThumbnailBackfill returned. */
let unsubscribeStore: (() => void) | null = null;

async function workerLoop(): Promise<void> {
  if (workerActive) return;
  workerActive = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      if (inProgress.has(id) || failed.has(id)) continue;

      const state = useProjectsStore.getState();
      const project = state.projects.find((p) => p.id === id);
      if (!project) continue; // wurde inzwischen gelöscht
      if (project.thumbUri) continue; // wurde inzwischen gesetzt (z.B. via ProjectDetail-clip-extract)

      const sourceUri = project.sourceUri ?? project.sourceUris?.[0];
      if (!sourceUri) {
        // Project hat keine Source (URL-only, oder broken state) — skip permanent
        failed.add(id);
        continue;
      }

      inProgress.add(id);
      try {
        const uri = await extractVideoThumbnail(sourceUri, 1000);
        if (uri) {
          state.updateProject(id, { thumbUri: uri });
          console.log(`[thumbnails] backfill ✓ ${id}`);
        } else {
          // extract returned null (codec issue, native missing) — skip permanent
          failed.add(id);
          console.log(`[thumbnails] backfill ✗ ${id} (extract returned null)`);
        }
      } catch (e) {
        failed.add(id);
        console.warn(`[thumbnails] backfill ✗ ${id}:`, e);
      } finally {
        inProgress.delete(id);
      }

      // Vivo HEVC = 1 Decoder. Pause damit der Decoder das vorherige
      // job-Result rauspusht bevor wir mit dem nächsten Source-File starten.
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    workerActive = false;
  }
}

function scanAndEnqueue(): void {
  const state = useProjectsStore.getState();
  if (!state.hydrated) return;
  for (const project of state.projects) {
    if (project.thumbUri) continue;
    if (failed.has(project.id)) continue;
    if (inProgress.has(project.id)) continue;
    if (queue.includes(project.id)) continue;
    const hasSource =
      project.sourceUri || (project.sourceUris && project.sourceUris.length > 0);
    if (!hasSource) continue;
    queue.push(project.id);
  }
  if (queue.length > 0) void workerLoop();
}

/**
 * Initialisiert den Thumbnail-Backfill. Wird einmalig vom App-Root (App.tsx
 * useEffect mount) aufgerufen.
 *
 * - Scannt initial den Projects-Store nach fehlenden thumbUris
 * - Subscribed an Store-Updates damit neue Projects automatisch ge-enqueued
 *   werden (z.B. nach `addProject`)
 *
 * Returns ein Cleanup-Callback (für den useEffect-cleanup, obwohl App-Root
 * im Normalfall nie unmountet).
 */
export function initThumbnailBackfill(): () => void {
  // Falls schon initialized — alten subscribe abschalten
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
  // Initial-Scan (falls Store schon hydrated ist)
  scanAndEnqueue();
  // Store-Subscribe — bei JEDER Store-Change nochmal scannen.
  // scanAndEnqueue ist self-dedup (queue.includes + inProgress + failed Sets),
  // daher harmlos auch bei häufigen non-projects-changes (z.B. `loading` flag).
  unsubscribeStore = useProjectsStore.subscribe(() => {
    scanAndEnqueue();
  });
  return () => {
    unsubscribeStore?.();
    unsubscribeStore = null;
  };
}

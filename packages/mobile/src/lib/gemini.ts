/**
 * Gemini Thumbnail-Generation (Phase 9.8) — Mobile-Port der Desktop ipc.ts
 * `thumbnail.generate`-Logik.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent
 * Body:     { contents: [{ parts: [{ text }, { inline_data }?] }], generationConfig: { responseModalities: ['IMAGE'] } }
 *
 * Multi-Model-Try: probiert mehrere Image-Generation-Models bis einer ein
 * Image zurückgibt (Google rotiert Verfügbarkeit / Throttling oft model-spezifisch).
 *
 * Output wird base64 in DocumentDirectory/thumbnails/{projectId}/thumb-{ts}.png
 * gespeichert. Caller persistiert URI in project.thumbnailHistory.
 */

import * as FileSystem from 'expo-file-system';

import { useAppStore } from '../stores/appStore';

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Models 1:1 aus Desktop src/main/ipc.ts:197-205 (Nano Banana 3.1 zuerst —
// das ist der aktuelle User-Default auf Desktop). Reihenfolge wichtig:
// 3.1-flash-image-preview ist seit 2025 das Standard-Image-Gen-Model.
const TRY_MODELS = [
  'gemini-3.1-flash-image-preview', // Nano Banana 3.1 — current default
  'gemini-3-pro-image-preview', // Nano Banana Pro
  'gemini-2.5-flash-image', // stable
  'gemini-2.5-flash-image-preview', // legacy preview
  'gemini-2.0-flash-preview-image-generation', // legacy
  'gemini-2.0-flash-exp', // legacy
];

const TIMEOUT_MS = 60_000;
const THUMBS_DIR = `${FileSystem.documentDirectory}thumbnails/`;

export interface GenerateThumbnailOpts {
  prompt: string;
  projectId: string;
  /** Optional: Reference-Image als base64 (ohne data:image-Prefix). */
  referenceImageBase64?: string;
  referenceMime?: string;
}

export interface GenerateThumbnailResult {
  /** file:// URI im documentDirectory. */
  uri: string;
  /** Welches Modell die Antwort lieferte (für UI-Display). */
  model: string;
}

export async function generateThumbnail(
  opts: GenerateThumbnailOpts,
): Promise<GenerateThumbnailResult> {
  const apiKey = useAppStore.getState().geminiKey?.trim();
  if (!apiKey) {
    throw new Error('Gemini API key required. Set it in Settings → API Keys.');
  }

  // ─── Parts aufbauen — exakt wie Desktop src/main/ipc.ts:302-310 ──
  // snake_case inline_data / mime_type, weil Desktop genau das nutzt und
  // funktioniert (kein API-Behavior-Drift bei Format-Switch).
  const partsWithRef: Array<Record<string, unknown>> = [{ text: opts.prompt }];
  if (opts.referenceImageBase64) {
    partsWithRef.push({
      inline_data: {
        mime_type: opts.referenceMime ?? 'image/jpeg',
        data: opts.referenceImageBase64,
      },
    });
    console.log(
      `[gemini] ref-image included (${(opts.referenceImageBase64.length / 1024).toFixed(1)} KB base64)`,
    );
  }

  // ─── Pass 1: mit Reference-Image (falls vorhanden) ───────────────
  let result = await tryAllModels(partsWithRef, apiKey, 'pass1');
  let combinedError = 'image' in result ? null : result.lastError;

  // ─── Pass 2: ohne Reference-Image bei allNoImage (Safety-Trigger) ─
  if (!('image' in result) && result.allNoImage && opts.referenceImageBase64) {
    console.warn(
      '[gemini] PASS-1 all models returned no-image with ref-image — retry WITHOUT ref (safety-fallback). Result will ignore your reference image.',
    );
    result = await tryAllModels([{ text: opts.prompt }], apiKey, 'pass2');
    if (!('image' in result)) combinedError = result.lastError;
  }

  if (!('image' in result)) {
    // Hilfreicher Fehler-Hint: welche Models sind beim User-Key verfügbar.
    const availableModels = await listAvailableImageModels(apiKey);
    const availableHint =
      availableModels.length > 0
        ? `\n\nImage models available for your API key:\n  · ${availableModels.slice(0, 8).join('\n  · ')}\n\nUpdate TRY_MODELS in lib/gemini.ts if these don't match.`
        : '';
    throw new Error(
      (combinedError || 'All Gemini models failed to return an image.') + availableHint,
    );
  }
  console.log(`[gemini] SUCCESS model=${result.model} mime=${result.image.mime}`);

  // ─── Speichern in documentDirectory/thumbnails/{projectId}/ ──────
  const projectDir = `${THUMBS_DIR}${opts.projectId}/`;
  const dirInfo = await FileSystem.getInfoAsync(projectDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(projectDir, { intermediates: true });
  }
  const ext = result.image.mime.includes('png') ? 'png' : 'jpg';
  const uri = `${projectDir}thumb-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, result.image.data, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri, model: result.model };
}

interface TryResult {
  image?: { data: string; mime: string };
  model?: string;
  allNoImage?: boolean;
  lastError?: string;
}

async function tryAllModels(
  parts: Array<Record<string, unknown>>,
  apiKey: string,
  label: string,
): Promise<
  | { image: { data: string; mime: string }; model: string }
  | { allNoImage: boolean; lastError: string }
> {
  let lastError = '';
  let allNoImage = true;

  for (const model of TRY_MODELS) {
    const url = `${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    console.log(`[gemini] (${label}) try model=${model}`);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = e?.name === 'AbortError' || ac.signal.aborted;
      lastError = aborted ? `${model}: timeout` : `${model}: ${e?.message ?? e}`;
      console.warn(`[gemini] ${lastError}`);
      allNoImage = false; // network-error ≠ "no image"
      continue;
    }
    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      lastError = `${model}: HTTP ${res.status} ${txt.slice(0, 200)}`;
      console.warn(`[gemini] ${lastError}`);
      allNoImage = false;
      // 401 = bad key, 403 = quota, 404 = model gone → continue zu anderen
      if (res.status === 401) throw new Error('Invalid Gemini API key');
      continue;
    }

    const json: unknown = await res.json().catch(() => ({}));
    const image = extractImage(json);
    if (image) {
      return { image, model };
    }

    const candidate = (json as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0];
    const finishReason = candidate?.finishReason ?? 'unknown';
    lastError = `${model}: no image (${finishReason})`;
    console.warn(`[gemini] ${lastError}`);
    // allNoImage bleibt true wenn alle 200-Responses ohne image waren
  }

  return { allNoImage, lastError };
}

/**
 * Extrahiere Image-Bytes aus einer Gemini-Response. Liefert null wenn keins drin
 * ist. Versucht alle bekannten Response-Shapes (inline_data, inlineData, image,
 * media, + direct part.data). Portiert 1:1 von Desktop src/main/ipc.ts:211-222.
 */
function extractImage(json: unknown): { data: string; mime: string } | null {
  const cands = (json as { candidates?: unknown[] })?.candidates ?? [];
  for (const c of cands as Array<{ content?: { parts?: unknown[] } }>) {
    for (const p of c.content?.parts ?? []) {
      const part = p as Record<string, unknown>;
      const inline =
        (part.inline_data as Record<string, unknown> | undefined) ??
        (part.inlineData as Record<string, unknown> | undefined) ??
        (part.image as Record<string, unknown> | undefined) ??
        (part.media as Record<string, unknown> | undefined);
      const data =
        (inline?.data as string | undefined) ?? (part.data as string | undefined);
      const mime =
        (inline?.mime_type as string | undefined) ??
        (inline?.mimeType as string | undefined) ??
        (part.mime_type as string | undefined) ??
        (part.mimeType as string | undefined) ??
        'image/png';
      if (data) return { data, mime };
    }
  }
  return null;
}

/**
 * Holt verfügbare Image-Models vom User's Key via ListModels-Endpoint.
 * Wird beim Fehler-Fall verwendet um dem User in der Error-Message zu zeigen
 * welche Models er nutzen könnte.
 */
export async function listAvailableImageModels(apiKey: string): Promise<string[]> {
  try {
    const url = `${ENDPOINT_BASE.replace('/models', '/models')}?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const json = (await r.json()) as { models?: Array<{ name?: string }> };
    return (json.models ?? [])
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter((n) => /image|imagen/i.test(n));
  } catch {
    return [];
  }
}

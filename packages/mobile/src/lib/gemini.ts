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

// Image-Generation-Models in Reihenfolge der Präferenz. Google rolloutet
// regelmäßig neue + retiret alte; die 'preview'-Aliases sind oft 404 nach
// einem Cycle. Update bei Bedarf via Desktop's `gemini.listModels` oder
// https://ai.google.dev/gemini-api/docs/models.
const TRY_MODELS = [
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-image-preview',
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

  // ─── Parts aufbauen ───────────────────────────────────────────────
  // Gemini v1beta nimmt BEIDE Cases (snake_case + camelCase) — wir senden
  // camelCase (inlineData/mimeType) weil das auf den neueren Modellen die
  // konsistente Variante ist. Desktop nutzt snake_case via Node-fetch und
  // funktioniert auch — beide sind valid.
  const partsWithRef: Array<Record<string, unknown>> = [{ text: opts.prompt }];
  if (opts.referenceImageBase64) {
    partsWithRef.push({
      inlineData: {
        mimeType: opts.referenceMime ?? 'image/jpeg',
        data: opts.referenceImageBase64,
      },
    });
    console.log(`[gemini] ref-image included (${(opts.referenceImageBase64.length / 1024).toFixed(1)} KB base64)`);
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
    throw new Error(combinedError || 'All Gemini models failed to return an image.');
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

function extractImage(json: unknown): { data: string; mime: string } | null {
  const candidates = (json as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })
    ?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    const inline =
      (p as { inline_data?: { data?: string; mime_type?: string } }).inline_data ??
      (p as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
    if (!inline) continue;
    const data =
      (inline as { data?: string }).data;
    const mime =
      (inline as { mime_type?: string; mimeType?: string }).mime_type ??
      (inline as { mimeType?: string }).mimeType;
    if (data && mime) return { data, mime };
  }
  return null;
}

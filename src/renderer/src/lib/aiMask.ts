/**
 * AI Subject Mask via Segment Anything 2 (SAM 2 Hiera Tiny ONNX).
 *
 * Pipeline:
 *   1. encodeImage(imageData) → embeddings (heavy, ~1-3s, gecached pro Frame)
 *   2. generateMask(embeddings, points) → binary mask (interaktiv, ~50-200ms)
 *
 * Modell-Files: userData/ai-models/{sam2_encoder,sam2_decoder}.onnx
 * Quelle: onnx-community/sam2.1-hiera-tiny
 * Lizenz: Apache 2.0 (Meta SAM 2) — kostenlos, kommerziell OK.
 *
 * Tracking: Aktuell single-frame. Per-Frame-Tracking via Memory-Modul
 * folgt in Turn B (separate Models + Cache-System).
 */

import * as ort from 'onnxruntime-web';

export type MaskPoint = {
  x: number;          // 0..1 normalized image coords
  y: number;
  label: 0 | 1;       // 0 = exclude, 1 = include
};

export type SamMask = {
  width: number;
  height: number;
  /** Float32 sigmoid output 0..1; >0.5 = subject. */
  data: Float32Array;
};

const SAM_INPUT_SIZE = 1024;
// SAM 2 nutzt gleiche ImageNet-Normalisierung wie SAM 1
const PIXEL_MEAN = [123.675, 116.28, 103.53];
const PIXEL_STD  = [58.395, 57.12, 57.375];

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;
let runtimeConfigured = false;

function configureRuntime() {
  if (runtimeConfigured) return;
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
  ort.env.wasm.simd = true;
  // Absolute URL via window.location: Vite/ORT sieht keine relative Path → kein
  // Module-Resolver-Conflict. Funktioniert in dev (http://localhost:5173/onnx/)
  // und production (file:///dist/onnx/).
  const baseUrl = new URL('./onnx/', window.location.href).href;
  ort.env.wasm.wasmPaths = baseUrl;
  console.log(`[ai-mask] wasmPaths = ${baseUrl}`);
  runtimeConfigured = true;
}

/**
 * Lädt encoder + decoder ONNX-Sessions via IPC (file:// im Renderer geht nicht zuverlässig).
 * Idempotent (cached). Bei Shape-Inference-Errors: Retry mit reduzierter Optimization.
 */
export async function loadModels(): Promise<void> {
  configureRuntime();
  const api = (window as any).api;
  if (!api) throw new Error('[ai-mask] window.api missing');

  // Hilft bei SAM 2 Modellen die mit dynamischen Shapes exportiert sind:
  // 'all'-Optimization triggert manchmal Shape-Inference-Errors.
  const tryLevels: Array<'all' | 'extended' | 'basic' | 'disabled'> = ['all', 'basic', 'disabled'];

  const loadModel = async (kind: 'encoder' | 'decoder'): Promise<ort.InferenceSession> => {
    const r = await api.invoke('aiMask.readModelBytes', { kind });
    if (!r.ok) throw new Error(`${kind} read failed: ${r.error}`);
    const bytes = new Uint8Array(r.data.bytes);
    const sizeMb = (r.data.size / 1024 / 1024).toFixed(1);
    console.log(`[ai-mask] loading ${kind} (${sizeMb} MB)…`);
    const t0 = performance.now();
    let lastError: any = null;
    for (const level of tryLevels) {
      try {
        const session = await ort.InferenceSession.create(bytes, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: level,
          enableCpuMemArena: level === 'all',
          enableMemPattern: level === 'all',
        });
        console.log(`[ai-mask] ${kind} loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s @ optLevel=${level} · inputs=${session.inputNames.join(',')} outputs=${session.outputNames.join(',')}`);
        return session;
      } catch (err: any) {
        console.warn(`[ai-mask] ${kind} load failed @ optLevel=${level}: ${err?.message}`);
        lastError = err;
      }
    }
    // Spezifischer Fehler bei Shape-Inference-Problemen → Model ist ORT-Web inkompatibel
    const msg = String(lastError?.message ?? '');
    if (msg.includes('ShapeInferenceError') || msg.includes('Mismatch between number of inferred')) {
      const e = new Error(`SAM_INCOMPATIBLE: ${kind} ONNX has shape-inference issues that ORT-Web can't handle. Run "Reset Models" + download SAM 1 instead.`);
      (e as any).code = 'SAM_INCOMPATIBLE';
      throw e;
    }
    throw new Error(`${kind} load failed at all optimization levels: ${lastError?.message}`);
  };

  if (!encoderSession) encoderSession = await loadModel('encoder');
  if (!decoderSession) decoderSession = await loadModel('decoder');
}

export function isLoaded(): boolean {
  return !!encoderSession && !!decoderSession;
}

/**
 * Resize + Normalize Image für SAM-Encoder.
 * SAM erwartet 1024x1024 mit longest-side-resize + zero-padding (rechts/unten).
 * Returns: Float32Array NCHW [1,3,1024,1024] und scale (für mask-postprocess).
 */
function preprocessImage(img: ImageData): { tensor: Float32Array; scale: number; padW: number; padH: number; origW: number; origH: number } {
  const origW = img.width;
  const origH = img.height;
  const scale = SAM_INPUT_SIZE / Math.max(origW, origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);

  // Resize via Canvas (browser-native, schnell)
  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d')!;
  // ImageData → Image-Bitmap → drawImage mit resize
  const tmp = document.createElement('canvas');
  tmp.width = origW;
  tmp.height = origH;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, newW, newH);
  const resized = ctx.getImageData(0, 0, newW, newH);

  // Allocate 1024x1024x3 padded with zeros, fill with normalized resized image (RGB)
  const tensor = new Float32Array(SAM_INPUT_SIZE * SAM_INPUT_SIZE * 3);
  // NCHW: channel-first
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const srcIdx = (y * newW + x) * 4;
      const r = resized.data[srcIdx];
      const g = resized.data[srcIdx + 1];
      const b = resized.data[srcIdx + 2];
      // Normalize: (px - mean) / std
      const rN = (r - PIXEL_MEAN[0]) / PIXEL_STD[0];
      const gN = (g - PIXEL_MEAN[1]) / PIXEL_STD[1];
      const bN = (b - PIXEL_MEAN[2]) / PIXEL_STD[2];
      // CHW indices
      const planeSize = SAM_INPUT_SIZE * SAM_INPUT_SIZE;
      const baseIdx = y * SAM_INPUT_SIZE + x;
      tensor[0 * planeSize + baseIdx] = rN;
      tensor[1 * planeSize + baseIdx] = gN;
      tensor[2 * planeSize + baseIdx] = bN;
    }
  }
  return { tensor, scale, padW: SAM_INPUT_SIZE - newW, padH: SAM_INPUT_SIZE - newH, origW, origH };
}

export interface EncodedFrame {
  /** Alle Encoder-Outputs (Name → Tensor) — für flexibles Decoder-Mapping.
      SAM 2 Hiera hat: image_embeddings + high_res_features1 + high_res_features2. */
  outputs: Record<string, ort.Tensor>;
  scale: number;
  origW: number;
  origH: number;
}

export async function encodeImage(imageData: ImageData): Promise<EncodedFrame> {
  if (!encoderSession) throw new Error('[ai-mask] encoder not loaded');

  const t0 = performance.now();
  const { tensor, scale, origW, origH } = preprocessImage(imageData);
  const inputTensor = new ort.Tensor('float32', tensor, [1, 3, SAM_INPUT_SIZE, SAM_INPUT_SIZE]);

  const inputName = encoderSession.inputNames[0];
  const result = await encoderSession.run({ [inputName]: inputTensor });

  // Alle Outputs in dict speichern — Decoder kann später passende auswählen
  const outputs: Record<string, ort.Tensor> = {};
  for (const name of encoderSession.outputNames) {
    if (result[name]) outputs[name] = result[name];
  }
  const dimsInfo = Object.entries(outputs)
    .map(([n, t]) => `${n}=[${t.dims.join(',')}]`).join(' ');
  console.log(`[ai-mask] encoded in ${((performance.now() - t0) / 1000).toFixed(2)}s · ${dimsInfo}`);
  return { outputs, scale, origW, origH };
}

export async function generateMask(
  encoded: EncodedFrame,
  points: MaskPoint[],
): Promise<SamMask | null> {
  if (!decoderSession) throw new Error('[ai-mask] decoder not loaded');
  if (points.length === 0) return null;

  // Convert click-points (image-relative 0..1) to SAM-input-coords (0..1024 nach scale).
  const numPts = points.length;
  const coordsArr = new Float32Array(numPts * 2);
  // Xenova SAM erwartet int64 für input_labels — BigInt64Array.
  const labelsArr = new BigInt64Array(numPts);
  for (let i = 0; i < numPts; i++) {
    const p = points[i];
    coordsArr[i * 2 + 0] = p.x * encoded.origW * encoded.scale;
    coordsArr[i * 2 + 1] = p.y * encoded.origH * encoded.scale;
    labelsArr[i] = BigInt(p.label);
  }

  // SAM Decoder Inputs (Xenova-Variante):
  //   image_embeddings: encoder-output
  //   point_coords:    [1, N, 2]
  //   point_labels:    [1, N]
  //   mask_input:      [1, 1, 256, 256] zeros (no previous mask)
  //   has_mask_input:  [1] = 0
  //   image_size?:     manche Varianten brauchen orig_im_size
  // Xenova SAM erwartet rank-4 input_points [batch, num_inputs, num_points, 2]
  // und rank-3 input_labels [batch, num_inputs, num_points].
  const pointCoords = new ort.Tensor('float32', coordsArr, [1, 1, numPts, 2]);
  const pointLabels = new ort.Tensor('int64', labelsArr, [1, 1, numPts]);
  // 4D mask_input: [1, 1, 256, 256] zeros
  const maskInput   = new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]);
  const hasMask     = new ort.Tensor('float32', new Float32Array([0]), [1]);

  // Decoder-Input-Mapping. SAM 2 Hiera hat:
  //   image_embeddings, high_res_features1, high_res_features2,
  //   point_coords, point_labels, mask_input, has_mask_input, orig_im_size
  // Strategy: erst direkt nach Name in Encoder-Outputs schauen (image_embeddings,
  // high_res_features...), dann Pattern-Match für Prompt-Inputs.
  const inputs: Record<string, ort.Tensor> = {};
  for (const name of decoderSession.inputNames) {
    // 1) Direct match aus Encoder-Outputs (image_embeddings, high_res_features1, etc.)
    if (encoded.outputs[name]) {
      inputs[name] = encoded.outputs[name];
      continue;
    }
    const lower = name.toLowerCase();
    // 2) Fuzzy match for Encoder-derived Tensors
    if (lower.includes('high_res') || lower.includes('vision_feat')) {
      // Find matching encoder output by partial name
      const match = Object.entries(encoded.outputs).find(([n]) =>
        n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()));
      if (match) inputs[name] = match[1];
    }
    else if (lower.includes('image_embed') || lower === 'embed') {
      const e = encoded.outputs['image_embeddings'] || Object.values(encoded.outputs)[0];
      if (e) inputs[name] = e;
    }
    // 3) Prompt-Inputs (Points/Labels/Masks)
    else if (lower.includes('point') || lower.includes('coord')) {
      inputs[name] = pointCoords;
    }
    else if (lower.includes('label')) {
      inputs[name] = pointLabels;
    }
    else if (lower.includes('mask') && !lower.includes('has')) {
      inputs[name] = maskInput;
    }
    else if (lower.includes('has')) {
      inputs[name] = hasMask;
    }
    else if (lower.includes('size') || lower.includes('orig_im')) {
      const size = new ort.Tensor('int64', new BigInt64Array([BigInt(encoded.origH), BigInt(encoded.origW)]), [2]);
      inputs[name] = size;
    }
  }

  console.log(`[ai-mask] decoder inputs needed: ${decoderSession.inputNames.join(',')} | mapped: ${Object.keys(inputs).join(',')}`);
  const missing = decoderSession.inputNames.filter((n) => !(n in inputs));
  if (missing.length > 0) {
    console.warn(`[ai-mask] missing decoder inputs: ${missing.join(',')} — generating defaults`);
    for (const name of missing) {
      const lower = name.toLowerCase();
      // Xenova hat manchmal 'has_input_masks' als Boolean-Flag
      if (lower.includes('has')) {
        inputs[name] = new ort.Tensor('float32', new Float32Array([0]), [1]);
      } else {
        // Last resort: zeros mit shape inferred (beibei wir versuchen das zu vermeiden)
        console.error(`[ai-mask] no fallback for input '${name}' — decoder will throw`);
      }
    }
  }

  const t0 = performance.now();
  const result = await decoderSession.run(inputs);
  console.log(`[ai-mask] decoded in ${((performance.now() - t0) / 1000).toFixed(2)}s`);

  // Output-Namen variieren: 'masks'/'pred_masks' und 'iou_predictions'/'iou_scores'.
  console.log(`[ai-mask] decoder outputs: ${decoderSession.outputNames.join(',')}`);
  const masksOutput = result['pred_masks'] || result['masks'] || result[decoderSession.outputNames[0]];
  if (!masksOutput) {
    console.error(`[ai-mask] no mask output found in:`, decoderSession.outputNames);
    return null;
  }

  // Shape kann 4D [B, num_outputs, H, W] oder 5D [B, num_inputs, num_outputs, H, W] sein
  const dims = masksOutput.dims;
  const maskH = dims[dims.length - 2];
  const maskW = dims[dims.length - 1];
  const numMasks = dims[dims.length - 3] ?? 1;
  const data = masksOutput.data as Float32Array;
  console.log(`[ai-mask] mask output shape=[${dims.join(',')}] → ${numMasks} mask(s) at ${maskW}x${maskH}, ${data.length} float values`);

  // SAM gibt 3 Mask-Varianten (small/medium/large für Click-Ambiguity).
  // Strategy: HÖCHSTE IoU picken — SAM's own confidence ist meist richtig.
  // Plus: Filter zu kleine (<2%) und zu große (>85%) raus damit weder noise
  // noch "alles ist subject" gewinnt.
  const planeSize0 = maskH * maskW;
  const iouOut = result['iou_scores'] || result['iou_predictions'];
  const iou = iouOut ? Array.from(iouOut.data as Float32Array) : null;
  const areas: number[] = [];
  for (let i = 0; i < numMasks; i++) {
    let a = 0;
    for (let p = 0; p < planeSize0; p++) if (data[i * planeSize0 + p] > 0) a++;
    areas.push(a);
  }
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < numMasks; i++) {
    const areaPct = areas[i] / planeSize0;
    // Filter: realistic-sized masks (2-85% of frame)
    if (areaPct < 0.02 || areaPct > 0.85) continue;
    const score = iou ? iou[i] : -i;  // mit IoU: höchste; ohne: idx 0
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  console.log(`[ai-mask] mask candidates: iou=[${iou?.map((v) => v.toFixed(3)).join(',') ?? '?'}] areas=[${areas.map((a) => (a / planeSize0 * 100).toFixed(1) + '%').join(',')}] picked idx=${bestIdx} (highest IoU within 2-85% range)`);

  const planeSize = maskH * maskW;
  const start = bestIdx * planeSize;

  // CROP zur unpadded Image-Region: SAM padded das Image rechts/unten mit zeros,
  // also bezieht sich das Output-Mask aufs gepaddete 1024x1024. Wir wollen nur
  // den Bereich der dem Original-Image entspricht.
  const maskScaleFactor = maskW / SAM_INPUT_SIZE;  // 256/1024 = 0.25
  const cropW = Math.max(1, Math.round(encoded.origW * encoded.scale * maskScaleFactor));
  const cropH = Math.max(1, Math.round(encoded.origH * encoded.scale * maskScaleFactor));

  const maskPlane = new Float32Array(cropW * cropH);
  let aboveThreshold = 0;
  let maxLogit = -Infinity, minLogit = Infinity;
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = start + y * maskW + x;
      const dstIdx = y * cropW + x;
      const logit = data[srcIdx];
      if (logit > maxLogit) maxLogit = logit;
      if (logit < minLogit) minLogit = logit;
      const s = 1 / (1 + Math.exp(-logit));
      maskPlane[dstIdx] = s;
      if (s > 0.5) aboveThreshold++;
    }
  }
  const totalPx = cropW * cropH;
  const pct = (aboveThreshold / totalPx * 100).toFixed(1);
  console.log(`[ai-mask] cropped mask ${cropW}x${cropH} (from ${maskW}x${maskH}) · ${pct}% above threshold · logit range [${minLogit.toFixed(2)}..${maxLogit.toFixed(2)}]`);
  return { width: cropW, height: cropH, data: maskPlane };
}

export function unloadModels() {
  encoderSession?.release();
  decoderSession?.release();
  encoderSession = null;
  decoderSession = null;
}

/**
 * Simple template-matching click tracker.
 * Suche im neuen Frame in einem Window um (lastX, lastY) den Patch der dem
 * Patch im prev Frame um (lastX, lastY) am ähnlichsten ist (SAD = sum of abs differences).
 * Returns: neue Position des Click-Punkts.
 *
 * Performance: O(searchRadius² × patchSize²). Mit patchSize=31, searchRadius=30
 * ≈ 60 × 60 × 31 × 31 = 3.5M ops/point/frame — schnell in JS (~50ms).
 */
function trackPoint(
  prev: ImageData,
  curr: ImageData,
  lastX: number,
  lastY: number,
  patchSize = 31,
  searchRadius = 30,
): { x: number; y: number } {
  const W = prev.width, H = prev.height;
  const half = (patchSize - 1) >> 1;
  // Bounds-Check für patch-Edge
  const px0 = Math.max(half, Math.min(W - half - 1, lastX));
  const py0 = Math.max(half, Math.min(H - half - 1, lastY));

  let bestSAD = Infinity;
  let bestX = px0;
  let bestY = py0;

  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    const cy = py0 + dy;
    if (cy - half < 0 || cy + half >= H) continue;
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const cx = px0 + dx;
      if (cx - half < 0 || cx + half >= W) continue;

      // SAD über das Patch (RGB, alpha ignored). Early-out wenn schon worse.
      let sad = 0;
      outer: for (let py = -half; py <= half; py++) {
        const prevRow = (py0 + py) * W;
        const currRow = (cy + py) * W;
        for (let px = -half; px <= half; px++) {
          const prevIdx = (prevRow + (px0 + px)) * 4;
          const currIdx = (currRow + (cx + px)) * 4;
          sad += Math.abs(prev.data[prevIdx]     - curr.data[currIdx])
              +  Math.abs(prev.data[prevIdx + 1] - curr.data[currIdx + 1])
              +  Math.abs(prev.data[prevIdx + 2] - curr.data[currIdx + 2]);
          if (sad >= bestSAD) break outer;
        }
      }

      if (sad < bestSAD) {
        bestSAD = sad;
        bestX = cx;
        bestY = cy;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/**
 * Per-Frame-Tracking: seekt durch das Video in samplingFps-Schritten,
 * encodet jeden Frame, decodet mit den gleichen Click-Points → Mask pro Frame.
 *
 * Slow: ~2-3s pro Frame (encoder ist heavy). Für 5s Clip @ 2fps = 10 frames = ~20-30s.
 * Echtes SAM-2-Tracking via memory_attention bräuchte separate ONNX-Module
 * — diese Methode hier ist "naive" frame-by-frame inference.
 */
export async function trackFrames(
  videoEl: HTMLVideoElement,
  points: MaskPoint[],
  sourceStart: number,        // Trim-Start im Source-Video (Sekunden)
  clipDuration: number,       // Display-Dauer auf Timeline
  samplingFps: number,        // 1..10
  onProgress?: (current: number, total: number) => void,
  cancelled?: () => boolean,
): Promise<Array<{ time: number; mask: SamMask }>> {
  if (!encoderSession || !decoderSession) throw new Error('[ai-mask] models not loaded');

  const stepSec = 1 / Math.max(0.5, Math.min(10, samplingFps));
  const totalFrames = Math.ceil(clipDuration / stepSec);
  const frames: Array<{ time: number; mask: SamMask }> = [];

  // Pause damit seeken klappt
  const wasPlaying = !videoEl.paused;
  videoEl.pause();

  // Click-Tracking: Template-Match-Patch um jeden Punkt von Frame zu Frame mitziehen.
  // Ohne das masked SAM bei jedem Frame nur den (statischen) Pixel an der ursprünglichen
  // Position — wenn Subject sich bewegt verlieren wir es.
  const trackedPoints = points.map((p) => ({ ...p }));  // mutable copies
  let prevImageData: ImageData | null = null;

  for (let i = 0; i < totalFrames; i++) {
    if (cancelled?.()) {
      console.log(`[ai-mask] tracking cancelled at frame ${i}/${totalFrames}`);
      break;
    }
    const clipTime = i * stepSec;
    const sourceTime = sourceStart + clipTime;

    // Robustes Seek: erst Listener attachen, DANN currentTime setzen.
    // Plus: nach 'seeked' noch 2× requestAnimationFrame warten damit der Browser
    // den neuen Frame tatsächlich gemalt hat (sonst capturet drawImage den OLD frame).
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        videoEl.removeEventListener('seeked', onSeeked);
        videoEl.removeEventListener('error', onErr);
        clearTimeout(timer);
        resolve();
      };
      const onSeeked = () => finish();
      const onErr = () => finish();
      videoEl.addEventListener('seeked', onSeeked);
      videoEl.addEventListener('error', onErr);
      const timer = setTimeout(finish, 5000);  // safety 5s
      videoEl.currentTime = sourceTime;
    });
    // 2 Animation-Frames warten — der Browser hat dann den seeked frame gepainted
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Sanity check: video sollte jetzt at sourceTime stehen
    const actualT = videoEl.currentTime;
    if (Math.abs(actualT - sourceTime) > 0.5) {
      console.warn(`[ai-mask] seek mismatch: wanted=${sourceTime.toFixed(2)} actual=${actualT.toFixed(2)}`);
    }

    // Capture frame
    const tmp = document.createElement('canvas');
    tmp.width = videoEl.videoWidth;
    tmp.height = videoEl.videoHeight;
    tmp.getContext('2d')!.drawImage(videoEl, 0, 0);
    const imgData = tmp.getContext('2d')!.getImageData(0, 0, tmp.width, tmp.height);

    // Click-Punkte mittracken via Template-Matching (außer beim ersten Frame)
    if (prevImageData && i > 0) {
      for (const pt of trackedPoints) {
        const px = Math.round(pt.x * imgData.width);
        const py = Math.round(pt.y * imgData.height);
        const newPos = trackPoint(prevImageData, imgData, px, py);
        pt.x = newPos.x / imgData.width;
        pt.y = newPos.y / imgData.height;
      }
    }
    prevImageData = imgData;

    // Encode + decode mit den (eventuell verschobenen) Tracking-Punkten
    const encoded = await encodeImage(imgData);
    const mask = await generateMask(encoded, trackedPoints);
    if (mask) {
      frames.push({ time: clipTime, mask });
      const ptStr = trackedPoints.map((p) => `(${(p.x * 100).toFixed(0)},${(p.y * 100).toFixed(0)})`).join(' ');
      // Mid-Pixel als Signature (statt Corner = meist 0)
      const midIdx = Math.floor(mask.data.length / 2);
      const sig = `${mask.data[midIdx].toFixed(2)},${mask.data[midIdx + 100].toFixed(2)}`;
      console.log(`[ai-mask] frame ${i + 1}/${totalFrames} t=${clipTime.toFixed(2)}s pts=${ptStr} mid=[${sig}]`);
    }

    onProgress?.(i + 1, totalFrames);
  }

  if (wasPlaying) videoEl.play().catch(() => {});
  console.log(`[ai-mask] tracking done: ${frames.length} frames captured`);
  return frames;
}

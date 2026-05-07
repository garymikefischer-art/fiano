import path from 'node:path';
import fs from 'node:fs/promises';
import type { Highlight } from '@shared/types';
import { renderMasterClip, getDuration } from '../ffmpeg';
import type { PipelineStep } from './types';

interface Input {
  sourcePath: string;
  highlights: Highlight[];
}

const MIN_CLIP_SEC = 1;
const MIN_OUTPUT_BYTES = 4096;

/**
 * Rendert für jedes Highlight einen 9:16 Clip mit FFmpeg (Center-Crop).
 * - Clamped start/end auf Source-Dauer (GPT spuckt manchmal end > duration)
 * - Skipped Clips < 1s
 * - Verifiziert dass Output-Datei tatsächlich existiert und Daten hat
 *   (FFmpeg kann mit exit 0 leere Files produzieren wenn Bounds schiefliegen)
 */
export const renderClipsStep: PipelineStep<Input, Highlight[]> = {
  name: 'render',
  async run({ sourcePath, highlights }, ctx) {
    if (highlights.length === 0) return [];

    const exportsDir = path.join(ctx.workDir, 'exports');
    await fs.rm(exportsDir, { recursive: true, force: true });
    await fs.mkdir(exportsDir, { recursive: true });

    let totalDuration = 0;
    try {
      totalDuration = await getDuration(sourcePath);
    } catch (err: any) {
      ctx.emit({ type: 'log', step: 'render', message: `Could not probe source duration: ${err?.message ?? err}` });
    }

    ctx.emit({
      type: 'log',
      step: 'render',
      message: `Source duration ${totalDuration.toFixed(1)}s, rendering ${highlights.length} clips`,
    });

    const result: Highlight[] = [];

    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const idx = String(i + 1).padStart(3, '0');
      const clipPath = path.join(exportsDir, `clip-${idx}.mp4`);

      // ─── Bounds clampen ────────────────────────────────────
      const safeStart = Math.max(0, h.start);
      const safeEnd   = totalDuration > 0 ? Math.min(totalDuration, h.end) : h.end;
      const safeDur   = safeEnd - safeStart;

      if (safeDur < MIN_CLIP_SEC) {
        ctx.emit({
          type: 'log',
          step: 'render',
          message: `Clip ${idx} skipped: duration ${safeDur.toFixed(2)}s too short (start=${h.start}, end=${h.end}, src=${totalDuration})`,
        });
        result.push({ ...h });
        emitProgress(ctx, i, highlights.length);
        continue;
      }

      // ─── Render ────────────────────────────────────────────
      ctx.emit({
        type: 'log',
        step: 'render',
        message: `Rendering ${idx} (${safeStart.toFixed(1)}–${safeEnd.toFixed(1)}s, ${safeDur.toFixed(1)}s)`,
      });

      try {
        await renderMasterClip(sourcePath, clipPath, safeStart, safeDur, ctx);

        // Output verifizieren – FFmpeg kann mit exit 0 leeren Output erzeugen
        const stat = await fs.stat(clipPath).catch(() => null);
        if (!stat || stat.size < MIN_OUTPUT_BYTES) {
          throw new Error(`output file empty or missing (${stat?.size ?? 0} bytes)`);
        }

        ctx.emit({
          type: 'log',
          step: 'render',
          message: `Clip ${idx} OK (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
        });
        result.push({ ...h, clipPath });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error(`[render] clip ${idx} failed:`, msg);
        ctx.emit({ type: 'log', step: 'render', message: `Clip ${idx} FAILED: ${msg}` });
        // Tote Datei aufräumen falls vorhanden
        await fs.rm(clipPath, { force: true }).catch(() => {});
        result.push({ ...h });
      }

      emitProgress(ctx, i, highlights.length);
    }

    const success = result.filter((h) => h.clipPath).length;
    ctx.emit({
      type: 'log',
      step: 'render',
      message: `Render done: ${success}/${highlights.length} successful`,
    });

    return result;
  },
};

function emitProgress(ctx: { emit: (e: any) => void }, i: number, total: number) {
  ctx.emit({
    type: 'progress',
    step: 'render',
    percent: Math.round(((i + 1) / total) * 100),
  });
}

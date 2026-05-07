import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { resolveBin } from '../bin';
import type { JobContext, PipelineStep } from './types';

interface Input { source: { kind: 'file' | 'url'; value: string } }

/** Lädt YouTube/Twitch-Video via yt-dlp herunter, oder nutzt lokale Datei direkt. */
export const downloadStep: PipelineStep<Input, { sourcePath: string }> = {
  name: 'download',
  async run({ source }, ctx: JobContext) {
    if (source.kind === 'file') {
      ctx.emit({ type: 'log', step: 'download', message: `Using local file: ${source.value}` });
      ctx.emit({ type: 'progress', step: 'download', percent: 100 });
      return { sourcePath: source.value };
    }

    const bin = resolveBin('yt-dlp');
    if (!bin) throw new Error('yt-dlp not found. Install via: brew install yt-dlp');

    const out = path.join(ctx.workDir, 'source.mp4');
    ctx.emit({ type: 'log', step: 'download', message: `yt-dlp ${source.value}` });

    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        bin,
        [
          '-f', 'bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b',
          '--merge-output-format', 'mp4',
          '--no-playlist',
          '--newline',
          '-o', out,
          source.value,
        ],
        { signal: ctx.signal },
      );

      let lastErr = '';
      p.stdout.on('data', (b: Buffer) => {
        for (const line of b.toString().split('\n')) {
          // [download]   3.5% of  45.20MiB at  3.20MiB/s ETA 00:13
          const m = line.match(/\[download\]\s+(\d+\.?\d*)%/);
          if (m) {
            ctx.emit({ type: 'progress', step: 'download', percent: parseFloat(m[1]) });
          }
        }
      });
      p.stderr.on('data', (b: Buffer) => { lastErr = b.toString().slice(-400); });

      p.on('error', reject);
      p.on('exit', (code) => {
        if (code === 0 && fs.existsSync(out)) resolve();
        else reject(new Error(`yt-dlp failed (exit ${code}): ${lastErr.trim()}`));
      });
    });

    ctx.emit({ type: 'progress', step: 'download', percent: 100 });
    return { sourcePath: out };
  },
};

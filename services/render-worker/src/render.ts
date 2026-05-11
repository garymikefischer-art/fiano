/**
 * FFmpeg-Runner — spawnt `ffmpeg ${args}` und streamt stderr für Progress-Logging.
 *
 * Args müssen kompatibel zu shared/ffmpegArgs.ts sein. Mobile baut die Args
 * mit `{SRC}` und `{DST}` als Platzhalter, der Server ersetzt sie mit echten
 * tmp-Pfaden.
 *
 * Hard cap auf maxDurationSec falls FFmpeg hängt — wir wollen keine zombie
 * Container auf Cloud Run.
 */

import { spawn } from 'node:child_process';

export interface RunOpts {
  jobId: string;
  /** Maximale Laufzeit; danach SIGKILL. Default 300s. */
  maxDurationSec?: number;
}

export async function runFFmpeg(args: string[], opts: RunOpts): Promise<void> {
  const maxSec = opts.maxDurationSec ?? 300;
  const jobId = opts.jobId;

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrTail = ''; // letzte ~4KB für Error-Diagnose
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      console.warn(`[${jobId}] ffmpeg timeout after ${maxSec}s → SIGKILL`);
      proc.kill('SIGKILL');
    }, maxSec * 1000);

    proc.stderr.on('data', (chunk: Buffer) => {
      const txt = chunk.toString('utf8');
      stderrTail = (stderrTail + txt).slice(-4096);
      // Parse `time=HH:MM:SS.cc` für Progress-Log (alle ~5s ein Log).
      const m = /time=(\d+):(\d+):(\d+)\.(\d+)/.exec(txt);
      if (m) {
        const sec = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
        if (Math.floor(sec) % 5 === 0) {
          console.log(`[${jobId}] progress t=${sec.toFixed(1)}s`);
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error(`ffmpeg killed after ${maxSec}s timeout`));
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        // Letzte Zeilen für Diagnose extrahieren — full stderr wäre zu groß.
        const lines = stderrTail.split('\n').slice(-15).join('\n');
        reject(new Error(`ffmpeg exited with code ${code}:\n${lines}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}

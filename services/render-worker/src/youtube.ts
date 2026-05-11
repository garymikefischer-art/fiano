/**
 * yt-dlp Runner (Phase 9.5.7) — downloaded YouTube / Twitch Videos via das
 * yt-dlp binary (installed in Dockerfile).
 *
 * Output: mp4-File (max 1080p — Server-Cost budget). Probe-Step gibt Duration
 * via ffprobe; Title kommt aus yt-dlp's `--print after_video:%(title)s`-Output
 * (stdout-only, sauber von Download-Progress getrennt).
 *
 * Hard cap auf maxDurationSec falls yt-dlp hängt (network slow, format-merge
 * stalls). Default 480s — Cloud-Run-Limit ist 600s.
 */

import { spawn } from 'node:child_process';
import { stat, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface YtDownloadOpts {
  url: string;
  outputPath: string;
  jobId: string;
  maxDurationSec?: number;
  /** Optionale Netscape cookies.txt-Format Cookies vom User (Phase 9.5.8.2).
   *  Wenn gesetzt → tempfile schreiben + yt-dlp --cookies. Bypass-Mechanismus
   *  für YouTube Bot-Detection ohne den der Server-Download oft blocked. */
  cookies?: string;
}

export interface YtDownloadResult {
  filePath: string;
  durationSec: number;
  title: string;
  sizeBytes: number;
}

const ALLOWED_HOST_RX = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be|twitch\.tv)\//i;

export function isAllowedUrl(url: string): boolean {
  return ALLOWED_HOST_RX.test(url.trim());
}

export async function downloadVideo(opts: YtDownloadOpts): Promise<YtDownloadResult> {
  const maxSec = opts.maxDurationSec ?? 480;
  const jobId = opts.jobId;

  if (!isAllowedUrl(opts.url)) {
    throw new Error('Only YouTube and Twitch URLs are supported');
  }

  // Cookie-File schreiben falls vom User mitgegeben (Phase 9.5.8.2).
  // Netscape cookies.txt-Format wird direkt durchgereicht. Tempfile wird
  // nach Download (oder Error) gelöscht.
  let cookieFile: string | null = null;
  if (opts.cookies && opts.cookies.length > 0) {
    cookieFile = path.join(tmpdir(), `${opts.jobId}-cookies.txt`);
    let content = opts.cookies;
    // yt-dlp ist sehr streng — Header-Zeile muss erste Zeile sein.
    if (!content.startsWith('# Netscape HTTP Cookie File')) {
      content = `# Netscape HTTP Cookie File\n${content}`;
    }
    await writeFile(cookieFile, content, { mode: 0o600 });
    console.log(`[${opts.jobId}] yt-dlp using user cookies (${content.length} bytes)`);
  }

  // Format-Selektor:
  //   bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a] → merge via ffmpeg
  //   fallback best[height<=1080][ext=mp4] (progressive mp4 wenn DASH nicht da)
  //   fallback best (worst case any format)
  // --max-filesize 500M = Schutz vor 4k-2h-Videos die /tmp füllen.
  // --no-playlist = bei URL einer Playlist-Item nur dieses Video.
  // --print after_video:%(title)s = sauberer Title-Output nach Success.
  //
  // Phase 9.5.8.1 YouTube-Bot-Detection-Workaround:
  // YouTube blockt seit Mitte 2024 yt-dlp ohne Auth aggressiv ("Sign in to confirm").
  // Workaround: `tv_embedded` + `web` Player-Clients haben weniger Bot-Checks als
  // der default `android`-Client. Plus desktop user-agent.
  // Phase 9.5.8.2: zusätzlich --cookies wenn User welche bereitgestellt hat.
  const args = [
    '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--max-filesize', '500M',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=tv_embedded,web,default',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(cookieFile ? ['--cookies', cookieFile] : []),
    '-o', opts.outputPath,
    '--print', 'after_video:%(title)s',
    opts.url,
  ];

  console.log(`[${jobId}] yt-dlp start url=${opts.url}`);

  let stdoutBuf = '';
  let stderrTail = '';
  let killed = false;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const timeout = setTimeout(() => {
      killed = true;
      console.warn(`[${jobId}] yt-dlp timeout after ${maxSec}s → SIGKILL`);
      proc.kill('SIGKILL');
    }, maxSec * 1000);

    proc.stdout.on('data', (c: Buffer) => {
      stdoutBuf += c.toString('utf8');
    });
    proc.stderr.on('data', (c: Buffer) => {
      stderrTail = (stderrTail + c.toString('utf8')).slice(-4096);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (killed) {
        reject(new Error(`yt-dlp killed after ${maxSec}s timeout`));
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        const lines = stderrTail.split('\n').slice(-12).join('\n');
        // User-friendly hints für bekannte Failure-Modi.
        let userMsg: string;
        if (/sign in to confirm|cookies|bot/i.test(lines)) {
          userMsg = 'YouTube blocked the download (bot-detection). Try a Twitch URL or download the video locally and use Single video file.';
        } else if (/private video|members[- ]only/i.test(lines)) {
          userMsg = 'Video is private or members-only.';
        } else if (/copyright|removed|unavailable/i.test(lines)) {
          userMsg = 'Video is unavailable (removed/copyright/region-locked).';
        } else if (/unable to extract|incomplete data/i.test(lines)) {
          userMsg = 'Could not extract this video — yt-dlp may need an update.';
        } else {
          userMsg = `yt-dlp exited with code ${code}:\n${lines}`;
        }
        reject(new Error(userMsg));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`yt-dlp spawn failed: ${err.message}`));
    });
  });

  // Title ist die letzte non-empty Zeile von stdout (after_video-Print kommt am Ende).
  const title = stdoutBuf
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop() ?? '';

  const durationSec = await probeDuration(opts.outputPath);
  const stats = await stat(opts.outputPath);
  console.log(`[${jobId}] yt-dlp done size=${stats.size} dur=${durationSec.toFixed(1)}s title="${title.slice(0, 60)}"`);

  // Cookie-Tempfile cleanup (success-path).
  if (cookieFile) {
    await unlink(cookieFile).catch(() => {});
  }

  return {
    filePath: opts.outputPath,
    durationSec,
    title: title.slice(0, 200),
    sizeBytes: stats.size,
  };
}

async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    proc.stdout.on('data', (c) => {
      out += c.toString();
    });
    proc.on('close', () => {
      const dur = parseFloat(out.trim());
      resolve(Number.isFinite(dur) ? dur : 0);
    });
    proc.on('error', () => resolve(0));
  });
}

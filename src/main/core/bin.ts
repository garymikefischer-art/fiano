import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

export type BinName = 'ffmpeg' | 'ffprobe' | 'yt-dlp';

const ext = process.platform === 'win32' ? '.exe' : '';

function bundledPath(name: BinName): string | null {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(__dirname, '../../../resources/bin', platform);
  const candidate = path.join(dir, name + ext);
  return fs.existsSync(candidate) ? candidate : null;
}

function systemPath(name: BinName): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0];
    return result && fs.existsSync(result) ? result : null;
  } catch {
    return null;
  }
}

/**
 * Liefert ALLE plausiblen ffmpeg-Pfade auf macOS — inkl. Homebrew-Cellar (ffmpeg + ffmpeg-full).
 * Wir probieren später jeden auf libass und nehmen den besten.
 */
function findAllFfmpegCandidates(): string[] {
  const out = new Set<string>();
  // Standard PATH lookup
  const fromPath = systemPath('ffmpeg');
  if (fromPath) out.add(fromPath);
  // Bundled
  const bundled = bundledPath('ffmpeg');
  if (bundled) out.add(bundled);
  // Bekannte Homebrew-Locations (Apple Silicon + Intel)
  const known = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg-full',
    '/usr/local/bin/ffmpeg-full',
    '/opt/homebrew/opt/ffmpeg/bin/ffmpeg',
    '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  ];
  for (const p of known) if (fs.existsSync(p)) out.add(p);
  // Cellar-Versionen (glob-artig — wir scannen Verzeichnisse)
  for (const formula of ['ffmpeg', 'ffmpeg-full']) {
    for (const cellar of ['/opt/homebrew/Cellar', '/usr/local/Cellar']) {
      const root = `${cellar}/${formula}`;
      try {
        if (fs.existsSync(root)) {
          for (const v of fs.readdirSync(root)) {
            const bin = `${root}/${v}/bin/ffmpeg`;
            if (fs.existsSync(bin)) out.add(bin);
          }
        }
      } catch {}
    }
  }
  return Array.from(out);
}

/** Probt ob ein FFmpeg-Binary den `subtitles`-Filter (libass) UND `drawtext` (libfreetype) hat. */
export function probeFfmpegFeatures(bin: string): { libass: boolean; drawtext: boolean; version: string } {
  let libass = false;
  let drawtext = false;
  let version = '';
  try {
    const filters = execSync(`"${bin}" -hide_banner -filters`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    libass   = /^\s*[A-Z\.]{2,3}\s+subtitles\s+/m.test(filters);
    drawtext = /^\s*[A-Z\.]{2,3}\s+drawtext\s+/m.test(filters);
  } catch {}
  try {
    const ver = execSync(`"${bin}" -hide_banner -version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    version = ver.split('\n')[0].replace('ffmpeg version ', '').slice(0, 60);
  } catch {}
  return { libass, drawtext, version };
}

/** Diagnostik aller gefundenen ffmpeg-Binaries — für Settings UI. */
export interface FfmpegInstall {
  path: string;
  libass: boolean;
  drawtext: boolean;
  version: string;
  isActive: boolean;
}

const cache = new Map<BinName, string | null>();
let ffmpegOverride: string | null = null;

/** Setzt einen User-Override für den ffmpeg-Pfad. Wird vor allen Auto-Lookups verwendet. */
export function setFfmpegOverride(override: string | null | undefined): void {
  ffmpegOverride = override && override.trim() && fs.existsSync(override.trim()) ? override.trim() : null;
  cache.delete('ffmpeg');
  cache.delete('ffprobe'); // ffprobe wird auch aus dem ffmpeg-Verzeichnis genommen
  if (ffmpegOverride) console.log(`[bin] ffmpeg override → ${ffmpegOverride}`);
  else if (override) console.warn(`[bin] ffmpeg override ignored (path missing): ${override}`);
}

/** Findet eine Binary: Override > bundled > Auto-Discover (libass-bevorzugt) > System-PATH. */
export function resolveBin(name: BinName): string | null {
  if (cache.has(name)) return cache.get(name)!;

  let resolved: string | null = null;

  if (name === 'ffmpeg' && ffmpegOverride) {
    resolved = ffmpegOverride;
  } else if (name === 'ffmpeg') {
    // Bundled bevorzugt, dann libass-fähigsten Kandidaten
    resolved = bundledPath(name);
    if (!resolved) {
      const candidates = findAllFfmpegCandidates();
      // Prefer einen mit libass (für Subtitle-Burn-In)
      for (const c of candidates) {
        const { libass } = probeFfmpegFeatures(c);
        if (libass) { resolved = c; break; }
      }
      // Fallback: erster Kandidat
      if (!resolved) resolved = candidates[0] ?? null;
    }
  } else if (name === 'ffprobe' && ffmpegOverride) {
    // ffprobe daneben suchen falls override gesetzt
    const dir = path.dirname(ffmpegOverride);
    const sib = path.join(dir, 'ffprobe' + ext);
    resolved = fs.existsSync(sib) ? sib : (bundledPath(name) ?? systemPath(name));
  } else {
    resolved = bundledPath(name) ?? systemPath(name);
  }

  cache.set(name, resolved);
  if (resolved) console.log(`[bin] ${name} → ${resolved}`);
  else console.warn(`[bin] ${name} NOT FOUND`);
  return resolved;
}

/** Liefert eine Diagnose-Liste aller gefundenen ffmpeg-Binaries mit ihren Features. */
export function getFfmpegDiagnostics(): FfmpegInstall[] {
  const active = resolveBin('ffmpeg');
  const candidates = findAllFfmpegCandidates();
  // Active sollte enthalten sein (kann override aus anderem Pfad sein)
  if (active && !candidates.includes(active)) candidates.unshift(active);
  return candidates.map((p) => ({
    path: p,
    isActive: p === active,
    ...probeFfmpegFeatures(p),
  }));
}

export interface BinaryStatus {
  name: BinName;
  path: string | null;
  installHint: string;
}

const HINTS: Record<BinName, string> = {
  ffmpeg: process.platform === 'darwin' ? 'brew install ffmpeg' : 'https://ffmpeg.org/download.html',
  ffprobe: process.platform === 'darwin' ? 'brew install ffmpeg' : 'https://ffmpeg.org/download.html',
  'yt-dlp': process.platform === 'darwin' ? 'brew install yt-dlp' : 'https://github.com/yt-dlp/yt-dlp#installation',
};

/** Forces re-probe — beim "Re-check"-Klick im UI nach brew install. */
export function clearBinaryCache(): void {
  cache.clear();
  console.log('[bin] cache cleared, next probe will re-detect');
}

export function checkBinaries(): BinaryStatus[] {
  return (['ffmpeg', 'ffprobe', 'yt-dlp'] as BinName[]).map((name) => ({
    name,
    path: resolveBin(name),
    installHint: HINTS[name],
  }));
}

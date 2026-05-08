import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';

/**
 * Phase 8 — Bundled-First Binary Resolution.
 *
 * Auflösungs-Reihenfolge:
 *   1. User Override (Settings → FFmpeg Diagnose → Manual)
 *   2. Bundled Binary aus extraResources/ (in production: process.resourcesPath/bin)
 *      bzw. resources/bin/{platform}/ (in dev)
 *   3. System-PATH / Homebrew (nur als letzter Fallback)
 *
 * macOS-Spezial:
 *   - Quarantine-Attribut wird beim ersten Resolve gestripped (sonst Gatekeeper-
 *     Block beim Launch der bundled FFmpeg-Binary)
 *   - chmod +x wird sichergestellt (extraResources verliert manchmal Permissions)
 *
 * yt-dlp-Spezial:
 *   - Wird beim ersten Run von resources/ nach userData/ kopiert. Dort ist es
 *     beschreibbar → yt-dlp -U funktioniert für Self-Update. Wenn updated, läuft
 *     der userData-Pfad an Stelle des bundled Pfads.
 */

export type BinName = 'ffmpeg' | 'ffprobe' | 'yt-dlp';

const ext = process.platform === 'win32' ? '.exe' : '';
const platformDir = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';

/* ─── Quarantine + Permissions (macOS) ────────────────────────────────── */

const quarantineCleared = new Set<string>();

/**
 * macOS: Strippt das `com.apple.quarantine` xattr von einer Binary die wir aus
 * extraResources extrahiert haben. Sonst killt Gatekeeper sie beim spawn.
 * Errors werden silent geschluckt — wenn xattr fehlt oder Datei schon clean
 * ist, ist alles in Ordnung.
 */
function stripQuarantineMac(binPath: string): void {
  if (process.platform !== 'darwin') return;
  if (quarantineCleared.has(binPath)) return;
  try {
    spawnSync('xattr', ['-d', 'com.apple.quarantine', binPath], { stdio: 'ignore' });
  } catch { /* ignore */ }
  // chmod +x — extraResources kann manchmal Bits verlieren, vor allem wenn
  // ZIP/asar-extraction die unix mode-bits nicht erhält.
  try {
    fs.chmodSync(binPath, 0o755);
  } catch { /* ignore */ }
  quarantineCleared.add(binPath);
}

/* ─── Pfad-Resolution ─────────────────────────────────────────────────── */

/**
 * Bundled-Pfad einer Binary. Production: process.resourcesPath/bin/.
 * Development: <repo>/resources/bin/{platform}/.
 */
function bundledPath(name: BinName): string | null {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(__dirname, '../../../resources/bin', platformDir);
  const candidate = path.join(dir, name + ext);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * yt-dlp Self-Update-Path: Erste Auflösung kopiert Binary nach userData,
 * dort ist sie beschreibbar für `yt-dlp -U`. Folge-Aufrufe nutzen den
 * userData-Pfad direkt. Wenn keine bundled Binary existiert → null.
 */
let ytDlpUserDataPath: string | null | undefined; // undefined = noch nicht initialisiert

function getYtDlpWritablePath(): string | null {
  if (ytDlpUserDataPath !== undefined) return ytDlpUserDataPath;
  const bundled = bundledPath('yt-dlp');
  if (!bundled) {
    ytDlpUserDataPath = null;
    return null;
  }
  try {
    const userData = app.getPath('userData');
    const target = path.join(userData, 'yt-dlp' + ext);
    if (!fs.existsSync(target)) {
      // First run — kopiere bundled → userData
      fs.copyFileSync(bundled, target);
      if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
      console.log(`[bin] yt-dlp: copied bundled → ${target} (writable for self-update)`);
    }
    ytDlpUserDataPath = target;
    return target;
  } catch (e) {
    console.warn(`[bin] yt-dlp userData copy failed, falling back to bundled:`, e);
    ytDlpUserDataPath = bundled;
    return bundled;
  }
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
 * Nur für die FFmpeg-Diagnose-Page in Settings. Production-resolution geht über bundled.
 */
function findAllFfmpegCandidates(): string[] {
  const out = new Set<string>();
  // Bundled (always preferred in display)
  const bundled = bundledPath('ffmpeg');
  if (bundled) out.add(bundled);
  // Standard PATH lookup
  const fromPath = systemPath('ffmpeg');
  if (fromPath) out.add(fromPath);
  if (process.platform === 'darwin') {
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
    // Cellar-Versionen
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
        } catch { /* ignore */ }
      }
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
  } catch { /* ignore */ }
  try {
    const ver = execSync(`"${bin}" -hide_banner -version`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    version = ver.split('\n')[0].replace('ffmpeg version ', '').slice(0, 60);
  } catch { /* ignore */ }
  return { libass, drawtext, version };
}

/** Diagnostik aller gefundenen ffmpeg-Binaries — für Settings UI. */
export interface FfmpegInstall {
  path: string;
  libass: boolean;
  drawtext: boolean;
  version: string;
  isActive: boolean;
  isBundled: boolean;
}

const cache = new Map<BinName, string | null>();
let ffmpegOverride: string | null = null;

/** Setzt einen User-Override für den ffmpeg-Pfad. Wird vor allen Auto-Lookups verwendet. */
export function setFfmpegOverride(override: string | null | undefined): void {
  ffmpegOverride = override && override.trim() && fs.existsSync(override.trim()) ? override.trim() : null;
  cache.delete('ffmpeg');
  cache.delete('ffprobe');
  if (ffmpegOverride) console.log(`[bin] ffmpeg override → ${ffmpegOverride}`);
  else if (override) console.warn(`[bin] ffmpeg override ignored (path missing): ${override}`);
}

/**
 * Findet eine Binary: Override > Bundled > System.
 * Bundled wird IMMER bevorzugt — bekannt-gut, libass+drawtext+freetype garantiert.
 */
export function resolveBin(name: BinName): string | null {
  if (cache.has(name)) return cache.get(name)!;

  let resolved: string | null = null;

  if (name === 'ffmpeg' && ffmpegOverride) {
    resolved = ffmpegOverride;
  } else if (name === 'ffmpeg') {
    // 1. Bundled — first priority
    resolved = bundledPath('ffmpeg');
    // 2. System fallback (PATH or Homebrew with libass)
    if (!resolved) {
      const candidates = findAllFfmpegCandidates();
      for (const c of candidates) {
        const { libass } = probeFfmpegFeatures(c);
        if (libass) { resolved = c; break; }
      }
      if (!resolved) resolved = candidates[0] ?? null;
    }
  } else if (name === 'ffprobe' && ffmpegOverride) {
    // ffprobe daneben suchen falls override gesetzt
    const dir = path.dirname(ffmpegOverride);
    const sib = path.join(dir, 'ffprobe' + ext);
    resolved = fs.existsSync(sib) ? sib : (bundledPath('ffprobe') ?? systemPath('ffprobe'));
  } else if (name === 'ffprobe') {
    resolved = bundledPath('ffprobe') ?? systemPath('ffprobe');
  } else if (name === 'yt-dlp') {
    // Special: writable userData copy → bundled fallback → system
    resolved = getYtDlpWritablePath() ?? bundledPath('yt-dlp') ?? systemPath('yt-dlp');
  }

  // macOS: Quarantine + chmod für bundled paths
  if (resolved && isBundledPath(resolved)) {
    stripQuarantineMac(resolved);
  }

  cache.set(name, resolved);
  if (resolved) {
    const tag = isBundledPath(resolved) ? '[bundled]' : isUserDataPath(resolved) ? '[userData]' : '[system]';
    console.log(`[bin] ${name} → ${resolved} ${tag}`);
  } else {
    console.warn(`[bin] ${name} NOT FOUND`);
  }
  return resolved;
}

/** Liefert true wenn der Pfad innerhalb der bundled-resources liegt. */
export function isBundledPath(p: string): boolean {
  if (!p) return false;
  const bundledRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(__dirname, '../../../resources/bin', platformDir);
  return p.startsWith(bundledRoot);
}

/** Liefert true wenn der Pfad in app.userData/ liegt (yt-dlp self-update target). */
function isUserDataPath(p: string): boolean {
  if (!p) return false;
  try {
    return p.startsWith(app.getPath('userData'));
  } catch {
    return false;
  }
}

/** Liefert eine Diagnose-Liste aller gefundenen ffmpeg-Binaries mit ihren Features. */
export function getFfmpegDiagnostics(): FfmpegInstall[] {
  const active = resolveBin('ffmpeg');
  const candidates = findAllFfmpegCandidates();
  if (active && !candidates.includes(active)) candidates.unshift(active);
  return candidates.map((p) => ({
    path: p,
    isActive: p === active,
    isBundled: isBundledPath(p),
    ...probeFfmpegFeatures(p),
  }));
}

export interface BinaryStatus {
  name: BinName;
  path: string | null;
  installHint: string;
  isBundled: boolean;
}

const HINTS: Record<BinName, string> = {
  ffmpeg:   'Bundled with fiano. Reinstall the app if missing.',
  ffprobe:  'Bundled with fiano. Reinstall the app if missing.',
  'yt-dlp': 'Bundled with fiano. Reinstall the app if missing.',
};

/** Forces re-probe — beim "Re-check"-Klick im UI. */
export function clearBinaryCache(): void {
  cache.clear();
  quarantineCleared.clear();
  ytDlpUserDataPath = undefined;
  console.log('[bin] cache cleared, next probe will re-detect');
}

export function checkBinaries(): BinaryStatus[] {
  return (['ffmpeg', 'ffprobe', 'yt-dlp'] as BinName[]).map((name) => {
    const p = resolveBin(name);
    return {
      name,
      path: p,
      installHint: HINTS[name],
      isBundled: !!p && (isBundledPath(p) || isUserDataPath(p)),
    };
  });
}

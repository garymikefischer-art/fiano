#!/usr/bin/env node
/**
 * Phase 8 — Bundled Binaries Download Script
 *
 * Lädt FFmpeg, FFprobe und yt-dlp pro Platform-und-Architektur:
 *   - resources/bin/mac-arm64/  → osxexperts.net (arm64 native, statisch)
 *   - resources/bin/mac-x64/    → evermeet.cx    (x86_64, statisch)
 *   - resources/bin/win-x64/    → BtbN           (gpl-build, statisch)
 *
 * Wird bei `npm install` als postinstall-Hook ausgeführt UND manuell via
 * `npm run binaries:download[ -- --force][ -- --only mac-arm64|mac-x64|win-x64]`.
 *
 * Pure Node — keine zusätzlichen npm-Deps. Extraktion via system-unzip
 * (macOS) bzw. system-tar (Windows ab Win10).
 *
 * Phase 8.7: Mac arm64 nutzt jetzt arm64-native FFmpeg statt x86_64 unter
 * Rosetta — entscheidend für Encode-Performance auf Apple Silicon
 * (videotoolbox Hardware-Encoder funktioniert nur arm64-native).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN_ROOT = path.join(ROOT, 'resources', 'bin');
const TMP = path.join(os.tmpdir(), 'fiano-bin-download');

const FORCE = process.argv.includes('--force');
const ONLY_PLATFORM = (() => {
  const i = process.argv.indexOf('--only');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
})();

/* ─── HTTP helper ─────────────────────────────────────────────────────── */

function httpGet(url, redirects = 5, headers = {}) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects: ' + url));
    const req = https.get(url, { headers }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        res.resume();
        if (!next) return reject(new Error(`Redirect without Location: ${url}`));
        const absolute = next.startsWith('http') ? next : new URL(next, url).toString();
        return httpGet(absolute, redirects - 1, headers).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`HTTP timeout: ${url}`)));
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpGet(url).then((res) => {
      let buf = '';
      res.on('data', (c) => { buf += c.toString(); });
      res.on('end', () => resolve(buf));
      res.on('error', reject);
    }, reject);
  });
}

/* ─── Quellen-Resolver ────────────────────────────────────────────────── */

/**
 * Aus der osxexperts.net-Hauptseite extrahieren wir die aktuellsten arm64-URLs
 * (z.B. ffmpeg81arm.zip + ffprobe81arm.zip). So sind wir gegen FFmpeg-Updates
 * robust ohne dass wir das Script anfassen müssen.
 */
async function resolveOsxExpertsArmUrls() {
  const html = await fetchText('https://www.osxexperts.net/');
  const ffmpegMatch = html.match(/href="(https:\/\/www\.osxexperts\.net\/ffmpeg(\d+)arm\.zip)"/g);
  const ffprobeMatch = html.match(/href="(https:\/\/www\.osxexperts\.net\/ffprobe(\d+)arm\.zip)"/g);
  if (!ffmpegMatch || !ffprobeMatch) {
    throw new Error('Could not find arm64 URLs on osxexperts.net — page format changed?');
  }
  // Höchste Version nehmen (sortiert nach numerischem Suffix)
  const pickLatest = (arr) => {
    const items = arr.map((href) => {
      const m = href.match(/\/(ff(?:mpeg|probe))(\d+)arm\.zip/);
      const url = href.match(/href="([^"]+)"/)[1];
      return { url, version: m ? parseInt(m[2]) : 0 };
    });
    items.sort((a, b) => b.version - a.version);
    return items[0].url;
  };
  return {
    ffmpeg:  pickLatest(ffmpegMatch),
    ffprobe: pickLatest(ffprobeMatch),
  };
}

/**
 * Aus evermeet.cx (Intel-only) — feste URLs, evermeet pinnt latest auf
 * /getrelease/zip. Nur für mac-x64.
 */
const EVERMEET_X64 = {
  ffmpeg:  'https://evermeet.cx/ffmpeg/getrelease/zip',
  ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
};

/* ─── Sources pro Platform ───────────────────────────────────────────── */

async function getSources(platform) {
  const ytDlpMac = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  const ytDlpWin = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';

  if (platform === 'mac-arm64') {
    const urls = await resolveOsxExpertsArmUrls();
    log(`  resolved arm64 URLs:\n    ffmpeg=${urls.ffmpeg}\n    ffprobe=${urls.ffprobe}`);
    return [
      { name: 'ffmpeg',  url: urls.ffmpeg,  type: 'zip', extractFrom: 'ffmpeg',  target: 'ffmpeg',  chmod: 0o755 },
      { name: 'ffprobe', url: urls.ffprobe, type: 'zip', extractFrom: 'ffprobe', target: 'ffprobe', chmod: 0o755 },
      { name: 'yt-dlp',  url: ytDlpMac,    type: 'raw', target: 'yt-dlp',  chmod: 0o755 },
    ];
  }
  if (platform === 'mac-x64') {
    return [
      { name: 'ffmpeg',  url: EVERMEET_X64.ffmpeg,  type: 'zip', extractFrom: 'ffmpeg',  target: 'ffmpeg',  chmod: 0o755 },
      { name: 'ffprobe', url: EVERMEET_X64.ffprobe, type: 'zip', extractFrom: 'ffprobe', target: 'ffprobe', chmod: 0o755 },
      { name: 'yt-dlp',  url: ytDlpMac,             type: 'raw', target: 'yt-dlp',       chmod: 0o755 },
    ];
  }
  if (platform === 'win-x64') {
    return [
      {
        name: 'ffmpeg+ffprobe',
        url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
        type: 'zip',
        extractMultiple: [
          { from: '*/bin/ffmpeg.exe',  target: 'ffmpeg.exe' },
          { from: '*/bin/ffprobe.exe', target: 'ffprobe.exe' },
        ],
      },
      { name: 'yt-dlp', url: ytDlpWin, type: 'raw', target: 'yt-dlp.exe' },
    ];
  }
  throw new Error(`Unknown platform: ${platform}`);
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function log(...args) { console.log('[bin-download]', ...args); }
function err(...args) { console.error('[bin-download]', ...args); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function bytesToMB(b) { return (b / 1024 / 1024).toFixed(1) + ' MB'; }

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    httpGet(url).then((res) => {
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      let lastLog = 0;
      const file = fs.createWriteStream(outPath);
      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastLog > 500) {
          const pct = total ? ` (${Math.round((received / total) * 100)}%)` : '';
          process.stdout.write(`\r       ${bytesToMB(received)}${total ? ' / ' + bytesToMB(total) : ''}${pct}        `);
          lastLog = now;
        }
      });
      res.pipe(file);
      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(() => resolve(outPath));
      });
      file.on('error', (e) => {
        try { fs.unlinkSync(outPath); } catch { /* ignore */ }
        reject(e);
      });
    }, reject);
  });
}

function unzip(zipPath, outDir) {
  ensureDir(outDir);
  let res = spawnSync('unzip', ['-oq', zipPath, '-d', outDir], { stdio: 'inherit' });
  if (res.status === 0) return outDir;
  res = spawnSync('tar', ['-xf', zipPath, '-C', outDir], { stdio: 'inherit' });
  if (res.status === 0) return outDir;
  if (process.platform === 'win32') {
    res = spawnSync('powershell', ['-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });
    if (res.status === 0) return outDir;
  }
  throw new Error(`Could not unzip ${zipPath}`);
}

function findInTree(rootDir, pattern) {
  const parts = pattern.split('/');
  function walk(dir, idx) {
    if (idx >= parts.length) return null;
    const part = parts[idx];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (part !== '*' && e.name !== part) continue;
      if (idx === parts.length - 1) {
        if (e.isFile()) return full;
      } else if (e.isDirectory()) {
        const found = walk(full, idx + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(rootDir, 0);
}

/* ─── Per-Source Handler ──────────────────────────────────────────────── */

async function handleRaw(source, targetDir) {
  const targetPath = path.join(targetDir, source.target);
  if (!FORCE && fs.existsSync(targetPath)) {
    log(`✓ ${source.name} already exists — skipping (use --force to redownload)`);
    return;
  }
  log(`→ downloading ${source.name} from ${source.url}`);
  ensureDir(targetDir);
  await downloadFile(source.url, targetPath);
  if (source.chmod !== undefined) fs.chmodSync(targetPath, source.chmod);
  log(`✓ saved to ${targetPath}`);
}

async function handleZip(source, targetDir) {
  const targets = source.extractMultiple
    ? source.extractMultiple.map((m) => path.join(targetDir, m.target))
    : [path.join(targetDir, source.target)];
  if (!FORCE && targets.every((p) => fs.existsSync(p))) {
    log(`✓ ${source.name} already exists — skipping (use --force to redownload)`);
    return;
  }
  log(`→ downloading ${source.name} from ${source.url}`);
  ensureDir(TMP);
  ensureDir(targetDir);
  const zipPath = path.join(TMP, `${source.name.replace(/[^a-z0-9]/gi, '_')}.zip`);
  await downloadFile(source.url, zipPath);
  log(`→ extracting ${source.name}`);
  const extractDir = path.join(TMP, `extract-${path.basename(zipPath, '.zip')}`);
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  unzip(zipPath, extractDir);
  if (source.extractMultiple) {
    for (const m of source.extractMultiple) {
      const found = findInTree(extractDir, m.from);
      if (!found) throw new Error(`Could not find '${m.from}' in extracted ${source.name}`);
      const target = path.join(targetDir, m.target);
      fs.copyFileSync(found, target);
      if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
      log(`  ✓ ${m.target}`);
    }
  } else {
    const found = findInTree(extractDir, source.extractFrom);
    if (!found) throw new Error(`Could not find '${source.extractFrom}' in extracted ${source.name}`);
    const target = path.join(targetDir, source.target);
    fs.copyFileSync(found, target);
    if (source.chmod !== undefined) fs.chmodSync(target, source.chmod);
    log(`  ✓ ${source.target}`);
  }
  try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function downloadFor(platform) {
  const sources = await getSources(platform);
  const targetDir = path.join(BIN_ROOT, platform);
  ensureDir(targetDir);
  log(`═══ Platform: ${platform} → ${targetDir} ═══`);
  for (const source of sources) {
    if (source.type === 'raw') await handleRaw(source, targetDir);
    else if (source.type === 'zip') await handleZip(source, targetDir);
  }
}

/** Bestimmt für einen postinstall-Hook welche Platforms-Bins der aktuelle Host
 *  gerade braucht (nur self-host, keine Cross-Platform). */
function hostPlatforms() {
  if (process.platform === 'darwin') {
    // Beim Build kann der User per `--only mac-x64` auch das andere Mac-Set
    // anziehen; postinstall reicht das aktuelle Host-arch.
    return [process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64'];
  }
  if (process.platform === 'win32') return ['win-x64'];
  return [];
}

async function main() {
  const startTime = Date.now();
  log(`Start — root=${BIN_ROOT}${FORCE ? ' --force' : ''}${ONLY_PLATFORM ? ` --only ${ONLY_PLATFORM}` : ''}`);

  const isPostinstall = process.env.npm_lifecycle_event === 'postinstall';
  const platforms = ONLY_PLATFORM
    ? [ONLY_PLATFORM]
    : isPostinstall
      ? hostPlatforms()
      : ['mac-arm64', 'mac-x64', 'win-x64'];

  for (const p of platforms) {
    try {
      await downloadFor(p);
    } catch (e) {
      err(`✗ ${p} failed: ${e.message}`);
      if (!isPostinstall) throw e;
    }
  }

  log(`Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});

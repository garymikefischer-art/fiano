#!/usr/bin/env node
/**
 * Phase 8 — Bundled Binaries Download Script
 *
 * Lädt FFmpeg, FFprobe und yt-dlp für Mac (Universal) + Windows x64 nach
 * resources/bin/{mac,win}/. Wird bei `npm install` als postinstall-Hook
 * ausgeführt UND manuell via `npm run binaries:download[ -- --force]`.
 *
 * Pure Node — keine zusätzlichen npm-Deps. Extraktion via system-unzip
 * (macOS) bzw. system-tar (Windows ab Win10).
 *
 * Quellen:
 *   - macOS FFmpeg/FFprobe: https://evermeet.cx (Universal Binary arm64+x64,
 *     GPL-Build mit libass + libfreetype + drawtext)
 *   - Windows FFmpeg/FFprobe: https://github.com/BtbN/FFmpeg-Builds (latest,
 *     win64-gpl, statisch gelinkt mit libass + drawtext)
 *   - yt-dlp: https://github.com/yt-dlp/yt-dlp/releases/latest
 *
 * Lizenz-Hinweis: Beide FFmpeg-Builds sind GPL — die Binaries selbst dürfen
 * weiterverteilt werden. Pflicht: LICENSE-Hinweis in der App (haben wir in
 * Settings → Legal → Lizenzen).
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

/* ─── Quellen ─────────────────────────────────────────────────────────── */

/**
 * Pro Platform definieren wir alle 3 Binaries. `extractFrom` ist der Pfad
 * INNERHALB des entpackten Archivs (für Win-Zip mit Unterordner).
 */
const SOURCES = {
  mac: [
    {
      name: 'ffmpeg',
      url: 'https://evermeet.cx/ffmpeg/getrelease/zip',
      type: 'zip',
      // evermeet.cx zip enthält ffmpeg im Root
      extractFrom: 'ffmpeg',
      target: 'ffmpeg',
      chmod: 0o755,
    },
    {
      name: 'ffprobe',
      url: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
      type: 'zip',
      extractFrom: 'ffprobe',
      target: 'ffprobe',
      chmod: 0o755,
    },
    {
      name: 'yt-dlp',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
      type: 'raw',
      target: 'yt-dlp',
      chmod: 0o755,
    },
  ],
  win: [
    {
      name: 'ffmpeg+ffprobe',
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      type: 'zip',
      // BtbN zip enthält ffmpeg-master-latest-win64-gpl/bin/{ffmpeg,ffprobe}.exe
      // Wir extrahieren das ganze Archiv in TMP und kopieren nur die zwei .exes
      extractMultiple: [
        { from: '*/bin/ffmpeg.exe',  target: 'ffmpeg.exe' },
        { from: '*/bin/ffprobe.exe', target: 'ffprobe.exe' },
      ],
    },
    {
      name: 'yt-dlp',
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      type: 'raw',
      target: 'yt-dlp.exe',
    },
  ],
};

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function log(...args) {
  console.log('[bin-download]', ...args);
}
function err(...args) {
  console.error('[bin-download]', ...args);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function bytesToMB(b) {
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * HTTP(S)-Download mit Redirect-Following + Progress-Output.
 * Liefert eine Promise die fulfillt mit dem Filepath.
 */
function downloadFile(url, outPath, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects: ' + url));
    const req = https.get(url, (res) => {
      // Redirect handling (301/302/307/308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        res.resume();
        if (!next) return reject(new Error(`Redirect without Location: ${url}`));
        const absolute = next.startsWith('http') ? next : new URL(next, url).toString();
        return downloadFile(absolute, outPath, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
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
    });
    req.on('error', reject);
    req.setTimeout(120_000, () => req.destroy(new Error(`Download timed out (>120s): ${url}`)));
  });
}

/**
 * ZIP entpacken — verwendet system unzip (macOS/Linux) bzw. tar (Windows ab
 * Win10 hat tar built-in mit zip-Support, oder PowerShell Expand-Archive).
 * Liefert das Ziel-Verzeichnis zurück.
 */
function unzip(zipPath, outDir) {
  ensureDir(outDir);
  // Bevorzuge `unzip` falls vorhanden (Mac, Linux, Windows-WSL/Git-Bash)
  let res = spawnSync('unzip', ['-oq', zipPath, '-d', outDir], { stdio: 'inherit' });
  if (res.status === 0) return outDir;
  // Fallback 1: tar (built-in seit Win10 1803, kann auch zip)
  res = spawnSync('tar', ['-xf', zipPath, '-C', outDir], { stdio: 'inherit' });
  if (res.status === 0) return outDir;
  // Fallback 2: PowerShell Expand-Archive (Win)
  if (process.platform === 'win32') {
    res = spawnSync(
      'powershell',
      ['-Command', `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`],
      { stdio: 'inherit' },
    );
    if (res.status === 0) return outDir;
  }
  throw new Error(`Could not unzip ${zipPath} — install 'unzip' or 'tar'`);
}

/**
 * Findet eine Datei in einem Verzeichnis-Tree die einem glob-Pattern entspricht.
 * Vereinfachte Glob-Logik: nur `*` als Wildcard für Verzeichnisnamen.
 */
function findInTree(rootDir, pattern) {
  const parts = pattern.split('/');
  function walk(dir, idx) {
    if (idx >= parts.length) return null;
    const part = parts[idx];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return null; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const matches = part === '*' || e.name === part;
      if (!matches) continue;
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
  // Wenn extractMultiple — wir prüfen ob alle targets existieren
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
  // Vorherige Extraktion löschen falls vorhanden
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
  unzip(zipPath, extractDir);

  if (source.extractMultiple) {
    for (const m of source.extractMultiple) {
      const found = findInTree(extractDir, m.from);
      if (!found) {
        throw new Error(`Could not find '${m.from}' in extracted ${source.name}`);
      }
      const target = path.join(targetDir, m.target);
      fs.copyFileSync(found, target);
      if (process.platform !== 'win32') fs.chmodSync(target, 0o755);
      log(`  ✓ ${m.target}`);
    }
  } else {
    // Single-Binary-Extraktion
    const found = findInTree(extractDir, source.extractFrom);
    if (!found) {
      throw new Error(`Could not find '${source.extractFrom}' in extracted ${source.name}`);
    }
    const target = path.join(targetDir, source.target);
    fs.copyFileSync(found, target);
    if (source.chmod !== undefined) fs.chmodSync(target, source.chmod);
    log(`  ✓ ${source.target}`);
  }

  // Aufräumen
  try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
  try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/* ─── Main ────────────────────────────────────────────────────────────── */

async function downloadFor(platform) {
  const sources = SOURCES[platform];
  if (!sources) throw new Error(`Unknown platform: ${platform}`);
  const targetDir = path.join(BIN_ROOT, platform);
  ensureDir(targetDir);
  log(`═══ Platform: ${platform} → ${targetDir} ═══`);
  for (const source of sources) {
    if (source.type === 'raw') await handleRaw(source, targetDir);
    else if (source.type === 'zip') await handleZip(source, targetDir);
    else throw new Error(`Unknown source type: ${source.type}`);
  }
}

async function main() {
  const startTime = Date.now();
  log(`Start — root=${BIN_ROOT}${FORCE ? ' --force' : ''}${ONLY_PLATFORM ? ` --only ${ONLY_PLATFORM}` : ''}`);

  // Bei postinstall: nur die aktuelle Host-Platform laden — kein Cross-Platform-
  // Download bei jedem `npm install`. Manuelle Builds lädt der Dev mit --only.
  const isPostinstall = process.env.npm_lifecycle_event === 'postinstall';
  const platforms = ONLY_PLATFORM
    ? [ONLY_PLATFORM]
    : isPostinstall
      ? [process.platform === 'darwin' ? 'mac' : 'win']
      : ['mac', 'win'];

  for (const p of platforms) {
    try {
      await downloadFor(p);
    } catch (e) {
      err(`✗ ${p} failed: ${e.message}`);
      // Bei postinstall nicht fail-fast — User soll npm install nicht crashen
      // wenn Network down ist. Manueller Re-Run möglich.
      if (!isPostinstall) throw e;
    }
  }

  log(`Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});

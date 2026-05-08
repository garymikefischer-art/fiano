#!/usr/bin/env node
/**
 * Phase 8 — Bundled-Binary Verification Script
 *
 * Verifiziert dass die bundled FFmpeg/FFprobe/yt-dlp:
 *   1. existieren
 *   2. funktionieren (spawn → exit 0)
 *   3. libass + drawtext + libfreetype enthalten (FFmpeg)
 *   4. yt-dlp version response
 *
 * Wirft mit non-zero exit wenn irgendwas nicht passt.
 *
 * Usage:
 *   npm run test:bundled
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PLATFORM = (() => {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (process.platform === 'win32')  return 'win-x64';
  return 'linux-x64';
})();
const EXT = process.platform === 'win32' ? '.exe' : '';
const BIN_DIR = path.join(ROOT, 'resources', 'bin', PLATFORM);

let failed = 0;
const log = (...args) => console.log('[test-bundled]', ...args);
const ok  = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`); };

function run(bin, args, opts = {}) {
  return spawnSync(bin, args, {
    encoding: 'utf8',
    // yt-dlp ist ein PyInstaller-Bundle — beim ersten Run extracted das nach
    // /tmp und kann 5-25s dauern. 60s timeout deckt das ab.
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

function checkExists(name) {
  const p = path.join(BIN_DIR, name + EXT);
  if (!fs.existsSync(p)) {
    bad(`${name} missing at ${p}`);
    return null;
  }
  ok(`${name} exists at ${p}`);
  return p;
}

function checkFfmpeg() {
  log(`▶ FFmpeg`);
  const ffmpeg = checkExists('ffmpeg');
  if (!ffmpeg) return;
  const ver = run(ffmpeg, ['-hide_banner', '-version']);
  if (ver.status !== 0) { bad(`ffmpeg -version failed: ${ver.stderr}`); return; }
  const firstLine = ver.stdout.split('\n')[0].trim();
  ok(`runs: ${firstLine}`);
  // Filters check (libass = 'subtitles' filter, drawtext = 'drawtext' filter)
  const filters = run(ffmpeg, ['-hide_banner', '-filters']);
  if (filters.status !== 0) { bad(`ffmpeg -filters failed`); return; }
  const hasSubtitles = /^\s*[A-Z\.]{2,3}\s+subtitles\s+/m.test(filters.stdout);
  const hasDrawtext  = /^\s*[A-Z\.]{2,3}\s+drawtext\s+/m.test(filters.stdout);
  if (hasSubtitles) ok('libass (subtitles filter) available');
  else              bad('libass (subtitles filter) MISSING');
  if (hasDrawtext)  ok('drawtext filter available');
  else              bad('drawtext filter MISSING');
  // libfreetype check — required for drawtext to actually render text
  const buildconf = run(ffmpeg, ['-hide_banner', '-buildconf']);
  if (buildconf.status === 0) {
    const hasFreetype = /--enable-libfreetype/.test(buildconf.stdout) || /--enable-freetype/.test(buildconf.stdout);
    if (hasFreetype) ok('libfreetype enabled in build');
    else             bad('libfreetype NOT in -buildconf — drawtext may not render text');
  }
}

function checkFfprobe() {
  log(`▶ FFprobe`);
  const ffprobe = checkExists('ffprobe');
  if (!ffprobe) return;
  const ver = run(ffprobe, ['-hide_banner', '-version']);
  if (ver.status !== 0) { bad(`ffprobe -version failed: ${ver.stderr}`); return; }
  const firstLine = ver.stdout.split('\n')[0].trim();
  ok(`runs: ${firstLine}`);
}

function checkYtDlp() {
  log(`▶ yt-dlp`);
  const yt = checkExists('yt-dlp');
  if (!yt) return;
  const ver = run(yt, ['--version']);
  if (ver.status !== 0) { bad(`yt-dlp --version failed: ${ver.stderr}`); return; }
  ok(`runs: ${ver.stdout.trim()}`);
}

function checkSubtitleBurn() {
  log(`▶ Subtitle Burn-In dry test (no real file output)`);
  const ffmpeg = path.join(BIN_DIR, 'ffmpeg' + EXT);
  if (!fs.existsSync(ffmpeg)) { bad('ffmpeg missing — skip burn test'); return; }
  // Wir testen nur dass der subtitles-Filter parsen kann ohne tatsächlich
  // ein Video zu rendern. lavfi color-source + Null-Output → schnell.
  const res = run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1',
    '-vf', "drawtext=text='test':fontcolor=white:x=10:y=10",
    '-frames:v', '1', '-f', 'null', '-',
  ]);
  if (res.status === 0) ok('drawtext filter renders ok');
  else                  bad(`drawtext render failed: ${res.stderr.trim()}`);
}

/* ─── Main ─── */

log(`Testing bundled binaries in: ${BIN_DIR}`);
if (!fs.existsSync(BIN_DIR)) {
  bad(`Directory does not exist! Run: npm run binaries:download`);
  process.exit(1);
}

checkFfmpeg();
checkFfprobe();
checkYtDlp();
checkSubtitleBurn();

console.log('');
if (failed > 0) {
  console.log(`\x1b[31m${failed} check(s) failed.\x1b[0m`);
  process.exit(1);
}
console.log(`\x1b[32mAll bundled-binary checks passed.\x1b[0m`);

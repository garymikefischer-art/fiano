# Changelog

All notable changes to fiano are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [0.1.1] — 2026-05-07

### Added
- Custom window-controls in the sidebar on Windows / Linux (frameless window — minimize, maximize, close).
- Auto-update via GitHub Releases — installed apps check every 6h and surface available updates in the in-app notification bell + toast.
- Build / publish scripts: `npm run release:mac`, `npm run release:win` (uses `GH_TOKEN`).
- `CHANGELOG.md`.

### Fixed
- Highlights tab: clip number badge (top-left of each card) now matches the chronological display order instead of the original array index.
- Builder tab: clip-cards no longer get clipped on the left edge / glow cut-off — switched to spacer-divs (same approach as TikTok tab).

### Changed
- Editor / Help copy: removed third-party app references (CapCut, Opus Clip, DaVinci) — neutral wording everywhere.

## [0.1.0] — Initial unsigned MVP

- Hybrid AI video desktop app for streamers and creators.
- Auto / manual / podcast highlight modes (Whisper + GPT-4o-mini).
- TikTok / YouTube-Builder / Multi-track-Editor tabs.
- 9 languages, AI Mask (SAM 1), LUTs, vidstab, electron-updater wired but un-published.
- macOS DMG (arm64 + x64) + Windows NSIS installer — unsigned.

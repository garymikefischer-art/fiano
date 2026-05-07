# Video App

AI-powered video clipping desktop app — turns long videos into shorts and combines clips into YouTube videos.

## Tech Stack

- **Electron** + **electron-vite** — Desktop shell + dev tooling
- **React 18** + **TypeScript** + **Vite** — UI
- **Tailwind CSS** — Styling
- **Zustand** — State management
- **FFmpeg** + **yt-dlp** — Video processing (added in Phase 6.2)
- **OpenAI Whisper / GPT-4o-mini** — Transcription + Highlight detection

## Getting Started

```bash
# Install
npm install

# Dev (hot reload)
npm run dev

# Build for production
npm run build:mac    # → dist/Video App-0.1.0-arm64.dmg
npm run build:win    # → dist/Video App-0.1.0-Setup.exe
```

## Project Structure

```
src/
├── main/         Electron main process (Node.js)
│   └── core/     Video pipeline, queue, project manager (Phase 6.2+)
├── preload/      Secure bridge between main and renderer
├── renderer/     React UI
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── index.css
└── shared/       Types shared between main and renderer
```

## Phases

- ✅ Phase 1–5 — Architecture, Stack, Pipeline, AI features, UI design (planned)
- 🔄 Phase 6.1 — Bootable project skeleton (this commit)
- ⏳ Phase 6.2 — Pipeline integration (yt-dlp, FFmpeg, Whisper, GPT)
- ⏳ Phase 6.3 — UI screens (Library, Project Detail, Settings)
- ⏳ Phase 6.4 — Builds + packaging

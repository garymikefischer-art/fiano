# Multi-Stage Build für minimale Image-Größe.
# Stage 1: Node-Build mit TypeScript-Compilation.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runtime mit FFmpeg + nur production-Deps.
FROM node:22-bookworm-slim
WORKDIR /app

# FFmpeg + ffprobe + yt-dlp (Phase 9.5.7 YouTube/Twitch-Import).
# yt-dlp ist ein standalone-binary aus dem upstream GitHub-Release — keine Python-
# Setup nötig für die Standard-Features. ffmpeg/ffprobe braucht yt-dlp zum Mergen
# von DASH-Streams (separate Video + Audio Tracks). curl + ca-certificates für
# den one-time binary-pull.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 fonts-liberation \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/download/2025.01.15/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    # Phase A6.7 (2026-05-18): pinned version statt latest (P1-5 Audit).
    # Hostile yt-dlp plugin-update kann sonst arbitrary code ausführen.
    # Update manuell: Tag oben anpassen (github.com/yt-dlp/yt-dlp/releases). \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Cloud Run setzt PORT env-var, Default 8080.
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Non-root user für Security.
RUN useradd -r -u 1001 worker && chown -R worker:worker /app
USER worker

CMD ["node", "dist/index.js"]

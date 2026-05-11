# Multi-Stage Build für minimale Image-Größe.
# Stage 1: Node-Build mit TypeScript-Compilation.
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runtime mit FFmpeg + nur production-Deps.
FROM node:20-bookworm-slim
WORKDIR /app

# FFmpeg + ffprobe install. apt-get cache wegwerfen für kleinere Image-Size.
# Debian-bookworm bringt FFmpeg 5.x — reicht für unsere Filter (drawtext, scale, overlay).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
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

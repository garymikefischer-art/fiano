# fiano Render Worker

FFmpeg-Render-Server. Läuft als Docker-Container auf **Google Cloud Run**
mit Scale-to-Zero. Storage via **Cloudflare R2** (unlimited Egress free).

## Architektur

```
Mobile (Expo)                Cloud Run (Worker)        Cloudflare R2
─────────────                ──────────────────        ─────────────
1. POST /v1/upload-url   →   pre-signed PUT-URL
2. PUT source.mp4        ─────────────────────→        sources/${user}/...
3. POST /v1/render       →   ├ download from R2  ←     (worker holt direct)
   { sourceKey, args }       ├ ffmpeg ${args}
                             ├ upload result     ───→  outputs/${user}/...
                             └ pre-signed DL-URL
4. GET signed-URL        ←   signed-DL-URL
   (Mobile lädt direct)  ←──────────────────────       outputs/...
```

**Warum diese 2-Step-Architektur:** Source-Files sind oft >100 MB. Würde der
Worker den Upload proxieren, käme er aufs Cloud-Run-Request-Size-Limit
(32 MiB default) und der Render-Endpoint wäre langsam. Stattdessen lädt Mobile
direkt zu R2 via Pre-Signed-URL — der Worker greift erst beim Render-Call drauf zu.

## Free-Tier Calculation

**Cloudflare R2:**
- 10 GB Storage free (mit 24h-Lifecycle reicht das easy für hunderte gleichzeitige Renders)
- **Unlimited Egress free** (das ist der Killer-Vorteil ggü. Supabase Storage)
- Class A operations (uploads): 1M/Monat free
- Class B operations (downloads): 10M/Monat free

**Google Cloud Run:**
- 2M Requests + 400k vCPU-seconds + 200k GB-seconds free/Monat
- Bei 500 Renders à 30s auf 2 vCPU: 30k vCPU-seconds → in Free Tier

**Bei MVP-Volumen:** 0€/Monat. Bei Skalierung auf 10k Renders/Monat: ~5-15€.

## Setup einmalig (~45 min)

### 1. Cloudflare R2 Setup

1. [cloudflare.com](https://cloudflare.com) Account erstellen (kostenlos)
2. Dashboard → **R2** → **Create bucket**:
   - Name: `fiano-renders`
   - Location: `Automatic` (oder EU für niedrige Latenz zu DE-Usern)
3. Bucket öffnen → **Settings** → **Object lifecycle rules** → Add:
   - Prefix: `sources/`
   - Action: Delete objects, Days after creation: `1`
   - (Sources werden nach 1 Tag automatisch gelöscht)
4. Zweite Rule:
   - Prefix: `outputs/`
   - Days after creation: `7`
   - (Outputs 1 Woche aufheben damit User Zeit hat zum Download)
5. Account → **R2 → API Tokens** → **Create API token**:
   - Permissions: `Object Read & Write`
   - Bucket: `fiano-renders` only
   - TTL: keine
6. Notier dir: **Account ID** (aus Dashboard-URL oder rechts) +
   **Access Key ID** + **Secret Access Key** (werden gezeigt, dann nie wieder)

### 2. Supabase (nur für Auth, kein Storage mehr)

Du brauchst nur den vorhandenen Supabase-Project. Hol dir den
**SERVICE_ROLE_KEY** aus Supabase-Dashboard → Settings → API.
Den Key NIEMALS im Mobile-Bundle exposen.

### 3. Google Cloud Setup

```bash
# gcloud CLI installieren falls noch nicht: https://cloud.google.com/sdk/docs/install
brew install --cask google-cloud-sdk

# Login + neues Projekt
gcloud auth login
gcloud projects create fiano-render-prod --name="fiano render"
gcloud config set project fiano-render-prod

# Billing aktivieren (manuell im Console → Billing → Link account)
# Du bekommst $300 Free-Credits bei Neuanmeldung

# Cloud Run API enablen
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Region setzen (europe-west1 = Belgien, niedrige Latenz für DE/AT-User)
gcloud config set run/region europe-west1
```

### 4. Container bauen + deployen

Vom Repo-Root aus:

```bash
cd services/render-worker

gcloud run deploy fiano-render-worker \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars "SUPABASE_URL=https://YOUR.supabase.co" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=eyJ..." \
  --set-env-vars "R2_ACCOUNT_ID=abc..." \
  --set-env-vars "R2_ACCESS_KEY_ID=..." \
  --set-env-vars "R2_SECRET_ACCESS_KEY=..." \
  --set-env-vars "R2_BUCKET=fiano-renders"
```

Output zeigt die Service-URL:
```
Service URL: https://fiano-render-worker-XXXX-ew.a.run.app
```

### 5. Mobile konfigurieren

In `packages/mobile/.env`:
```
EXPO_PUBLIC_RENDER_WORKER_URL=https://fiano-render-worker-XXXX-ew.a.run.app
```

Dann Metro reload (`r`) — der renderJob.ts-Client nutzt die URL.

### 6. Testen

```bash
curl https://fiano-render-worker-XXXX-ew.a.run.app/health
# → {"ok":true,"version":"0.2.0","storage":"r2"}
```

Erst-Request dauert ~5-10s (Cold-Start), Folge-Requests <1s.

## Lokal entwickeln

```bash
cd services/render-worker
npm install
cp .env.example .env
# .env editieren mit echten Supabase- + R2-Credentials
npm run dev
```

Worker läuft auf http://localhost:8080. FFmpeg muss lokal installiert sein
(`brew install ffmpeg` macOS, `apt install ffmpeg` Linux).

## API

### `POST /v1/upload-url`

Headers: `Authorization: Bearer <supabase-jwt>`

Body: `{ "projectId": "uuid" }`

Response: `{ ok, uploadUrl, sourceKey, jobId, expiresInSec }`

Mobile lädt das Source-Video dann via `PUT ${uploadUrl}` mit binary body
direkt zu R2.

### `POST /v1/render`

Headers: `Authorization: Bearer <supabase-jwt>`

Body:
```json
{
  "sourceKey": "sources/userId/projectId/jobId-src.mp4",
  "args": ["-y", "-i", "{SRC}", "-vf", "scale=1080:1920", "{DST}"],
  "projectId": "uuid",
  "outputName": "9x16-export.mp4"
}
```

Response: `{ ok, jobId, outputKey, signedUrl, durationMs, sizeBytes }`

`signedUrl` ist 24h gültig — Mobile lädt das Result-Video direkt davon.

### `GET /health`

Liveness probe. `{ok:true,version,storage:'r2'}`.

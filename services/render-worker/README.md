# fiano Render Worker

FFmpeg-Render-Server für die Mobile-App. Läuft als Docker-Container auf
**Google Cloud Run** mit Scale-to-Zero — wenn niemand exportiert, kostet
es 0€.

## Architektur

```
Mobile (Expo)                        Cloud Run (dieser Worker)
─────────────                        ──────────────────────────
1. Upload Source-Video         →     Supabase Storage `source-uploads`
2. POST /v1/render             →     ├─ JWT verify
   { sourceKey, args[],              ├─ Download source from bucket
     projectId }                     ├─ Spawn ffmpeg ${args}
                                     ├─ Upload result to `render-output`
                                     └─ Return signed-URL
3. Download result via         ←     signed-URL aus response
   signed-URL
4. Save to Camera-Roll
```

## Setup einmalig (~30 min)

### 1. Supabase Storage Buckets anlegen

In deinem [Supabase-Dashboard](https://supabase.com/dashboard) → Storage:

```
Bucket: source-uploads
  - Public: NEIN (private)
  - File size limit: 500 MB (oder mehr je nach Mobile-Use-Case)

Bucket: render-output
  - Public: NEIN
  - File size limit: 500 MB
```

RLS-Policies (in SQL Editor):

```sql
-- Source-Bucket: User kann nur eigene Files lesen+schreiben.
CREATE POLICY "user owns source files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'source-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Output-Bucket: gleiche Regel.
CREATE POLICY "user owns output files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'render-output' AND auth.uid()::text = (storage.foldername(name))[1]);
```

→ Heißt File-Pfade sind `${userId}/${projectId}/${jobId}.mp4` — User
kann nur seine eigenen Files erreichen.

### 2. Google Cloud Setup

```bash
# gcloud CLI installieren falls noch nicht: https://cloud.google.com/sdk/docs/install

# Neues Projekt
gcloud projects create fiano-render --name="fiano render"
gcloud config set project fiano-render

# Billing aktivieren (kostenlos solange Free Tier nicht überschritten)
# → manuell im Console: Billing → Link account

# Cloud Run API enablen
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Service Account für Container (optional — Default geht auch)
gcloud iam service-accounts create fiano-render-runner

# Region setzen (europe-west1 = Belgien, niedrige Latenz für DE/AT-User)
gcloud config set run/region europe-west1
```

### 3. Container bauen + deployen

Vom Repo-Root aus:

```bash
cd services/render-worker

# Build + Deploy in einem Schritt (Cloud Build kompiliert das Image
# server-side, kein lokales Docker nötig).
gcloud run deploy fiano-render-worker \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars "SUPABASE_URL=https://YOUR_PROJECT.supabase.co" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=eyJ..."
```

Erklärung der Flags:
- `--source .` lässt Cloud Build das Image bauen statt lokal
- `--allow-unauthenticated` weil wir mit Supabase-JWT selbst authentifizieren
- `--memory 2Gi` reicht für 1080p-Renders, `--cpu 2` für ffmpeg-Speed
- `--timeout 600` = 10 min max pro Request (lange Renders)
- `--max-instances 10` cap damit kein Runaway
- `--min-instances 0` = scale to zero (das spart Geld!)

Output zeigt die Service-URL, z.B.:
```
https://fiano-render-worker-XXXX-ew.a.run.app
```

Die musst du in `packages/mobile/.env` (oder app.config.js) als
`EXPO_PUBLIC_RENDER_WORKER_URL` setzen.

### 4. Testen

```bash
curl https://fiano-render-worker-XXXX-ew.a.run.app/health
# → {"ok":true,"version":"0.1.0"}
```

Erst-Request dauert ~5-10s (Cold-Start). Folge-Requests <1s.

## Lokal entwickeln

```bash
cd services/render-worker
npm install
cp .env.example .env
# .env editieren mit echten Supabase-Werten
npm run dev
```

Worker läuft dann auf http://localhost:8080. FFmpeg muss lokal installiert
sein (`brew install ffmpeg` auf macOS, `apt install ffmpeg` Linux).

## Kosten

Pricing Google Cloud Run (Stand 2026):
- **Free Tier monatlich:** 2M Requests + 400k vCPU-seconds + 200k GB-seconds
- Bei MVP-Volumen (z.B. 500 Renders/Monat à 30s): ~15k vCPU-seconds → 100% innerhalb Free Tier
- Bei Wachstum: $0.000024/vCPU-second + $0.0000025/GB-second + $0.40/1M Requests
- → Ein 1-min 1080p-Render auf 2-vCPU-Container: ~$0.005 = halber Cent

Realistic monthly cost:
| Volumen | Kosten |
|---|---|
| 0-500 Renders | 0€ (Free Tier) |
| 5000 Renders | ~5€ |
| 50000 Renders | ~50€ |

Bei Stripe-Sub-Pricing von 30€/Monat pro User bist du immer im Plus.

## API

### `POST /v1/render`

Headers:
```
Authorization: Bearer <supabase-jwt>
Content-Type: application/json
```

Body:
```json
{
  "sourceKey": "user-uuid/project-uuid/source.mp4",
  "args": ["-y", "-i", "{SRC}", "-vf", "scale=1080:1920", "{DST}"],
  "projectId": "project-uuid",
  "outputName": "9x16-export.mp4"
}
```

Args müssen `{SRC}` und `{DST}` als Platzhalter enthalten — der Server
ersetzt sie sicher mit tmp-Pfaden.

Response (success):
```json
{
  "ok": true,
  "jobId": "...",
  "outputKey": "project-uuid/9x16-export.mp4",
  "signedUrl": "https://.../signed-url-24h",
  "durationMs": 28543,
  "sizeBytes": 18234567
}
```

### `GET /health`

Liveness probe. Returnt `{ok:true,version:"..."}`.

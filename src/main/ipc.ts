import { ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  createProject,
  createManualProject,
  createQuickTikTokProject,
  listProjects,
  startAnalysis,
  deleteProject,
  updateHighlight,
  setProjectMusic,
  setProjectIntro,
  addManualHighlight,
  deleteHighlight,
  createEmptyProject,
  renameProject,
  addVoiceOver,
  removeVoiceOver,
  updateVoiceOver,
  getProjectSourcePath,
  addMusicTrack,
  removeMusicTrack,
  updateMusicTrack,
  setActiveMusicIndex,
  getProjectDir,
} from './core/projects';
import {
  setApiKey, hasApiKey, deleteApiKey, getApiKey,
  getAppDefaults, setAppDefaults, type AppDefaults,
  setGeminiApiKey, getGeminiApiKey, hasGeminiApiKey, deleteGeminiApiKey,
} from './core/settings';
import { checkBinaries, clearBinaryCache, getFfmpegDiagnostics, setFfmpegOverride } from './core/bin';
import { exportClipAs, buildVideo, hasSubtitlesFilter, getSubtitleSupport, renderEditorTimeline, extractFrameJpeg, runVidstabDetect, hasVidstabFilter, setQualityMode, type BuilderClip, type EditorClipSpec, type EditorRenderOptions, type QualityMode } from './core/ffmpeg';
import { transcodeForPreview } from './core/transcode';
import { generateClipSrt } from './core/pipeline/subtitles';
import type {
  ClipSegment,
  ExportFormat,
  FacecamRegion,
  Highlight,
  IpcResponse,
  ProjectIntro,
  ProjectMusic,
  ProjectSource,
  SubtitlePosition,
  SubtitleSettings,
  SubtitleStyle,
  TikTokLayout,
} from '@shared/types';

type Handler<P, R> = (payload: P) => Promise<R>;

/** Setzt Encoder-Quality-Mode vor Render-Calls. Override > AppDefault > 'fast'. */
async function applyQualityMode(override?: QualityMode): Promise<void> {
  const mode = override ?? (await getAppDefaults()).qualityMode ?? 'fast';
  setQualityMode(mode);
}

const handlers: Record<string, Handler<any, any>> = {
  // ─── Projects ─────────────────────────────────────────────
  'project.list':           async ()                                 => listProjects(),
  'project.create':         async (i: { source: ProjectSource; name?: string; videoType?: import('@shared/types').VideoType }) =>
                                createProject(i.source, i.name, i.videoType),
  'project.createManual':   async (i: { paths: string[]; name?: string }) =>
                                createManualProject(i.paths, i.name),
  'project.createQuickTikTok': async (i: { path: string; name?: string }) =>
                                createQuickTikTokProject(i.path, i.name),
  'project.createEmpty':       async (i: { name?: string })                  =>
                                createEmptyProject(i.name),
  'project.delete':         async (i: { id: string })                => { await deleteProject(i.id); return { ok: true }; },
  'project.rename':         async (i: { id: string; name: string })  => { await renameProject(i.id, i.name); return { ok: true }; },
  'project.startAnalysis':  async (i: { id: string })                => startAnalysis(i.id),
  'project.addManualHighlight': async (i: { id: string; start: number; end: number }) =>
                                addManualHighlight(i.id, i.start, i.end),
  'project.deleteHighlight':    async (i: { id: string; index: number }) => {
                                  await deleteHighlight(i.id, i.index);
                                  return { ok: true };
                                },
  // ─── Voice-Overs (TTS-generierte AI-Voice-Spuren) ───────────────────
  'project.addVoiceOver':       async (i: { id: string; vo: any }) => {
                                  await addVoiceOver(i.id, i.vo);
                                  return { ok: true };
                                },
  'project.removeVoiceOver':    async (i: { id: string; index: number }) => {
                                  await removeVoiceOver(i.id, i.index);
                                  return { ok: true };
                                },
  'project.updateVoiceOver':    async (i: { id: string; index: number; patch: any }) => {
                                  await updateVoiceOver(i.id, i.index, i.patch);
                                  return { ok: true };
                                },
  'project.getSourcePath':  async (i: { id: string }) => {
    const project = await listProjects().then((ps) => ps.find((p) => p.id === i.id));
    if (!project) return { path: null };
    return { path: getProjectSourcePath(project) };
  },

  // Cover-Standbild für Library-Cards. Lazy generiert + gecached als <projectDir>/cover.jpg.
  // Renderer liefert candidate-Pfade (typisch highlights[0].clipPath); wir versuchen sie
  // der Reihe nach und extrahieren ein Frame bei 3s.
  'project.getCover': async (i: { id: string; sourcePaths?: string[] }) => {
    const projectDir = getProjectDir(i.id);
    const coverPath = path.join(projectDir, 'cover.jpg');
    try {
      await fs.access(coverPath);
      return { path: coverPath };  // Cache-Hit
    } catch { /* not cached → generate */ }

    await fs.mkdir(projectDir, { recursive: true });
    const candidates = (i.sourcePaths ?? []).filter((s): s is string => !!s);
    for (const src of candidates) {
      try {
        await fs.access(src);
        await extractFrameJpeg(src, coverPath, 3);
        return { path: coverPath };
      } catch (err) {
        console.warn(`[cover] failed for "${src.split('/').pop()}":`, (err as Error).message);
      }
    }
    return { path: null };
  },
  'project.updateHighlight': async (i: { projectId: string; index: number; patch: Partial<Highlight> }) => {
    await updateHighlight(i.projectId, i.index, i.patch);
    return { ok: true };
  },
  'project.setMusic':       async (i: { id: string; music: ProjectMusic | null }) => {
    await setProjectMusic(i.id, i.music);
    return { ok: true };
  },
  'project.addMusicTrack':  async (i: { id: string; track: ProjectMusic }) => {
    await addMusicTrack(i.id, i.track);
    return { ok: true };
  },
  'project.removeMusicTrack': async (i: { id: string; index: number }) => {
    await removeMusicTrack(i.id, i.index);
    return { ok: true };
  },
  'project.updateMusicTrack': async (i: { id: string; index: number; patch: Partial<ProjectMusic> }) => {
    await updateMusicTrack(i.id, i.index, i.patch);
    return { ok: true };
  },
  'project.setActiveMusicIndex': async (i: { id: string; index: number | undefined }) => {
    await setActiveMusicIndex(i.id, i.index);
    return { ok: true };
  },
  'project.setIntro':       async (i: { id: string; intro: ProjectIntro | null }) => {
    await setProjectIntro(i.id, i.intro);
    return { ok: true };
  },

  // ─── Settings (Keychain via safeStorage) ──────────────────
  'settings.setApiKey':     async (i: { key: string })               => { await setApiKey(i.key); return { ok: true }; },
  'settings.hasApiKey':     async ()                                 => ({ hasKey: await hasApiKey() }),
  'settings.deleteApiKey':  async ()                                 => { await deleteApiKey(); return { ok: true }; },

  // ─── App-Defaults (z.B. Default Facecam) ──────────────────
  'appDefaults.get':        async ()                                 => getAppDefaults(),
  // Stabilizer (vidstab) verfügbar? — Renderer fragt das beim Toggle-Aktivieren.
  'bin.hasVidstab':         async (): Promise<{ available: boolean }> => ({ available: hasVidstabFilter() }),
  'appDefaults.set':        async (i: { patch: Partial<AppDefaults> }) => {
    const next = await setAppDefaults(i.patch);
    // ffmpegPath-Änderung wirkt sich sofort aus
    if ('ffmpegPath' in i.patch) {
      setFfmpegOverride(next.ffmpegPath ?? null);
    }
    return next;
  },

  // ─── FFmpeg Diagnose ──────────────────────────────────────
  'health.ffmpegInstalls':  async ()                                 => ({
    installs: getFfmpegDiagnostics(),
  }),

  // ─── Gemini API Key (für Thumbnail Generator) ─────────────
  'gemini.setKey':          async (i: { key: string })               => { await setGeminiApiKey(i.key); return { ok: true }; },
  'gemini.hasKey':           async ()                                 => ({ hasKey: await hasGeminiApiKey() }),
  'gemini.deleteKey':        async ()                                 => { await deleteGeminiApiKey(); return { ok: true }; },

  // ─── Thumbnail Generator (Gemini Image Models) ────────────────
  /**
   * Versucht den User-konfigurierten Modell-Namen zuerst, dann eine Reihe bekannter
   * Image-fähiger Modelle. Erst wenn alle 404/Permission-Denied geben, wirft Fehler.
   */
  'thumbnail.generate': async (i: {
    prompt: string;
    referenceImageBase64?: string;
    referenceMime?: string;
  }) => {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API key not set. Add it in Settings.');

    // Modell-Reihenfolge: User-Override → 3.1 (Nano Banana) → 3-pro → 2.5-Fallbacks
    const userModel = (await getAppDefaults()).geminiImageModel?.trim();
    const candidates = [
      ...(userModel ? [userModel] : []),
      'gemini-3.1-flash-image-preview',            // Nano Banana 3.1 — User-Default
      'gemini-3-pro-image-preview',                // Nano Banana Pro
      'gemini-2.5-flash-image',                    // stable, schnell
      'gemini-2.5-flash-image-preview',            // legacy preview-name
      'gemini-2.0-flash-preview-image-generation', // legacy fallback
      'gemini-2.0-flash-exp',                      // legacy fallback
    ];
    const tryModels = Array.from(new Set(candidates));

    const TIMEOUT_MS = 90_000;

    /** Extrahiere Image-Bytes aus einer Gemini-Response. Liefert null wenn keins drin ist. */
    const extractImage = (json: any): { data: string; mime: string } | null => {
      const cands = json?.candidates ?? [];
      for (const c of cands) {
        for (const p of (c.content?.parts ?? [])) {
          const inline = p.inline_data ?? p.inlineData ?? p.image ?? p.media;
          const data   = inline?.data ?? p.data;
          const mime   = inline?.mime_type ?? inline?.mimeType ?? p.mime_type ?? p.mimeType ?? 'image/png';
          if (data) return { data, mime };
        }
      }
      return null;
    };

    /**
     * Probiert alle Modelle mit den gegebenen `parts`.
     * Liefert: { image, model } wenn erfolgreich, sonst { errors, allNoImage }.
     */
    const tryAllModels = async (parts: any[], label: string): Promise<
      | { image: { data: string; mime: string }; model: string }
      | { errors: Array<{ model: string; status: number; body: string }>; allNoImage: boolean }
    > => {
      const errors: Array<{ model: string; status: number; body: string }> = [];

      for (const model of tryModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        console.log(`[thumbnail] (${label}) try model=${model}`);

        const t0 = Date.now();
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            signal: ac.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseModalities: ['IMAGE'] },
            }),
          });
        } catch (err: any) {
          clearTimeout(timer);
          const aborted = err?.name === 'AbortError' || ac.signal.aborted;
          if (aborted) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            console.warn(`[thumbnail] ${model} TIMEOUT after ${elapsed}s — trying next`);
            errors.push({ model, status: 0, body: `timeout after ${elapsed}s` });
            continue;
          }
          const cause = err?.cause;
          const code = cause?.code ?? cause?.errno ?? 'unknown';
          console.error('[thumbnail] fetch failed:', err?.message, 'cause:', cause);
          throw new Error(`Network error (${code}). Check internet connection. Original: ${err?.message ?? err}`);
        }
        clearTimeout(timer);

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          errors.push({ model, status: res.status, body: errText.slice(0, 200) });
          console.warn(`[thumbnail] ${model} → ${res.status} after ${elapsed}s`);
          if (res.status !== 404 && res.status !== 403 && res.status !== 503) {
            throw new Error(`Gemini API ${res.status} (${model}): ${errText.slice(0, 400)}`);
          }
          continue;
        }

        const json: any = await res.json();
        console.log(`[thumbnail] ✓ ${model} responded ok in ${elapsed}s`);

        const img = extractImage(json);
        if (img) return { image: img, model };

        const finishReason = json?.candidates?.[0]?.finishReason ?? 'unknown';
        const finishMsg = json?.candidates?.[0]?.finishMessage ?? '';
        console.warn(`[thumbnail] ${model} NO image (${finishReason}) — trying next`);
        errors.push({
          model,
          status: 200,
          body: `no image (${finishReason}${finishMsg ? `: ${finishMsg.slice(0, 80)}` : ''})`,
        });
      }

      const allNoImage = errors.length > 0 && errors.every((e) => e.status === 200);
      return { errors, allNoImage };
    };

    // ─── Pass 1: mit Reference-Image (falls vorhanden) ─────────
    const partsWithRef: any[] = [{ text: i.prompt }];
    if (i.referenceImageBase64) {
      partsWithRef.push({
        inline_data: {
          mime_type: i.referenceMime ?? 'image/jpeg',
          data: i.referenceImageBase64,
        },
      });
    }
    console.log(`[thumbnail] pass=1 ref=${!!i.referenceImageBase64} prompt=${i.prompt.length} chars`);

    let result = await tryAllModels(partsWithRef, 'pass1');
    let combinedErrors = 'errors' in result ? [...result.errors] : [];

    // ─── Pass 2: OHNE Reference-Image (wenn alle 200-OK aber NO_IMAGE und Ref dabei war) ─────
    // Häufiger Fall: Ref-Image triggert Safety-Filter (Gameplay/Kampf-Szenen).
    // Ohne Ref klappt's oft — etwas weniger zielgerichtet, aber überhaupt ein Output.
    if (!('image' in result) && result.allNoImage && i.referenceImageBase64) {
      console.warn('[thumbnail] All models refused with reference image — retrying WITHOUT reference');
      const partsTextOnly: any[] = [{ text: i.prompt }];
      result = await tryAllModels(partsTextOnly, 'pass2-no-ref');
      if ('errors' in result) combinedErrors = combinedErrors.concat(result.errors);
    }

    if ('image' in result) {
      const dir = path.join(require('electron').app.getPath('userData'), 'thumbnails');
      await fs.mkdir(dir, { recursive: true });
      const ext = result.image.mime === 'image/jpeg' ? 'jpg' : 'png';
      const outPath = path.join(dir, `thumb-${Date.now()}.${ext}`);
      await fs.writeFile(outPath, Buffer.from(result.image.data, 'base64'));
      console.log(`[thumbnail] saved → ${outPath} (${result.image.mime}) [model=${result.model}]`);
      return { path: outPath };
    }

    // Beide Passes durch — finalen Error bauen
    const summary = combinedErrors
      .map((e) => `${e.model} → ${e.status === 200 ? e.body : `HTTP ${e.status}`}`)
      .join('\n  · ');

    let availableHint = '';
    try {
      const lr = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
      if (lr.ok) {
        const ljson: any = await lr.json();
        const imageish: string[] = (ljson.models ?? [])
          .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
          .filter((n: string) => /image|imagen/i.test(n));
        if (imageish.length) {
          availableHint = `\n\nImage models available for your key:\n  · ${imageish.slice(0, 8).join('\n  · ')}`;
        }
      }
    } catch {}

    const allNoImage = combinedErrors.length > 0 && combinedErrors.every((e) => e.status === 200);
    const allTimeout = combinedErrors.length > 0 && combinedErrors.every((e) => e.status === 0);
    const hint = allTimeout
      ? '\n\nAll models timed out. Gemini image API is currently slow — try again in a few minutes.'
      : allNoImage
        ? '\n\nAll models refused to generate. Try rephrasing the prompt (avoid weapons / violence / specific persons).'
        : '\n\nMix of failures — usually transient API issues (503 = overloaded). Try again in a moment.';

    throw new Error(`Gemini thumbnail generation failed.\nTried:\n  · ${summary}` + hint + availableHint);
  },

  /**
   * Listet alle Modelle die der User-API-Key sehen kann.
   * Filtert auf Image-fähige (responseModalities ['IMAGE']) und/oder die nach Image klingen.
   */
  'gemini.listModels': async () => {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API key not set.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err: any) {
      throw new Error(`Network error: ${err?.message ?? err}`);
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const all: Array<any> = json.models ?? [];
    // Map auf simple Struktur, behalte alle für Dropdown
    const models = all.map((m) => ({
      name: String(m.name ?? '').replace(/^models\//, ''),
      displayName: String(m.displayName ?? ''),
      description: String(m.description ?? ''),
      methods: m.supportedGenerationMethods ?? [],
      input: m.inputTokenLimit ?? 0,
      output: m.outputTokenLimit ?? 0,
    }));
    // Wahrscheinlichkeit für Image-fähig: Name enthält "image" / "imagen" / "flash-image" oder
    // unterstützt generateContent UND ist nicht ausschließlich text
    const imageish = models.filter((m) =>
      /image|imagen|flash-2\.5/i.test(m.name) ||
      (m.methods.includes('generateContent') && /image/i.test(m.description)),
    );
    return { all: models, imageLike: imageish };
  },

  /** Liste aller bisher generierten Thumbnails (mit Pfaden + Timestamps). */
  'thumbnail.list': async () => {
    const dir = path.join(require('electron').app.getPath('userData'), 'thumbnails');
    try {
      const files = await fs.readdir(dir);
      const items = await Promise.all(
        files
          .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
          .map(async (f) => {
            const p = path.join(dir, f);
            const stat = await fs.stat(p);
            return { path: p, mtime: stat.mtime.getTime(), size: stat.size };
          }),
      );
      return { items: items.sort((a, b) => b.mtime - a.mtime) };
    } catch {
      return { items: [] };
    }
  },

  'thumbnail.delete': async (i: { path: string }) => {
    await fs.rm(i.path, { force: true });
    return { ok: true };
  },

  // ─── Text-to-Speech (OpenAI TTS API, nutzt vorhandenen API-Key) ───────
  // Voices: alloy/echo/fable/onyx/nova/shimmer. Sprache wird von OpenAI
  // automatisch aus dem Input-Text erkannt — kein expliziter lang-Parameter.
  // Output: MP3-Datei in userData/tts/, Pfad wird zurückgegeben.
  'tts.generate': async (i: { text: string; voice: string }): Promise<{ path: string }> => {
    const text = (i.text ?? '').trim();
    if (!text) throw new Error('Text required');
    if (text.length > 4096) throw new Error('Max 4096 characters per generation');
    const allowedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const voice = allowedVoices.includes(i.voice) ? i.voice : 'nova';

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('OpenAI API key not configured. Add it under Settings → API Keys.');

    console.log(`[tts] generating ${text.length} chars with voice "${voice}"…`);
    const t0 = Date.now();
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = path.join(require('electron').app.getPath('userData'), 'tts');
    await fs.mkdir(dir, { recursive: true });
    const filename = `tts-${voice}-${Date.now()}.mp3`;
    const outPath = path.join(dir, filename);
    await fs.writeFile(outPath, buf);
    console.log(`[tts] ✓ ${(buf.length / 1024).toFixed(1)} KB in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${filename}`);
    return { path: outPath };
  },

  'thumbnail.saveAs': async (i: { srcPath: string; suggestedName?: string }) => {
    const r = await dialog.showSaveDialog({
      defaultPath: i.suggestedName ?? 'thumbnail.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    await fs.copyFile(i.srcPath, r.filePath);
    return { canceled: false, savedTo: r.filePath };
  },

  'dialog.openImage': async (): Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  /**
   * Direkt-Read einer Datei zu base64. Sauberer als fetch(media://) im Renderer
   * — keine Protocol-Hops, kein Encoding-Wirrwarr.
   */
  'file.readAsBase64': async (i: { path: string }) => {
    try {
      const buf = await fs.readFile(i.path);
      const ext = path.extname(i.path).toLowerCase().slice(1);
      const mimeMap: Record<string, string> = {
        jpg:  'image/jpeg', jpeg: 'image/jpeg',
        png:  'image/png',  webp: 'image/webp', gif: 'image/gif',
      };
      return {
        base64: buf.toString('base64'),
        mime: mimeMap[ext] ?? 'application/octet-stream',
        size: buf.length,
      };
    } catch (err: any) {
      throw new Error(`Could not read file: ${err?.message ?? err}`);
    }
  },

  // ─── Media: Browser-kompatible Preview-Version erzeugen ──
  // Wird vom Editor beim Asset-Import aufgerufen. Skipt wenn schon H.264/MP4.
  'media.transcodeForPreview': async (i: { path: string }) => {
    return transcodeForPreview(i.path);
  },

  // ─── Editor: Multi-Track-Timeline rendern ──────────────
  // Im Gegensatz zu buildVideo respektiert dies alle Tracks (Video/Overlay/Audio)
  // mit ihren Per-Clip-Transforms. Output landet in projects/<id>/exports/.
  'editor.renderTimeline': async (i: {
    outputPath: string;
    clips: Array<EditorClipSpec & {
      aiMaskPng?: string;          // base64 — Static (single)
      aiMaskPngs?: string[];        // base64-Array — Per-Frame
      aiMaskFps?: number;           // Sampling-FPS für Per-Frame-Sequenz
      textPngBase64?: string;       // base64 PNG — pre-rendered Text-Overlay
      stabilizeEnabled?: boolean;   // vidstab pre-pass aktiv
      stabilizeSmoothness?: number; // 5..30, default 10
    }>;
    options: EditorRenderOptions;
    qualityMode?: QualityMode;
  }) => {
    if (!i.outputPath) throw new Error('outputPath required');
    await applyQualityMode(i.qualityMode);
    await fs.mkdir(path.dirname(i.outputPath), { recursive: true });

    // ── vidstab Pre-Pass: für stabilize-Clips .trf-Files generieren ──
    // Wird VOR dem haupt-Render gemacht; trf-Pfade landen in der spec.
    const tmpStabDir = path.join(path.dirname(i.outputPath), '.stab-tmp-' + Date.now());
    let createdStabDir = false;
    const wantsStabilize = i.clips.some((c) => c.stabilizeEnabled);
    const stabilizeAvailable = wantsStabilize ? hasVidstabFilter() : true;
    if (wantsStabilize && !stabilizeAvailable) {
      console.warn('[editor-render] stabilize requested but vidstab filter not available — skipping');
    }

    // AI-Mask PNGs in tmp/ schreiben, Pfad in spec eintragen.
    // Per-Frame: schreibe Sequenz mask_NNNN.png in clip-Subfolder + fps mitgeben.
    // Static: schreibe ein einzelnes mask_<n>.png.
    const tmpMaskDir = path.join(path.dirname(i.outputPath), '.aimask-tmp-' + Date.now());
    await fs.mkdir(tmpMaskDir, { recursive: true });
    // Text-PNG temp dir (full-canvas overlays für text-clips, pre-rendered im Renderer)
    const tmpTextDir = path.join(path.dirname(i.outputPath), '.text-tmp-' + Date.now());
    await fs.mkdir(tmpTextDir, { recursive: true });
    const cleanedClips: EditorClipSpec[] = [];
    let maskCount = 0;
    let textCount = 0;
    let stabCount = 0;
    for (const c of i.clips) {
      const { aiMaskPng, aiMaskPngs, aiMaskFps, textPngBase64, stabilizeEnabled, stabilizeSmoothness, ...rest } = c;

      // Text-Clip: schreibe pre-rendered PNG zu temp file, src + textPngPath setzen.
      if (textPngBase64) {
        const textPath = path.join(tmpTextDir, `text_${textCount++}.png`);
        await fs.writeFile(textPath, Buffer.from(textPngBase64, 'base64'));
        cleanedClips.push({ ...rest, src: textPath, textPngPath: textPath });
        continue;
      }

      // Stabilizer Pre-Pass: wenn aktiv UND vidstab verfügbar → detect-pass für diesen Clip-Range
      let stabilizeTrfPath: string | undefined;
      let stabilizeFinalSmoothness: number | undefined;
      if (stabilizeEnabled && stabilizeAvailable) {
        if (!createdStabDir) {
          await fs.mkdir(tmpStabDir, { recursive: true });
          createdStabDir = true;
        }
        const trf = path.join(tmpStabDir, `stab_${stabCount++}.trf`);
        const trimStart = c.trimStart ?? 0;
        const speed = c.speed && c.speed > 0 ? c.speed : 1;
        const detectDur = c.duration * speed;
        try {
          await runVidstabDetect(c.src, trimStart, detectDur, trf);
          stabilizeTrfPath = trf;
          stabilizeFinalSmoothness = stabilizeSmoothness ?? 10;
        } catch (err: any) {
          console.warn(`[editor-render] vidstab detect failed for ${c.src}: ${err?.message ?? err}`);
        }
      }

      // stabilize-Felder werden in jeden Pfad eingespielt (mask oder normal)
      const withStab = (spec: EditorClipSpec): EditorClipSpec =>
        stabilizeTrfPath ? { ...spec, stabilizeTrfPath, stabilizeSmoothness: stabilizeFinalSmoothness } : spec;

      if (aiMaskPngs && aiMaskPngs.length > 0 && aiMaskFps && aiMaskFps > 0) {
        // Per-Frame-Sequenz
        const subDir = path.join(tmpMaskDir, `clip_${maskCount}`);
        await fs.mkdir(subDir, { recursive: true });
        for (let j = 0; j < aiMaskPngs.length; j++) {
          const fn = `mask_${String(j + 1).padStart(4, '0')}.png`;
          await fs.writeFile(path.join(subDir, fn), Buffer.from(aiMaskPngs[j], 'base64'));
        }
        const pattern = path.join(subDir, 'mask_%04d.png');
        cleanedClips.push(withStab({ ...rest, aiMaskPath: pattern, aiMaskFps }));
        maskCount++;
      } else if (aiMaskPng) {
        // Static (single)
        const maskPath = path.join(tmpMaskDir, `mask_${maskCount++}.png`);
        await fs.writeFile(maskPath, Buffer.from(aiMaskPng, 'base64'));
        cleanedClips.push(withStab({ ...rest, aiMaskPath: maskPath }));
      } else {
        cleanedClips.push(withStab(rest));
      }
    }

    try {
      await renderEditorTimeline(cleanedClips, i.outputPath, i.options);
    } finally {
      // tmp masks + text-PNGs + stabilize-trfs aufräumen
      try { await fs.rm(tmpMaskDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { await fs.rm(tmpTextDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { await fs.rm(tmpStabDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    return { path: i.outputPath };
  },

  // ─── Editor: State persistieren (clips, tracks, settings) ──
  // Damit User-Edits beim nächsten App-Start wieder da sind.
  'editor.saveState': async (i: { projectId: string; state: unknown }) => {
    const projectDir = getProjectDir(i.projectId);
    await fs.mkdir(projectDir, { recursive: true });
    const filePath = path.join(projectDir, 'editor-state.json');
    await fs.writeFile(filePath, JSON.stringify(i.state, null, 2), 'utf8');
    return { ok: true };
  },

  'editor.loadState': async (i: { projectId: string }): Promise<{ state: unknown }> => {
    const projectDir = getProjectDir(i.projectId);
    const filePath = path.join(projectDir, 'editor-state.json');
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return { state: JSON.parse(data) };
    } catch (e: any) {
      if (e?.code === 'ENOENT') return { state: null };
      throw e;
    }
  },

  // ─── File-Existence-Check (für previewSrc-Validation beim Project-Load) ─
  'fs.exists': async (i: { path: string }) => {
    try { await fs.access(i.path); return { exists: true }; }
    catch { return { exists: false }; }
  },

  // ─── AI Mask: Model-Status checken ───────────────────────
  // Erkennt SOWOHL SAM 1 (sam_vit_b_*) ALS AUCH SAM 2 (sam2_*) — was vorhanden ist wird genutzt.
  'aiMask.modelStatus': async () => {
    const userData = (await import('electron')).app.getPath('userData');
    const modelsDir = path.join(userData, 'ai-models');
    const sam2Enc = path.join(modelsDir, 'sam2_encoder.onnx');
    const sam2Dec = path.join(modelsDir, 'sam2_decoder.onnx');
    const sam1Enc = path.join(modelsDir, 'sam_vit_b_encoder.onnx');
    const sam1Dec = path.join(modelsDir, 'sam_vit_b_decoder.onnx');
    const [s2e, s2d, s1e, s1d] = await Promise.all([
      fs.access(sam2Enc).then(() => true).catch(() => false),
      fs.access(sam2Dec).then(() => true).catch(() => false),
      fs.access(sam1Enc).then(() => true).catch(() => false),
      fs.access(sam1Dec).then(() => true).catch(() => false),
    ]);
    // SAM 2 hat Vorrang wenn vorhanden, sonst SAM 1
    const useSam2 = s2e && s2d;
    const encoderAvailable = useSam2 ? s2e : s1e;
    const decoderAvailable = useSam2 ? s2d : s1d;
    const encoderPath = useSam2 ? sam2Enc : sam1Enc;
    const decoderPath = useSam2 ? sam2Dec : sam1Dec;
    return {
      encoderAvailable, decoderAvailable, encoderPath, decoderPath, modelsDir,
      activeVariant: useSam2 ? 'sam2' : 'sam1',
    };
  },

  // ─── AI Mask: alte SAM 1 Files + SAM 2 Cache-Reset ──────────
  'aiMask.resetModels': async () => {
    const userData = (await import('electron')).app.getPath('userData');
    const modelsDir = path.join(userData, 'ai-models');
    const filesToDelete = [
      'sam_vit_b_encoder.onnx',
      'sam_vit_b_decoder.onnx',
      'sam2_encoder.onnx',
      'sam2_decoder.onnx',
    ];
    let removed = 0;
    for (const f of filesToDelete) {
      try { await fs.unlink(path.join(modelsDir, f)); removed++; } catch { /* not present */ }
    }
    return { removed };
  },

  // ─── AI Mask: Models-Verzeichnis im Finder öffnen (für manuellen Download) ──
  'aiMask.revealModelsDir': async () => {
    const userData = (await import('electron')).app.getPath('userData');
    const modelsDir = path.join(userData, 'ai-models');
    await fs.mkdir(modelsDir, { recursive: true });
    shell.openPath(modelsDir);
    return { path: modelsDir };
  },

  // ─── AI Mask: ONNX-Bytes lesen — versuche SAM 2 zuerst, fallback SAM 1 ──
  'aiMask.readModelBytes': async (i: { kind: 'encoder' | 'decoder' }) => {
    const { app } = await import('electron');
    const modelsDir = path.join(app.getPath('userData'), 'ai-models');
    const sam2 = i.kind === 'encoder' ? 'sam2_encoder.onnx' : 'sam2_decoder.onnx';
    const sam1 = i.kind === 'encoder' ? 'sam_vit_b_encoder.onnx' : 'sam_vit_b_decoder.onnx';
    let filePath = path.join(modelsDir, sam2);
    try { await fs.access(filePath); }
    catch { filePath = path.join(modelsDir, sam1); }
    const buf = await fs.readFile(filePath);
    return {
      bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      size: buf.byteLength,
      variant: filePath.includes('sam2') ? 'sam2' : 'sam1',
    };
  },

  // ─── AI Mask: Auto-Download SAM 2 base_plus aus GitHub (no auth) ──
  // Quelle: github.com/ibaiGorordo/ONNX-SAM2-Segment-Anything/releases
  // base_plus ~324MB encoder + ~20MB decoder = ~344MB — substantieller Download
  // aber dafür echtes SAM 2 mit Tracking-Capability für später.
  'aiMask.downloadModels': async (i: { variant?: 'sam1' | 'sam2' } | undefined) => {
    const { app } = await import('electron');
    const { broadcast } = await import('./core/events');
    const userData = app.getPath('userData');
    const modelsDir = path.join(userData, 'ai-models');
    await fs.mkdir(modelsDir, { recursive: true });

    const variant = i?.variant ?? 'sam2';

    const targets: Array<{ urls: string[]; outName: string; label: string }> = variant === 'sam2' ? [
      {
        urls: [
          'https://github.com/ibaiGorordo/ONNX-SAM2-Segment-Anything/releases/latest/download/sam2_hiera_base_plus_encoder.onnx',
        ],
        outName: 'sam2_encoder.onnx',
        label: 'SAM 2 Image Encoder base_plus (~324 MB)',
      },
      {
        urls: [
          'https://github.com/ibaiGorordo/ONNX-SAM2-Segment-Anything/releases/latest/download/decoder.onnx',
        ],
        outName: 'sam2_decoder.onnx',
        label: 'SAM 2 Mask Decoder (~20 MB)',
      },
    ] : [
      {
        urls: ['https://huggingface.co/Xenova/sam-vit-base/resolve/main/onnx/vision_encoder_quantized.onnx'],
        outName: 'sam_vit_b_encoder.onnx',
        label: 'SAM 1 Image Encoder (~33 MB)',
      },
      {
        urls: ['https://huggingface.co/Xenova/sam-vit-base/resolve/main/onnx/prompt_encoder_mask_decoder_quantized.onnx'],
        outName: 'sam_vit_b_decoder.onnx',
        label: 'SAM 1 Mask Decoder (~6 MB)',
      },
    ];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const outPath = path.join(modelsDir, t.outName);
      const tmpPath = outPath + '.tmp';

      // Skip wenn schon da
      try { await fs.access(outPath); console.log(`[ai-mask] skip ${t.outName} (exists)`); continue; }
      catch { /* doesn't exist, download */ }

      // Versuche jede URL bis eine klappt
      let lastError: any = null;
      let success = false;
      for (const url of t.urls) {
        try {
          console.log(`[ai-mask] try ${t.label} from ${url}`);
          broadcast({ type: 'progress', step: 'aiMask.download', percent: (i / targets.length) * 100, message: `Trying ${t.label}…` } as any);

          const res = await fetch(url, { redirect: 'follow' });
          if (!res.ok || !res.body) {
            lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
            console.warn(`[ai-mask] ${url} failed: ${lastError.message}`);
            continue;
          }
          const total = parseInt(res.headers.get('content-length') ?? '0', 10);
          let received = 0;

          const fileHandle = await fs.open(tmpPath, 'w');
          try {
            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              await fileHandle.write(value);
              received += value.length;
              if (total > 0) {
                const fileFraction = received / total;
                const overall = ((i + fileFraction) / targets.length) * 100;
                broadcast({ type: 'progress', step: 'aiMask.download', percent: overall,
                  message: `${t.label}: ${(received / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB` } as any);
              }
            }
          } finally { await fileHandle.close(); }

          await fs.rename(tmpPath, outPath);
          console.log(`[ai-mask] ${t.outName} done (${(received / 1024 / 1024).toFixed(1)} MB) from ${url}`);
          success = true;
          break;
        } catch (err: any) {
          lastError = err;
          try { await fs.unlink(tmpPath); } catch { /* ignore */ }
          console.warn(`[ai-mask] ${url} threw:`, err?.message);
        }
      }

      if (!success) {
        throw new Error(
          `All download mirrors failed for ${t.label}.\n` +
          `Last error: ${lastError?.message ?? 'unknown'}\n\n` +
          `Manual workaround: download the SAM 2 ONNX files (encoder + decoder) ` +
          `and place them in the models folder as sam2_encoder.onnx and sam2_decoder.onnx. ` +
          `Click "Open Folder" to see the path.`,
        );
      }
    }

    broadcast({ type: 'progress', step: 'aiMask.download', percent: 100, message: 'Models ready' } as any);
    return { ok: true, modelsDir };
  },

  // ─── Health Check ─────────────────────────────────────────
  'health.binaries':        async ()                                 => {
    // Cache flushen bei jedem Re-check, damit ein zwischenzeitliches `brew install ffmpeg`
    // direkt greift statt einen alten Pfad zu reusen.
    clearBinaryCache();
    const sup = getSubtitleSupport();
    return {
      binaries: checkBinaries(),
      subtitlesAvailable: sup.libass,
      subtitleSupport: sup,
    };
  },

  // ─── Dialog ───────────────────────────────────────────────
  'dialog.openVideo': async (): Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  'dialog.openMultipleVideos': async (): Promise<{ paths: string[] } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    return { paths: r.filePaths };
  },

  'dialog.openMusic': async (): Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  'dialog.openIntro': async (): Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  // ─── Editor: Asset (Video ODER Audio) Picker ──────────
  'dialog.openEditorAsset': async (): Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Media', extensions: ['mp4','mov','mkv','webm','m4v','mp3','m4a','wav','aac','ogg','flac'] },
        { name: 'Video', extensions: ['mp4','mov','mkv','webm','m4v'] },
        { name: 'Audio', extensions: ['mp3','m4a','wav','aac','ogg','flac'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  // ─── Generic File-Picker (z.B. für LUTs) ───────────────
  'dialog.openFile': async (i: { filters?: Array<{ name: string; extensions: string[] }>; title?: string }):
                          Promise<{ path: string } | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: i.title,
      filters: i.filters && i.filters.length > 0 ? i.filters : undefined,
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0] };
  },

  // ─── Editor: Save-As für Export ───────────────────────
  'dialog.saveEditorExport': async (i: { suggestedName?: string }): Promise<{ path: string } | null> => {
    const r = await dialog.showSaveDialog({
      defaultPath: i.suggestedName ?? 'edit.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (r.canceled || !r.filePath) return null;
    return { path: r.filePath };
  },

  // ─── Shell / Export ───────────────────────────────────────
  /**
   * Master-Clip + Trim + Format → Save-As-Dialog → finale Datei.
   * Re-encoded mit FFmpeg, daher dauert der Save ein paar Sekunden.
   */
  'shell.exportClip': async (i: {
    masterPath: string;
    suggestedName: string;
    format: ExportFormat;
    segments: ClipSegment[];
    layout?: TikTokLayout;
    facecam?: FacecamRegion;
    splitRatio?: number;
    music?: ProjectMusic;
    qualityMode?: QualityMode;
    // Optional: Subtitle Embedding aus dem transcript.json des Projekts
    subtitles?: {
      projectId: string;
      highlightIndex: number;
      style: SubtitleStyle;
      position?: SubtitlePosition;
      customY?: number;
      settings?: SubtitleSettings;
    };
  }) => {
    // Pre-Flight: wenn Subs gewünscht, mindestens EIN Burn-In-Pfad muss da sein
    if (i.subtitles) {
      const sup = getSubtitleSupport();
      if (!sup.libass && !sup.drawtext) {
        throw new Error(
          'Subtitle burn-in needs FFmpeg with libass or libfreetype.\n\n' +
          'Your installed FFmpeg has neither.\n\n' +
          'Fix: brew uninstall ffmpeg && brew install ffmpeg\n' +
          '(or use the homebrew-ffmpeg/ffmpeg tap for full features)',
        );
      }
    }
    await applyQualityMode(i.qualityMode);

    const r = await dialog.showSaveDialog({
      defaultPath: i.suggestedName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (r.canceled || !r.filePath) return { canceled: true };

    const tmp = path.join(os.tmpdir(), `videoapp-export-${Date.now()}.mp4`);
    let srtPath: string | null = null;
    try {
      // Subtitles: libass-Pfad UND drawtext-Fallback vorbereiten.
      // exportClipAs entscheidet runtime welcher Pfad genommen wird.
      let subsForExport: {
        style: SubtitleStyle;
        position?: SubtitlePosition;
        customY?: number;
        settings?: SubtitleSettings;
        srtPath?: string;
        transcript?: any;
        highlight?: any;
      } | undefined;
      if (i.subtitles) {
        const projectsList = await listProjects();
        const project = projectsList.find((p) => p.id === i.subtitles!.projectId);
        if (project) {
          try {
            const tjson = await fs.readFile(path.join(getProjectDir(project.id), 'transcript.json'), 'utf8');
            const transcript = JSON.parse(tjson);
            const hl = project.highlights[i.subtitles.highlightIndex];
            if (hl) {
              subsForExport = {
                style: i.subtitles.style,
                position: i.subtitles.position,
                customY: i.subtitles.customY,
                settings: i.subtitles.settings,
                transcript,
                highlight: hl,
              };
              // Nur libass-SRT generieren wenn der Filter da ist (sonst spart's IO)
              if (hasSubtitlesFilter()) {
                const srtName = `clip-${i.subtitles.highlightIndex}-${Date.now()}.srt`;
                const generated = await generateClipSrt(
                  transcript, hl, os.tmpdir(), srtName,
                  i.subtitles.style, i.subtitles.settings,
                );
                if (generated) {
                  srtPath = generated;
                  subsForExport.srtPath = generated;
                }
              }
            }
          } catch (err: any) {
            console.warn(`[subtitles] could not load transcript: ${err?.message ?? err}`);
          }
        }
      }

      await exportClipAs(i.format, i.masterPath, tmp, i.segments, {
        layout: i.layout,
        facecam: i.facecam,
        splitRatio: i.splitRatio,
        music: i.music,
        subtitles: subsForExport,
      });
      await fs.rename(tmp, r.filePath).catch(async () => {
        await fs.copyFile(tmp, r.filePath);
        await fs.rm(tmp, { force: true });
      });
      return { canceled: false, savedTo: r.filePath };
    } catch (err: any) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    } finally {
      if (srtPath) await fs.rm(srtPath, { force: true }).catch(() => {});
    }
  },

  'shell.buildVideo': async (i: {
    projectId: string;
    suggestedName: string;
    format: ExportFormat;
    clips: BuilderClip[];
    layout?: TikTokLayout;
    facecam?: FacecamRegion;
    gameplay?: import('@shared/types').GameplayRegion;
    splitRatio?: number;
    effects?: import('@shared/types').ClipEffects;
    intro?: ProjectIntro;
    music?: ProjectMusic;
    qualityMode?: QualityMode;
    exportQuality?: { width?: number; height?: number; fps?: number; bitrate?: string };
    /** Index muss mit clips-Array korrelieren. */
    subtitlesPerClip?: Array<{
      highlightIndex: number;
      style: SubtitleStyle;
      position?: SubtitlePosition;
      customY?: number;
      settings?: SubtitleSettings;
      /** Pre-rendered Layered-Subtitle-PNG-Overlays — wenn gesetzt: skip libass. */
      pngOverlays?: Array<{ start: number; end: number; pngBase64: string }>;
    } | null>;
  }) => {
    const r = await dialog.showSaveDialog({
      defaultPath: i.suggestedName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    await applyQualityMode(i.qualityMode);

    // Pre-Flight: wenn Subs gewünscht, mindestens EIN Burn-In-Pfad muss da sein
    const wantsSubs = i.subtitlesPerClip?.some((s) => s) ?? false;
    if (wantsSubs) {
      const sup = getSubtitleSupport();
      if (!sup.libass && !sup.drawtext) {
        throw new Error(
          'Subtitle burn-in needs FFmpeg with libass or libfreetype.\n\n' +
          'Your installed FFmpeg has neither.\n\n' +
          'Fix: brew uninstall ffmpeg && brew install ffmpeg\n' +
          '(or use the homebrew-ffmpeg/ffmpeg tap for full features)',
        );
      }
    }

    const tmpDir = path.join(getProjectDir(i.projectId), 'build_tmp');
    await fs.mkdir(tmpDir, { recursive: true });

    // Pro Clip Subtitles vorbereiten — libass UND drawtext-Fallback vorhalten.
    const generatedSrtPaths: string[] = [];
    let subsForBuild: Array<{
      style: SubtitleStyle;
      position?: SubtitlePosition;
      customY?: number;
      settings?: SubtitleSettings;
      srtPath?: string;
      transcript?: any;
      highlight?: any;
      pngOverlayPaths?: Array<{ start: number; end: number; path: string }>;
    } | undefined> | undefined;

    // Tmp-Dir für pre-rendered Subtitle-PNGs (Layered-Style). Wird im finally aufgeräumt.
    const tmpSubPngDir = path.join(tmpDir, 'sub-pngs');
    let createdSubPngDir = false;

    try {
      if (i.subtitlesPerClip && i.subtitlesPerClip.some((s) => s)) {
        const projectsList = await listProjects();
        const project = projectsList.find((p) => p.id === i.projectId);
        if (project) {
          try {
            const tjson = await fs.readFile(path.join(getProjectDir(project.id), 'transcript.json'), 'utf8');
            const transcript = JSON.parse(tjson);
            const libassOk = hasSubtitlesFilter();
            subsForBuild = await Promise.all(
              i.subtitlesPerClip.map(async (sub, clipIdx) => {
                if (!sub) return undefined;
                const hl = project.highlights[sub.highlightIndex];
                if (!hl) return undefined;
                const entry: any = {
                  style: sub.style,
                  position: sub.position,
                  customY: sub.customY,
                  settings: sub.settings,
                  transcript,
                  highlight: hl,
                };
                // Pre-rendered Layered-PNGs: schreibe zu temp + setze Pfade.
                // Wenn gesetzt → ffmpeg.ts wird libass SKIPPEN.
                if (sub.pngOverlays && sub.pngOverlays.length > 0) {
                  if (!createdSubPngDir) {
                    await fs.mkdir(tmpSubPngDir, { recursive: true });
                    createdSubPngDir = true;
                  }
                  const paths: Array<{ start: number; end: number; path: string }> = [];
                  for (let pi = 0; pi < sub.pngOverlays.length; pi++) {
                    const p = sub.pngOverlays[pi];
                    const pngPath = path.join(tmpSubPngDir, `clip${clipIdx}_cue${pi}.png`);
                    await fs.writeFile(pngPath, Buffer.from(p.pngBase64, 'base64'));
                    paths.push({ start: p.start, end: p.end, path: pngPath });
                  }
                  entry.pngOverlayPaths = paths;
                  console.log(`[subtitles/build] wrote ${paths.length} layered-PNG overlays for clip${clipIdx}`);
                } else if (libassOk) {
                  const srt = await generateClipSrt(
                    transcript, hl, tmpDir,
                    `subs-${sub.highlightIndex}-${Date.now()}.srt`,
                    sub.style, sub.settings,
                  );
                  if (srt) {
                    generatedSrtPaths.push(srt);
                    entry.srtPath = srt;
                  }
                }
                return entry;
              }),
            );
          } catch (err: any) {
            console.warn(`[subtitles/build] could not load transcript: ${err?.message ?? err}`);
          }
        }
      }

      await buildVideo(i.clips, r.filePath, {
        format: i.format,
        layout: i.layout,
        facecam: i.facecam,
        gameplay: i.gameplay,
        splitRatio: i.splitRatio,
        effects: i.effects,
        intro: i.intro,
        music: i.music,
        exportQuality: i.exportQuality,
        subtitlesPerClip: subsForBuild,
      }, tmpDir);
      return { canceled: false, savedTo: r.filePath };
    } finally {
      // SRTs aufräumen — buildTmp wird sowieso geräumt aber sicherheitshalber
      for (const p of generatedSrtPaths) {
        await fs.rm(p, { force: true }).catch(() => {});
      }
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },

  'shell.revealInFolder': async (i: { path: string }) => {
    shell.showItemInFolder(path.normalize(i.path));
    return { ok: true };
  },

  // ─── Auth: Session encrypted persisting via safeStorage (Phase 6.1) ───────
  // saveSession nimmt einen JSON-stringified Supabase-Session-Object,
  // ver-/entschlüsselt mit Electron safeStorage (Keychain/DPAPI), legt's
  // in userData/auth-session.enc ab.
  'auth.saveSession': async (i: { sessionJson: string }) => {
    const { saveSession } = await import('./core/auth');
    await saveSession(i.sessionJson);
    return { ok: true };
  },
  'auth.loadSession': async () => {
    const { loadSession } = await import('./core/auth');
    return await loadSession();
  },
  'auth.clearSession': async () => {
    const { clearSession } = await import('./core/auth');
    await clearSession();
    return { ok: true };
  },

  // Generic external-URL opener (für Stripe Checkout, Google OAuth, etc.)
  'shell.openExternal': async (i: { url: string }) => {
    if (!i?.url) return { ok: false };
    // Whitelist auf https/fiano-Custom-Scheme — keine arbiträren Protocols
    if (!/^https?:\/\//i.test(i.url)) return { ok: false, error: 'Unsupported protocol' };
    await shell.openExternal(i.url);
    return { ok: true };
  },

  // Mac-Fallback: bei unsigned-Build kann Squirrel.Mac den Update nicht validieren
  //  ("Code signature did not pass validation"). User bekommt stattdessen die
  //  GitHub-Release-Page geöffnet und installiert die DMG manuell.
  'app.openReleasePage': async (i: { version?: string }) => {
    const tag = i?.version ? `tag/v${i.version}` : 'latest';
    const url = `https://github.com/garymikefischer-art/fiano/releases/${tag}`;
    await shell.openExternal(url);
    return { ok: true };
  },

  // Auto-Updater: User klickt "Restart now" im UpdateToast → quitAndInstall
  // electron-updater ist CommonJS — durch electron-vite kann der Default-Export
  // unterschiedlich gewrappt sein. Wir versuchen alle gängigen Shapes (siehe
  // gleicher Helper in main/index.ts).
  'app.restartAndInstall': async () => {
    try {
      const mod: any = await import('electron-updater');
      const autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater ?? mod.default ?? mod;
      if (!autoUpdater || typeof autoUpdater.quitAndInstall !== 'function') {
        console.warn(
          `[updater] quitAndInstall unavailable. Module keys: ${Object.keys(mod).join(', ')}`,
        );
        return { ok: false };
      }
      console.log('[updater] quitAndInstall: closing app to install update');
      // isSilent=false (Installer-UI zeigen, sonst wirken Win-Installer "stuck"),
      // isForceRunAfter=true (App nach Install neustarten)
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (err: any) {
      console.warn('[updater] quitAndInstall failed:', err);
      return { ok: false };
    }
  },

  // ─── Transcript: Cues für ein Highlight liefern ──────────────────
  // Renderer braucht das für Subtitle-PNG-Pre-Render (Layered-Style).
  // Output: Cue-Liste mit Timestamps RELATIV zum Highlight-Anfang (0 = clip-start),
  // analog zum SRT-Generator damit beide Pfade identisch timen.
  'transcript.getCuesForHighlight': async (i: {
    projectId: string;
    highlightIndex: number;
  }): Promise<{ cues: Array<{ start: number; end: number; text: string }> }> => {
    const projectsList = await listProjects();
    const project = projectsList.find((p) => p.id === i.projectId);
    if (!project) return { cues: [] };
    const hl = project.highlights[i.highlightIndex];
    if (!hl) return { cues: [] };
    try {
      const tjson = await fs.readFile(path.join(getProjectDir(project.id), 'transcript.json'), 'utf8');
      const transcript = JSON.parse(tjson) as { segments: Array<{ start: number; end: number; text: string }> };
      const start = hl.start;
      const end = hl.end;
      const cues: Array<{ start: number; end: number; text: string }> = [];
      for (const s of transcript.segments) {
        if (s.end <= start || s.start >= end) continue;
        const t = (s.text ?? '').trim();
        if (!t) continue;
        cues.push({
          start: Math.max(0, s.start - start),
          end: Math.min(end - start, s.end - start),
          text: t,
        });
      }
      return { cues };
    } catch (err: any) {
      console.warn(`[transcript.getCuesForHighlight] ${err?.message ?? err}`);
      return { cues: [] };
    }
  },
};

export function registerIpc(): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_e, payload): Promise<IpcResponse<unknown>> => {
      try {
        const data = await handler(payload);
        return { ok: true, data };
      } catch (err: any) {
        console.error(`[ipc] ${channel} failed:`, err);
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
  }
}

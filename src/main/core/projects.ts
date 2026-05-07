import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type {
  Project,
  ProjectSource,
  Highlight,
  ProjectMusic,
  ProjectIntro,
} from '@shared/types';
import { DEFAULT_FACECAM, DEFAULT_SPLIT_RATIO } from '@shared/types';
import { enqueue } from './queue';
import { runAnalysisPipeline } from './pipeline/runner';
import { broadcast } from './events';
import type { JobContext } from './pipeline/types';
import { getApiKey, getAppDefaults } from './settings';
import { resolveBin } from './bin';
import { getDuration as probeDuration } from './ffmpeg';

const ROOT = () => path.join(app.getPath('userData'), 'projects');

async function projectDir(id: string) {
  const dir = path.join(ROOT(), id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeMeta(p: Project) {
  const dir = await projectDir(p.id);
  // Auto-set updatedAt bei jedem Save → Library-Sort "last modified" funktioniert ohne
  // dass jeder Caller dran denken muss.
  const stamped: Project = { ...p, updatedAt: Date.now() };
  await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(stamped, null, 2));
}

async function readMeta(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(path.join(ROOT(), id, 'project.json'), 'utf8');
    const parsed = JSON.parse(raw);
    // Migration: ältere Projekte ohne mode → 'auto'
    if (!parsed.mode) parsed.mode = 'auto';
    // Migration: legacy single music → musicTracks[0]
    if (!parsed.musicTracks && parsed.music) {
      parsed.musicTracks = [parsed.music];
      parsed.activeMusicIndex = 0;
    }
    return parsed as Project;
  } catch {
    return null;
  }
}

async function updateProject(id: string, patch: Partial<Project>) {
  const cur = await readMeta(id);
  if (!cur) return;
  const next: Project = { ...cur, ...patch };
  await writeMeta(next);
  broadcast({ type: 'project.updated', projectId: id });
}

/** AUTO-Mode: long-form Source → AI-Pipeline findet Highlights. */
export async function createProject(
  source: ProjectSource,
  name?: string,
  videoType?: import('@shared/types').VideoType,
): Promise<Project> {
  const id = crypto.randomUUID();
  await projectDir(id);
  const project: Project = {
    id,
    mode: 'auto',
    name: name ?? (source.kind === 'file' ? path.basename(source.value) : source.value),
    source,
    status: 'created',
    highlights: [],
    createdAt: Date.now(),
    videoType: videoType ?? 'gaming',
  };
  await writeMeta(project);
  broadcast({ type: 'project.updated', projectId: id });
  return project;
}

/**
 * MANUAL-Mode: User wählt mehrere bereits-fertige Clips → keine Analyse,
 * direkt fertig zum Kombinieren. Jedes File wird zu einem Highlight mit clipPath.
 */
export async function createManualProject(paths: string[], name?: string): Promise<Project> {
  console.log(`[manual-import] files selected: ${paths.length}`);
  if (paths.length === 0) throw new Error('No clips provided');

  const id = crypto.randomUUID();
  await projectDir(id);

  const highlights: Highlight[] = [];
  let probedOk = 0;
  let probedFail = 0;
  for (const p of paths) {
    const dur = await probeDuration(p).catch((err) => {
      console.warn(`[manual-import] probe failed for ${p}:`, err?.message ?? err);
      return 0;
    });
    if (dur > 0) probedOk++; else probedFail++;
    highlights.push({
      start: 0,
      end: dur || 30,                 // Fallback wenn Probe fehlschlägt
      score: 1,
      reason: 'manual import',
      clipPath: p,
    });
  }

  const project: Project = {
    id,
    mode: 'manual',
    name: name ?? `Manual collection (${paths.length} clips)`,
    status: 'ready',
    highlights,
    createdAt: Date.now(),
  };
  await writeMeta(project);
  broadcast({ type: 'project.updated', projectId: id });

  console.log(
    `[manual-import] clips created: ${highlights.length}` +
    ` (probed ok: ${probedOk}, fallback: ${probedFail}) → project ${id}`,
  );
  return project;
}

/**
 * Erstellt ein leeres Project ohne Highlights — für Standalone-Editor-Workflow.
 * User kann direkt mit dem Editor starten ohne vorher Clips zu importieren.
 * Mode = 'manual' (keine AI-Pipeline), status = 'ready' (sofort bearbeitbar).
 */
export async function createEmptyProject(name?: string): Promise<Project> {
  const id = crypto.randomUUID();
  await projectDir(id);
  const ts = new Date();
  const dateLabel = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
  const project: Project = {
    id,
    mode: 'manual',
    name: name ?? `Quick Edit · ${dateLabel}`,
    status: 'ready',
    highlights: [],
    createdAt: Date.now(),
  };
  await writeMeta(project);
  broadcast({ type: 'project.updated', projectId: id });
  console.log(`[empty-project] created → ${id} ("${project.name}")`);
  return project;
}

export async function listProjects(): Promise<Project[]> {
  await fs.mkdir(ROOT(), { recursive: true });
  const ids = await fs.readdir(ROOT());
  const projects: Project[] = [];
  for (const id of ids) {
    const meta = await readMeta(id);
    if (meta) projects.push(meta);
  }
  return projects.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteProject(id: string): Promise<void> {
  await fs.rm(path.join(ROOT(), id), { recursive: true, force: true });
  broadcast({ type: 'project.updated', projectId: id });
}

/** Benennt ein Project um. Triggert project.updated event für Reaktivität. */
export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name must not be empty');
  await updateProject(id, { name: trimmed });
}

/** Entfernt ein Highlight aus dem Project + räumt die clipPath-Datei mit auf. */
export async function deleteHighlight(projectId: string, index: number): Promise<void> {
  const project = await readMeta(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (index < 0 || index >= project.highlights.length) {
    throw new Error(`Highlight index ${index} out of bounds`);
  }
  const target = project.highlights[index];
  if (target.clipPath) {
    try { await fs.unlink(target.clipPath); }
    catch (e: any) {
      if (e?.code !== 'ENOENT') console.warn(`[deleteHighlight] clipPath rm failed:`, e.message);
    }
  }
  const next = project.highlights.filter((_, i) => i !== index);
  await updateProject(projectId, { highlights: next });
}

/** Patcht ein einzelnes Highlight (Trim-Werte etc.) und speichert. */
export async function updateHighlight(
  projectId: string,
  index: number,
  patch: Partial<Highlight>,
): Promise<void> {
  const project = await readMeta(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (index < 0 || index >= project.highlights.length) {
    throw new Error(`Highlight index ${index} out of bounds`);
  }
  const next = [...project.highlights];
  next[index] = { ...next[index], ...patch };
  await updateProject(projectId, { highlights: next });
}

/** Gibt den absoluten Pfad zum Projekt-Ordner zurück. */
export function getProjectDir(id: string): string {
  return path.join(ROOT(), id);
}

/** Hängt ein Voice-Over an das Project an. */
export async function addVoiceOver(id: string, vo: import('@shared/types').ProjectVoiceOver): Promise<void> {
  const cur = await readMeta(id);
  if (!cur) return;
  const next = [...(cur.voiceOvers ?? []), vo];
  await updateProject(id, { voiceOvers: next });
}

/** Entfernt ein Voice-Over per Index. */
export async function removeVoiceOver(id: string, index: number): Promise<void> {
  const cur = await readMeta(id);
  if (!cur) return;
  const list = cur.voiceOvers ?? [];
  if (index < 0 || index >= list.length) return;
  const target = list[index];
  // Best-effort: zugehörige MP3-Datei aufräumen
  if (target?.path) {
    try { await fs.unlink(target.path); } catch { /* ignore */ }
  }
  await updateProject(id, { voiceOvers: list.filter((_, i) => i !== index) });
}

/** Patcht ein einzelnes Voice-Over (z.B. startSec, volume, text). */
export async function updateVoiceOver(
  id: string, index: number, patch: Partial<import('@shared/types').ProjectVoiceOver>,
): Promise<void> {
  const cur = await readMeta(id);
  if (!cur) return;
  const list = [...(cur.voiceOvers ?? [])];
  if (index < 0 || index >= list.length) return;
  list[index] = { ...list[index], ...patch };
  await updateProject(id, { voiceOvers: list });
}

/** Setzt/entfernt project.music (legacy). */
export async function setProjectMusic(id: string, music: ProjectMusic | null): Promise<void> {
  await updateProject(id, { music: music ?? undefined });
}

/** Music-Tracks-Pool: Track hinzufügen. Erste Hinzufügung aktiviert ihn auch. */
export async function addMusicTrack(id: string, track: ProjectMusic): Promise<void> {
  const cur = await readMeta(id);
  if (!cur) return;
  const tracks = [...(cur.musicTracks ?? []), track];
  const activeMusicIndex = cur.activeMusicIndex ?? tracks.length - 1;
  await updateProject(id, { musicTracks: tracks, activeMusicIndex });
}

/** Music-Track entfernen. activeIndex wird passend angepasst. */
export async function removeMusicTrack(id: string, index: number): Promise<void> {
  const cur = await readMeta(id);
  if (!cur || !cur.musicTracks || index < 0 || index >= cur.musicTracks.length) return;
  const tracks = cur.musicTracks.filter((_, i) => i !== index);
  let active = cur.activeMusicIndex;
  if (active === undefined || tracks.length === 0) active = undefined;
  else if (active === -1) active = -1; // random bleibt random
  else if (active === index) active = tracks.length > 0 ? 0 : undefined;
  else if (active > index) active = active - 1;
  await updateProject(id, { musicTracks: tracks, activeMusicIndex: active });
}

/** Patch eines Tracks (z.B. Volume). */
export async function updateMusicTrack(
  id: string,
  index: number,
  patch: Partial<ProjectMusic>,
): Promise<void> {
  const cur = await readMeta(id);
  if (!cur || !cur.musicTracks || index < 0 || index >= cur.musicTracks.length) return;
  const tracks = cur.musicTracks.map((t, i) => i === index ? { ...t, ...patch } : t);
  await updateProject(id, { musicTracks: tracks });
}

/** Welcher Track für den nächsten Build aktiv ist. -1 = random pro Build. undefined = keine Music. */
export async function setActiveMusicIndex(id: string, index: number | undefined): Promise<void> {
  await updateProject(id, { activeMusicIndex: index });
}

/** Setzt/entfernt project.intro (mit allen Feldern). */
export async function setProjectIntro(id: string, intro: ProjectIntro | null): Promise<void> {
  await updateProject(id, { intro: intro ?? undefined });
}

/**
 * Quick TikTok Clip: User lädt EINEN fertigen Clip hoch, keine Analyse,
 * keine API-Calls. Direkt in Stacked-Layout vorkonfiguriert für schnellen Export.
 */
export async function createQuickTikTokProject(
  filePath: string,
  name?: string,
): Promise<Project> {
  const id = crypto.randomUUID();
  await projectDir(id);

  const dur = await probeDuration(filePath).catch(() => 0);

  // Lade User-Default Facecam (fällt auf DEFAULT_FACECAM zurück wenn nichts gesetzt)
  const defaults = await getAppDefaults();

  const project: Project = {
    id,
    mode: 'manual',
    name: name ?? `Quick TikTok: ${path.basename(filePath)}`,
    status: 'ready',
    highlights: [
      {
        start: 0,
        end: dur || 60,
        score: 1,
        reason: 'quick tiktok',
        clipPath: filePath,
        layout: 'stacked',
        splitRatio: defaults.splitRatio,
        facecam: defaults.facecam,
      },
    ],
    createdAt: Date.now(),
  };
  await writeMeta(project);
  broadcast({ type: 'project.updated', projectId: id });
  return project;
}

/** Pfad zum Source-Video für ein Auto-Mode-Projekt (nach Download bzw. originaler File-Pfad). */
export function getProjectSourcePath(project: Project): string | null {
  if (project.mode !== 'auto' || !project.source) return null;
  if (project.source.kind === 'file') return project.source.value;
  // url-Source: yt-dlp speichert nach projectDir/source.mp4
  return path.join(getProjectDir(project.id), 'source.mp4');
}

/**
 * Manuelles Highlight zu einem Auto-Projekt hinzufügen + Master-Clip im Hintergrund rendern.
 * Liefert sofort den Index des neuen Highlights — clipPath wird nach Render via project.updated event gesetzt.
 */
export async function addManualHighlight(
  projectId: string,
  start: number,
  end: number,
): Promise<{ index: number; queued: boolean }> {
  const project = await readMeta(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (project.mode !== 'auto') throw new Error('Manual highlights only supported on auto projects');

  const sourcePath = getProjectSourcePath(project);
  if (!sourcePath) throw new Error('Source video not available for this project');

  // Bounds-Check
  const safeStart = Math.max(0, start);
  const safeEnd   = Math.max(safeStart + 1, end);
  if (safeEnd - safeStart < 1) throw new Error('Highlight must be at least 1 second long');

  // Highlight anhängen (ohne clipPath — kommt nach Render)
  const next: Highlight = {
    start: safeStart,
    end:   safeEnd,
    score: 1,
    reason: 'manual highlight',
    origin: 'manual',
  };
  const highlights = [...project.highlights, next];
  const idx = highlights.length - 1;
  await updateProject(projectId, { highlights });

  // Async Render → clipPath patchen wenn fertig
  enqueue(`manual-render:${projectId}:${idx}`, async () => {
    const exportsDir = path.join(getProjectDir(projectId), 'exports');
    await fs.mkdir(exportsDir, { recursive: true });
    const clipPath = path.join(exportsDir, `clip-manual-${idx + 1}-${Date.now()}.mp4`);

    const ac = new AbortController();
    const ctx: JobContext = {
      projectId,
      workDir: getProjectDir(projectId),
      signal: ac.signal,
      emit: (e) => {
        if (e.type === 'progress') {
          broadcast({ type: 'job.progress', projectId, step: e.step, percent: e.percent });
        }
      },
    };

    try {
      console.log(`[manual-highlight] rendering ${safeStart.toFixed(1)}s..${safeEnd.toFixed(1)}s for project ${projectId}`);
      const { renderMasterClip } = await import('./ffmpeg');
      await renderMasterClip(sourcePath, clipPath, safeStart, safeEnd - safeStart, ctx);
      await updateHighlight(projectId, idx, { clipPath });
      console.log(`[manual-highlight] done → ${clipPath}`);
    } catch (err: any) {
      console.error(`[manual-highlight] failed:`, err?.message ?? err);
      // Highlight bleibt ohne clipPath → UI zeigt es als "render failed"
    }
  });

  return { index: idx, queued: true };
}

/** Pre-flight check (nur AUTO-Mode braucht Tools / API Key). */
function preflight(project: Project, apiKey: string | null): string | null {
  if (project.mode === 'manual') return null;
  if (!apiKey)                   return 'OpenAI API key not set. Add it in Settings.';
  if (!resolveBin('ffmpeg'))     return 'ffmpeg not found. Install via: brew install ffmpeg';
  if (!resolveBin('ffprobe'))    return 'ffprobe not found. Install via: brew install ffmpeg';
  if (project.source?.kind === 'url' && !resolveBin('yt-dlp')) {
    return 'yt-dlp not found. Install via: brew install yt-dlp';
  }
  return null;
}

/** Startet die Analyse-Pipeline (asynchron, UI-non-blocking). */
export async function startAnalysis(id: string): Promise<{ queued: boolean; error?: string }> {
  const project = await readMeta(id);
  if (!project) throw new Error(`Project ${id} not found`);

  if (project.mode === 'manual') {
    return { queued: false, error: 'Manual projects do not require analysis.' };
  }
  if (!project.source) {
    throw new Error('Auto project missing source');
  }

  const apiKey = await getApiKey();
  const blocker = preflight(project, apiKey);
  if (blocker) {
    await updateProject(id, { status: 'error', errorMessage: blocker });
    return { queued: false, error: blocker };
  }

  enqueue(`analyze:${id}`, async () => {
    const ac = new AbortController();
    const ctx: JobContext = {
      projectId: id,
      workDir: path.join(ROOT(), id),
      signal: ac.signal,
      apiKey: apiKey!,
      emit: (e) => {
        if (e.type === 'progress') {
          broadcast({ type: 'job.progress', projectId: id, step: e.step, percent: e.percent });
        } else {
          broadcast({ type: 'job.log', projectId: id, message: `[${e.step}] ${e.message}` });
        }
      },
    };

    try {
      await updateProject(id, { status: 'analyzing', errorMessage: undefined });
      const { highlights } = await runAnalysisPipeline(project.source!, ctx, project.videoType ?? 'gaming');
      await updateProject(id, { status: 'ready', highlights });
    } catch (err: any) {
      console.error('[pipeline] failed:', err);
      const msg = err?.message ?? String(err);
      await updateProject(id, { status: 'error', errorMessage: msg });
    }
  });

  return { queued: true };
}

import { create } from 'zustand';
import type {
  AppEvent,
  ClipEffects,
  ClipSegment,
  ExportFormat,
  FacecamRegion,
  GameplayRegion,
  Highlight,
  Project,
  ProjectIntro,
  ProjectMusic,
  ProjectVoiceOver,
  ProjectSource,
  SubtitlePosition,
  SubtitleSettings,
  SubtitleStyle,
  TikTokLayout,
} from '@shared/types';
import { DEFAULT_EFFECTS, DEFAULT_FACECAM, DEFAULT_GAMEPLAY, DEFAULT_SPLIT_RATIO } from '@shared/types';
import type { LanguageCode } from '../lib/i18n';

export interface EditorExportDefaults {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
}

interface AppDefaults {
  facecam: FacecamRegion;
  splitRatio: number;
  testClipPath?: string;
  gameplay: GameplayRegion;
  effects: ClipEffects;
  geminiImageModel?: string;
  ffmpegPath?: string;
  confirmDelete?: boolean;
  soundsEnabled?: boolean;
  language?: string;
  editorExport?: EditorExportDefaults;
  /** Encoder-Quality-Mode: 'fast' = Hardware (videotoolbox), 'quality' = libx264 -preset slow (langsamer aber schärfer) */
  qualityMode?: 'fast' | 'quality';
  /** User-saved Subtitle-Presets. */
  subtitlePresets?: Array<{ id: string; name: string; settings: import('@shared/types').SubtitleSettings }>;
}

export interface FfmpegInstall {
  path: string;
  libass: boolean;
  drawtext: boolean;
  version: string;
  isActive: boolean;
}

interface ExportClipOptions {
  layout?: TikTokLayout;
  facecam?: FacecamRegion;
  splitRatio?: number;
  music?: ProjectMusic;
  subtitles?: {
    projectId: string;
    highlightIndex: number;
    style: SubtitleStyle;
    position?: SubtitlePosition;
    customY?: number;
  };
}

export interface BuilderClipInput {
  master: string;
  segments: ClipSegment[];
}

interface BuildVideoOptions {
  format: ExportFormat;
  layout?: TikTokLayout;
  facecam?: FacecamRegion;
  gameplay?: GameplayRegion;
  splitRatio?: number;
  effects?: ClipEffects;
  intro?: ProjectIntro;
  music?: ProjectMusic;
  /** Optional Export-Quality-Override (Editor-Tab) */
  exportQuality?: { width?: number; height?: number; fps?: number; bitrate?: string };
  /** Encoder-Quality-Mode: 'fast' (Hardware) oder 'quality' (libx264 -preset slow) */
  qualityMode?: 'fast' | 'quality';
  subtitlesPerClip?: Array<{
    highlightIndex: number;
    style: SubtitleStyle;
    position?: SubtitlePosition;
    customY?: number;
    settings?: SubtitleSettings;
    /** Pre-rendered Layered-Subtitle-PNG-Overlays (vom Renderer via Canvas).
     *  Wenn gesetzt: Main schreibt sie zu temp-files, FFmpeg overlay-compositiert sie
     *  statt libass-Filter zu nutzen. Pixel-genau identisch zur Live-Preview. */
    pngOverlays?: Array<{ start: number; end: number; pngBase64: string }>;
  } | null>;
}

interface JobState {
  projectId: string;
  step: string;
  percent: number;
}

interface BinaryStatus {
  name: 'ffmpeg' | 'ffprobe' | 'yt-dlp';
  path: string | null;
  installHint: string;
}

interface AppState {
  projects: Project[];
  /** ID des Projects das der User zuletzt geöffnet hat (persisted in localStorage). */
  lastVisitedProjectId: string | null;
  currentJob: JobState | null;
  recentLogs: string[];
  hasApiKey: boolean;
  binaries: BinaryStatus[];
  subtitlesAvailable: boolean;
  subtitleSupport: { libass: boolean; drawtext: boolean };
  appDefaults: AppDefaults;

  setLastVisitedProject: (id: string) => void;
  loadProjects: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  loadAppDefaults: () => Promise<void>;
  setDefaultFacecam: (facecam: FacecamRegion) => Promise<void>;
  setDefaultGameplay: (gameplay: GameplayRegion) => Promise<void>;
  setDefaultEffects: (effects: ClipEffects) => Promise<void>;
  setDefaultSplitRatio: (ratio: number) => Promise<void>;
  setConfirmDelete: (enabled: boolean) => Promise<void>;
  setSoundsEnabled: (enabled: boolean) => Promise<void>;
  setLanguage: (code: string) => Promise<void>;
  setEditorExportDefaults: (patch: Partial<EditorExportDefaults>) => Promise<void>;
  setQualityMode: (mode: 'fast' | 'quality') => Promise<void>;
  saveSubtitlePreset: (name: string, settings: import('@shared/types').SubtitleSettings) => Promise<void>;
  deleteSubtitlePreset: (id: string) => Promise<void>;
  setTestClipPath: (path: string | null) => Promise<void>;
  pickTestClipFile: () => Promise<string | null>;
  pickImageFile: () => Promise<string | null>;
  // Gemini
  hasGeminiKey: boolean;
  refreshGeminiKey: () => Promise<void>;
  setGeminiKey: (key: string) => Promise<boolean>;
  clearGeminiKey: () => Promise<void>;
  generateThumbnail: (prompt: string, refImageBase64?: string, refMime?: string) => Promise<string | null>;
  exportThumbnail: (srcPath: string, suggestedName?: string) => Promise<string | null>;
  listThumbnails: () => Promise<Array<{ path: string; mtime: number; size: number }>>;
  deleteThumbnail: (path: string) => Promise<void>;
  setGeminiImageModel: (model: string) => Promise<void>;
  listGeminiModels: () => Promise<{
    all: Array<{ name: string; displayName: string; methods: string[] }>;
    imageLike: Array<{ name: string; displayName: string; methods: string[] }>;
  } | null>;
  setFfmpegPath: (path: string) => Promise<void>;
  listFfmpegInstalls: () => Promise<FfmpegInstall[]>;
  // ─── Music tracks (multi) ───────────────────────────────────
  addMusicTrack: (projectId: string, music: ProjectMusic) => Promise<void>;
  removeMusicTrack: (projectId: string, index: number) => Promise<void>;
  updateMusicTrack: (projectId: string, index: number, patch: Partial<ProjectMusic>) => Promise<void>;
  setActiveMusicIndex: (projectId: string, index: number | undefined) => Promise<void>;
  setApiKey: (key: string) => Promise<boolean>;
  clearApiKey: () => Promise<void>;
  createFromUrl: (url: string, videoType?: import('@shared/types').VideoType) => Promise<Project | null>;
  createFromFile: (videoType?: import('@shared/types').VideoType) => Promise<Project | null>;
  createFromMultipleFiles: () => Promise<Project | null>;
  createQuickTikTok: () => Promise<Project | null>;
  createEmptyProject: () => Promise<Project | null>;
  startAnalysis: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  updateHighlight: (projectId: string, index: number, patch: Partial<Highlight>) => Promise<void>;
  addManualHighlight: (projectId: string, start: number, end: number) => Promise<{ index: number; queued: boolean } | null>;
  deleteHighlight: (projectId: string, index: number) => Promise<void>;
  getProjectSourcePath: (projectId: string) => Promise<string | null>;
  setProjectMusic: (id: string, music: ProjectMusic | null) => Promise<void>;
  addVoiceOver: (projectId: string, vo: ProjectVoiceOver) => Promise<void>;
  removeVoiceOver: (projectId: string, index: number) => Promise<void>;
  updateVoiceOver: (projectId: string, index: number, patch: Partial<ProjectVoiceOver>) => Promise<void>;
  setProjectIntro: (id: string, intro: ProjectIntro | null) => Promise<void>;
  pickMusicFile: () => Promise<string | null>;
  pickIntroFile: () => Promise<string | null>;
  exportClip: (
    masterPath: string,
    suggestedName: string,
    format: ExportFormat,
    segments: ClipSegment[],
    options?: ExportClipOptions,
  ) => Promise<string | null>;
  buildVideo: (
    projectId: string,
    suggestedName: string,
    clips: BuilderClipInput[],
    options: BuildVideoOptions,
  ) => Promise<string | null>;
}

async function call<T>(channel: string, payload?: unknown): Promise<T | null> {
  const r = await window.api.invoke<T>(channel, payload);
  if (!r.ok) {
    const e = String(r.error ?? '').toLowerCase();
    if (e === 'aborted' || e.includes('abort')) return null;
    console.error(`[ipc] ${channel}:`, r.error);
    // Bei Export/Build-Errors: User-sichtbar machen — Errors sind oft Setup-Probleme
    if (channel.startsWith('shell.')) {
      // eslint-disable-next-line no-alert
      alert(`Export failed:\n\n${r.error}`);
    }
    return null;
  }
  return r.data ?? null;
}

/** localStorage-Key für last-visited Persistence. */
const LAST_VISITED_KEY = 'fiano:lastVisitedProjectId';

function readLastVisited(): string | null {
  try { return window.localStorage.getItem(LAST_VISITED_KEY); }
  catch { return null; }
}

export const useApp = create<AppState>((set, get) => ({
  projects: [],
  lastVisitedProjectId: readLastVisited(),
  currentJob: null,
  recentLogs: [],
  hasApiKey: false,
  binaries: [],
  subtitlesAvailable: false,
  subtitleSupport: { libass: false, drawtext: false },
  appDefaults: {
    facecam: { ...DEFAULT_FACECAM },
    splitRatio: DEFAULT_SPLIT_RATIO,
    gameplay: { ...DEFAULT_GAMEPLAY },
    effects: { ...DEFAULT_EFFECTS },
  },

  setLastVisitedProject: (id) => {
    try { window.localStorage.setItem(LAST_VISITED_KEY, id); } catch { /* quota etc. — ignorieren */ }
    set({ lastVisitedProjectId: id });
  },

  loadProjects: async () => {
    const p = await call<Project[]>('project.list');
    if (p) {
      // KEIN Sort hier — Index muss zur File-Position matchen damit updateHighlight korrekt
      // das richtige Highlight im Backend updatet. Sort passiert nur in der UI beim Rendering
      // (mit Original-Index als Referenz für IPC).
      set({ projects: p });
      // Stale ID? Wenn das gespeicherte Project nicht mehr existiert → cleanen
      const lv = get().lastVisitedProjectId;
      if (lv && !p.find((proj) => proj.id === lv)) {
        try { window.localStorage.removeItem(LAST_VISITED_KEY); } catch {}
        set({ lastVisitedProjectId: null });
      }
    }
  },

  refreshHealth: async () => {
    const apiCheck = await call<{ hasKey: boolean }>('settings.hasApiKey');
    const binCheck = await call<{
      binaries: BinaryStatus[];
      subtitlesAvailable: boolean;
      subtitleSupport: { libass: boolean; drawtext: boolean };
    }>('health.binaries');
    set({
      hasApiKey: apiCheck?.hasKey ?? false,
      binaries: binCheck?.binaries ?? [],
      subtitlesAvailable: binCheck?.subtitlesAvailable ?? false,
      subtitleSupport: binCheck?.subtitleSupport ?? { libass: false, drawtext: false },
    });
  },

  loadAppDefaults: async () => {
    const d = await call<AppDefaults>('appDefaults.get');
    if (d) {
      set({ appDefaults: d });
      // Sync sound-mute mit lib/sounds.ts beim App-Start
      try {
        const sounds = await import('../lib/sounds');
        sounds.setMuted(d.soundsEnabled === false);
      } catch { /* ignore */ }
      // Sync UI-Sprache mit i18n-Modul-State
      try {
        const i18n = await import('../lib/i18n');
        if (d.language && (i18n.LANGUAGES as Array<{ code: string }>).some((l) => l.code === d.language)) {
          i18n.setLanguage(d.language as LanguageCode);
        }
      } catch { /* ignore */ }
    }
  },

  setDefaultFacecam: async (facecam) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, facecam } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { facecam } });
    if (next) set({ appDefaults: next });
  },

  setDefaultGameplay: async (gameplay) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, gameplay } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { gameplay } });
    if (next) set({ appDefaults: next });
  },

  setDefaultEffects: async (effects) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, effects } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { effects } });
    if (next) set({ appDefaults: next });
  },

  setDefaultSplitRatio: async (ratio) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, splitRatio: ratio } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { splitRatio: ratio } });
    if (next) set({ appDefaults: next });
  },

  setConfirmDelete: async (enabled) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, confirmDelete: enabled } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { confirmDelete: enabled } });
    if (next) set({ appDefaults: next });
  },

  setSoundsEnabled: async (enabled) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, soundsEnabled: enabled } }));
    // Sync mit lib/sounds.ts (localStorage-basiert) damit existierende sounds.X() Calls
    // den Mute-State respektieren ohne dass jeder Caller den appDefaults checken muss.
    try {
      const sounds = await import('../lib/sounds');
      sounds.setMuted(!enabled);
    } catch { /* ignore */ }
    const next = await call<AppDefaults>('appDefaults.set', { patch: { soundsEnabled: enabled } });
    if (next) set({ appDefaults: next });
  },

  setLanguage: async (code) => {
    // 1) Optimistic update (lokal sofort sichtbar) + i18n-Modul-State setzen → Re-Render
    set((s) => ({ appDefaults: { ...s.appDefaults, language: code } }));
    try {
      const i18n = await import('../lib/i18n');
      i18n.setLanguage(code as LanguageCode);
    } catch { /* ignore */ }
    // 2) Persistieren via IPC
    const next = await call<AppDefaults>('appDefaults.set', { patch: { language: code } });
    if (next) set({ appDefaults: next });
  },

  setEditorExportDefaults: async (patch) => {
    set((s) => ({
      appDefaults: {
        ...s.appDefaults,
        editorExport: {
          width: 1920, height: 1080, fps: 30, bitrate: '30M',
          ...s.appDefaults.editorExport,
          ...patch,
        },
      },
    }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { editorExport: patch as EditorExportDefaults } });
    if (next) set({ appDefaults: next });
  },

  setQualityMode: async (mode) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, qualityMode: mode } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { qualityMode: mode } });
    if (next) set({ appDefaults: next });
  },

  saveSubtitlePreset: async (name, settings) => {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const list = [...(get().appDefaults.subtitlePresets ?? []), { id, name, settings }];
    set((s) => ({ appDefaults: { ...s.appDefaults, subtitlePresets: list } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { subtitlePresets: list } });
    if (next) set({ appDefaults: next });
  },

  deleteSubtitlePreset: async (id) => {
    const list = (get().appDefaults.subtitlePresets ?? []).filter((p) => p.id !== id);
    set((s) => ({ appDefaults: { ...s.appDefaults, subtitlePresets: list } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { subtitlePresets: list } });
    if (next) set({ appDefaults: next });
  },

  setTestClipPath: async (testClipPath) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, testClipPath: testClipPath ?? undefined } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { testClipPath: testClipPath ?? undefined } });
    if (next) set({ appDefaults: next });
  },

  pickTestClipFile: async () => {
    const picked = await call<{ path: string } | null>('dialog.openVideo');
    return picked?.path ?? null;
  },

  pickImageFile: async () => {
    const picked = await call<{ path: string } | null>('dialog.openImage');
    return picked?.path ?? null;
  },

  // ─── Gemini ───────────────────────────────────────────────
  hasGeminiKey: false,

  refreshGeminiKey: async () => {
    const r = await call<{ hasKey: boolean }>('gemini.hasKey');
    set({ hasGeminiKey: r?.hasKey ?? false });
  },

  setGeminiKey: async (key) => {
    const r = await call('gemini.setKey', { key });
    if (r) await get().refreshGeminiKey();
    return !!r;
  },

  clearGeminiKey: async () => {
    await call('gemini.deleteKey');
    await get().refreshGeminiKey();
  },

  generateThumbnail: async (prompt, refImageBase64, refMime) => {
    const r = await call<{ path: string }>('thumbnail.generate', {
      prompt, referenceImageBase64: refImageBase64, referenceMime: refMime,
    });
    return r?.path ?? null;
  },

  exportThumbnail: async (srcPath, suggestedName) => {
    const r = await call<{ canceled: boolean; savedTo?: string }>('thumbnail.saveAs', {
      srcPath, suggestedName,
    });
    return r?.savedTo ?? null;
  },

  listThumbnails: async () => {
    const r = await call<{ items: Array<{ path: string; mtime: number; size: number }> }>('thumbnail.list');
    return r?.items ?? [];
  },

  deleteThumbnail: async (path) => {
    await call('thumbnail.delete', { path });
  },

  setGeminiImageModel: async (model) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, geminiImageModel: model || undefined } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { geminiImageModel: model || undefined } });
    if (next) set({ appDefaults: next });
  },

  listGeminiModels: async () => {
    return await call<any>('gemini.listModels');
  },

  setFfmpegPath: async (p) => {
    set((s) => ({ appDefaults: { ...s.appDefaults, ffmpegPath: p || undefined } }));
    const next = await call<AppDefaults>('appDefaults.set', { patch: { ffmpegPath: p || undefined } });
    if (next) set({ appDefaults: next });
  },

  listFfmpegInstalls: async () => {
    const r = await call<{ installs: FfmpegInstall[] }>('health.ffmpegInstalls');
    return r?.installs ?? [];
  },

  // ─── Music tracks ─────────────────────────────────────────
  addMusicTrack: async (projectId, music) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const tracks = [...(p.musicTracks ?? []), music];
        return { ...p, musicTracks: tracks, activeMusicIndex: p.activeMusicIndex ?? tracks.length - 1 };
      }),
    }));
    await call('project.addMusicTrack', { id: projectId, track: music });
  },

  removeMusicTrack: async (projectId, index) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const tracks = (p.musicTracks ?? []).filter((_, i) => i !== index);
        let active = p.activeMusicIndex;
        if (active === undefined || tracks.length === 0) active = undefined;
        else if (active === -1) active = -1;
        else if (active === index) active = tracks.length > 0 ? 0 : undefined;
        else if (active > index) active = active - 1;
        return { ...p, musicTracks: tracks, activeMusicIndex: active };
      }),
    }));
    await call('project.removeMusicTrack', { id: projectId, index });
  },

  updateMusicTrack: async (projectId, index, patch) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const tracks = (p.musicTracks ?? []).map((t, i) => i === index ? { ...t, ...patch } : t);
        return { ...p, musicTracks: tracks };
      }),
    }));
    await call('project.updateMusicTrack', { id: projectId, index, patch });
  },

  setActiveMusicIndex: async (projectId, index) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId ? { ...p, activeMusicIndex: index } : p),
    }));
    await call('project.setActiveMusicIndex', { id: projectId, index });
  },

  setApiKey: async (key) => {
    const r = await call('settings.setApiKey', { key });
    if (r) await get().refreshHealth();
    return !!r;
  },

  clearApiKey: async () => {
    await call('settings.deleteApiKey');
    await get().refreshHealth();
  },

  createFromUrl: async (url, videoType) => {
    const source: ProjectSource = { kind: 'url', value: url };
    const p = await call<Project>('project.create', { source, videoType });
    if (p) await get().loadProjects();
    return p;
  },

  createFromFile: async (videoType) => {
    const picked = await call<{ path: string } | null>('dialog.openVideo');
    if (!picked) return null;
    const source: ProjectSource = { kind: 'file', value: picked.path };
    const p = await call<Project>('project.create', { source, videoType });
    if (p) await get().loadProjects();
    return p;
  },

  createFromMultipleFiles: async () => {
    const picked = await call<{ paths: string[] } | null>('dialog.openMultipleVideos');
    if (!picked || picked.paths.length === 0) return null;
    const p = await call<Project>('project.createManual', { paths: picked.paths });
    if (p) await get().loadProjects();
    return p;
  },

  createQuickTikTok: async () => {
    const picked = await call<{ path: string } | null>('dialog.openVideo');
    if (!picked) return null;
    const p = await call<Project>('project.createQuickTikTok', { path: picked.path });
    if (p) await get().loadProjects();
    return p;
  },

  createEmptyProject: async () => {
    const p = await call<Project>('project.createEmpty', {});
    if (p) await get().loadProjects();
    return p;
  },

  startAnalysis: async (id) => {
    set({ currentJob: { projectId: id, step: 'starting', percent: 0 } });
    await call('project.startAnalysis', { id });
  },

  deleteProject: async (id) => {
    await call('project.delete', { id });
    await get().loadProjects();
  },

  renameProject: async (id, name) => {
    // Optimistic update — Backend triggert project.updated event was loadProjects neu lädt
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, name, updatedAt: Date.now() } : p),
    }));
    await call('project.rename', { id, name });
  },

  updateHighlight: async (projectId, index, patch) => {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const next = [...p.highlights];
        next[index] = { ...next[index], ...patch };
        return { ...p, highlights: next };
      }),
    }));
    await call('project.updateHighlight', { projectId, index, patch });
  },

  addManualHighlight: async (projectId, start, end) => {
    return await call<{ index: number; queued: boolean }>('project.addManualHighlight', {
      id: projectId, start, end,
    });
  },

  deleteHighlight: async (projectId, index) => {
    // Optimistic update: lokal sofort entfernen, Backend räumt asynchron auf
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId
        ? { ...p, highlights: p.highlights.filter((_, i) => i !== index) }
        : p),
    }));
    await call('project.deleteHighlight', { id: projectId, index });
  },

  getProjectSourcePath: async (projectId) => {
    const r = await call<{ path: string | null }>('project.getSourcePath', { id: projectId });
    return r?.path ?? null;
  },

  addVoiceOver: async (projectId, vo) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId
        ? { ...p, voiceOvers: [...(p.voiceOvers ?? []), vo] }
        : p),
    }));
    await call('project.addVoiceOver', { id: projectId, vo });
  },

  removeVoiceOver: async (projectId, index) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId
        ? { ...p, voiceOvers: (p.voiceOvers ?? []).filter((_, i) => i !== index) }
        : p),
    }));
    await call('project.removeVoiceOver', { id: projectId, index });
  },

  updateVoiceOver: async (projectId, index, patch) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId
        ? {
            ...p,
            voiceOvers: (p.voiceOvers ?? []).map((vo, i) => i === index ? { ...vo, ...patch } : vo),
          }
        : p),
    }));
    await call('project.updateVoiceOver', { id: projectId, index, patch });
  },

  setProjectMusic: async (id, music) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, music: music ?? undefined } : p),
    }));
    await call('project.setMusic', { id, music });
  },

  setProjectIntro: async (id, intro) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, intro: intro ?? undefined } : p),
    }));
    await call('project.setIntro', { id, intro });
  },

  pickMusicFile: async () => {
    const picked = await call<{ path: string } | null>('dialog.openMusic');
    return picked?.path ?? null;
  },

  pickIntroFile: async () => {
    const picked = await call<{ path: string } | null>('dialog.openIntro');
    return picked?.path ?? null;
  },

  exportClip: async (masterPath, suggestedName, format, segments, options) => {
    const r = await call<{ canceled: boolean; savedTo?: string }>('shell.exportClip', {
      masterPath,
      suggestedName,
      format,
      segments,
      layout: options?.layout,
      facecam: options?.facecam,
      splitRatio: options?.splitRatio,
      music: options?.music,
      subtitles: options?.subtitles,
    });
    return r?.savedTo ?? null;
  },

  buildVideo: async (projectId, suggestedName, clips, options) => {
    const r = await call<{ canceled: boolean; savedTo?: string }>('shell.buildVideo', {
      projectId,
      suggestedName,
      clips,
      format: options.format,
      layout: options.layout,
      facecam: options.facecam,
      gameplay: options.gameplay,
      splitRatio: options.splitRatio,
      effects: options.effects,
      intro: options.intro,
      music: options.music,
      exportQuality: options.exportQuality,
      qualityMode: options.qualityMode,
      subtitlesPerClip: options.subtitlesPerClip,
    });
    return r?.savedTo ?? null;
  },
}));

// Globaler Event-Listener
window.api.onEvent((e: AppEvent) => {
  if (e.type === 'job.progress') {
    useApp.setState({
      currentJob: { projectId: e.projectId, step: e.step, percent: e.percent },
    });
  } else if (e.type === 'job.log') {
    useApp.setState((s) => ({ recentLogs: [...s.recentLogs.slice(-100), e.message] }));
  } else if (e.type === 'project.updated') {
    useApp.getState().loadProjects().then(() => {
      const s = useApp.getState();
      const p = s.projects.find((pr) => pr.id === e.projectId);
      if (s.currentJob?.projectId === e.projectId && p && p.status !== 'analyzing') {
        useApp.setState({ currentJob: null });
      }
    });
  }
});

/**
 * Projects-Store (Phase 9.4.12).
 *
 * Single Source of Truth für alle Projekte in der App. Lokal-only — analog zu
 * Desktop, wo Projekte über `window.api.invoke('project.list')` aus dem
 * appData-Filesystem kommen (kein Supabase im Spiel). Auf Mobile übernimmt
 * AsyncStorage die Rolle des lokalen Speichers.
 *
 * Supabase wird in der App ausschließlich für Auth + Subscription genutzt —
 * Projekte (inkl. Source-Files & Clips) bleiben gerätelokal.
 *
 * Library, Home (Recent), ProjectDetail lesen alle hier, damit der Store
 * austauschbar bleibt ohne UI-Changes.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEMO_PROJECTS,
  type DemoProject,
  type ProjectMode,
  type VideoType,
  type SourceType,
} from '../data/demoProjects';

export type Project = DemoProject;
export type { ProjectMode, VideoType, SourceType };

const STORAGE_KEY = 'fiano.projects';

interface NewProjectInput {
  title: string;
  durationSec: number;
  mode: ProjectMode;
  /** file:// URI (sourceType 'file') ODER YouTube/Twitch URL (sourceType 'url'). */
  sourceUri?: string;
  sourceUrl?: string;
  sourceType: SourceType;
  videoType?: VideoType;
  trimStart?: number;
  trimEnd?: number;
}

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  hydrated: boolean;
  /** Lädt persistierte Projekte aus AsyncStorage. Beim Erststart bleibt der Seed. */
  init: () => Promise<void>;
  /** Setzt die Liste komplett. */
  setProjects: (projects: Project[]) => void;
  removeProject: (id: string) => void;
  /** Reseed auf die Demo-Daten — z.B. via "Reset Library" Debug-Action. */
  resetToDemo: () => void;
  /** Legt ein neues Projekt an (status: processing) und gibt es zurück. */
  addProject: (input: NewProjectInput) => Project;
  /** Patcht ein Projekt teilweise (z.B. status: ready/failed nach Export). */
  updateProject: (id: string, patch: Partial<Project>) => void;
}

/** ID-Generator — Date.now + zufälliger Suffix, ausreichend für lokale Projekte. */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function relativeSubtitle(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `Today · ${hh}:${mm}`;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: DEMO_PROJECTS,
  loading: false,
  hydrated: false,
  init: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const projects = JSON.parse(raw) as Project[];
        set({ projects, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },
  setProjects: (projects) => set({ projects }),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
  resetToDemo: () => set({ projects: DEMO_PROJECTS }),

  addProject: (input) => {
    const project: Project = {
      id: generateId(),
      title: input.title || 'Untitled project',
      subtitle: relativeSubtitle(),
      durationSec: input.durationSec,
      status: 'processing',
      thumbHue: Math.floor(Math.random() * 360),
      clips: [],
      sourceUri: input.sourceUri,
      sourceUrl: input.sourceUrl,
      mode: input.mode,
      videoType: input.videoType,
      sourceType: input.sourceType,
      trimStart: input.trimStart,
      trimEnd: input.trimEnd,
      createdAt: Date.now(),
    };
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  updateProject: (id, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
}));

useProjectsStore.subscribe((state, prev) => {
  if (!state.hydrated) return;
  if (state.projects === prev.projects) return;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects)).catch(() => {});
});

/* ─── Selector-Hooks ──────────────────────────────────────────── */

export function useProjects(): Project[] {
  return useProjectsStore((s) => s.projects);
}

export function useProject(id: string | undefined): Project | undefined {
  return useProjectsStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined));
}

export function useTotalClips(): number {
  return useProjectsStore((s) => s.projects.reduce((c, p) => c + p.clips.length, 0));
}

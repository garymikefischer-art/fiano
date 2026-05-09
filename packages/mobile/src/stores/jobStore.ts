/**
 * Job Store für Mobile.
 *
 * MVP: nur EIN aktiver Job zur Zeit (analog Desktop concurrency=1).
 * Kein komplexes Queue-System v1 — User-Wunsch.
 */

import { create } from 'zustand';

export interface ActiveJob {
  id: string;
  step: 'export';
  percent: number;
  /** Pfad in der Sandbox wo das Output landet. */
  outputPath: string;
}

interface JobState {
  current: ActiveJob | null;
  setCurrent: (job: ActiveJob | null) => void;
  setPercent: (percent: number) => void;
}

export const useJobStore = create<JobState>((set) => ({
  current: null,
  setCurrent: (job) => set({ current: job }),
  setPercent: (percent) =>
    set((s) => (s.current ? { current: { ...s.current, percent } } : s)),
}));

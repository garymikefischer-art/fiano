/**
 * Feature-Gating für Phase 6.3.
 *
 * Zentrale Quelle der Wahrheit, welche Features welcher Plan freischaltet.
 * UI-Komponenten (FeatureLock, UpgradeModal) lesen ausschließlich von hier.
 *
 * Plan-Hierarchie (numerisch, höher = mehr):
 *   creator (1) < pro (2) < studio_lifetime (3)
 *
 * Lifetime erbt alle Pro-Features automatisch über den numerischen Vergleich
 * — wir pflegen keine separate Lifetime-Map.
 */

import { useAuth, type Plan } from '../stores/authStore';

/* ─── Feature-IDs ─────────────────────────────────────────────────────── */

/**
 * Alle gateable Features. Beim Hinzufügen neuer Locks: Eintrag hier UND in
 * FEATURE_MIN_PLAN unten. TypeScript zwingt den Compiler dann beide synchron
 * zu halten (Record-Vollständigkeitscheck).
 */
export type FeatureId =
  // Creator-Features (alle Plans inkl. Creator)
  | 'auto_highlights'
  | 'manual_highlights'
  | 'tiktok_tab'
  | 'builder'
  | 'multi_track_editor'
  | 'subtitle_studio_4styles'
  | 'music_intro_upload'
  | 'basic_effects'
  | 'export_1080p'
  // Pro+Lifetime-Features
  | 'podcast_highlights'
  | 'thumbnail_generator'
  | 'ai_subject_mask'
  | 'stabilizer'
  | 'lut_filters'
  | 'subtitle_layered_style'
  | 'subtitle_advanced_effects'
  | 'custom_subtitle_presets'
  | 'export_4k'
  | 'export_high_bitrate'
  | 'quality_render_mode'
  | 'priority_queue'
  | 'early_access'
  | 'unlimited_projects';

/**
 * i18n-Keys für die User-facing Feature-Namen.
 * Wird im UpgradeModal angezeigt ("AI Subject Mask is a Pro feature").
 * Translation-Strings liegen in src/renderer/src/lib/i18n/{lang}.ts unter `features.<id>`.
 */
export const FEATURE_LABEL_KEY: Record<FeatureId, string> = {
  auto_highlights: 'features.auto_highlights',
  manual_highlights: 'features.manual_highlights',
  tiktok_tab: 'features.tiktok_tab',
  builder: 'features.builder',
  multi_track_editor: 'features.multi_track_editor',
  subtitle_studio_4styles: 'features.subtitle_studio_4styles',
  music_intro_upload: 'features.music_intro_upload',
  basic_effects: 'features.basic_effects',
  export_1080p: 'features.export_1080p',
  podcast_highlights: 'features.podcast_highlights',
  thumbnail_generator: 'features.thumbnail_generator',
  ai_subject_mask: 'features.ai_subject_mask',
  stabilizer: 'features.stabilizer',
  lut_filters: 'features.lut_filters',
  subtitle_layered_style: 'features.subtitle_layered_style',
  subtitle_advanced_effects: 'features.subtitle_advanced_effects',
  custom_subtitle_presets: 'features.custom_subtitle_presets',
  export_4k: 'features.export_4k',
  export_high_bitrate: 'features.export_high_bitrate',
  quality_render_mode: 'features.quality_render_mode',
  priority_queue: 'features.priority_queue',
  early_access: 'features.early_access',
  unlimited_projects: 'features.unlimited_projects',
};

/** Map: Feature-ID → benötigter Mindest-Plan. */
export const FEATURE_MIN_PLAN: Record<FeatureId, Plan> = {
  // Creator (alle Plans)
  auto_highlights: 'creator',
  manual_highlights: 'creator',
  tiktok_tab: 'creator',
  builder: 'creator',
  multi_track_editor: 'creator',
  subtitle_studio_4styles: 'creator',
  music_intro_upload: 'creator',
  basic_effects: 'creator',
  export_1080p: 'creator',

  // Pro+Lifetime
  podcast_highlights: 'pro',
  thumbnail_generator: 'pro',
  ai_subject_mask: 'pro',
  stabilizer: 'pro',
  lut_filters: 'pro',
  subtitle_layered_style: 'pro',
  subtitle_advanced_effects: 'pro',
  custom_subtitle_presets: 'pro',
  export_4k: 'pro',
  export_high_bitrate: 'pro',
  quality_render_mode: 'pro',
  priority_queue: 'pro',
  early_access: 'pro',
  unlimited_projects: 'pro',
};

/* ─── Project-Limit (numerisch, separat von Boolean-Features) ─────────── */

/**
 * Maximale Project-Anzahl pro Plan. Infinity = unbegrenzt.
 * Creator: 25, Pro/Lifetime: ∞.
 */
export const PROJECT_LIMIT: Record<Plan, number> = {
  creator: 25,
  pro: Infinity,
  studio_lifetime: Infinity,
};

/* ─── Plan-Hierarchie ─────────────────────────────────────────────────── */

const PLAN_RANK: Record<Plan, number> = {
  creator: 1,
  pro: 2,
  studio_lifetime: 3,
};

/**
 * Bestimmt ob `currentPlan` mindestens auf der Stufe von `requiredPlan` ist.
 * Lifetime erfüllt alle Pro-Anforderungen, Pro alle Creator-Anforderungen.
 */
export function planMeets(currentPlan: Plan | null, requiredPlan: Plan): boolean {
  if (!currentPlan) return false;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}

/* ─── Pure-Helper ─────────────────────────────────────────────────────── */

/**
 * Pure-Function, ohne React-Hooks. Nutzbar in Stores, IPC-Handlern,
 * Validation-Code, oder wo immer kein React-Render-Cycle aktiv ist.
 */
export function canUseFeature(plan: Plan | null, featureId: FeatureId): boolean {
  return planMeets(plan, FEATURE_MIN_PLAN[featureId]);
}

/**
 * Project-Limit-Check. `count` = aktuelle Project-Anzahl, gibt true zurück
 * wenn der User noch ein weiteres Projekt anlegen darf.
 */
export function canCreateProject(plan: Plan | null, count: number): boolean {
  if (!plan) return false;
  return count < PROJECT_LIMIT[plan];
}

export function projectLimitForPlan(plan: Plan | null): number {
  if (!plan) return 0;
  return PROJECT_LIMIT[plan];
}

/* ─── React Hook ──────────────────────────────────────────────────────── */

export interface UseFeatureResult {
  /** Hat der User Zugriff auf das Feature? */
  unlocked: boolean;
  /** Aktueller Plan des Users (oder null falls keine Subscription). */
  currentPlan: Plan | null;
  /** Mindest-Plan der für das Feature benötigt wird. */
  requiredPlan: Plan;
}

/**
 * Hook für UI-Komponenten. Subscribed an authStore und re-rendert
 * automatisch wenn sich die Subscription ändert (Realtime/Polling).
 *
 * Usage:
 *   const { unlocked, requiredPlan } = useFeature('ai_subject_mask');
 *   if (!unlocked) return <FeatureLock requiredPlan={requiredPlan}>…</FeatureLock>;
 */
export function useFeature(featureId: FeatureId): UseFeatureResult {
  const subscription = useAuth((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;
  const requiredPlan = FEATURE_MIN_PLAN[featureId];
  return {
    unlocked: planMeets(currentPlan, requiredPlan),
    currentPlan,
    requiredPlan,
  };
}

/**
 * Hook für Project-Limit. Liest aktuelle Anzahl aus Caller-Code (z.B.
 * appStore.projects.length) und gibt zurück ob noch erstellt werden darf.
 */
export function useProjectLimit(currentCount: number): {
  canCreate: boolean;
  limit: number;
  remaining: number;
  currentPlan: Plan | null;
} {
  const subscription = useAuth((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;
  const limit = projectLimitForPlan(currentPlan);
  const canCreate = canCreateProject(currentPlan, currentCount);
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - currentCount) : Infinity;
  return { canCreate, limit, remaining, currentPlan };
}

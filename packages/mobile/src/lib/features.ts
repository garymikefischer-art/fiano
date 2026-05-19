/**
 * Feature-Gating für Mobile (Phase A5 — 2026-05-16).
 *
 * Port von src/renderer/src/lib/features.ts (Desktop). Plan-Hierarchie und
 * Feature-Mapping identisch — gewollt, sonst kommen Desktop+Mobile in
 * Trouble wenn sie mit verschiedenen Plan-Definitionen rendern.
 *
 * Mobile-Anpassungen:
 *   - Import zeigt auf packages/mobile/src/stores/authStore (statt Desktop).
 *   - Plan-Typ aus Mobile ist nullable; FEATURE_MIN_PLAN nutzt PlanRequirement
 *     (non-null subset).
 *
 * ⚠️ A5 ist Client-side only. Power-User mit gültigem JWT können via curl die
 * Worker-API direkt callen und Locks umgehen, weil der Worker noch keinen
 * Plan-Check macht. **Server-side Enforcement kommt in A6.3** (P0-2-Fix aus
 * SECURITY_AUDIT_2026-05-16.md).
 */

import { useAuthStore, type Plan } from '../stores/authStore';

/* ─── Plan-Typen ──────────────────────────────────────────────────────── */

/**
 * Non-null Plan — Required für FEATURE_MIN_PLAN. Der Mobile-authStore-Plan
 * ist 'creator'|'pro'|'studio_lifetime'|null (null = keine Subscription).
 * Feature-Locks brauchen einen konkreten Mindestplan, der nie null sein kann.
 */
export type PlanRequirement = Exclude<Plan, null>;

/* ─── Feature-IDs ─────────────────────────────────────────────────────── */

/**
 * Alle gateable Features. Beim Hinzufügen neuer Locks: Eintrag hier UND in
 * FEATURE_MIN_PLAN unten. TypeScript zwingt den Compiler dann beide synchron
 * zu halten (Record-Vollständigkeitscheck).
 *
 * Bleibt 1:1 synchron mit Desktop src/renderer/src/lib/features.ts.
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
  | 'unlimited_projects'
  // Phase C1 (2026-05-19): advanced effects (saturation + sharpen) = Pro.
  // basic_effects (brightness + contrast) gibt's schon als creator.
  | 'advanced_effects';

/**
 * i18n-Keys für die User-facing Feature-Namen.
 * Wird im UpgradeModal angezeigt ("AI Subject Mask is a Pro feature").
 * Translation-Strings liegen in packages/shared/src/i18n/locales/{lang}.ts.
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
  advanced_effects: 'features.advanced_effects',
};

/** Map: Feature-ID → benötigter Mindest-Plan. */
export const FEATURE_MIN_PLAN: Record<FeatureId, PlanRequirement> = {
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
  quality_render_mode: 'creator', // s. Desktop-Kommentar Phase 9.3
  priority_queue: 'pro',
  early_access: 'pro',
  unlimited_projects: 'pro',
  advanced_effects: 'pro',
};

/* ─── Project-Limit (numerisch, separat von Boolean-Features) ─────────── */

/**
 * Maximale Project-Anzahl pro Plan. Infinity = unbegrenzt.
 * Creator: 25, Pro/Lifetime: ∞.
 */
export const PROJECT_LIMIT: Record<PlanRequirement, number> = {
  creator: 25,
  pro: Infinity,
  studio_lifetime: Infinity,
};

/* ─── Plan-Hierarchie ─────────────────────────────────────────────────── */

const PLAN_RANK: Record<PlanRequirement, number> = {
  creator: 1,
  pro: 2,
  studio_lifetime: 3,
};

/**
 * Bestimmt ob `currentPlan` mindestens auf der Stufe von `requiredPlan` ist.
 * Lifetime erfüllt alle Pro-Anforderungen, Pro alle Creator-Anforderungen.
 *
 * currentPlan === null → false (User ohne Subscription kann nichts).
 */
export function planMeets(currentPlan: Plan, requiredPlan: PlanRequirement): boolean {
  if (!currentPlan) return false;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan];
}

/* ─── Pure-Helper ─────────────────────────────────────────────────────── */

/**
 * Pure-Function, ohne React-Hooks. Nutzbar in Stores, Pre-Render-Validierung,
 * oder wo immer kein React-Render-Cycle aktiv ist.
 */
export function canUseFeature(plan: Plan, featureId: FeatureId): boolean {
  return planMeets(plan, FEATURE_MIN_PLAN[featureId]);
}

/**
 * Project-Limit-Check. `count` = aktuelle Project-Anzahl, gibt true zurück
 * wenn der User noch ein weiteres Projekt anlegen darf.
 */
export function canCreateProject(plan: Plan, count: number): boolean {
  if (!plan) return false;
  return count < PROJECT_LIMIT[plan];
}

export function projectLimitForPlan(plan: Plan): number {
  if (!plan) return 0;
  return PROJECT_LIMIT[plan];
}

/* ─── React Hooks ─────────────────────────────────────────────────────── */

export interface UseFeatureResult {
  /** Hat der User Zugriff auf das Feature? */
  unlocked: boolean;
  /** Aktueller Plan des Users (oder null falls keine Subscription). */
  currentPlan: Plan;
  /** Mindest-Plan der für das Feature benötigt wird. */
  requiredPlan: PlanRequirement;
}

/**
 * Hook für UI-Komponenten. Subscribed an authStore und re-rendert
 * automatisch wenn sich die Subscription ändert.
 *
 * Usage:
 *   const { unlocked, requiredPlan } = useFeature('ai_subject_mask');
 *   if (!unlocked) return <FeatureLock featureId="ai_subject_mask">…</FeatureLock>;
 */
export function useFeature(featureId: FeatureId): UseFeatureResult {
  const subscription = useAuthStore((s) => s.subscription);
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
 * useProjects().length) und gibt zurück ob noch erstellt werden darf.
 */
export function useProjectLimit(currentCount: number): {
  canCreate: boolean;
  limit: number;
  remaining: number;
  currentPlan: Plan;
} {
  const subscription = useAuthStore((s) => s.subscription);
  const currentPlan = subscription?.plan ?? null;
  const limit = projectLimitForPlan(currentPlan);
  const canCreate = canCreateProject(currentPlan, currentCount);
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - currentCount) : Infinity;
  return { canCreate, limit, remaining, currentPlan };
}

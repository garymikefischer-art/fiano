/**
 * Plan-Check + Monthly Quota Module (Phase A6.3 + A6.3.1 + A6.3.2, 2026-05-18).
 *
 * Server-side Enforcement der Subscription-Plans + monthly Render-Quota.
 * Adressiert SECURITY_AUDIT P0-2: Mobile-Paywall war client-only, ein User
 * mit gültigem JWT konnte via curl unlimited 4K-Renders ausführen.
 *
 * Plan-Limits (sync gehalten mit `supabase/migrations/002_render_quota.sql`):
 *   inactive/no-sub:  0 renders     → subscription_required
 *   creator:          30 renders    max 1080p (kein 4K)
 *   pro:              200 renders   4K OK
 *
 * Lifetime ist Desktop-only (lokales FFmpeg, kein Worker-Render). User mit
 * lifetime-flag aber ohne aktive creator/pro Sub bekommen 0 Renders (Mobile
 * App-Paywall-Gate blockiert sie eh vorher).
 *
 * Rationale: Cloud Run cost ~$0.003-0.015 pro Render. Limits + paywall-gate
 * sichern dass Cloud-Render-Kosten nie höher sind als Subscription-Revenue.
 *
 * Aufruf-Pattern:
 *   `await checkAndIncrementRenderQuota(supabase, userId, resolution)` direkt
 *   vor dem FFmpeg-Spawn. Bei `allowed=false` → return 402 mit reason.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RenderQuotaResult =
  | {
      allowed: true;
      plan: 'creator' | 'pro';
      render_count: number;
      monthly_limit: number;
    }
  | {
      allowed: false;
      reason:
        | 'subscription_required'
        | 'monthly_limit_exceeded'
        | 'resolution_locked'
        | 'rpc_error';
      plan: 'inactive' | 'creator' | 'pro' | null;
      render_count?: number;
      monthly_limit?: number;
      requested_resolution?: string;
      message?: string;
    };

/**
 * Ruft die SQL-RPC `check_and_increment_render_quota` auf und parsed das
 * Ergebnis. Atomisch — selbst bei concurrent requests vom gleichen User
 * zählt jeder erfolgreiche Increment.
 *
 * @param resolution - Optional, eines von '720p' | '1080p' | '4k'.
 *                     Bei '4k' + Plan ∉ {pro, lifetime} → resolution_locked.
 *                     Default '1080p' (vorhandene clients ohne explicit value).
 */
export async function checkAndIncrementRenderQuota(
  supabase: SupabaseClient,
  userId: string,
  resolution: '720p' | '1080p' | '4k' = '1080p',
): Promise<RenderQuotaResult> {
  const { data, error } = await supabase.rpc('check_and_increment_render_quota', {
    p_user_id: userId,
    p_resolution: resolution,
  });

  if (error) {
    return {
      allowed: false,
      reason: 'rpc_error',
      plan: null,
      message: `quota RPC failed: ${error.message}`,
    };
  }

  // RPC gibt JSONB zurück — Supabase JS deserialized das automatisch.
  return data as RenderQuotaResult;
}

/**
 * Optional: für Endpunkte die KEINEN render machen (z.B. /v1/transcribe).
 * Hier wollen wir auch limitieren, aber keinen Counter incrementen — daher
 * nur Plan-Lookup ohne Update. (TODO: separate RPC oder direkt subscriptions
 * lesen. Vorerst skippen — transcribe nutzt eigene rate-limits.)
 */

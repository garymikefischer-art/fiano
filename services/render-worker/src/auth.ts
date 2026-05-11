/**
 * JWT-Auth Middleware — verifiziert Supabase-Token aus Authorization-Header.
 *
 * Da der Worker via Cloud Run public erreichbar ist, müssen wir 100% sicher sein
 * dass nur authentifizierte User mit aktivem Abo rendern. Wir verifizieren via
 * Supabase admin-client (Service-Role-Key) — kein Klartext-Key client-side nötig.
 *
 * Quota-Check ist Stub für jetzt — TODO Phase 9.6.2 wenn Stripe-Subscription-
 * Tabelle steht: rufe RPC `check_render_quota(user_id)` auf, returnt remaining_jobs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function authMiddleware(supabase: SupabaseClient) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing Authorization Bearer token' });
    }
    const token = header.slice(7);

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ ok: false, error: 'invalid token' });
      }
      req.userId = data.user.id;
      req.userEmail = data.user.email ?? undefined;

      // TODO Phase 9.6.2 — Quota-Check:
      // const { data: quota } = await supabase.rpc('check_render_quota', { user_id: data.user.id });
      // if (!quota?.allowed) return res.status(402).json({ ok: false, error: 'quota exceeded' });

      next();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(401).json({ ok: false, error: `auth failed: ${msg}` });
    }
  };
}

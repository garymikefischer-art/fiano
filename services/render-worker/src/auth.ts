/**
 * JWT-Auth Middleware — verifiziert Supabase-Token aus Authorization-Header.
 *
 * Da der Worker via Cloud Run public erreichbar ist, müssen wir 100% sicher sein
 * dass nur authentifizierte User mit aktivem Abo rendern. Wir verifizieren via
 * Supabase admin-client (Service-Role-Key) — kein Klartext-Key client-side nötig.
 *
 * K-2 (SECURITY_AUDIT_2026-06-10): Email-Verifizierung als harte Vorbedingung
 * für ALLE kostenrelevanten Endpoints (Denial-of-Wallet / Trial-Farming). Ohne
 * bestätigte Email kein Cloud-Compute. Greift NUR, wenn Supabase die Email als
 * unbestätigt markiert (email_confirmed_at IS NULL) — also nur bei aktivem
 * "Confirm email" im Supabase-Dashboard. OAuth-Logins (Google) sind immer
 * bestätigt. Fail-safe: solange Confirm-Email aus ist, sind alle Accounts
 * auto-confirmed und das Gate lässt sie durch (bricht nichts).
 * ⚠️ Damit das Gate WIRKT, muss "Confirm email" im Supabase-Dashboard aktiv
 *    sein (Auth → Providers → Email → Confirm email).
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

      // K-2: Email-Verify-Gate. email_confirmed_at wird von Supabase bei jedem
      // bestätigten Account (OAuth oder Confirm-Email-Flow) gesetzt. NULL =
      // unbestätigte Email → 403, kein Cloud-Compute. Verhindert Trial-/Multi-
      // Account-Farming mit Wegwerf-Emails.
      if (!data.user.email_confirmed_at) {
        console.warn(`[auth] blocked unverified email user=${data.user.id}`);
        return res.status(403).json({ ok: false, error: 'email_unverified' });
      }

      req.userId = data.user.id;
      req.userEmail = data.user.email ?? undefined;

      next();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(401).json({ ok: false, error: `auth failed: ${msg}` });
    }
  };
}

/**
 * Footer mit Links zu den Legal-Pages.
 * Wird auf Login-, Signup-, Pricing-Page angezeigt — pflicht für EU-Compliance
 * (User soll vor Vertragsabschluss / Account-Erstellung Zugriff auf Impressum,
 * AGB und Datenschutz haben).
 */

import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';

export function LegalFooter() {
  const t = useT();
  return (
    <footer className="shrink-0 px-6 py-3 border-t border-white/[0.04] flex items-center justify-center gap-4 text-[10px] text-zinc-600">
      <Link to="/legal/imprint"  className="hover:text-zinc-300 transition">{t('legal.tab.imprint')}</Link>
      <span className="opacity-30">·</span>
      <Link to="/legal/privacy"  className="hover:text-zinc-300 transition">{t('legal.tab.privacy')}</Link>
      <span className="opacity-30">·</span>
      <Link to="/legal/terms"    className="hover:text-zinc-300 transition">{t('legal.tab.terms')}</Link>
      <span className="opacity-30">·</span>
      <Link to="/legal/licenses" className="hover:text-zinc-300 transition">{t('legal.tab.licenses')}</Link>
    </footer>
  );
}

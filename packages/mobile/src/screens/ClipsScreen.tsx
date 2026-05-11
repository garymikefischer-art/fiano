/**
 * ClipsScreen — Tab-Placeholder. Tatsächlich routet MainTabs.tsx via tabPress-
 * Listener direkt zum ProjectDetail/Highlights-Tab; dieser Screen wird kaum
 * wirklich gerendert. Bleibt als Fallback falls der Listener nicht greift.
 */

import { ComingSoon } from '../components/ComingSoon';

export function ClipsScreen() {
  return (
    <ComingSoon
      icon="cut-outline"
      title="Highlights"
      description="Öffne dein zuletzt bearbeitetes Projekt …"
    />
  );
}

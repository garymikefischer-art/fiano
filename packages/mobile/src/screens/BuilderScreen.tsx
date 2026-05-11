/**
 * BuilderScreen — Tab-Placeholder. MainTabs.tsx tabPress routet direkt zu
 * ProjectDetail/Builder. Dieser Screen ist Fallback.
 */

import { ComingSoon } from '../components/ComingSoon';

export function BuilderScreen() {
  return (
    <ComingSoon
      icon="construct-outline"
      title="Builder"
      description="Öffne dein zuletzt bearbeitetes Projekt …"
    />
  );
}

/**
 * TikTokScreen — Tab-Placeholder. MainTabs.tsx tabPress routet direkt zu
 * ProjectDetail/9:16. Dieser Screen ist Fallback.
 */

import { ComingSoon } from '../components/ComingSoon';

export function TikTokScreen() {
  return (
    <ComingSoon
      icon="logo-tiktok"
      title="9:16"
      description="Öffne dein zuletzt bearbeitetes Projekt …"
    />
  );
}

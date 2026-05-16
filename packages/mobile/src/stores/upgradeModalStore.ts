/**
 * Mini-Store für globalen Upgrade-Modal-State (Phase A5).
 *
 * Port von src/renderer/src/stores/upgradeModalStore.ts (Desktop).
 *
 * FeatureLock-Components rufen `open(featureId)` auf, das einmalig in der App
 * gerenderte <UpgradeModal /> liest hier raus und zeigt sich an. Damit haben
 * wir:
 *   - keine duplicate Modal-Trees pro Lock-Component
 *   - keine z-index-Konflikte
 *   - kein Re-Render-Storm beim Öffnen
 */

import { create } from 'zustand';
import type { FeatureId } from '../lib/features';

interface UpgradeModalState {
  /** Aktuelle Feature-ID die zum Lock geführt hat — null = Modal zu. */
  featureId: FeatureId | null;
  open: (featureId: FeatureId) => void;
  close: () => void;
}

export const useUpgradeModal = create<UpgradeModalState>((set) => ({
  featureId: null,
  open: (featureId) => set({ featureId }),
  close: () => set({ featureId: null }),
}));

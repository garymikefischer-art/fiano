import { createContext, useContext } from 'react';

/**
 * RightRail = optionaler "right column slot" der von ProjectDetailPage gemountet wird
 * und vom aktiven Tab via React-Portal befüllt werden kann.
 *
 * - ProjectDetailPage stellt das Mount-Element zur Verfügung (oder null wenn Tab keinen Rail braucht).
 * - TikTokTab rendert dort seine SettingsSidebar via createPortal.
 * - So bleibt der State in TikTokTab, aber die Sidebar liegt visuell als Sibling vom Header.
 */
export const RightRailContext = createContext<HTMLElement | null>(null);

export function useRightRail(): HTMLElement | null {
  return useContext(RightRailContext);
}

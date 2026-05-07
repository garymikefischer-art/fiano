import { BrowserWindow } from 'electron';
import type { AppEvent } from '@shared/types';

/** Sendet ein Event an alle offenen Fenster (i.d.R. genau eines). */
export function broadcast(event: AppEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app.event', event);
    }
  }
}

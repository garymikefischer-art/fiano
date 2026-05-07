import { contextBridge, ipcRenderer } from 'electron';
import type { AppEvent, IpcResponse } from '@shared/types';

const api = {
  invoke: <T = unknown>(channel: string, payload?: unknown): Promise<IpcResponse<T>> =>
    ipcRenderer.invoke(channel, payload),

  onEvent: (cb: (e: AppEvent) => void): (() => void) => {
    const handler = (_: unknown, e: AppEvent) => cb(e);
    ipcRenderer.on('app.event', handler);
    return () => {
      ipcRenderer.off('app.event', handler);
    };
  },

  platform: process.platform as NodeJS.Platform,

  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:maximize-toggle'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void): (() => void) => {
      const handler = (_: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on('window:maximize-changed', handler);
      return () => {
        ipcRenderer.off('window:maximize-changed', handler);
      };
    },
  },

  /** Auth: OAuth-Callback aus dem Custom-Protocol fiano:// (Phase 6.1.5).
   *  Main-Prozess fängt die fiano://auth-callback#access_token=...-URL ab und
   *  schickt sie hier rein. AuthStore subscribed darauf und ruft setSession auf. */
  onAuthCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_: unknown, payload: { url: string }) => cb(payload.url);
    ipcRenderer.on('auth.oauth-callback', handler);
    return () => {
      ipcRenderer.off('auth.oauth-callback', handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;

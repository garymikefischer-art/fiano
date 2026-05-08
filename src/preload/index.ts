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

  /** Auth: OAuth-Callback via fiano:// Custom-Protocol (Production-Builds).
   *  Wird im Dev-Mode nicht zuverlässig getriggert — dort übernimmt der Loopback. */
  onAuthCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_: unknown, payload: { url: string }) => cb(payload.url);
    ipcRenderer.on('auth.oauth-callback', handler);
    return () => {
      ipcRenderer.off('auth.oauth-callback', handler);
    };
  },

  /** Auth: OAuth-Code aus dem Loopback-Server (Dev + Prod). Funktioniert
   *  ohne OS-Custom-Scheme-Registrierung. type='recovery' bei Password-Reset. */
  onAuthOauthCode: (cb: (payload: { code?: string; error?: string; type?: string }) => void): (() => void) => {
    const handler = (_: unknown, payload: { code?: string; error?: string; type?: string }) => cb(payload);
    ipcRenderer.on('auth.oauth-code', handler);
    return () => {
      ipcRenderer.off('auth.oauth-code', handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;

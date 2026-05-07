import { app, BrowserWindow, ipcMain, nativeImage, protocol, shell } from 'electron';
import { join, extname } from 'node:path';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { registerIpc } from './ipc';

// Custom-Scheme als privileged registrieren — MUSS vor app.whenReady() passieren.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

const MIME: Record<string, string> = {
  '.mp4':  'video/mp4',
  '.m4v':  'video/mp4',
  '.mov':  'video/quicktime',
  '.mkv':  'video/x-matroska',
  '.webm': 'video/webm',
  '.avi':  'video/x-msvideo',
  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.wav':  'audio/wav',
  '.aac':  'audio/aac',
  '.ogg':  'audio/ogg',
  // Bilder (Thumbnails / Reference Photos)
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
};

function registerMediaProtocol() {
  // media://local/<absoluter Pfad> → File aus dem Dateisystem streamen.
  // Eigene Stream-Implementierung (statt net.fetch(file://)) — verhindert
  // Bad-FD-Crashes in Electron's scoped_file.cc bei großen/langen Streams.
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);

      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      if (!filePath || filePath === '/') {
        return new Response('Bad Request', { status: 400 });
      }

      const stats = statSync(filePath);
      if (!stats.isFile()) {
        return new Response('Not Found', { status: 404 });
      }

      const ext = extname(filePath).toLowerCase();
      const mime = MIME[ext] ?? 'application/octet-stream';
      const total = stats.size;

      // Range-Requests vom <video>-Element bedienen
      const rangeHeader = request.headers.get('Range') ?? request.headers.get('range');
      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : total - 1;
          const safeEnd = Math.min(end, total - 1);
          const stream = createReadStream(filePath, { start, end: safeEnd });
          stream.on('error', (e) => logIfRealError('[media stream]', e));
          return new Response(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
              'Content-Range':  `bytes ${start}-${safeEnd}/${total}`,
              'Accept-Ranges':  'bytes',
              'Content-Length': String(safeEnd - start + 1),
              'Content-Type':   mime,
              'Cache-Control':  'no-cache',
            },
          });
        }
      }

      const stream = createReadStream(filePath);
      stream.on('error', (e) => console.error('[media stream] error:', e));
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Length': String(total),
          'Accept-Ranges':  'bytes',
          'Content-Type':   mime,
          'Cache-Control':  'no-cache',
        },
      });
    } catch (err) {
      logIfRealError('[media protocol]', err);
      return new Response('Not Found', { status: 404 });
    }
  });
}

/**
 * Filtert harmlose Stream-Abbrüche raus (Seek im Player, Tab-Wechsel, …).
 * Nur echte Fehler werden geloggt — verhindert Console-Spam.
 */
function logIfRealError(prefix: string, err: any): void {
  const code = err?.code;
  const name = err?.name;
  const msg = String(err?.message ?? err ?? '');
  // Bekannte harmlose Abbruch-Signale
  if (
    code === 'ABORT_ERR'  || name === 'AbortError' ||
    code === 'EBADF'      ||
    code === 'EPIPE'      ||
    code === 'ECANCELED'  ||
    code === 'ENOENT'     ||   // Datei während Stream gelöscht/verschoben
    msg.includes('aborted')
  ) {
    return;
  }
  console.error(prefix, 'error:', err);
}

function createWindow() {
  // Dock-Icon im Dev-Mode: build/icon.png laden falls vorhanden.
  // (In Production setzt electron-builder das App-Icon — Dev-Mode zeigt sonst Electron-Default.)
  const iconCandidates = [
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../../build/icon.png'),
  ];
  const iconPath = iconCandidates.find((p) => existsSync(p));
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  if (icon && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }

  // Security: in Production-Builds DevTools komplett deaktivieren.
  // app.isPackaged ist true beim built app (electron-builder), false in `npm run dev`.
  const isProd = app.isPackaged;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    // Mac: Traffic-Lights eingebettet links. Win/Linux: komplett frameless,
    // Custom Controls in der Sidebar (siehe WindowControls.tsx).
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#090b0c',
    icon, // Win/Linux nutzen das aus dem BrowserWindow
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // Production: DevTools komplett aus. Dev-Mode (npm run dev): an für Debug.
      devTools: !isProd,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Security: blockiere DevTools-Shortcuts IMMER (auch in Dev-Mode — User-Wunsch).
  // Dev-Mode: DevTools nur via App-Menu öffnenbar. Production: gar nicht (devTools=false).
  win.webContents.on('before-input-event', (event, input) => {
    const k = input.key.toLowerCase();
    const isDevToolsCombo = (
      // Cmd/Ctrl + Opt/Alt + I (DevTools)
      ((input.meta || input.control) && input.alt && k === 'i') ||
      // Cmd/Ctrl + Shift + I (DevTools alt)
      ((input.meta || input.control) && input.shift && k === 'i') ||
      // Cmd/Ctrl + Shift + C (Inspect element)
      ((input.meta || input.control) && input.shift && k === 'c') ||
      // Cmd/Ctrl + Shift + J (Console)
      ((input.meta || input.control) && input.shift && k === 'j') ||
      // F12
      k === 'f12'
    );
    if (isDevToolsCombo) {
      event.preventDefault();
    }
  });
  if (isProd) {
    // In Production: defensives close, falls DevTools doch geöffnet werden
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Window-Controls: Custom Title-Bar in der Sidebar braucht IPC zum
  // minimize/maximize/close. Channel-Namen: 'window:*' (kein IpcResponse-Wrap,
  // da fire-and-forget bzw. simple bool-Antwort).
  win.on('maximize', () => win.webContents.send('window:maximize-changed', true));
  win.on('unmaximize', () => win.webContents.send('window:maximize-changed', false));

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // FFmpeg-Override aus app-defaults.json laden falls gesetzt
  try {
    const { getAppDefaults } = await import('./core/settings');
    const { setFfmpegOverride } = await import('./core/bin');
    const d = await getAppDefaults();
    if (d.ffmpegPath) setFfmpegOverride(d.ffmpegPath);
  } catch (err) {
    console.warn('[startup] could not apply ffmpeg override:', err);
  }

  registerMediaProtocol();
  registerIpc();

  // Window-Controls: globale Handler — operieren auf dem Sender-Window.
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('window:maximize-toggle', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return false;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
    return w.isMaximized();
  });
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('window:is-maximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
  });

  createWindow();

  // Auto-Updates — nur in Production. Check beim Start, dann periodisch.
  // Bei verfügbarem Update: download → broadcast event zur UI → User entscheidet ob er installiert.
  // Manueller Check: über IPC 'app.checkForUpdates' (von der Notification-Bell aufgerufen).
  const { broadcast } = await import('./core/events');
  if (app.isPackaged) {
    try {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('checking-for-update', () => {
        broadcast({ type: 'update.checking' });
      });
      autoUpdater.on('update-available', (info) => {
        console.log(`[updater] update available: ${info.version}`);
        broadcast({ type: 'update.available', version: String(info.version) });
      });
      autoUpdater.on('update-not-available', (info) => {
        broadcast({ type: 'update.not-available', currentVersion: String(info?.version ?? app.getVersion()) });
      });
      autoUpdater.on('update-downloaded', (info) => {
        console.log(`[updater] update downloaded: ${info.version}`);
        broadcast({ type: 'update.downloaded', version: String(info.version) });
      });
      autoUpdater.on('error', (err) => {
        const msg = err?.message ?? String(err);
        console.warn(`[updater] error: ${msg}`);
        broadcast({ type: 'update.error', message: msg });
      });
      // Initial check 15s nach Start (App soll erst voll laden) + dann alle 6h
      setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 15_000);
      setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
    } catch (err) {
      console.warn('[updater] init failed:', err);
    }
  }

  // IPC-Handler: manueller Update-Check aus der UI (Notification-Bell).
  // Im Dev-Mode (nicht packaged) funktioniert electron-updater nicht — wir broadcasten
  // einen klaren Hinweis statt einen kryptischen Fehler. In Production triggert er den
  // autoUpdater, der dann checking/not-available/available-Events feuert.
  ipcMain.handle('app.checkForUpdates', async () => {
    if (!app.isPackaged) {
      broadcast({ type: 'update.error', message: 'Updates are only available in the packaged build.' });
      return;
    }
    try {
      broadcast({ type: 'update.checking' });
      const { autoUpdater } = await import('electron-updater');
      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      broadcast({ type: 'update.error', message: err?.message ?? String(err) });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

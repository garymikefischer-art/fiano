import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Auth-Loopback-Server für OAuth-Callbacks.
 *
 * Hintergrund:
 *  Custom-URL-Schemes (fiano://) funktionieren in macOS Dev-Mode (`npm run dev`)
 *  unzuverlässig — macOS startet die Electron-Binary statt der laufenden Instanz.
 *  Loopback-Server (http://127.0.0.1:PORT) funktionieren überall: Browser
 *  redirected dorthin, wir fangen ?code=... ab und schicken ihn zur App.
 *
 * Flow (mit Supabase PKCE):
 *  1. Renderer ruft auth.startOauthLoopback → wir starten Server auf einem
 *     freien Port und geben die Callback-URL zurück.
 *  2. Renderer ruft supabase.signInWithOAuth({ redirectTo: <url> }) → bekommt
 *     auth-URL zurück → öffnet sie via shell.openExternal.
 *  3. Browser → Google → Supabase → 302 zu http://127.0.0.1:PORT/?code=...
 *  4. Server liest code aus Query → broadcastet an Renderer → returnt eine
 *     "Login successful — you can close this window"-HTML-Seite → Server self-closes.
 *  5. Renderer ruft supabase.auth.exchangeCodeForSession(code) → Session.
 */

let activeServer: http.Server | null = null;
let activeTimer: NodeJS.Timeout | null = null;

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano — Login successful</title>
<style>
  html,body{margin:0;background:#0d0f10;color:#f1f2f2;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;height:100%;display:flex;align-items:center;justify-content:center}
  .card{padding:40px 48px;border-radius:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:center;max-width:380px}
  h1{margin:0 0 8px;font-size:18px;font-weight:600}
  p{margin:0;font-size:13px;color:#a1a1aa;line-height:1.5}
  .check{width:48px;height:48px;border-radius:14px;background:rgba(255,16,57,0.15);border:1px solid rgba(255,16,57,0.4);margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
  .check svg{width:22px;height:22px;color:#ff1039}
</style></head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>Login successful</h1>
    <p>You can close this window and return to fiano.</p>
  </div>
  <script>setTimeout(()=>{try{window.close();}catch(e){}},800);</script>
</body></html>`;

const FAILURE_HTML = (msg: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano — Login failed</title>
<style>html,body{margin:0;background:#0d0f10;color:#f1f2f2;font-family:-apple-system,sans-serif;padding:40px}
.err{color:#ff1039;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap}</style></head>
<body><h1>Login failed</h1><div class="err">${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</div></body></html>`;

export interface LoopbackResult {
  callbackUrl: string;
  port: number;
}

/** Startet den Loopback-Server. onCode wird aufgerufen sobald ein Code ankommt (oder
 *  wenn der Server timeoutet ohne Code). Der Server schließt sich danach selbst. */
export async function startAuthLoopback(
  onCallback: (params: { code?: string; error?: string }) => void,
  timeoutMs = 5 * 60 * 1000,
): Promise<LoopbackResult> {
  // Falls schon ein Server läuft (User klickt Google-Login zweimal): erst sauber schließen.
  await stopAuthLoopback();

  return new Promise<LoopbackResult>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Nur GET / akzeptieren
      if (!req.url) {
        res.writeHead(404).end();
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error') ?? url.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(FAILURE_HTML(error));
        onCallback({ error });
      } else if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
        onCallback({ code });
      } else {
        // Möglicherweise ein Hash-Fragment-Flow (legacy) — unser PKCE-Setup
        // sollte das nicht treffen. Defensive: ignore + 200 zurück.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
      }
      // Server nach kurzer Pause schließen — gibt der Response-Page Zeit.
      setTimeout(() => stopAuthLoopback(), 1000);
    });

    server.on('error', (err) => {
      console.warn('[auth-loopback] server error:', err);
      reject(err);
    });

    // Port:0 → OS wählt freien Port. Bind nur an 127.0.0.1 (loopback, nie öffentlich).
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      activeServer = server;
      // Timeout-Sicherung: wenn nach 5 Min keine Callback kommt, Server schließen
      activeTimer = setTimeout(() => {
        console.warn('[auth-loopback] timeout — closing server');
        onCallback({ error: 'OAuth timeout (no callback received)' });
        stopAuthLoopback();
      }, timeoutMs);
      resolve({
        callbackUrl: `http://127.0.0.1:${addr.port}/auth-callback`,
        port: addr.port,
      });
    });
  });
}

export async function stopAuthLoopback(): Promise<void> {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeServer) {
    const s = activeServer;
    activeServer = null;
    return new Promise<void>((resolve) => {
      s.close(() => resolve());
      // Force-close nach 500ms falls hängt
      setTimeout(() => resolve(), 500);
    });
  }
}

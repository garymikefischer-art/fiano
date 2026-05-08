import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Persistenter Auth-Loopback-Server für OAuth + Email-Confirmation.
 *
 * Startet einmal beim App-Start, läuft solange fiano läuft. Hört auf einen
 * der Ports im Range FIXED_PORTS (erster freier wird genutzt). Wenn der
 * Browser die App via http://127.0.0.1:PORT öffnet (egal ob direkt nach
 * OAuth oder Stunden später beim Email-Confirmation-Klick), fängt der
 * Server `?code=...` ab und schickt's an den Renderer.
 *
 * Festes Port-Range (statt port:0) damit Supabase Site-URL stabil bleibt:
 *   Site URL:       http://127.0.0.1:51999
 *   Redirect URLs:  http://127.0.0.1:51999/**
 *
 * Falls 51999 belegt ist (anderer Service nutzt ihn): 52000–52010 als Fallback.
 * Wir broadcasten immer nur die tatsächlich gebundene URL via IPC.
 */

const FIXED_PORTS = [51999, 52000, 52001, 52002, 52003, 52004, 52005];

let server: http.Server | null = null;
let activePort: number | null = null;
let codeListener: ((p: { code?: string; error?: string; type?: string }) => void) | null = null;

// Wiederverwendbare HTML-Page für Auth/Checkout-Erfolg.
// Title + Heading + Body als Argumente, damit wir verschiedene Use-Cases einfach abdecken.
const renderSuccessPage = (heading: string, body: string, accent: 'red' | 'green' = 'red'): string => {
  const accentBg     = accent === 'green' ? 'rgba(34,197,94,0.15)'  : 'rgba(255,16,57,0.15)';
  const accentBorder = accent === 'green' ? 'rgba(34,197,94,0.4)'   : 'rgba(255,16,57,0.4)';
  const accentText   = accent === 'green' ? '#22c55e'               : '#ff1039';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano</title>
<style>
  html,body{margin:0;background:#0d0f10;color:#f1f2f2;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;height:100%;display:flex;align-items:center;justify-content:center}
  .card{padding:40px 48px;border-radius:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:center;max-width:380px}
  h1{margin:0 0 8px;font-size:18px;font-weight:600}
  p{margin:0;font-size:13px;color:#a1a1aa;line-height:1.5}
  .check{width:48px;height:48px;border-radius:14px;background:${accentBg};border:1px solid ${accentBorder};margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
  .check svg{width:22px;height:22px;color:${accentText}}
</style></head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>${heading}</h1>
    <p>${body}</p>
  </div>
  <script>setTimeout(()=>{try{window.close();}catch(e){}},1500);</script>
</body></html>`;
};

const SUCCESS_HTML        = renderSuccessPage("You're signed in",         "You can close this window and return to fiano.");
const CHECKOUT_OK_HTML    = renderSuccessPage('Payment successful',       'Welcome to fiano. You can close this window — your plan is being activated.', 'green');
const CHECKOUT_CANCEL_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano — Checkout canceled</title>
<style>html,body{margin:0;background:#0d0f10;color:#f1f2f2;font-family:-apple-system,sans-serif;height:100%;display:flex;align-items:center;justify-content:center}
.card{padding:40px 48px;border-radius:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);text-align:center;max-width:380px}
h1{margin:0 0 8px;font-size:18px;font-weight:600}p{margin:0;font-size:13px;color:#a1a1aa;line-height:1.5}</style></head>
<body><div class="card"><h1>Checkout canceled</h1><p>No charge was made. You can return to fiano and pick another plan whenever you're ready.</p></div>
<script>setTimeout(()=>{try{window.close();}catch(e){}},2000);</script></body></html>`;
const PORTAL_RETURN_HTML  = renderSuccessPage('All set',                  'You can close this window and return to fiano.', 'green');

const FAILURE_HTML = (msg: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano — Login failed</title>
<style>html,body{margin:0;background:#0d0f10;color:#f1f2f2;font-family:-apple-system,sans-serif;padding:40px}
.err{color:#ff1039;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;background:rgba(255,16,57,0.06);border:1px solid rgba(255,16,57,0.2);border-radius:10px;padding:16px}
h1{font-size:18px}</style></head>
<body><h1>Login failed</h1><div class="err">${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</div></body></html>`;

const HASH_BRIDGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fiano</title></head>
<body>
<script>
  // Manche Supabase-Flows redirecten mit #fragment statt ?query.
  // Browser sendet Hash nicht zum Server → wir bridgen es per JS zu /auth-callback?...
  (function () {
    var h = window.location.hash || '';
    if (h.startsWith('#')) h = h.slice(1);
    var search = window.location.search || '';
    if (h) {
      var url = '/auth-callback' + (search ? search + '&' : '?') + h;
      window.location.replace(url);
    }
  })();
</script>
</body></html>`;

/**
 * Setzt den Listener-Callback. Kann mehrfach aufgerufen werden — überschreibt jedes Mal.
 */
export function setLoopbackListener(cb: ((p: { code?: string; error?: string; type?: string }) => void) | null): void {
  codeListener = cb;
}

/** Aktuelle Loopback-URL (null wenn Server nicht läuft). */
export function getLoopbackUrl(): string | null {
  if (!activePort) return null;
  return `http://127.0.0.1:${activePort}/auth-callback`;
}

export function getLoopbackBaseUrl(): string | null {
  if (!activePort) return null;
  return `http://127.0.0.1:${activePort}`;
}

/** Server beim App-Start aufrufen — versucht Ports der Reihe nach. Idempotent. */
export async function startPersistentLoopback(): Promise<void> {
  if (server) return; // bereits läuft

  for (const port of FIXED_PORTS) {
    try {
      await tryListen(port);
      activePort = port;
      console.log(`[auth-loopback] listening on http://127.0.0.1:${port}`);
      return;
    } catch (err: any) {
      if (err?.code === 'EADDRINUSE') continue;
      console.warn(`[auth-loopback] failed on port ${port}:`, err);
    }
  }
  console.warn('[auth-loopback] all ports busy — auth callbacks will not work');
}

function tryListen(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const s = http.createServer(handleRequest);
    s.once('error', (err) => {
      reject(err);
    });
    s.listen(port, '127.0.0.1', () => {
      s.removeAllListeners('error');
      // Künftige Errors loggen, nicht abstürzen
      s.on('error', (err) => console.warn('[auth-loopback] runtime error:', err));
      server = s;
      const addr = s.address() as AddressInfo;
      activePort = addr.port;
      resolve();
    });
  });
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!req.url) {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');

  // Root-Path: Supabase nutzt manchmal Hash-Fragment-Flow (Email-Confirmation legacy).
  // Wir senden ein winziges JS-Bridge das den Hash zu Query macht und auf /auth-callback weiterleitet.
  if (url.pathname === '/' || url.pathname === '') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(HASH_BRIDGE_HTML);
    return;
  }

  // Stripe-Checkout-Success: Stripe redirected hierhin nach erfolgreicher Zahlung.
  // Subscription-Sync läuft via Webhook im Hintergrund — wir zeigen nur eine
  // schöne "Payment successful"-Seite. Der Realtime-Channel im AuthStore
  // detected die neue Subscription dann automatisch und routet weiter.
  if (url.pathname === '/checkout-success') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CHECKOUT_OK_HTML);
    // App in Vordergrund holen
    if (codeListener) codeListener({ /* nichts spezifisches — focus only */ });
    return;
  }

  // Stripe-Checkout-Cancel: User hat Stripe-Checkout abgebrochen.
  if (url.pathname === '/checkout-cancel') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CHECKOUT_CANCEL_HTML);
    return;
  }

  // Customer-Portal-Return: User klickt im Stripe-Portal "Return to fiano".
  if (url.pathname === '/portal-return') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PORTAL_RETURN_HTML);
    if (codeListener) codeListener({ /* focus only */ });
    return;
  }

  if (url.pathname !== '/auth-callback') {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type'); // 'recovery' bei Password-Reset, sonst undefined
  const error = url.searchParams.get('error') ?? url.searchParams.get('error_description');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(FAILURE_HTML(error));
    if (codeListener) codeListener({ error });
    return;
  }

  if (code) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
    if (codeListener) codeListener({ code, ...(type ? { type } : {}) });
    return;
  }

  // Kein code, kein error — wahrscheinlich nur ein Redirect ohne Auth-Daten.
  // Show success-Page trotzdem damit User nicht verwirrt ist.
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_HTML);
}

export function stopPersistentLoopback(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    const s = server;
    server = null;
    activePort = null;
    s.close(() => resolve());
    setTimeout(resolve, 500);
  });
}

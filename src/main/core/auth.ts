import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Auth-Session encryption with Electron safeStorage.
 *
 * Stores Supabase session (access_token + refresh_token + user) in an
 * OS-keychain-backed encrypted blob in userData. Same pattern as for
 * api-key storage in settings.ts.
 *
 * Why we don't use localStorage: tokens in localStorage are visible to
 * any DevTools-injected script. safeStorage uses Keychain (mac), DPAPI
 * (Windows), kwallet/gnome-keyring (Linux) — much harder to exfiltrate.
 */

const SESSION_FILE = () => path.join(app.getPath('userData'), 'auth-session.enc');

export async function saveSession(sessionJson: string): Promise<void> {
  const trimmed = sessionJson.trim();
  if (!trimmed) {
    await fs.rm(SESSION_FILE(), { force: true });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available — cannot persist session.');
  }
  await fs.writeFile(SESSION_FILE(), safeStorage.encryptString(trimmed));
}

export async function loadSession(): Promise<string | null> {
  try {
    const buf = await fs.readFile(SESSION_FILE());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await fs.rm(SESSION_FILE(), { force: true });
}

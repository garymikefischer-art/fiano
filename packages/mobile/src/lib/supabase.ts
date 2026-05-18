/**
 * Supabase Client für Mobile.
 *
 * Session wird in expo-secure-store persistiert (iOS Keychain, Android EncryptedSharedPreferences).
 * Gleiches Supabase-Projekt wie Desktop → User-Accounts sind plattformübergreifend.
 */

import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { ENV } from './env';

// Phase B3.6 (2026-05-18): SecureStore hat 2 KB Limit pro Key. Supabase
// Sessions sind seit OAuth/Google-Login + Plan-Claims oft > 2 KB → triggert
// Expo-Warning "may not be stored successfully". Fix: Chunked-Adapter
// splittet Werte > 1.9 KB in N Chunks (key__0, key__1, ...). Beim Lesen
// werden Chunks zusammengeführt. Legacy-Werte (vor chunking) bleiben
// kompatibel durch fallback auf single-key-read.
const CHUNK_SIZE = 1900;
const CHUNK_COUNT_SUFFIX = '__count';

async function chunkedGet(key: string): Promise<string | null> {
  // 1) Versuche legacy single-key-read (für alte Sessions vor Chunking).
  const single = await SecureStore.getItemAsync(key);
  if (single !== null) {
    // Heuristik: legacy values haben keinen "__count"-marker. Erkenne aktuelle
    // chunked-saves an einem separat gespeicherten count.
    const countRaw = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (countRaw === null) return single;
    // Falls count existiert → wir sind im chunked-Modus, ignoriere single
    // (war ggf. residual aus Legacy). Stattdessen Chunks zusammenführen.
  }
  // 2) Chunked-Read.
  const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
  if (countStr === null) return null;
  const count = parseInt(countStr, 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}__${i}`);
    if (part === null) return null; // Daten unvollständig → null statt corrupt-read
    parts.push(part);
  }
  return parts.join('');
}

async function chunkedSet(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_SIZE) {
    // Klein genug → single-key save (legacy-compatible).
    await SecureStore.setItemAsync(key, value);
    // Clean up old chunks falls vorhanden.
    const oldCount = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (oldCount !== null) {
      const n = parseInt(oldCount, 10);
      if (Number.isFinite(n)) {
        for (let i = 0; i < n; i++) {
          await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => {});
        }
      }
      await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`).catch(() => {});
    }
    return;
  }
  // Groß → in Chunks splitten.
  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}__${i}`, chunk);
  }
  await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, String(count));
  // Lösche legacy single-key falls vorhanden.
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

async function chunkedRemove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key).catch(() => {});
  const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
  if (countStr !== null) {
    const n = parseInt(countStr, 10);
    if (Number.isFinite(n)) {
      for (let i = 0; i < n; i++) {
        await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => {});
      }
    }
    await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`).catch(() => {});
  }
}

const ExpoSecureStoreAdapter: SupportedStorage = {
  getItem: chunkedGet,
  setItem: chunkedSet,
  removeItem: chunkedRemove,
};

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

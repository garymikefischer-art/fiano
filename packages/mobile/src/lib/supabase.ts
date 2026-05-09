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

// SecureStore hat 2 KB Limit pro Key. Bei sehr großen Sessions splitten — Supabase
// Session ist ~1.5 KB → reicht. Bei Überschreiten würde der Adapter werfen.
const ExpoSecureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

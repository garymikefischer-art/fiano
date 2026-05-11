/**
 * Runtime-Env-Variablen aus Expo (EXPO_PUBLIC_* werden in den Bundle gebaked).
 * Entwicklung: aus `.env` via expo-cli. Production: via EAS Secrets.
 */

const required = (name: string, val: string | undefined): string => {
  if (!val) {
    throw new Error(
      `Missing env var: ${name}. Set it via .env (dev) or EAS Secrets (prod).`,
    );
  }
  return val;
};

export const ENV = {
  SUPABASE_URL: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  // Phase 9.6 Cloud-Render-Worker URL (Google Cloud Run). Optional — wenn leer,
  // ist Cloud-Render deaktiviert (ExportScreen zeigt 'coming soon').
  RENDER_WORKER_URL: process.env.EXPO_PUBLIC_RENDER_WORKER_URL ?? '',
};

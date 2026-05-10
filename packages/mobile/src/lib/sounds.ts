/**
 * Mobile-Sounds (Phase 9.4.27).
 *
 * 1:1-API zu Desktop src/renderer/src/lib/sounds.ts. Statt Web-Audio-API
 * (auf RN nicht verfügbar) werden die 5 vorgerenderten WAVs aus
 * `assets/sounds/` über expo-av abgespielt — Tonkurven sind identisch
 * (siehe scripts/generate-sounds.js).
 *
 * Lazy-Load mit try/catch — wenn das Native-Modul (expo-av) noch nicht
 * gelinkt ist, sind die Calls no-op statt App-Crash.
 *
 * Mute persistiert via expo-secure-store unter `fiano.sounds.muted`.
 * Die `setMuted`/`isMuted`-API spiegelt Desktop.
 */

import * as SecureStore from 'expo-secure-store';

type AvModule = typeof import('expo-av');
type SoundClass = AvModule['Audio']['Sound'];
type SoundInstance = InstanceType<SoundClass>;

const SOUND_FILES = {
  appStart: require('../../assets/sounds/appStart.wav'),
  projectOpen: require('../../assets/sounds/projectOpen.wav'),
  exportDone: require('../../assets/sounds/exportDone.wav'),
  notify: require('../../assets/sounds/notify.wav'),
  error: require('../../assets/sounds/error.wav'),
} as const;

type SoundName = keyof typeof SOUND_FILES;

const STORAGE_KEY = 'fiano.sounds.muted';

let cached: AvModule | null | undefined = undefined;
let warned = false;
/** Wird auf `true` gesetzt sobald ein Aufruf fehlschlägt → kein Retry-Spam. */
let permanentlyDisabled = false;
/** Cache geladener Sound-Instanzen → re-use statt jedes Mal neu zu laden. */
const instances: Partial<Record<SoundName, SoundInstance>> = {};
let muted = false;
let mutedHydrated = false;

function getModule(): AvModule | null {
  if (permanentlyDisabled) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-av') as AvModule;
  } catch {
    cached = null;
    if (!warned) {
      warned = true;
      console.warn('[sounds] expo-av nicht verfügbar — Native-Build mit `npm run android` nötig.');
    }
  }
  return cached;
}

function disableAfterError(name: string, e: unknown) {
  if (!permanentlyDisabled) {
    permanentlyDisabled = true;
    console.warn(`[sounds] disabled after ${name} failure:`, e);
  }
}

/** Vorab Mute-State aus SecureStore lesen — App.tsx ruft das beim Boot auf. */
export async function initSounds(): Promise<void> {
  try {
    const v = await SecureStore.getItemAsync(STORAGE_KEY);
    muted = v === '1';
  } catch {
    // SecureStore-Lese-Fehler ignorieren, default = false (sounds an)
  }
  mutedHydrated = true;
}

export function isMuted(): boolean {
  return muted;
}

export async function setMuted(next: boolean): Promise<void> {
  muted = next;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // ignore — runtime mute funktioniert trotzdem
  }
}

async function playSound(name: SoundName) {
  if (permanentlyDisabled) return;
  if (!mutedHydrated) {
    // wenn init noch nicht durch ist, lieber stumm bleiben statt zu früh zu spielen.
    return;
  }
  if (muted) return;

  const A = getModule();
  if (!A) return;

  try {
    let snd = instances[name];
    if (!snd) {
      const created = await A.Audio.Sound.createAsync(
        SOUND_FILES[name],
        { shouldPlay: false, volume: 1.0 },
      );
      snd = created.sound;
      instances[name] = snd;
    }
    await snd.setPositionAsync(0);
    await snd.playAsync();
  } catch (e) {
    // Native-Modul fehlt komplett (z.B. zwischen Install + Build) → für den
    // Rest der App-Session stilllegen, sonst Logs-Spam bei jeder Action.
    disableAfterError(name, e);
  }
}

/* ─── Public API — gleiche Signaturen wie Desktop ──────────────── */

export function appStart(): void {
  void playSound('appStart');
}

export function projectOpen(): void {
  void playSound('projectOpen');
}

export function exportDone(): void {
  void playSound('exportDone');
}

export function notify(): void {
  void playSound('notify');
}

export function error(): void {
  void playSound('error');
}

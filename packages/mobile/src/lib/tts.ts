/**
 * TTS-Generation via OpenAI (Phase 9.5.5).
 *
 * Endpoint: https://api.openai.com/v1/audio/speech
 * Model: tts-1 (fast, niedrige Latenz)
 * Response: audio/mpeg (mp3-Binary)
 *
 * Wir laden das Audio per fetch + arrayBuffer, konvertieren zu base64 und
 * schreiben via expo-file-system in `documentDirectory/voice-overs/`. Das
 * Datei bleibt persistent (analog Source-Videos via persistInDocuments).
 *
 * RN 0.76 / Hermes hat fetch + arrayBuffer + globalThis.btoa nativ verfügbar
 * — kein zusätzliches Dep nötig. Falls btoa fehlt: arrayBufferToBase64()
 * fallback'd auf einen reinen JS-Encoder (siehe Helper-Section).
 */

import * as FileSystem from 'expo-file-system';

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const TTS_DIR = `${FileSystem.documentDirectory}voice-overs/`;

export interface GenerateTtsOpts {
  text: string;
  voice: string;
  apiKey: string;
  /** Default 'tts-1'. 'tts-1-hd' = höhere Qualität, ~3× Kosten + Latenz. */
  model?: 'tts-1' | 'tts-1-hd';
}

export interface GenerateTtsResult {
  /** file:// URI in documentDirectory/voice-overs/. */
  path: string;
  /** Größe in Bytes. */
  size: number;
}

export async function generateTts(opts: GenerateTtsOpts): Promise<GenerateTtsResult> {
  const text = opts.text.trim();
  if (!text) throw new Error('Text is empty');
  if (!opts.apiKey) throw new Error('OpenAI API key not configured (Settings → API Keys)');
  if (text.length > 4096) throw new Error('Text exceeds 4096 chars');

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? 'tts-1',
      input: text,
      voice: opts.voice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    let msg = `OpenAI TTS failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.error?.message) msg = err.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  // Ensure target dir.
  const dirInfo = await FileSystem.getInfoAsync(TTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(TTS_DIR, { intermediates: true });
  }

  const filename = `tts-${Date.now()}-${opts.voice}.mp3`;
  const path = `${TTS_DIR}${filename}`;

  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { path, size: arrayBuffer.byteLength };
}

/**
 * Konvertiert einen ArrayBuffer zu base64. Chunk-weise um Stack-Overflow bei
 * großen Buffern zu vermeiden (String.fromCharCode.apply mit > ~64k Args bricht
 * auf manchen Engines). Wenn globalThis.btoa nicht verfügbar ist (alte JS-Engines),
 * fallback auf reinen JS-Encoder.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (typeof globalThis.btoa === 'function') {
    const CHUNK = 0x8000; // 32KB
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return globalThis.btoa(binary);
  }
  return jsBase64Encode(bytes);
}

const B64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS-Fallback wenn btoa fehlt. ~3× langsamer aber zuverlässig. */
function jsBase64Encode(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : 0;
    const b3 = i < len ? bytes[i++] : 0;
    const padding = i > len ? len + 3 - i : 0;
    out += B64_TABLE.charAt(b1 >> 2);
    out += B64_TABLE.charAt(((b1 & 3) << 4) | (b2 >> 4));
    out += padding >= 2 ? '=' : B64_TABLE.charAt(((b2 & 15) << 2) | (b3 >> 6));
    out += padding >= 1 ? '=' : B64_TABLE.charAt(b3 & 63);
  }
  return out;
}

export interface TtsVoice {
  id: string;
  label: string;
  hint: string;
}

export const TTS_VOICES_MALE: TtsVoice[] = [
  { id: 'onyx',  label: 'Onyx',  hint: 'Deep, authoritative' },
  { id: 'echo',  label: 'Echo',  hint: 'Calm, neutral' },
  { id: 'fable', label: 'Fable', hint: 'British accent' },
];

export const TTS_VOICES_FEMALE: TtsVoice[] = [
  { id: 'nova',    label: 'Nova',    hint: 'Bright, energetic' },
  { id: 'shimmer', label: 'Shimmer', hint: 'Soft, warm' },
  { id: 'alloy',   label: 'Alloy',   hint: 'Neutral, versatile' },
];

export interface TtsLanguage {
  code: string;
  label: string;
  native: string;
}

/** Subset der OpenAI-TTS-unterstützten Sprachen (analog Desktop). Das Lang-Field
 *  wirkt auf das model nicht direkt (TTS detected die Sprache aus dem Text), aber
 *  hilft dem User beim Mental-Mapping welche Voice/Akzent er erwartet. */
export const TTS_LANGUAGES: TtsLanguage[] = [
  { code: 'de', label: 'German',     native: 'Deutsch' },
  { code: 'en', label: 'English',    native: 'English' },
  { code: 'es', label: 'Spanish',    native: 'Español' },
  { code: 'fr', label: 'French',     native: 'Français' },
  { code: 'it', label: 'Italian',    native: 'Italiano' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'nl', label: 'Dutch',      native: 'Nederlands' },
  { code: 'pl', label: 'Polish',     native: 'Polski' },
  { code: 'ru', label: 'Russian',    native: 'Русский' },
];

export function isMaleVoice(id: string): boolean {
  return TTS_VOICES_MALE.some((v) => v.id === id);
}

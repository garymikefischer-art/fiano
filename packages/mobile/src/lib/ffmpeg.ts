/**
 * FFmpeg-Wrapper für Mobile.
 *
 * Nutzt ffmpeg-kit-react-native (Community-Fork — Original arthenica/ffmpeg-kit
 * ist seit Juni 2025 archiviert).
 *
 * Ablauf:
 *   - Args werden mit `buildMobileExportArgs` aus @fiano/shared/ffmpegArgs erstellt
 *   - Hier wird nur die Spawn-Layer + Progress-Callback gehandhabt
 *
 * Migration-Path: wenn wir auf custom native Module wechseln (post-MVP), bleibt
 * dieser File die einzige Stelle die getauscht werden muss.
 */

import { Platform } from 'react-native';
import {
  FFmpegKit,
  FFmpegKitConfig,
  ReturnCode,
  type Statistics,
  type FFmpegSession,
} from 'ffmpeg-kit-react-native';
import {
  buildMobileExportArgs,
  type MobileExportOpts,
  type Platform as ArgPlatform,
} from '@fiano/shared/ffmpegArgs';

export interface RunOpts {
  /** Total-Duration in Sekunden für Progress-%-Berechnung. */
  expectedDuration: number;
  onProgress?: (percent: number) => void;
}

let activeSession: FFmpegSession | null = null;

function platformForArgs(): ArgPlatform {
  if (Platform.OS === 'ios') return 'darwin';
  if (Platform.OS === 'android') return 'android';
  return 'other';
}

/**
 * Führt einen Mobile-Export aus. Wirft bei Fehler oder Cancel.
 *
 * Returns: void (Output ist in opts.dst geschrieben).
 */
export async function exportMobile(opts: MobileExportOpts, runOpts: RunOpts): Promise<void> {
  const args = buildMobileExportArgs(opts, platformForArgs());
  await runFfmpegArgs(args, runOpts);
}

/**
 * Low-level Runner — direkt mit args[]. Wird für custom Pipelines genutzt.
 */
export async function runFfmpegArgs(args: string[], runOpts: RunOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    FFmpegKitConfig.enableStatisticsCallback((stat: Statistics) => {
      if (runOpts.onProgress && runOpts.expectedDuration > 0) {
        const sec = stat.getTime() / 1000;
        const pct = Math.min(99, (sec / runOpts.expectedDuration) * 100);
        runOpts.onProgress(pct);
      }
    });

    FFmpegKit.executeWithArguments(args)
      .then(async (session) => {
        activeSession = session;
        const rc = await session.getReturnCode();
        activeSession = null;
        if (ReturnCode.isSuccess(rc)) {
          runOpts.onProgress?.(100);
          resolve();
        } else if (ReturnCode.isCancel(rc)) {
          reject(new Error('aborted'));
        } else {
          const log = await session.getOutput();
          reject(new Error(`ffmpeg failed: ${(log ?? '').slice(-500)}`));
        }
      })
      .catch((err) => {
        activeSession = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/**
 * Bricht den aktiven FFmpeg-Job ab. Der laufende `exportMobile`-Promise rejected
 * dann mit `Error('aborted')`.
 */
export function cancelFfmpeg(): void {
  if (activeSession) {
    FFmpegKit.cancel();
  }
}

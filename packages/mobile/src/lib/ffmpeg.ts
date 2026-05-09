/**
 * FFmpeg-Wrapper für Mobile — STUB für MVP (Phase 9.4.2).
 *
 * Hintergrund: arthenica/ffmpeg-kit wurde Juni 2025 archiviert + Maven-Repo am
 * 1.4.2025 abgeschaltet. Auch der jdarshan5-Fork pullt noch die alten
 * `com.arthenica:ffmpeg-kit-https`-Coords → Gradle-Build schlägt fehl.
 *
 * Phase 9.4.x: Custom Native-Module (iOS via kewlbear/FFmpeg-iOS Swift-Package,
 * Android via NDK + statisch gelinktes FFmpeg). Da @fiano/shared/ffmpegArgs
 * plattform-neutral ist, ist der Migrationsaufwand klein.
 *
 * Bis dahin: Stub damit App startbar und Login + Import + UI testbar bleiben.
 */

import {
  buildMobileExportArgs,
  type MobileExportOpts,
} from '@fiano/shared/ffmpegArgs';

export interface RunOpts {
  expectedDuration: number;
  onProgress?: (percent: number) => void;
}

/**
 * STUB — wirft "not-implemented". Args werden trotzdem berechnet damit der Code
 * im ExportScreen kompiliert + die Pipeline-Logik testbar bleibt.
 */
export async function exportMobile(opts: MobileExportOpts, runOpts: RunOpts): Promise<void> {
  const args = buildMobileExportArgs(opts, 'android');
  console.log('[ffmpeg-stub] would run:', args.join(' '));

  // Fake-Progress-Demo für UI-Tests (~3 sec)
  for (let i = 0; i <= 100; i += 10) {
    await new Promise((r) => setTimeout(r, 300));
    runOpts.onProgress?.(i);
  }

  throw new Error(
    'FFmpeg-Native ist im MVP noch nicht aktiv (Phase 9.4.x). ' +
    'Custom Android/iOS-Native-Module sind in Vorbereitung.',
  );
}

/** Low-level Runner — gleicher Stub-Status. */
export async function runFfmpegArgs(args: string[], runOpts: RunOpts): Promise<void> {
  void args;
  void runOpts;
  throw new Error('FFmpeg-Native nicht im MVP — siehe exportMobile.');
}

/** Cancel-No-Op (kein laufender Job). */
export function cancelFfmpeg(): void {
  // Stub
}

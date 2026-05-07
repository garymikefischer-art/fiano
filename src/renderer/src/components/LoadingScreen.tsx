import { FianoLogo } from './FianoLogo';
import { useT } from '../lib/i18n';

/**
 * Splash-Screen beim App-Start. Wird ~1.2s gezeigt während Initial-Loads laufen.
 * Pure UI — fadet gleichmäßig ein, mit pulsierendem Logo + indeterminate Progress-Bar.
 */
export function LoadingScreen() {
  const t = useT();
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-fiano-black overflow-hidden">
      {/* Subtiler radial-gradient im Hintergrund */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,16,57,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-7 animate-fade-in">
        {/* fiano Wortmarke mit pulsierendem Glow */}
        <FianoLogo className="h-40 w-auto animate-glow-pulse" />

        {/* Indeterminate Progress-Bar */}
        <div className="w-40 h-[2px] rounded-full bg-white/[0.06] overflow-hidden relative">
          <div className="absolute top-0 left-0 h-full w-1/3 bg-fiano-red rounded-full
                          shadow-[0_0_8px_rgba(255,16,57,0.6)] animate-loading-sweep" />
        </div>

        {/* Status */}
        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">
          {t('loading.initializing')}
        </div>
      </div>
    </div>
  );
}

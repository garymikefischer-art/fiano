import { useEffect, useState } from 'react';
import clsx from 'clsx';

/** Toast für update-available/downloaded events vom Auto-Updater (electron-updater).
 *  - 'available' → einfacher Hinweis, Update wird automatisch geladen
 *  - 'downloaded' → Button "Restart now" → quitAndInstall via IPC */
type State =
  | { type: 'idle' }
  | { type: 'available'; version: string }
  | { type: 'downloaded'; version: string };

export function UpdateToast() {
  const [state, setState] = useState<State>({ type: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const off = window.api.onEvent((e) => {
      if (e.type === 'update.available') {
        setState({ type: 'available', version: e.version });
        setDismissed(false);
      } else if (e.type === 'update.downloaded') {
        setState({ type: 'downloaded', version: e.version });
        setDismissed(false);
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  if (state.type === 'idle' || dismissed) return null;

  const isReady = state.type === 'downloaded';

  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-[90] glass rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]',
      'p-4 max-w-sm flex items-start gap-3 animate-fade-in',
    )}>
      <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-fiano-red/30 to-fiano-red/10 border border-fiano-red/40 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-fiano-red" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-zinc-100">
          {isReady ? `Update ${state.version} ready` : `Update ${state.version} available`}
        </div>
        <div className="text-[11px] text-zinc-400 mt-0.5">
          {isReady
            ? 'Restart fiano to install the update.'
            : 'Downloading in background — you can keep working.'}
        </div>
        {isReady && (
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => window.api.invoke('app.restartAndInstall', {})}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-fiano-red text-white hover:brightness-110 transition"
            >
              Restart now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-[11px] text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.05] transition"
            >
              Later
            </button>
          </div>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-zinc-500 hover:text-zinc-200 transition text-[14px] leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

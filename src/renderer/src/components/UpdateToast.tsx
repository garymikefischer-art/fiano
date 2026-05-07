import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/** Toast für Auto-Updater-Events (electron-updater).
 *  - 'available'  → Hinweis dass Download startet
 *  - 'progress'   → Live-Fortschritt mit Bar + Prozent + Geschwindigkeit
 *  - 'downloaded' → Button "Restart now" → quitAndInstall via IPC */
type State =
  | { type: 'idle' }
  | { type: 'available'; version: string }
  | { type: 'progress'; version: string; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'downloaded'; version: string }
  /** Mac-spezifischer Fallback: code-signature-Validation failed → User soll manuell laden. */
  | { type: 'manual-fallback'; version: string };

export function UpdateToast() {
  const [state, setState] = useState<State>({ type: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  // Letzte bekannte Version für Progress-Events (die liefern keine Version mit).
  const versionRef = useRef<string>('');

  useEffect(() => {
    const off = window.api.onEvent((e) => {
      if (e.type === 'update.available') {
        versionRef.current = e.version;
        setState({ type: 'available', version: e.version });
        setDismissed(false);
      } else if (e.type === 'update.progress') {
        setState({
          type: 'progress',
          version: versionRef.current || 'unknown',
          percent: e.percent,
          transferred: e.transferred,
          total: e.total,
          bytesPerSecond: e.bytesPerSecond,
        });
        setDismissed(false);
      } else if (e.type === 'update.downloaded') {
        versionRef.current = e.version;
        setState({ type: 'downloaded', version: e.version });
        setDismissed(false);
      } else if (e.type === 'update.error') {
        // Code-signature-Fehler auf Mac → Manual-Fallback-State.
        // Andere Fehler ignorieren wir hier (Bell-Status zeigt sie schon).
        if (/code signat|signature|did not pass validation/i.test(e.message)) {
          setState({ type: 'manual-fallback', version: versionRef.current || '' });
          setDismissed(false);
        }
      }
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  if (state.type === 'idle' || dismissed) return null;

  const isReady = state.type === 'downloaded';
  const isProgress = state.type === 'progress';
  const isManual = state.type === 'manual-fallback';

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
          {isManual
            ? `Update ${state.version} — manual download`
            : isReady
              ? `Update ${state.version} ready`
              : isProgress
                ? `Downloading update ${state.version}`
                : `Update ${state.version} available`}
        </div>
        <div className="text-[11px] text-zinc-400 mt-0.5">
          {isManual
            ? 'Auto-update needs code-signing on macOS. Open the release page to download the new DMG manually.'
            : isReady
              ? 'Restart fiano to install the update.'
              : isProgress
                ? `${Math.round(state.percent)}% · ${formatBytes(state.transferred)} / ${formatBytes(state.total)} · ${formatBytes(state.bytesPerSecond)}/s`
                : 'Downloading in background — you can keep working.'}
        </div>

        {/* Progress-Bar während Download */}
        {isProgress && (
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-fiano-red/80 to-fiano-red transition-all duration-150 shadow-[0_0_8px_rgba(255,16,57,0.4)]"
              style={{ width: `${Math.max(0, Math.min(100, state.percent))}%` }}
            />
          </div>
        )}

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
        {isManual && (
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => window.api.invoke('app.openReleasePage', { version: state.version })}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-fiano-red text-white hover:brightness-110 transition"
            >
              Open release page
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

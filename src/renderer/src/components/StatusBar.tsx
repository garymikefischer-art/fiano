import { useEffect, useState } from 'react';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

export function StatusBar() {
  const job = useApp((s) => s.currentJob);
  const cancelCurrentJob = useApp((s) => s.cancelCurrentJob);
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  // Version einmalig laden — kommt aus Electron's app.getVersion(), das im Build
  // eingefroren wird. Fehler ignorieren (ältere Main-Prozess ohne Handler bleibt funktionsfähig).
  useEffect(() => {
    (async () => {
      try {
        const r = await window.api.invoke<{ version: string }>('app.getVersion');
        if (r?.ok && r.data?.version) setVersion(r.data.version);
      } catch {/* noop */}
    })();
  }, []);

  // Job changed → reset canceling-flag (neuer Job = neue Cancel-Möglichkeit).
  useEffect(() => {
    if (!job) setCanceling(false);
  }, [job?.projectId, job?.step]);

  const stepLabel: Record<string, string> = {
    starting:        t('status.starting'),
    download:        t('status.downloading'),
    transcribe:      t('status.transcribing'),
    highlights:      t('status.analyzingHighlights'),
    render:          t('status.renderingClips'),
    'shell-export':  t('status.exporting'),
    'shell-build':   t('status.building'),
    'editor-export': t('status.exportingEditor'),
  };

  // Phase 9.1: Cancel nur für Shell-Jobs (9:16/Builder Export).
  // Pipeline-Jobs (download/transcribe/render) brauchen separaten Cancel-Pfad.
  const cancelable = job?.projectId === 'shell';

  async function handleCancel() {
    if (canceling) return;
    setCanceling(true);
    try {
      await cancelCurrentJob();
    } catch {
      setCanceling(false);
    }
  }

  if (!job) {
    return (
      <div className="h-9 bg-panel border-t border-zinc-800 flex items-center justify-between px-4 text-xs text-zinc-600">
        <span>{t('status.idle')}</span>
        {version && <span className="text-[10px] tracking-wide text-zinc-700 font-mono">v{version}</span>}
      </div>
    );
  }

  return (
    <div className="h-9 bg-panel border-t border-zinc-800 flex items-center px-4 gap-3 text-xs">
      <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
      <span className="text-zinc-300">
        {canceling
          ? t('status.canceling')
          : `${stepLabel[job.step] ?? job.step} · ${Math.round(job.percent)}%`}
      </span>
      <div className="flex-1 max-w-sm bg-zinc-800 rounded-full h-1 overflow-hidden">
        <div
          className="h-full bg-brand transition-all duration-200"
          style={{ width: `${job.percent}%` }}
        />
      </div>
      {cancelable && (
        <button
          onClick={handleCancel}
          disabled={canceling}
          title={t('status.cancel')}
          aria-label={t('status.cancel')}
          className="flex items-center justify-center w-5 h-5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      )}
      {version && <span className="text-[10px] tracking-wide text-zinc-700 font-mono ml-auto">v{version}</span>}
    </div>
  );
}

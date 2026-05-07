import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

export function StatusBar() {
  const job = useApp((s) => s.currentJob);
  const t = useT();

  const stepLabel: Record<string, string> = {
    starting:    t('status.starting'),
    download:    t('status.downloading'),
    transcribe:  t('status.transcribing'),
    highlights:  t('status.analyzingHighlights'),
    render:      t('status.renderingClips'),
  };

  if (!job) {
    return <div className="h-9 bg-panel border-t border-zinc-800 flex items-center px-4 text-xs text-zinc-600">
      {t('status.idle')}
    </div>;
  }

  return (
    <div className="h-9 bg-panel border-t border-zinc-800 flex items-center px-4 gap-3 text-xs">
      <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
      <span className="text-zinc-300">
        {stepLabel[job.step] ?? job.step} · {Math.round(job.percent)}%
      </span>
      <div className="flex-1 max-w-sm bg-zinc-800 rounded-full h-1 overflow-hidden">
        <div
          className="h-full bg-brand transition-all duration-200"
          style={{ width: `${job.percent}%` }}
        />
      </div>
    </div>
  );
}

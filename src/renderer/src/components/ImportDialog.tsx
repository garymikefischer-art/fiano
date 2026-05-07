import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { VideoType } from '@shared/types';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { createFromUrl, createFromFile, createFromMultipleFiles, createQuickTikTok } = useApp();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [videoType, setVideoType] = useState<VideoType>('gaming');
  const t = useT();

  const submitUrl = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    await createFromUrl(url.trim(), videoType);
    setBusy(false);
    onClose();
  };

  const pickFile = async () => {
    setBusy(true);
    const p = await createFromFile(videoType);
    setBusy(false);
    if (p) onClose();
  };

  const pickMultiple = async () => {
    setBusy(true);
    const p = await createFromMultipleFiles();
    setBusy(false);
    if (p) {
      onClose();
      navigate(`/project/${p.id}?tab=clips`);
    }
  };

  const pickQuickTikTok = async () => {
    setBusy(true);
    const p = await createQuickTikTok();
    setBusy(false);
    if (p) {
      onClose();
      navigate(`/project/${p.id}?tab=tiktok`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-panel rounded-2xl p-6 w-[540px] border border-zinc-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t('importDialog.title')}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg">✕</button>
        </div>

        {/* Quick TikTok — featured at top */}
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-wide text-brand mb-2 px-1">
            ⚡ {t('importDialog.quickTikTokHeader')}
          </div>
          <button
            onClick={pickQuickTikTok}
            disabled={busy}
            className="w-full border border-brand/40 hover:border-brand bg-brand/5 hover:bg-brand/10
                       rounded-xl p-4 text-left transition disabled:opacity-50 flex items-center gap-3"
          >
            <span className="text-2xl">🎬</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{t('importDialog.quickTikTokTitle')}</div>
              <div className="text-xs text-zinc-400">
                {t('importDialog.quickTikTokDesc')}
              </div>
            </div>
          </button>
        </div>

        <div className="my-4 flex items-center gap-3 text-zinc-700 text-[10px]">
          <hr className="flex-1 border-zinc-800" /> {t('importDialog.or')} <hr className="flex-1 border-zinc-800" />
        </div>

        {/* AUTO Mode */}
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2 px-1">
            {t('importDialog.autoModeHeader')}
          </div>

          {/* Video-Type-Picker — bestimmt Highlight-Erkennungsstrategie */}
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
              {t('importDialog.videoTypeLabel')}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['gaming', 'podcast', 'auto'] as VideoType[]).map((vt) => (
                <button
                  key={vt}
                  onClick={() => setVideoType(vt)}
                  disabled={busy}
                  className={clsx(
                    'rounded-lg px-2 py-2 text-[11px] border transition',
                    videoType === vt
                      ? 'bg-fiano-red/15 border-fiano-red/45 text-white shadow-[0_0_12px_rgba(255,16,57,0.18)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]',
                  )}
                >
                  <div className="font-semibold">{t(`importDialog.videoType.${vt}`)}</div>
                  <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight">
                    {t(`importDialog.videoType.${vt}Hint`)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={pickFile}
            disabled={busy}
            className="w-full mb-2 border border-zinc-800 hover:border-brand hover:bg-brand/5
                       rounded-xl p-4 text-left transition disabled:opacity-50 flex items-center gap-3"
          >
            <span className="text-2xl">🎞</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{t('importDialog.singleFileTitle')}</div>
              <div className="text-xs text-zinc-500">{t('importDialog.singleFileDesc')}</div>
            </div>
          </button>

          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
              placeholder={t('importDialog.urlPlaceholder')}
              className="flex-1 bg-surface border border-zinc-800 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-brand"
            />
            <button
              onClick={submitUrl}
              disabled={!url.trim() || busy}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 rounded-lg disabled:opacity-40"
            >
              {t('importDialog.importBtn')}
            </button>
          </div>
        </div>

        <div className="my-5 flex items-center gap-3 text-zinc-700 text-[10px]">
          <hr className="flex-1 border-zinc-800" /> {t('importDialog.or')} <hr className="flex-1 border-zinc-800" />
        </div>

        {/* MANUAL Mode */}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2 px-1">
            {t('importDialog.manualModeHeader')}
          </div>

          <button
            onClick={pickMultiple}
            disabled={busy}
            className="w-full border border-zinc-800 hover:border-brand hover:bg-brand/5
                       rounded-xl p-4 text-left transition disabled:opacity-50 flex items-center gap-3"
          >
            <span className="text-2xl">📦</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{t('importDialog.multipleTitle')}</div>
              <div className="text-xs text-zinc-500">{t('importDialog.multipleDesc')}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

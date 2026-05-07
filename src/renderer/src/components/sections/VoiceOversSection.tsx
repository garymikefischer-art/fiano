import { useState } from 'react';
import clsx from 'clsx';
import type { Project } from '@shared/types';
import { useApp } from '../../stores/appStore';
import { TtsModal } from '../EditorTab';
import { useT } from '../../lib/i18n';

/** Helper: format MM:SS or fallback to "0s" */
function fmtSec(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function VoiceOversSection({
  project, totalDurationHint,
}: {
  project: Project;
  /** Optional: max position für Slider (Output-Video-Dauer-Schätzung). Default 60s. */
  totalDurationHint?: number;
}) {
  const addVoiceOver    = useApp((s) => s.addVoiceOver);
  const removeVoiceOver = useApp((s) => s.removeVoiceOver);
  const updateVoiceOver = useApp((s) => s.updateVoiceOver);

  const [showTts, setShowTts] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const voiceOvers = project.voiceOvers ?? [];
  const maxSec = Math.max(60, totalDurationHint ?? 0);

  const editing = editingIdx !== null ? voiceOvers[editingIdx] : null;
  const t = useT();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
            {t('voiceOver.heading')}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {t('voiceOver.subheading')}
          </div>
        </div>
        <button
          onClick={() => { setEditingIdx(null); setShowTts(true); }}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md
                     border border-fiano-red/45 text-fiano-red bg-transparent
                     hover:bg-fiano-red/10 hover:border-fiano-red/70
                     active:scale-[0.97] transition-all flex items-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <path d="M8 3v10 M3 8h10" />
          </svg>
          {t('voiceOver.new')}
        </button>
      </div>

      {voiceOvers.length === 0 ? (
        <div className="px-3 py-6 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.08] text-center text-[11px] text-zinc-600 italic">
          {t('voiceOver.emptyHint')}
        </div>
      ) : (
        <div className="space-y-2">
          {voiceOvers.map((vo, i) => (
            <div key={i} className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-zinc-100 truncate">
                    🎙️ {vo.text ? vo.text.slice(0, 40) + (vo.text.length > 40 ? '…' : '') : t('voiceOver.fallbackTitle')}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-mono">
                    {vo.voice ?? 'tts'} · {t('voiceOver.startsAt')} {fmtSec(vo.startSec)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingIdx(i); setShowTts(true); }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition"
                    title={t('voiceOver.editTitle')}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M11.5 2.5l2 2L6 12 3 13l1-3z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t('voiceOver.removeConfirm'))) removeVoiceOver(project.id, i);
                    }}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title={t('voiceOver.removeTitle')}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M3 4h10 M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1 M6 7v5 M10 7v5 M4 4l1 9a1 1 0 001 1h4a1 1 0 001-1l1-9" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Position-Slider — startSec */}
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={maxSec} step={0.5}
                  value={vo.startSec}
                  onChange={(e) => updateVoiceOver(project.id, i, { startSec: Number(e.target.value) })}
                  className="flex-1 accent-fiano-red"
                />
                <input
                  type="number" min={0} step={0.5}
                  value={vo.startSec}
                  onChange={(e) => updateVoiceOver(project.id, i, { startSec: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-16 px-2 py-1 rounded-md bg-black/40 border border-white/[0.08]
                             text-[11px] font-mono text-zinc-100 focus:outline-none focus:border-fiano-red/60"
                />
                <span className="text-[10px] text-zinc-600 font-mono">s</span>
              </div>

              {/* Volume-Slider */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 w-12">{t('voiceOver.volume')}</span>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={vo.volume}
                  onChange={(e) => updateVoiceOver(project.id, i, { volume: Number(e.target.value) })}
                  className="flex-1 accent-fiano-red"
                />
                <span className="w-10 text-right text-[10px] text-zinc-400 font-mono tabular-nums">
                  {Math.round(vo.volume * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-zinc-700 italic px-1">
        ⓘ {t('voiceOver.footer')}
      </div>

      {showTts && (
        <TtsModal
          onClose={() => { setShowTts(false); setEditingIdx(null); }}
          initialText={editing?.text ?? ''}
          initialVoice={editing?.voice ?? 'nova'}
          isEditMode={editing !== null}
          onGenerated={async (audioPath, _label, text, voice) => {
            const vo = {
              path: audioPath,
              startSec: editing?.startSec ?? 0,
              volume: editing?.volume ?? 1.0,
              text,
              voice,
            };
            if (editing && editingIdx !== null) {
              await updateVoiceOver(project.id, editingIdx, vo);
            } else {
              await addVoiceOver(project.id, vo);
            }
            setEditingIdx(null);
          }}
        />
      )}
    </div>
  );
}

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ClipSegment, ExportFormat, Project } from '@shared/types';
import { ClipCard } from './ClipCard';
import { ClipEditorModal } from './ClipEditorModal';
import { useApp } from '../stores/appStore';
import { useT } from '../lib/i18n';

interface Props {
  project: Project;
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  onJumpToBuilder: () => void;
}

export function ClipsTab({ project, selected, setSelected, onJumpToBuilder }: Props) {
  const exportClip = useApp((s) => s.exportClip);
  const updateHighlight = useApp((s) => s.updateHighlight);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const t = useT();

  if (project.status === 'analyzing') {
    return (
      <div className="text-center py-16 text-zinc-500">
        <div className="text-2xl mb-3 animate-pulse">⏳</div>
        <div className="text-sm">{t('clipsTab.analyzing')}</div>
      </div>
    );
  }

  if (project.highlights.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <div className="text-2xl mb-3">🎬</div>
        <div className="text-sm">{t('clipsTab.noClips')}</div>
      </div>
    );
  }

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const onExport = async (
    i: number,
    format: ExportFormat,
    segments: ClipSegment[],
  ) => {
    const h = project.highlights[i];
    if (!h.clipPath) return;
    const idx = String(i + 1).padStart(3, '0');
    const suffix = format === 'youtube' ? '16x9' : '9x16';
    const name = `clip-${idx}-${suffix}.mp4`;
    await exportClip(h.clipPath, name, format, segments, {
      layout: 'full',
      music: project.music,
    });
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="text-[12px] text-zinc-400">
          <span className="text-zinc-200 font-medium">{project.highlights.length}</span> {t('clipsTab.clipsLabel')}
          {' · '}
          <span className="text-zinc-200 font-medium">{selected.size}</span> {t('clipsTab.selectedLabel')}
        </div>
        <button
          onClick={onJumpToBuilder}
          disabled={selected.size === 0}
          className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-fiano-red text-white
                     hover:brightness-110 hover:shadow-[0_0_20px_rgba(255,16,57,0.45)]
                     active:scale-[0.98] disabled:opacity-40 disabled:hover:shadow-none disabled:hover:brightness-100
                     transition-all"
        >
          {t('clipsTab.buildYouTube')} →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Chronologisch sortiert (für UI-Reihenfolge), aber Original-Index als Referenz behalten
            — sonst landen updateHighlight-Calls am falschen Highlight im Backend. */}
        {project.highlights
          .map((h, i) => ({ h, i }))
          .sort((a, b) => a.h.start - b.h.start)
          .map(({ h, i }, displayIdx) => (
          <ClipCard
            key={i}
            highlight={h}
            index={i}
            displayIndex={displayIdx}
            selected={selected.has(i)}
            onToggle={() => toggle(i)}
            onCommitSegments={(segments) => {
              updateHighlight(project.id, i, { segments });
            }}
            onExport={(format, segments) => onExport(i, format, segments)}
            onOpenEditor={() => setEditingIdx(i)}
          />
        ))}
      </div>

      {editingIdx !== null && project.highlights[editingIdx] && (
        <ClipEditorModal
          projectId={project.id}
          highlight={project.highlights[editingIdx]}
          index={editingIdx}
          onClose={() => setEditingIdx(null)}
        />
      )}
    </div>
  );
}

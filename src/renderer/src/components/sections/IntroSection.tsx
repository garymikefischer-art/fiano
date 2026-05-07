import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { IntroMode, Project, ProjectIntro } from '@shared/types';
import { DEFAULT_INTRO_OVERLAY } from '@shared/types';
import { useApp } from '../../stores/appStore';
import { useT } from '../../lib/i18n';

/** Wiederverwendbare Intro-Sektion mit Mode-Toggle und Overlay-Position-Editor. */
export function IntroSection({ project }: { project: Project }) {
  const { setProjectIntro, pickIntroFile } = useApp();
  const t = useT();

  const onPick = async () => {
    const path = await pickIntroFile();
    if (path) {
      await setProjectIntro(project.id, {
        path,
        mode: project.intro?.mode ?? 'before',
        scale: project.intro?.scale,
        x: project.intro?.x,
        y: project.intro?.y,
      });
    }
  };
  const onRemove = async () => { await setProjectIntro(project.id, null); };
  const onSetMode = async (mode: IntroMode) => {
    if (!project.intro) return;
    await setProjectIntro(project.id, { ...project.intro, mode });
  };
  const onPatch = async (patch: Partial<ProjectIntro>) => {
    if (!project.intro) return;
    await setProjectIntro(project.id, { ...project.intro, ...patch });
  };

  return (
    <section>
      <h3 className="text-sm font-medium mb-2">{t('intro.heading')}</h3>
      {project.intro ? (
        <IntroAssigned
          intro={project.intro}
          mode={project.intro.mode ?? 'before'}
          onPick={onPick}
          onRemove={onRemove}
          onSetMode={onSetMode}
          onPatch={onPatch}
        />
      ) : (
        <button
          onClick={onPick}
          className="w-full border-2 border-dashed border-zinc-800 rounded-xl p-4 text-left hover:border-brand hover:bg-brand/5 transition"
        >
          <div className="text-[10px] text-zinc-500 mb-1">{t('intro.heading')}</div>
          <div className="text-sm text-zinc-300 mb-1">{t('intro.add')}</div>
          <div className="text-[10px] text-zinc-600">{t('intro.fileHint')}</div>
        </button>
      )}
    </section>
  );
}

function IntroAssigned({
  intro, mode, onPick, onRemove, onSetMode, onPatch,
}: {
  intro: ProjectIntro;
  mode: IntroMode;
  onPick: () => void;
  onRemove: () => void;
  onSetMode: (m: IntroMode) => void;
  onPatch: (patch: Partial<ProjectIntro>) => void;
}) {
  const scale = intro.scale ?? DEFAULT_INTRO_OVERLAY.scale;
  const x = intro.x ?? DEFAULT_INTRO_OVERLAY.x;
  const y = intro.y ?? DEFAULT_INTRO_OVERLAY.y;

  const [localScale, setLocalScale] = useState(scale);
  const [localX, setLocalX] = useState(x);
  const [localY, setLocalY] = useState(y);
  const t = useT();
  useEffect(() => { setLocalScale(scale); }, [scale]);
  useEffect(() => { setLocalX(x); }, [x]);
  useEffect(() => { setLocalY(y); }, [y]);

  return (
    <div className="border border-brand/40 bg-brand/5 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-zinc-500">{t('intro.fileLabel')}</div>
          <div className="text-sm text-zinc-200 truncate" title={intro.path}>
            ✓ {intro.path.split('/').pop() ?? intro.path}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onPick} className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 bg-zinc-800 rounded">{t('intro.replace')}</button>
          <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 bg-zinc-800 rounded">{t('intro.remove')}</button>
        </div>
      </div>

      <div>
        <div className="text-[11px] text-zinc-400 mb-1">{t('intro.modeLabel')}</div>
        <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded">
          <button
            onClick={() => onSetMode('before')}
            className={clsx('text-xs py-1.5 rounded transition',
              mode === 'before' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >⏮ {t('intro.modeBefore')}</button>
          <button
            onClick={() => onSetMode('overlay')}
            className={clsx('text-xs py-1.5 rounded transition',
              mode === 'overlay' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300')}
          >🪟 {t('intro.modeOverlay')}</button>
        </div>
        <div className="text-[10px] text-zinc-600 mt-1">
          {mode === 'before' ? t('intro.modeBeforeHint') : t('intro.modeOverlayHint')}
        </div>
      </div>

      {mode === 'overlay' && (
        <div className="space-y-2 pt-1">
          <SliderRow label={t('intro.size')}     value={localScale} min={0.05} max={1}    step={0.01}
            display={`${Math.round(localScale * 100)}%`}
            onChange={setLocalScale} onCommit={(v) => onPatch({ scale: v })} />
          <SliderRow label={t('intro.posX')}     value={localX}    min={0}    max={0.95} step={0.01}
            display={`${Math.round(localX * 100)}%`}
            onChange={setLocalX} onCommit={(v) => onPatch({ x: v })} />
          <SliderRow label={t('intro.posY')}     value={localY}    min={0}    max={0.95} step={0.01}
            display={`${Math.round(localY * 100)}%`}
            onChange={setLocalY} onCommit={(v) => onPatch({ y: v })} />
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, display, onChange, onCommit,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  display: string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-brand">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit(value)}
        className="w-full accent-brand"
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { Project, ProjectMusic } from '@shared/types';
import { useApp } from '../../stores/appStore';
import { useT } from '../../lib/i18n';

/**
 * Wiederverwendbare Music-Tracks-Sektion.
 * Wird sowohl im BuilderTab (YouTube) als auch im TikTokTab verwendet.
 */
export function MusicSection({ project }: { project: Project }) {
  const {
    pickMusicFile,
    addMusicTrack,
    removeMusicTrack,
    updateMusicTrack,
    setActiveMusicIndex,
  } = useApp();

  const tracks = project.musicTracks ?? [];
  const activeIdx = project.activeMusicIndex;
  const t = useT();

  const onAdd = async () => {
    const path = await pickMusicFile();
    if (path) await addMusicTrack(project.id, { path, volume: 0.25 });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{t('music.heading')}</h3>
        <button
          onClick={onAdd}
          className="text-[10px] text-zinc-300 hover:text-white px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded"
        >
          {t('music.addTrack')}
        </button>
      </div>

      {tracks.length === 0 ? (
        <div className="text-[11px] text-zinc-600 italic">
          {t('music.noTracksHint')}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {tracks.map((t, i) => (
              <MusicTrackRow
                key={i}
                track={t}
                isActive={activeIdx === i}
                onActivate={() => setActiveMusicIndex(project.id, i)}
                onRemove={() => removeMusicTrack(project.id, i)}
                onVolumeCommit={(v) => updateMusicTrack(project.id, i, { volume: v })}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px]">
            <button
              onClick={() => setActiveMusicIndex(project.id, -1)}
              className={clsx(
                'px-3 py-1 rounded transition',
                activeIdx === -1
                  ? 'bg-brand text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
              )}
            >
              🎲 {t('music.randomPerBuild')}
            </button>
            <button
              onClick={() => setActiveMusicIndex(project.id, undefined)}
              className={clsx(
                'px-3 py-1 rounded transition',
                activeIdx === undefined
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
              )}
            >
              {t('music.off')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function MusicTrackRow({
  track, isActive, onActivate, onRemove, onVolumeCommit,
}: {
  track: ProjectMusic;
  isActive: boolean;
  onActivate: () => void;
  onRemove: () => void;
  onVolumeCommit: (v: number) => void;
}) {
  const [vol, setVol] = useState(track.volume);
  useEffect(() => { setVol(track.volume); }, [track.volume]);
  const t = useT();

  return (
    <div
      className={clsx(
        'rounded-lg p-3 border flex items-center gap-3',
        isActive ? 'border-brand bg-brand/5' : 'border-zinc-800 bg-panel',
      )}
    >
      <button
        onClick={onActivate}
        className={clsx(
          'w-4 h-4 rounded-full border-2 shrink-0 transition',
          isActive ? 'bg-brand border-brand' : 'border-zinc-600 hover:border-zinc-400',
        )}
        title={t('music.useTrack')}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200 truncate" title={track.path}>
          {track.path.split('/').pop() ?? track.path}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={vol}
            onChange={(e) => setVol(parseFloat(e.target.value))}
            onPointerUp={() => onVolumeCommit(vol)}
            className="flex-1 accent-brand h-1"
          />
          <span className="text-[10px] font-mono text-zinc-500 w-8 text-right">
            {Math.round(vol * 100)}%
          </span>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 bg-zinc-800 rounded shrink-0"
      >
        {t('music.remove')}
      </button>
    </div>
  );
}

/** Helper: liefert den aktuell für den Build aktiven Track. Random pro Build via -1. */
export function resolveActiveMusic(project: Project): ProjectMusic | undefined {
  const tracks = project.musicTracks ?? [];
  const idx = project.activeMusicIndex;
  if (idx === undefined || tracks.length === 0) return undefined;
  if (idx === -1) return tracks[Math.floor(Math.random() * tracks.length)];
  return tracks[idx];
}

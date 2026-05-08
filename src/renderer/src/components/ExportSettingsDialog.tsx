import clsx from 'clsx';
import { useT } from '../lib/i18n';
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';

/**
 * Phase 9.2: Geteilter Export-Settings-Dialog für Builder (16:9) + 9:16 (TikTokTab).
 *
 * Visuell identisch zum Edit-Tab Export-Dialog (siehe EditorTab.tsx ExportDialog) —
 * Glass-Card, Resolution-Dropdown + Width/Height-Inputs, FPS-Toggle, Bitrate-Dropdown.
 * Edit-Tab BLEIBT visuell unverändert (separate Komponente dort).
 *
 * Plan-Locks: 4K + High-Bitrate (50M/30M) gated per useFeature() — beim Pick auf
 * locked-Option → revert + UpgradeModal.
 *
 * format-Prop bestimmt die Resolution-Presets: 'youtube' = 16:9-Liste,
 * 'tiktok' = 9:16-vertikal-Liste.
 */

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  /** Encoder-Mode: 'fast' = Hardware (h264_videotoolbox / NVENC), 'quality' = libx264 -preset slow */
  qualityMode: 'fast' | 'quality';
}

const RESOLUTION_PRESETS_16_9: Array<{ label: string; w: number; h: number }> = [
  { label: '4K (3840×2160)',     w: 3840, h: 2160 },
  { label: '1440p (2560×1440)',  w: 2560, h: 1440 },
  { label: '1080p (1920×1080)',  w: 1920, h: 1080 },
  { label: '720p (1280×720)',    w: 1280, h: 720 },
  { label: '480p (854×480)',     w: 854,  h: 480 },
];

const RESOLUTION_PRESETS_9_16: Array<{ label: string; w: number; h: number }> = [
  { label: '4K (2160×3840)',     w: 2160, h: 3840 },
  { label: '1440p (1440×2560)',  w: 1440, h: 2560 },
  { label: '1080p (1080×1920)',  w: 1080, h: 1920 },
  { label: '720p (720×1280)',    w: 720,  h: 1280 },
  { label: '480p (480×854)',     w: 480,  h: 854 },
];

const FPS_PRESETS = [24, 30, 60];

const BITRATE_PRESETS = [
  { label: 'Lossless (50 Mbps)',   value: '50M' },
  { label: 'Maximum (30 Mbps)',    value: '30M' },
  { label: 'High (20 Mbps)',       value: '20M' },
  { label: 'Standard (15 Mbps)',   value: '15M' },
  { label: 'Compressed (10 Mbps)', value: '10M' },
];

export function defaultExportSettings(format: 'youtube' | 'tiktok'): ExportSettings {
  if (format === 'tiktok') {
    return { width: 1080, height: 1920, fps: 30, bitrate: '30M', qualityMode: 'fast' };
  }
  return { width: 1920, height: 1080, fps: 30, bitrate: '30M', qualityMode: 'fast' };
}

export function ExportSettingsDialog({
  format, settings, onChange, onCancel, onConfirm,
}: {
  format: 'youtube' | 'tiktok';
  settings: ExportSettings;
  onChange: (s: ExportSettings) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const fourKFeature = useFeature('export_4k');
  const highBitrateFeature = useFeature('export_high_bitrate');
  const qualityFeature = useFeature('quality_render_mode');
  const openUpgrade = useUpgradeModal((s) => s.open);

  const presets = format === 'tiktok' ? RESOLUTION_PRESETS_9_16 : RESOLUTION_PRESETS_16_9;
  const matchingPreset = presets.find((p) => p.w === settings.width && p.h === settings.height);
  const matchingBitrate = BITRATE_PRESETS.find((b) => b.value === settings.bitrate);

  // Lock: 4K (egal welche Aspect-Ratio) erfordert Pro
  const isResolutionLocked = (w: number, h: number) =>
    Math.max(w, h) >= 3840 && !fourKFeature.unlocked;
  const isBitrateLocked = (val: string) =>
    (val === '50M' || val === '30M') && !highBitrateFeature.unlocked;
  const isQualityModeLocked = (mode: 'fast' | 'quality') =>
    mode === 'quality' && !qualityFeature.unlocked;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
         onClick={onCancel}>
      <div className="glass w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{t('exportDialog.title')}</h2>
          <button onClick={onCancel} className="w-7 h-7 rounded-md text-zinc-400 hover:bg-white/[0.06] flex items-center justify-center transition">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10 M13 3L3 13"/></svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* Resolution */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('exportDialog.resolution')}</div>
            <select
              value={matchingPreset ? `${matchingPreset.w}x${matchingPreset.h}` : 'custom'}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                if (!w || !h) return;
                if (isResolutionLocked(w, h)) {
                  openUpgrade('export_4k');
                  return;
                }
                onChange({ ...settings, width: w, height: h });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
            >
              {presets.map((p) => {
                const locked = isResolutionLocked(p.w, p.h);
                return (
                  <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                    {locked ? `${p.label} 🔒` : p.label}
                  </option>
                );
              })}
            </select>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <input
                type="number"
                value={settings.width}
                onChange={(e) => onChange({ ...settings, width: parseInt(e.target.value) || 0 })}
                placeholder={t('exportDialog.width')}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
              />
              <input
                type="number"
                value={settings.height}
                onChange={(e) => onChange({ ...settings, height: parseInt(e.target.value) || 0 })}
                placeholder={t('exportDialog.height')}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fiano-red/40"
              />
            </div>
          </div>

          {/* FPS */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('exportDialog.frameRate')}</div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
              {FPS_PRESETS.map((fps) => (
                <button
                  key={fps}
                  onClick={() => onChange({ ...settings, fps })}
                  className={clsx(
                    'text-[11px] py-1.5 rounded-md font-medium transition',
                    settings.fps === fps ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {fps} fps
                </button>
              ))}
            </div>
          </div>

          {/* Bitrate */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('exportDialog.bitrate')}</div>
            <select
              value={matchingBitrate ? matchingBitrate.value : 'custom'}
              onChange={(e) => {
                if (isBitrateLocked(e.target.value)) {
                  openUpgrade('export_high_bitrate');
                  return;
                }
                onChange({ ...settings, bitrate: e.target.value });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 focus:outline-none focus:border-fiano-red/40"
            >
              {BITRATE_PRESETS.map((b) => {
                const locked = isBitrateLocked(b.value);
                return (
                  <option key={b.value} value={b.value}>
                    {locked ? `${b.label} 🔒` : b.label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Encoder */}
          <div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500 mb-1.5">{t('exportDialog.encoder')}</div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-lg">
              {(['fast', 'quality'] as const).map((mode) => {
                const active = settings.qualityMode === mode;
                const locked = isQualityModeLocked(mode);
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      if (locked) { openUpgrade('quality_render_mode'); return; }
                      onChange({ ...settings, qualityMode: mode });
                    }}
                    className={clsx(
                      'text-[11px] py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1',
                      active ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    {mode === 'fast' ? t('exportDialog.encoderHardware') : t('exportDialog.encoderSoftware')}
                    {locked && <span className="text-[9px]">🔒</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-zinc-300 text-[12px] font-medium py-2.5 rounded-lg transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-[2] bg-fiano-red hover:brightness-110 text-white text-[12px] font-semibold py-2.5 rounded-lg transition shadow-[0_0_18px_rgba(255,16,57,0.35)]"
          >
            {t('exportDialog.startExport')}
          </button>
        </div>
      </div>
    </div>
  );
}

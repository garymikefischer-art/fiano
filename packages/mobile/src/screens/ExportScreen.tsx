/**
 * Export-Screen — startet FFmpeg-Export, zeigt Progress, Save-to-Camera-Roll.
 *
 * Visual: Glass-Card, BackgroundGlow, phasen-spezifische Status-Icons + Texte.
 * Strings via t() (Fallback EN). Logik unverändert: ensureLocalCopy → exportMobile →
 * saveToCameraRoll, mit Cancel-Knopf während des Renders.
 *
 * Phase 9.4.16: bei "done" wird eine lokale Notification gefeuert, damit der User
 * auch mit App im Hintergrund informiert wird.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar as RNStatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { ensureLocalCopy, saveToCameraRoll } from '../lib/mediaPicker';
import { runRenderJob } from '../lib/renderJob';
// Phase A6.4 (2026-05-18): buildTikTokExportArgs nicht mehr im Mobile-flow
// genutzt — Worker baut args[] selber via shared/ffmpegArgs.ts (verhindert
// FFmpeg-Argument-Injection). Mobile bleibt buildAssSubtitle für lokales
// .ass-Bauen + Upload.
import { buildAssSubtitle } from '@fiano/shared/assBuilder';
import type { ClientRenderSpec } from '../lib/renderJob';
import { useAppStore } from '../stores/appStore';
import { useProject } from '../stores/projectsStore';
import { DEFAULT_SPLIT_RATIO, hasActiveEffects } from '../data/demoProjects';
import { BrandButton } from '../components/BrandButton';
import { ProgressBar } from '../components/ProgressBar';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { useJobStore } from '../stores/jobStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useProjectsStore, flushProjectsNow } from '../stores/projectsStore';
import { scheduleLocalNotification } from '../lib/pushNotifications';
import { useT } from '../lib/i18n';
import * as sounds from '../lib/sounds';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Export'>;
type R = RouteProp<RootStackParamList, 'Export'>;

type Phase = 'idle' | 'uploading' | 'rendering' | 'saving' | 'done' | 'failed' | 'canceled';

/** Chunked-Cue mit clipIndex-Pass-through (Phase B6.1, 2026-05-18). */
interface ChunkedCue {
  startSec: number;
  endSec: number;
  text: string;
  /** Von der ursprünglichen Cue durchgereicht — identifiziert die source bei
   *  Multi-Source-Projekten. undefined = single-source / legacy. */
  clipIndex?: number;
}

/**
 * Splittet eine Cue in N-Wort-Chunks. Phase Builder-4: wenn cue.words mit
 * Word-level-Timestamps (Whisper) vorhanden ist, nutze ECHTE per-word-Zeiten.
 * Sonst fallback auf proportionale Aufteilung des cue-Ranges.
 *
 * Phase B6.1 (2026-05-18): Pass-through von clipIndex damit Multi-Source-
 * Subs nach Chunking weiterhin der richtigen Source zugeordnet werden können.
 */
function chunkCueByWords(
  cue: {
    startSec: number;
    endSec: number;
    text: string;
    words?: { text: string; startSec: number; endSec: number }[];
    clipIndex?: number;
  },
  maxWords: number,
): ChunkedCue[] {
  // Word-level path: nutze echte Whisper-Timestamps.
  if (cue.words && cue.words.length > 0) {
    if (cue.words.length <= maxWords) {
      // Cue ist klein genug → behalte als ein chunk mit ursprünglichem Text.
      return [{ startSec: cue.startSec, endSec: cue.endSec, text: cue.text, clipIndex: cue.clipIndex }];
    }
    const out: ChunkedCue[] = [];
    for (let i = 0; i < cue.words.length; i += maxWords) {
      const chunkWords = cue.words.slice(i, i + maxWords);
      out.push({
        startSec: chunkWords[0].startSec,
        endSec: chunkWords[chunkWords.length - 1].endSec,
        text: chunkWords.map((w) => w.text).join(' '),
        clipIndex: cue.clipIndex,
      });
    }
    return out;
  }
  // Fallback: proportionale Aufteilung (für alte Projekte ohne word-timestamps).
  const words = cue.text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return [{ startSec: cue.startSec, endSec: cue.endSec, text: cue.text, clipIndex: cue.clipIndex }];
  }
  const totalDur = Math.max(0.1, cue.endSec - cue.startSec);
  const out: ChunkedCue[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const chunkWords = words.slice(i, i + maxWords);
    const fracStart = i / words.length;
    const fracEnd = Math.min(1, (i + chunkWords.length) / words.length);
    out.push({
      startSec: cue.startSec + fracStart * totalDur,
      endSec: cue.startSec + fracEnd * totalDur,
      text: chunkWords.join(' '),
      clipIndex: cue.clipIndex,
    });
  }
  return out;
}

export function ExportScreen() {
  const colors = useColors();
  const nav = useNavigation<Nav>();
  const t = useT();
  const { params } = useRoute<R>();
  const setCurrent = useJobStore((s) => s.setCurrent);
  const setPercent = useJobStore((s) => s.setPercent);
  const job = useJobStore((s) => s.current);
  const addNotification = useNotificationsStore((s) => s.add);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const project = useProject(params.projectId);
  const defaultFacecam = useAppStore((s) => s.facecamRegion);
  const defaultGameplay = useAppStore((s) => s.gameplayRegion);
  const storeExportSettings = useAppStore((s) => s.exportSettings);
  // Wenn ExportSettingsModal Per-Export-Override mitgibt → nutze die.
  const exportSettings = params.exportSettings ?? storeExportSettings;

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // Phase A6.3 (2026-05-18): Plan-Limit-Info wenn Worker 402 zurückgibt.
  const [planLimit, setPlanLimit] = useState<{
    reason: string;
    plan: string | null;
    renderCount?: number;
    monthlyLimit?: number;
    requestedResolution?: string;
  } | null>(null);
  const [savedAssetUri, setSavedAssetUri] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, []);

  const run = async () => {
    setPhase('uploading');
    setError(null);
    setPercent(0);
    const isBuilder = params.mode === 'builder';
    // Phase A3.4 (2026-05-17): Multi-Clip-9:16-Export — `mode='tiktok'` mit
    // einem builderItemPlan. Nutzt denselben Multi-Source-Pfad wie Builder,
    // aber behält den 9:16-Layout (project.tiktokLayout statt 'full').
    const isMultiTiktok =
      !isBuilder &&
      params.mode === 'tiktok' &&
      (params.builderItemPlan?.length ?? 0) > 0;
    const hasItemPlan = isBuilder || isMultiTiktok;
    const outputName = `fiano-${isBuilder ? '16x9' : isMultiTiktok ? '9x16-multi' : Date.now()}-${Date.now()}.mp4`;
    setCurrent({ id: outputName, step: 'export', percent: 0, outputPath: outputName });

    try {
      // 1. Lokale Source sicherstellen (file://-URI nicht asset://).
      // Builder-Mode (Phase Builder-3 unified): wenn builderItemPlan vorhanden,
      // dedupliziere sourceUris[] und baue clips[] mit src-indices. Ein clip
      // pro item-plan-entry. Funktioniert für single-source, multi-source und
      // gemischte (highlights + extras).
      // A3.4: Multi-Tiktok nutzt gleichen Pfad.
      const itemPlan = (hasItemPlan ? params.builderItemPlan : undefined) ?? [];
      const localSrc = await ensureLocalCopy(params.sourceUri);
      // Dedupe URIs in order of first occurrence.
      const uniqueSrcMap = new Map<string, number>();
      for (const item of itemPlan) {
        if (!uniqueSrcMap.has(item.sourceUri)) {
          uniqueSrcMap.set(item.sourceUri, uniqueSrcMap.size);
        }
      }
      const builderUniqueSourceUris = Array.from(uniqueSrcMap.keys());
      const localSrcUris: string[] = builderUniqueSourceUris.length > 0
        ? await Promise.all(builderUniqueSourceUris.map((u) => ensureLocalCopy(u)))
        : [];
      const isMultiSourceBuilder = builderUniqueSourceUris.length >= 2;
      // A3.4: Multi-Tiktok zählt auch als "Multi-Source"-Pipeline. Variable-
      // Name behalten für minimal-diff, aber Semantik = "hat itemPlan mit
      // ≥ 1 unique source", was bei Multi-Tiktok zutrifft.
      const hasMultiSourcePipeline = hasItemPlan && itemPlan.length > 0;

      // 2. Layout + Regions + Subtitle vom Project ableiten.
      //    Builder-Mode: layout=full (16:9 Cover-Crop) ohne facecam/gameplay-split.
      //    Multi-Tiktok: behält project.tiktokLayout (stacked/full/split), 9:16.
      const layout = isBuilder ? 'full' : (project?.tiktokLayout ?? 'stacked');
      const facecamRegion = project?.facecamRegion ?? defaultFacecam ?? { x: 0.06, y: 0.06, w: 0.28, h: 0.32 };
      const gameplayRegion = project?.gameplayRegion ?? defaultGameplay;
      const splitRatio = project?.splitRatio ?? DEFAULT_SPLIT_RATIO;

      // 2b. Builder-Mode: clips[] mit src-Indices aus itemPlan bauen.
      //     Für extras mit trimEnd=-1 (unbekannte duration): wir können nicht
      //     trimmen. Fallback: trimEnd auf eine große Zahl setzen (Server trimmt
      //     bis source-end; ffmpeg trim mit end > duration = source-end).
      // Phase B6.3 (2026-05-18): Wenn trimEnd <= 0 (legacy multi-clip-import
      // ohne Source-Duration), nutze project.perClipDurations[srcIdx] als
      // echte Source-Duration statt BIG_TRIM_END. Subtitle-Mapping nutzt
      // sonst 99999 als outOffset für clip 1 → clip-2 cues landen weit
      // außerhalb des output-Videos (User-Report 2026-05-18).
      const BIG_TRIM_END = 99999;
      const projectSourceUris = project?.sourceUris ?? [];
      const perClipDurations = project?.perClipDurations ?? [];
      const builderClips: { src: number; startSec: number; endSec: number }[] = itemPlan
        .map((item) => {
          const srcIdx = uniqueSrcMap.get(item.sourceUri);
          if (srcIdx === undefined) return null;
          let end: number;
          if (item.trimEnd > 0) {
            end = item.trimEnd;
          } else {
            const projectIdx = projectSourceUris.indexOf(item.sourceUri);
            const realDur =
              projectIdx >= 0 ? (perClipDurations[projectIdx] ?? 0) : 0;
            end = realDur > 0 ? realDur : BIG_TRIM_END;
          }
          return {
            src: srcIdx,
            startSec: Math.max(0, item.trimStart),
            endSec: Math.max(item.trimStart + 0.1, end),
          };
        })
        .filter((c): c is { src: number; startSec: number; endSec: number } => c !== null);

      // 3. Subtitle-Burn-In (Phase 9.6.7a + 9.6.7g + 9.6.7h):
      //    - Wenn enabled UND cues vorhanden → libass via .ass-Datei.
      //    - chunking nach maxWordsPerChunk passiert vor dem ass-Build.
      //    - **Cues sind absolute Source-Times** (Whisper liefert sie so).
      //      Beim Trim/Clip-Wechsel müssen wir sie auf die Output-Timeline
      //      umrechnen, sonst zeigt das exportierte Video die Cues vom
      //      Source-Anfang statt vom getrimmten Bereich.
      const subSettings = project?.subtitles;
      const rawCues = subSettings?.cues ?? [];
      const maxWords = subSettings?.maxWordsPerChunk ?? 0;
      const chunkedRaw =
        maxWords > 0 && maxWords < 99
          ? rawCues.flatMap((c) => chunkCueByWords(c, maxWords))
          : rawCues;
      // Cue-Zeiten auf Output-Timeline mappen.
      //  9:16 / Manual: trimStart..trimEnd → 0..(trimEnd-trimStart). Shift -trimStart,
      //                 cues mit partial-overlap werden geclipped statt verworfen.
      //  Builder Multi-Clip (single-source): cue gehört zu Clip k wenn er
      //                  in [k.startSec, k.endSec] überlappt; output-Start
      //                  = Σ vorheriger dur + (cue.start - clip.start).
      //  Builder Multi-Source ohne Trim: cues disabled (kein 1:1 mapping).
      //
      // Defensive: trimStart/trimEnd default 0 / sourceDuration; NaN-Schutz.
      const ts = Number.isFinite(params.trimStart) ? params.trimStart : 0;
      const te = Number.isFinite(params.trimEnd)
        ? params.trimEnd
        : params.sourceDuration ?? ts + 60;
      const clipDur = Math.max(0.1, te - ts);

      // Phase B6.1 (2026-05-18): Multi-Source-aware cue mapping.
      //
      // Multi-Source-Projects haben cues mit `clipIndex` (gesetzt durch
      // transcribeMultiSource) — der Index in `project.sourceUris[]`. Cue-
      // Times sind GLOBAL (offset durch Summe der vorherigen Source-Durations).
      //
      // Mapping-Algorithmus:
      //   1. Cue's source bestimmen: cue.clipIndex → project.sourceUris[ci]
      //   2. Cue's source-local-time = cue.startSec - sourceOffset (Summe der
      //      perClipDurations[0..clipIndex-1])
      //   3. Cue's source-idx in unique-Map: uniqueSrcMap.get(sourceUri)
      //   4. Iterate selected clips, match nur clips mit src=cueSrcIdx.
      //   5. Bei overlap → return output-time.
      //
      // Single-Source-Fallback: clipIndex undefined → assume primary source,
      // sourceOffset=0, match against clips with src=primarySrcIdx.
      const primarySourceUri =
        project?.sourceUri ??
        project?.sourceUris?.[0] ??
        '';
      const primarySrcIdx = primarySourceUri ? uniqueSrcMap.get(primarySourceUri) : undefined;
      const sourceOffsetForClipIdx = (ci: number): number => {
        let off = 0;
        for (let i = 0; i < ci && i < perClipDurations.length; i++) {
          off += perClipDurations[i] ?? 0;
        }
        return off;
      };

      const mapCueToOutput = (
        c: ChunkedCue,
      ): { startSec: number; endSec: number; text: string } | null => {
        if (hasItemPlan && builderClips.length > 0) {
          // Cue's source ableiten.
          const ci = c.clipIndex;
          const cueSourceUri =
            ci !== undefined && projectSourceUris[ci] !== undefined
              ? projectSourceUris[ci]
              : primarySourceUri;
          const cueSrcIdx = cueSourceUri ? uniqueSrcMap.get(cueSourceUri) : undefined;
          if (cueSrcIdx === undefined) return null;
          // Cue auf source-local time bringen (Multi-Source: globale Time
          // minus Source-Offset). Single-source: clipIndex undef → offset 0.
          // Defensive fallback (B6.2): wenn offset cue's time negative macht,
          // dann ohne offset retry (cue ist scheinbar source-local).
          const sourceOffset = ci !== undefined ? sourceOffsetForClipIdx(ci) : 0;
          let cueLocalStart = c.startSec - sourceOffset;
          let cueLocalEnd = c.endSec - sourceOffset;
          if (cueLocalStart < 0 && c.startSec >= 0) {
            cueLocalStart = c.startSec;
            cueLocalEnd = c.endSec;
          }
          let outOffset = 0;
          for (const clip of builderClips) {
            const dur = Math.max(0, clip.endSec - clip.startSec);
            if (clip.src !== cueSrcIdx) {
              outOffset += dur;
              continue;
            }
            const overlapStart = Math.max(cueLocalStart, clip.startSec);
            const overlapEnd = Math.min(cueLocalEnd, clip.endSec);
            if (overlapEnd > overlapStart + 0.04) {
              return {
                startSec: outOffset + Math.max(0, overlapStart - clip.startSec),
                endSec: outOffset + Math.min(dur, overlapEnd - clip.startSec),
                text: c.text,
              };
            }
            outOffset += dur;
          }
          return null;
        }
        // 9:16 / Manual: shift + clamp statt strikt zu filtern.
        const startOut = Math.max(0, c.startSec - ts);
        const endOut = Math.min(clipDur, c.endSec - ts);
        if (endOut <= 0 || startOut >= clipDur) return null;
        return {
          startSec: Number.isFinite(startOut) ? startOut : 0,
          endSec: Number.isFinite(endOut) ? Math.max(startOut + 0.04, endOut) : startOut + 0.04,
          text: c.text,
        };
      };
      // Note: primarySrcIdx Referenz vom Logging unten genutzt (war vorher
      // direkt in der Mapping-Funktion).
      void primarySrcIdx;
      const chunkedCues = chunkedRaw
        .map(mapCueToOutput)
        .filter((c): c is { startSec: number; endSec: number; text: string } => c !== null);
      // Diagnose-Log: wenn raw cues vorhanden waren aber nach mapping leer →
      // hilft beim Debuggen falls subs unsichtbar bleiben.
      if (chunkedRaw.length > 0 && chunkedCues.length === 0) {
        console.warn(
          `[Export] ${chunkedRaw.length} cues filtered out — none overlap with trim/clip range. ts=${ts} te=${te} mode=${isBuilder ? 'builder' : 'tiktok'} isMultiSrc=${isMultiSourceBuilder}`,
        );
      }
      const subEnabled = subSettings?.enabled === true && chunkedCues.length > 0;
      // Default: libass via .ass-File. drawtext-fallback nur für legacy/no-cues.
      const useAss = subEnabled;
      const fontColor = subSettings?.useGradient
        ? subSettings.gradientFrom ?? subSettings.textColor ?? '#ffffff'
        : subSettings?.textColor ?? '#ffffff';
      // Phase A6.4: subtitle in spec eingebaut (siehe unten), kein subtitleArg
      // mehr für args-build. fontColor wird für drawtext-fallback genutzt.

      // 4. Add-Ons: Music + Voice-Overs + Intro vom Project ablesen.
      const musicTracks = project?.musicTracks ?? [];
      const intro = project?.intro;
      const voiceOvers = project?.voiceOvers ?? [];

      // 5. ExportSettings → Width/Height/FPS/Bitrate aus appStore.
      //    Builder = 16:9 landscape, TikTok = 9:16 portrait.
      const [w, h] = (() => {
        switch (exportSettings.resolution) {
          case '720p':  return isBuilder ? [1280, 720]  : [720, 1280];
          case '1080p': return isBuilder ? [1920, 1080] : [1080, 1920];
          case '4k':    return isBuilder ? [3840, 2160] : [2160, 3840];
          default:      return isBuilder ? [1920, 1080] : [1080, 1920];
        }
      })();

      // 5b. ASS-Subtitle (Phase 9.6.7h): jetzt mit echten W/H bauen. PlayResX/Y
      //     in der .ass-Datei = Output-Resolution, libass scaliert die Schrift-
      //     Größen entsprechend.
      const assContent = useAss
        ? buildAssSubtitle({
            settings: subSettings!,
            cues: chunkedCues,
            width: w,
            height: h,
          })
        : undefined;

      // 6. Phase A6.4 (2026-05-18): typed RenderSpec statt args[].
      //    Worker validiert + baut args[] selber → keine Command-Injection
      //    mehr möglich. Mobile-side wird buildTikTokExportArgs nicht mehr
      //    aufgerufen für /v1/render. Pre-Build wäre nur für lokale Preview
      //    oder local-FFmpeg-Tests sinnvoll.
      const spec: ClientRenderSpec = {
        width: w,
        height: h,
        fps: exportSettings.fps,
        bitrate: exportSettings.bitrate,
        encoder: 'software',
        layout,
        facecamRegion: { x: facecamRegion.x, y: facecamRegion.y, w: facecamRegion.w, h: facecamRegion.h },
        gameplayRegion: { x: gameplayRegion.x, y: gameplayRegion.y, w: gameplayRegion.w, h: gameplayRegion.h },
        splitRatio,
        fullOffsetX: project?.fullOffsetX,
        trimStart: params.trimStart,
        trimEnd: params.trimEnd,
        subtitle: subEnabled
          ? {
              useAss,
              text: '',
              cues: useAss
                ? undefined
                : chunkedCues.map((c) => ({
                    startSec: c.startSec,
                    endSec: c.endSec,
                    text: subSettings!.uppercase ? c.text.toUpperCase() : c.text,
                  })),
              fontSize: useAss ? undefined : subSettings!.fontSize ?? 64,
              color: useAss ? undefined : fontColor,
              strokeColor: useAss ? undefined : subSettings!.strokeColor ?? '#000000',
              strokeWidth: useAss
                ? undefined
                : subSettings!.strokeEnabled === true
                  ? subSettings!.strokeWidth ?? 4
                  : 0,
              position: useAss
                ? undefined
                : (subSettings!.position as 'top' | 'center' | 'bottom' | undefined),
              uppercase: false,
            }
          : undefined,
        music: musicTracks.map((m) => ({ volume: m.volume })),
        voiceOvers: voiceOvers.map((vo) => ({
          startSec: vo.startSec,
          volume: vo.volume,
        })),
        intro: intro
          ? {
              mode: intro.mode ?? 'before',
              scale: intro.scale,
              x: intro.x,
              y: intro.y,
              durationSec: intro.durationSec,
            }
          : undefined,
        clips: builderClips.length > 0 ? builderClips : undefined,
        // Phase C1.B (2026-05-19): Project-level Color-Grade Effects. Falls
        // hasActiveEffects → an Worker schicken, sonst weglassen (kein Filter
        // wird im FFmpeg-Graph generiert). Per-Clip-Override (clip.effects)
        // wird in einem späteren Phase implementiert.
        effects: hasActiveEffects(project?.effectsAll) ? project!.effectsAll : undefined,
      };

      // 7. Cloud-Render: Multi-Input Upload → Render → Download.
      const result = await runRenderJob({
        inputs: {
          // A3.4: bei Multi-Tiktok auch sourceUris[] schicken (wie Builder).
          sourceUri: hasMultiSourcePipeline && localSrcUris.length > 0 ? undefined : localSrc,
          sourceUris: hasMultiSourcePipeline && localSrcUris.length > 0 ? localSrcUris : undefined,
          introUri: intro?.path,
          musicUris: musicTracks.map((m) => m.path),
          voiceOverUris: voiceOvers.map((vo) => vo.path),
          assContent,
        },
        spec,
        projectId: params.projectId ?? 'no-project',
        outputName,
        onUploadProgress: (frac) => {
          setPercent(frac * 30);
          if (frac >= 1) setPhase('rendering');
        },
      });

      // 4. Render-Done — Progress 30→90 wurde während Server-Render gehalten.
      setPercent(90);
      setPhase('saving');

      // 5. Save zu Camera-Roll
      const assetUri = await saveToCameraRoll(result.localUri);
      setSavedAssetUri(assetUri);
      setPercent(100);
      setPhase('done');
      sounds.exportDone();

      // Projekt-Status: ready. clips NICHT überschreiben — vorher wurde hier
      // ein "Imported clip"-Dummy gesetzt, der AI-Highlights nach Export
      // wegnahm (User-Report 2026-05-12). Wenn das Projekt noch keine clips
      // hatte (klassischer Import ohne Whisper-Analyse), legen wir EINEN
      // Default-Clip an, sonst lassen wir bestehende Highlights stehen.
      if (params.projectId) {
        const existing = project?.clips ?? [];
        const updates: Partial<NonNullable<typeof project>> = { status: 'ready' };
        if (existing.length === 0) {
          updates.clips = [
            {
              id: 'c1',
              startSec: 0,
              endSec: params.trimEnd - params.trimStart,
              label: 'Imported clip',
              score: 0.9,
            },
          ];
        }
        updateProject(params.projectId, updates);
        // Phase 9.6.7g: flush damit App-Kill den state nicht killt.
        await flushProjectsNow().catch(() => {});
      }

      const doneBody = isBuilder
        ? t('export.notifBodyBuilder', '16:9 video saved to your camera roll.')
        : t('export.notifBody', '9:16 clip saved to your camera roll.');
      addNotification({
        icon: 'cloud-done-outline',
        iconColor: '#22c55e',
        iconBg: 'rgba(34,197,94,0.15)',
        title: t('export.notifTitle', 'Export complete'),
        body: doneBody,
        time: t('common.justNow', 'Just now'),
      });
      void scheduleLocalNotification({
        title: t('export.notifTitle', 'Export complete'),
        body: doneBody,
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg === 'aborted') {
        setPhase('canceled');
        if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: 'Canceled' });
      } else if (err?.isPlanLimit) {
        // Phase A6.3 (2026-05-18): Server-side Plan-Limit (Worker 402).
        // UI zeigt spezifische Plan-Hinweise + Upgrade-Button statt
        // generischen Error.
        setPlanLimit(err.planLimit);
        setError(msg);
        setPhase('failed');
        sounds.error();
        if (params.projectId)
          updateProject(params.projectId, {
            status: 'failed',
            errorMessage: `Plan-Limit: ${err.planLimit.reason}`,
          });
      } else {
        setError(msg);
        setPhase('failed');
        sounds.error();
        if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: msg });
      }
    } finally {
      setCurrent(null);
    }
  };

  const onCancel = () => {
    // Cloud-Render auf Server kann mobile-seitig nicht cancelled werden — der Worker
    // läuft seinen ffmpeg-Job zu Ende. Wir setzen mobile-seitig 'canceled' damit User
    // raus aus dem Screen kann. Server-side cleanup nach MAX_DURATION_SEC.
    setPhase('canceled');
    if (params.projectId) updateProject(params.projectId, { status: 'failed', errorMessage: 'Canceled by user' });
  };

  const meta = phaseMeta(phase, t, params.mode === 'builder', colors);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.bg.elevated,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close" size={18} color="#f1f2f2" />
        </Pressable>
        <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
          {t('export.title', 'Export')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        {/* Status-Card */}
        <View
          style={{
            backgroundColor: colors.bg.elevated,
            borderWidth: 1,
            borderColor: colors.border.subtle,
            borderRadius: 22,
            padding: 22,
            gap: 16,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              backgroundColor: meta.iconBg,
              borderWidth: 1,
              borderColor: meta.ringColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={meta.icon} size={34} color={meta.iconColor} />
          </View>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 }}>
              {meta.title}
            </Text>
            {meta.subtitle && (
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 12,
                  textAlign: 'center',
                  lineHeight: 17,
                  maxWidth: 280,
                }}
              >
                {meta.subtitle}
              </Text>
            )}
          </View>

          {(phase === 'uploading' || phase === 'rendering' || phase === 'saving') && (
            <View style={{ width: '100%', gap: 8 }}>
              <ProgressBar percent={job?.percent ?? 0} />
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 12,
                  textAlign: 'center',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {Math.round(job?.percent ?? 0)} %
              </Text>
            </View>
          )}
        </View>

        {/* Failure-Detail */}
        {phase === 'failed' && planLimit && (
          <View
            style={{
              backgroundColor: 'rgba(255,16,57,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.35)',
              borderRadius: 14,
              padding: 16,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="lock-closed" size={16} color="#ff1039" />
              <Text style={{ color: '#ff1039', fontSize: 13, fontWeight: '700' }}>
                {t('export.planLimitTitle', 'Plan limit reached')}
              </Text>
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 13, lineHeight: 19 }}>
              {planLimit.reason === 'subscription_required'
                ? t(
                    'export.planLimitSubscription',
                    'Cloud Render requires an active subscription. Subscribe to Creator, Pro or Studio Lifetime to start exporting.',
                  )
                : planLimit.reason === 'resolution_locked'
                  ? t(
                      'export.planLimitResolution',
                      '4K export requires Pro plan or higher. Choose 1080p or upgrade your plan.',
                    )
                  : planLimit.reason === 'monthly_limit_exceeded'
                    ? t(
                        'export.planLimitMonthly',
                        'You\'ve used {n}/{m} renders this month on the {plan} plan. Upgrade for more renders.',
                      )
                        .replace('{n}', String(planLimit.renderCount ?? '?'))
                        .replace('{m}', String(planLimit.monthlyLimit ?? '?'))
                        .replace('{plan}', planLimit.plan ?? 'inactive')
                    : t('export.planLimitGeneric', 'Render blocked by plan limit.')}
            </Text>
          </View>
        )}
        {phase === 'failed' && !planLimit && (
          <View
            style={{
              backgroundColor: 'rgba(255,16,57,0.06)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.22)',
              borderRadius: 14,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: '#ff5571', fontSize: 12, fontWeight: '700' }}>
              {t('export.errorDetail', 'Error detail')}
            </Text>
            <Text style={{ color: colors.text.primary, fontSize: 12, lineHeight: 18 }}>{error}</Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
              {t(
                'export.phaseNote',
                'Check ob EXPO_PUBLIC_RENDER_WORKER_URL gesetzt ist und der /health-Endpoint antwortet (siehe services/render-worker/README.md).',
              )}
            </Text>
          </View>
        )}

        {/* Action-Row */}
        <View style={{ gap: 10, marginTop: 'auto' }}>
          {(phase === 'uploading' || phase === 'rendering' || phase === 'saving') && (
            <BrandButton
              title={t('common.cancel', 'Cancel')}
              variant="secondary"
              onPress={onCancel}
              icon={<Ionicons name="stop-circle-outline" size={16} color="#f1f2f2" />}
            />
          )}

          {phase === 'done' && (
            <BrandButton
              title={t('export.backToHome', 'Back to home')}
              onPress={() => nav.popToTop()}
              icon={<Ionicons name="home-outline" size={16} color="#fff" />}
            />
          )}

          {phase === 'canceled' && (
            <BrandButton
              title={t('common.back', 'Back')}
              variant="secondary"
              onPress={() => nav.goBack()}
              icon={<Ionicons name="arrow-back" size={16} color={colors.text.primary} />}
            />
          )}

          {phase === 'failed' && planLimit && (
            <BrandButton
              title={t('export.upgradeBtn', 'Upgrade plan')}
              onPress={() => nav.navigate('Pricing' as never)}
              icon={<Ionicons name="rocket" size={16} color="#fff" />}
            />
          )}

          {phase === 'failed' && (
            <BrandButton
              title={t('common.back', 'Back')}
              variant="secondary"
              onPress={() => nav.goBack()}
              icon={<Ionicons name="arrow-back" size={16} color={colors.text.primary} />}
            />
          )}
        </View>

        {savedAssetUri && (
          <Text
            numberOfLines={1}
            style={{ color: colors.text.muted, fontSize: 10, textAlign: 'center' }}
          >
            {savedAssetUri}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function phaseMeta(
  phase: Phase,
  t: (k: string, f?: string) => string,
  isBuilder: boolean,
  colors: ReturnType<typeof useColors>,
): {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  ringColor: string;
  title: string;
  subtitle?: string;
} {
  switch (phase) {
    case 'uploading':
      return {
        icon: 'cloud-upload-outline',
        iconColor: '#60a5fa',
        iconBg: 'rgba(96,165,250,0.15)',
        ringColor: 'rgba(96,165,250,0.32)',
        title: t('export.phaseUploading', 'Lade Source zur Cloud…'),
        subtitle: t('export.phaseUploadingSub', 'Source-Video wird zum Render-Worker geschickt.'),
      };
    case 'rendering':
      return {
        icon: 'sync',
        iconColor: '#ff1039',
        iconBg: 'rgba(255,16,57,0.12)',
        ringColor: 'rgba(255,16,57,0.32)',
        title: isBuilder
          ? t('export.phaseRendering16x9', 'Rendere 16:9 in der Cloud…')
          : t('export.phaseRendering', 'Rendere 9:16 in der Cloud…'),
        subtitle: t('export.phaseRenderingSub', 'FFmpeg läuft auf dem Render-Worker. Dauert ~30s pro Minute Clip.'),
      };
    case 'saving':
      return {
        icon: 'save-outline',
        iconColor: '#60a5fa',
        iconBg: 'rgba(96,165,250,0.15)',
        ringColor: 'rgba(96,165,250,0.32)',
        title: t('export.phaseSaving', 'Saving to gallery…'),
      };
    case 'done':
      return {
        icon: 'checkmark-circle',
        iconColor: '#22c55e',
        iconBg: 'rgba(34,197,94,0.15)',
        ringColor: 'rgba(34,197,94,0.32)',
        title: t('export.phaseDone', 'Done'),
        subtitle: t('export.phaseDoneSub', 'Clip saved to your camera roll.'),
      };
    case 'canceled':
      return {
        icon: 'close-circle-outline',
        iconColor: '#a1a1aa',
        iconBg: colors.bg.elevated,
        ringColor: colors.border.strong,
        title: t('export.phaseCanceled', 'Canceled'),
      };
    case 'failed':
      return {
        icon: 'alert-circle-outline',
        iconColor: '#ff5571',
        iconBg: 'rgba(255,16,57,0.12)',
        ringColor: 'rgba(255,16,57,0.32)',
        title: t('export.phaseFailed', 'Export failed'),
      };
    default:
      return {
        icon: 'ellipse-outline',
        iconColor: '#a1a1aa',
        iconBg: colors.bg.elevated,
        ringColor: colors.border.strong,
        title: t('export.phaseIdle', 'Ready'),
      };
  }
}

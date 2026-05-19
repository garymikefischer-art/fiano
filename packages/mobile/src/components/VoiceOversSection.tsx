/**
 * VoiceOversSection — Liste + Verwaltung der TTS-Voice-Overs eines Projekts.
 *
 * Analog Desktop's VoiceOversSection in renderer/components/sections/. Zeigt:
 *   - Header mit "+ New" Button (öffnet TtsModal)
 *   - Empty-State falls keine VOs
 *   - Pro VO eine Card mit: 🎙 Text-Snippet + Voice + StartSec + Volume +
 *     Edit/Delete-Icons
 *   - Sliders für startSec (0..maxSec) und volume (0..1.5)
 */

import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { appAlert } from './AppAlert';
import { Ionicons } from '@expo/vector-icons';
import { TtsModal } from './TtsModal';
import { SimpleSlider } from './SimpleSlider';
import { useProjectsStore } from '../stores/projectsStore';
import type { DemoProject, ProjectVoiceOver } from '../data/demoProjects';
import { haptic } from '../lib/haptics';

interface Props {
  project: DemoProject;
  /** Hint für Slider-Range. Default 60s wenn unbekannt. */
  totalDurationHint?: number;
  /** Header-Title (i18n-übersetzt) — default "Voice-overs". */
  title?: string;
}

export function VoiceOversSection({
  project,
  totalDurationHint,
  title = 'Voice-overs',
}: Props) {
  const addVoiceOver = useProjectsStore((s) => s.addVoiceOver);
  const updateVoiceOver = useProjectsStore((s) => s.updateVoiceOver);
  const removeVoiceOver = useProjectsStore((s) => s.removeVoiceOver);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const voiceOvers = project.voiceOvers ?? [];
  const maxSec = Math.max(60, totalDurationHint ?? 0);
  const editing = editingIdx !== null ? voiceOvers[editingIdx] : null;

  const onConfirmDelete = (idx: number) => {
    haptic.warning();
    appAlert(
      'Delete voice-over?',
      'This removes the audio file from the project (cannot be undone).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic.success();
            removeVoiceOver(project.id, idx);
          },
        },
      ],
    );
  };

  const handleGenerated = (audioPath: string, text: string, voice: string) => {
    const vo: ProjectVoiceOver = {
      path: audioPath,
      startSec: editing?.startSec ?? 0,
      volume: editing?.volume ?? 1.0,
      text,
      voice,
    };
    if (editing && editingIdx !== null) {
      updateVoiceOver(project.id, editingIdx, vo);
    } else {
      addVoiceOver(project.id, vo);
    }
    setEditingIdx(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>{title.toUpperCase()}</Text>
          <Text style={styles.sub}>AI-narrated audio over the clip</Text>
        </View>
        <Pressable
          onPress={() => {
            haptic.light();
            setEditingIdx(null);
            setModalOpen(true);
          }}
          style={({ pressed }) => [styles.newBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="add" size={14} color="#ff1039" />
          <Text style={styles.newLabel}>New</Text>
        </Pressable>
      </View>

      {voiceOvers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            No voice-overs yet — tap "New" to generate one with AI.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {voiceOvers.map((vo, i) => (
            <VoiceOverRow
              key={`${vo.path}-${i}`}
              vo={vo}
              maxSec={maxSec}
              onEdit={() => {
                haptic.light();
                setEditingIdx(i);
                setModalOpen(true);
              }}
              onDelete={() => onConfirmDelete(i)}
              onPatch={(patch) => updateVoiceOver(project.id, i, patch)}
            />
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        ⓘ Generated audio is stored locally and used at export.
      </Text>

      {/* Lazy mount: erst rendern wenn der Modal geöffnet ist. Spart RN-Tree-
          Allocations wenn der User die Voice-Over-Section sieht ohne TTS zu
          öffnen — auf Memory-knappen Android-Geräten relevant. */}
      {modalOpen && (
        <TtsModal
          visible={modalOpen}
          initialText={editing?.text ?? ''}
          initialVoice={editing?.voice ?? 'nova'}
          isEditMode={editing !== null}
          onClose={() => {
            setModalOpen(false);
            setEditingIdx(null);
          }}
          onGenerated={handleGenerated}
        />
      )}
    </View>
  );
}

function VoiceOverRow({
  vo,
  maxSec,
  onEdit,
  onDelete,
  onPatch,
}: {
  vo: ProjectVoiceOver;
  maxSec: number;
  onEdit: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<ProjectVoiceOver>) => void;
}) {
  const snippet =
    vo.text && vo.text.length > 0
      ? vo.text.slice(0, 56) + (vo.text.length > 56 ? '…' : '')
      : 'Voice-over';
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            🎙️ {snippet}
          </Text>
          <Text style={styles.rowMeta}>
            {(vo.voice ?? 'tts')} · starts at {fmtSec(vo.startSec)}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={onEdit} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={16} color="#a1a1aa" />
        </Pressable>
        <Pressable hitSlop={8} onPress={onDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </Pressable>
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Position</Text>
        <View style={{ flex: 1 }}>
          <SimpleSlider
            value={vo.startSec}
            min={0}
            max={maxSec}
            step={0.5}
            onChange={(v) => onPatch({ startSec: v })}
          />
        </View>
        <Text style={styles.sliderValue}>{fmtSec(vo.startSec)}</Text>
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Volume</Text>
        <View style={{ flex: 1 }}>
          <SimpleSlider
            value={vo.volume}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => onPatch({ volume: v })}
          />
        </View>
        <Text style={styles.sliderValue}>{Math.round(vo.volume * 100)}%</Text>
      </View>

      {/* Phase C4 (2026-05-19): Auto-Duck Toggle pro VO. Default ON →
          Source-Audio wird während die VO spricht via Sidechain-Compressor
          gedimmt (FFmpeg sidechaincompress). User kann pro Track abschalten. */}
      <Pressable
        onPress={() => {
          haptic.light();
          onPatch({ autoDuck: !(vo.autoDuck !== false) });
        }}
        style={({ pressed }) => [
          styles.duckRow,
          { opacity: pressed ? 0.7 : 1 },
        ]}
        hitSlop={4}
      >
        <Ionicons
          name={vo.autoDuck !== false ? 'volume-low' : 'volume-high'}
          size={14}
          color={vo.autoDuck !== false ? '#ff1039' : '#71717a'}
        />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.duckLabel}>Auto-duck source audio</Text>
          <Text style={styles.duckHint}>
            {vo.autoDuck !== false
              ? 'Source dimmt während TTS spricht (sidechain compressor)'
              : 'Source bleibt auf voller Lautstärke'}
          </Text>
        </View>
        <View
          style={[
            styles.duckSwitch,
            vo.autoDuck !== false ? styles.duckSwitchOn : styles.duckSwitchOff,
          ]}
        >
          <View
            style={[
              styles.duckSwitchKnob,
              vo.autoDuck !== false ? styles.duckSwitchKnobOn : styles.duckSwitchKnobOff,
            ]}
          />
        </View>
      </Pressable>
    </View>
  );
}

function fmtSec(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heading: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  sub: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.45)',
  },
  newLabel: {
    color: '#ff1039',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyText: {
    color: '#71717a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  row: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowTitle: {
    color: '#f1f2f2',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  rowMeta: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sliderLabel: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
    width: 55,
  },
  sliderValue: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
  footer: {
    color: '#52525b',
    fontSize: 9,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  duckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 2,
  },
  duckLabel: {
    color: '#f1f2f2',
    fontSize: 11,
    fontWeight: '600',
  },
  duckHint: {
    color: '#71717a',
    fontSize: 9,
    lineHeight: 12,
  },
  duckSwitch: {
    width: 32,
    height: 18,
    borderRadius: 999,
    padding: 2,
    justifyContent: 'center',
  },
  duckSwitchOn: {
    backgroundColor: 'rgba(255,16,57,0.45)',
  },
  duckSwitchOff: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  duckSwitchKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
  duckSwitchKnobOn: {
    alignSelf: 'flex-end',
  },
  duckSwitchKnobOff: {
    alignSelf: 'flex-start',
  },
});

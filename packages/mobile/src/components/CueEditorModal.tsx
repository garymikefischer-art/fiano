/**
 * CueEditorModal (Phase 9.6.7a) — User editiert die von Whisper generierten
 * Subtitle-Cues. Analog Desktop's CueEditor in TikTokTab.tsx.
 *
 * UI: Liste von Cards, jede zeigt Zeitstempel [m:ss.s → m:ss.s] + editierbares
 * Text-Input + Delete-Button. Save am Header propagiert geänderte Cues an
 * onSave-Callback (caller updated project.subtitles.cues).
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { SubtitleCue } from '../data/demoProjects';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';
import { useColors } from '../lib/theme';

interface Props {
  visible: boolean;
  cues: SubtitleCue[];
  /** Phase A3.2 (2026-05-17): optional, für Multi-Clip-Cue-Zuordnung.
   *  Wenn gesetzt + cues haben clipIndex → Cues werden pro Source-Clip
   *  gruppiert mit Section-Header (filename). */
  sourceUris?: string[];
  onClose: () => void;
  onSave: (cues: SubtitleCue[]) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const d = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}

/** Phase A3.2: extract Source-File basename aus file://-URI für Section-Header. */
function basenameOfUri(uri: string | undefined, fallback: string): string {
  if (!uri) return fallback;
  const seg = uri.split('/').pop() ?? '';
  return seg || fallback;
}

export function CueEditorModal({ visible, cues, sourceUris, onClose, onSave }: Props) {
  const t = useT();
  const colors = useColors();
  const [localCues, setLocalCues] = useState<SubtitleCue[]>(cues);

  useEffect(() => {
    if (visible) setLocalCues(cues);
  }, [visible, cues]);

  const updateText = (idx: number, text: string) => {
    setLocalCues((prev) => prev.map((c, i) => (i === idx ? { ...c, text } : c)));
  };

  const deleteCue = (idx: number) => {
    haptic.medium();
    setLocalCues((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    haptic.success();
    onSave(localCues);
    onClose();
  };

  // Phase A3.2: Cues nach clipIndex gruppieren wenn vorhanden.
  // Wenn KEINE cues clipIndex haben (= Single-Clip-Mode) → 1 Gruppe ohne Header.
  // Wenn alle cues clipIndex haben → gruppiert mit per-clip-Header.
  const hasClipIndex = localCues.some((c) => typeof c.clipIndex === 'number');
  const groups: { clipIndex: number | null; rows: { cue: SubtitleCue; absIdx: number }[] }[] = [];
  if (hasClipIndex) {
    const byClip = new Map<number, { cue: SubtitleCue; absIdx: number }[]>();
    localCues.forEach((cue, absIdx) => {
      const ci = cue.clipIndex ?? -1;
      if (!byClip.has(ci)) byClip.set(ci, []);
      byClip.get(ci)!.push({ cue, absIdx });
    });
    const sortedKeys = Array.from(byClip.keys()).sort((a, b) => a - b);
    for (const k of sortedKeys) {
      groups.push({ clipIndex: k, rows: byClip.get(k)! });
    }
  } else {
    groups.push({
      clipIndex: null,
      rows: localCues.map((cue, absIdx) => ({ cue, absIdx })),
    });
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }} edges={['top']}>
        <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomColor: colors.bg.elevated,
            borderBottomWidth: 1,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close" size={22} color={colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '700' }}>
              {t('cueEditor.title', 'Cue Editor')}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
              {localCues.length} {t('cueEditor.cuesLabel', 'cues')}
            </Text>
          </View>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
            })}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {t('common.save', 'Save')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          {localCues.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40, gap: 8 }}>
              <Ionicons name="document-text-outline" size={32} color="#52525b" />
              <Text style={{ color: colors.text.tertiary, fontSize: 12, textAlign: 'center' }}>
                {t(
                  'cueEditor.empty',
                  'No cues yet — run AI Analysis in Highlights first.',
                )}
              </Text>
            </View>
          ) : (
            groups.map((g, gi) => (
              <View key={`group-${g.clipIndex ?? 'flat'}-${gi}`} style={{ gap: 8 }}>
                {/* Phase A3.2: Section-Header pro Clip (nur Multi-Clip-Mode) */}
                {g.clipIndex !== null && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 4,
                      paddingTop: gi === 0 ? 0 : 12,
                    }}
                  >
                    <Ionicons name="film-outline" size={11} color="#ff1039" />
                    <Text style={{ color: '#ff1039', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
                      {t('cueEditor.clipHeading', 'CLIP {n}').replace('{n}', String(g.clipIndex + 1))}
                    </Text>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10 }} numberOfLines={1}>
                      · {basenameOfUri(sourceUris?.[g.clipIndex], `Clip ${g.clipIndex + 1}`)}
                    </Text>
                  </View>
                )}
                {g.rows.map(({ cue, absIdx }) => (
                  <View
                    key={`cue-${absIdx}`}
                    style={{
                      backgroundColor: colors.bg.elevated,
                      borderWidth: 1,
                      borderColor: colors.border.subtle,
                      borderRadius: 12,
                      padding: 12,
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          color: colors.text.tertiary,
                          fontSize: 10,
                          fontVariant: ['tabular-nums'],
                          fontWeight: '600',
                        }}
                      >
                        {formatTime(cue.startSec)} → {formatTime(cue.endSec)}
                      </Text>
                      <Pressable onPress={() => deleteCue(absIdx)} hitSlop={6} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </Pressable>
                    </View>
                    <TextInput
                      value={cue.text}
                      onChangeText={(text) => updateText(absIdx, text)}
                      multiline
                      placeholder={t('cueEditor.placeholder', 'Cue text…')}
                      placeholderTextColor={colors.text.muted}
                      style={{
                        color: colors.text.primary,
                        fontSize: 13,
                        lineHeight: 18,
                        backgroundColor: colors.bg.elevated,
                        borderWidth: 1,
                        borderColor: colors.border.subtle,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        minHeight: 50,
                        textAlignVertical: 'top',
                      }}
                    />
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

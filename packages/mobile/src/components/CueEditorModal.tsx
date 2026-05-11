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

interface Props {
  visible: boolean;
  cues: SubtitleCue[];
  onClose: () => void;
  onSave: (cues: SubtitleCue[]) => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const d = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${d}`;
}

export function CueEditorModal({ visible, cues, onClose, onSave }: Props) {
  const t = useT();
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
        <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomColor: 'rgba(255,255,255,0.06)',
            borderBottomWidth: 1,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close" size={22} color="#f1f2f2" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700' }}>
              {t('cueEditor.title', 'Cue Editor')}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 11 }}>
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
              <Text style={{ color: '#71717a', fontSize: 12, textAlign: 'center' }}>
                {t(
                  'cueEditor.empty',
                  'No cues yet — run AI Analysis in Highlights first.',
                )}
              </Text>
            </View>
          ) : (
            localCues.map((cue, idx) => (
              <View
                key={`cue-${idx}`}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
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
                      color: '#71717a',
                      fontSize: 10,
                      fontVariant: ['tabular-nums'],
                      fontWeight: '600',
                    }}
                  >
                    {formatTime(cue.startSec)} → {formatTime(cue.endSec)}
                  </Text>
                  <Pressable onPress={() => deleteCue(idx)} hitSlop={6} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  </Pressable>
                </View>
                <TextInput
                  value={cue.text}
                  onChangeText={(text) => updateText(idx, text)}
                  multiline
                  placeholder={t('cueEditor.placeholder', 'Cue text…')}
                  placeholderTextColor="#52525b"
                  style={{
                    color: '#f1f2f2',
                    fontSize: 13,
                    lineHeight: 18,
                    backgroundColor: 'rgba(0,0,0,0.25)',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    minHeight: 50,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

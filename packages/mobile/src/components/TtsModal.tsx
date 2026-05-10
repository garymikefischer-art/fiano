/**
 * TtsModal — Bottom-Sheet-Modal mit Sprache, Gender, Voice-Picker, Text-Input
 * + Generate-Button. Analog Desktop's TtsModal in EditorTab.tsx (line 5339+).
 *
 * Bei `onGenerated` ruft der Caller die OpenAI-API auf und bekommt einen file://
 * Pfad zurück — dieser wird als ProjectVoiceOver an das Project gehängt
 * (siehe VoiceOversSection).
 *
 * UX-Details:
 *   - 4096-Char-Limit (OpenAI hard limit)
 *   - Live char-counter unten rechts
 *   - Loading-Spinner während Generation, Error-Overlay bei Fehlern
 *   - Sprache + Voice + Gender werden im Lokal-State gehalten — onGenerated
 *     bekommt finalen text + voice
 */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  TTS_LANGUAGES,
  TTS_VOICES_FEMALE,
  TTS_VOICES_MALE,
  generateTts,
  isMaleVoice,
} from '../lib/tts';
import { useAppStore } from '../stores/appStore';
import { haptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  initialText?: string;
  initialVoice?: string;
  isEditMode?: boolean;
  onClose: () => void;
  /** Wird gerufen wenn Audio erfolgreich generiert + persistiert wurde. */
  onGenerated: (audioPath: string, text: string, voice: string) => void;
}

const MAX_CHARS = 4096;

export function TtsModal({
  visible,
  initialText = '',
  initialVoice = 'nova',
  isEditMode = false,
  onClose,
  onGenerated,
}: Props) {
  const apiKey = useAppStore((s) => s.openaiKey);

  const [text, setText] = useState(initialText);
  const [lang, setLang] = useState('de');
  const [gender, setGender] = useState<'male' | 'female'>(
    isMaleVoice(initialVoice) ? 'male' : 'female',
  );
  const [voice, setVoice] = useState(initialVoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bei Mount/Open: state aus initial-props zurücksetzen.
  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    setVoice(initialVoice);
    setGender(isMaleVoice(initialVoice) ? 'male' : 'female');
    setError(null);
  }, [visible, initialText, initialVoice]);

  // Bei Gender-Wechsel (User-Aktion, nicht Mount): erste Voice der neuen Gruppe.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setVoice(gender === 'male' ? TTS_VOICES_MALE[0].id : TTS_VOICES_FEMALE[0].id);
  }, [gender]);

  const voices = gender === 'male' ? TTS_VOICES_MALE : TTS_VOICES_FEMALE;
  const charsLeft = MAX_CHARS - text.length;
  const canGenerate = text.trim().length > 0 && !busy && charsLeft >= 0;

  const onGenerate = async () => {
    if (!canGenerate) return;
    if (!apiKey) {
      Alert.alert(
        'OpenAI key missing',
        'Add your OpenAI API key in Settings → API Keys before generating speech.',
      );
      return;
    }
    haptic.medium();
    setBusy(true);
    setError(null);
    try {
      const result = await generateTts({ text: text.trim(), voice, apiKey });
      haptic.success();
      onGenerated(result.path, text.trim(), voice);
      onClose();
    } catch (e) {
      haptic.error();
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name="mic" size={20} color="#ff1039" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {isEditMode ? 'Edit Text-to-Speech' : 'AI Text-to-Speech'}
                </Text>
                <Text style={styles.subtitle}>
                  {isEditMode
                    ? 'Update text or voice — generates a new audio file.'
                    : 'Generate voice-over audio with OpenAI TTS.'}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#a1a1aa" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Language Picker — horizontal scroll pills */}
              <View>
                <Text style={styles.label}>LANGUAGE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillRow}
                >
                  {TTS_LANGUAGES.map((l) => (
                    <Pressable
                      key={l.code}
                      onPress={() => {
                        haptic.selection();
                        setLang(l.code);
                      }}
                      style={({ pressed }) => [
                        styles.pill,
                        lang === l.code && styles.pillActive,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[styles.pillText, lang === l.code && styles.pillTextActive]}>
                        {l.native}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Gender */}
              <View>
                <Text style={styles.label}>GENDER</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['female', 'male'] as const).map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => {
                        haptic.selection();
                        setGender(g);
                      }}
                      style={({ pressed }) => [
                        styles.genderBtn,
                        gender === g && styles.genderBtnActive,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Ionicons
                        name={g === 'female' ? 'female' : 'male'}
                        size={18}
                        color={gender === g ? '#ff1039' : '#a1a1aa'}
                      />
                      <Text style={[styles.genderLabel, gender === g && { color: '#ff1039' }]}>
                        {g === 'female' ? 'Female' : 'Male'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Voice */}
              <View>
                <Text style={styles.label}>VOICE</Text>
                <View style={{ gap: 6 }}>
                  {voices.map((v) => (
                    <Pressable
                      key={v.id}
                      onPress={() => {
                        haptic.selection();
                        setVoice(v.id);
                      }}
                      style={({ pressed }) => [
                        styles.voiceRow,
                        voice === v.id && styles.voiceRowActive,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <View
                        style={[
                          styles.voiceRadio,
                          voice === v.id && styles.voiceRadioActive,
                        ]}
                      >
                        {voice === v.id && <View style={styles.voiceRadioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.voiceName}>{v.label}</Text>
                        <Text style={styles.voiceHint}>{v.hint}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Text */}
              <View>
                <Text style={styles.label}>TEXT</Text>
                <TextInput
                  multiline
                  value={text}
                  onChangeText={setText}
                  placeholder="Type the script you want spoken…"
                  placeholderTextColor="#52525b"
                  maxLength={MAX_CHARS}
                  style={styles.textInput}
                  editable={!busy}
                />
                <View style={styles.charRow}>
                  <Text
                    style={[
                      styles.charCount,
                      charsLeft < 200 && { color: '#fbbf24' },
                      charsLeft < 0 && { color: '#ef4444' },
                    ]}
                  >
                    {charsLeft} / {MAX_CHARS}
                  </Text>
                </View>
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#ef4444" />
                  <Text style={styles.errorText} numberOfLines={3}>
                    {error}
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              onPress={onGenerate}
              disabled={!canGenerate}
              style={({ pressed }) => [
                styles.generateBtn,
                !canGenerate && { opacity: 0.4 },
                pressed && canGenerate && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="sparkles" size={16} color="#fff" />
              )}
              <Text style={styles.generateLabel}>
                {busy ? 'Generating…' : isEditMode ? 'Re-generate' : 'Generate'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#0d0509',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,16,57,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#f1f2f2',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  pillRow: {
    gap: 6,
    paddingRight: 12,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  pillActive: {
    backgroundColor: 'rgba(255,16,57,0.16)',
    borderColor: 'rgba(255,16,57,0.5)',
  },
  pillText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#ff1039',
  },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  genderBtnActive: {
    backgroundColor: 'rgba(255,16,57,0.12)',
    borderColor: 'rgba(255,16,57,0.45)',
  },
  genderLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  voiceRowActive: {
    backgroundColor: 'rgba(255,16,57,0.10)',
    borderColor: 'rgba(255,16,57,0.45)',
  },
  voiceRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRadioActive: {
    borderColor: '#ff1039',
  },
  voiceRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff1039',
  },
  voiceName: {
    color: '#f1f2f2',
    fontSize: 13,
    fontWeight: '600',
  },
  voiceHint: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 1,
  },
  textInput: {
    minHeight: 92,
    maxHeight: 200,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f1f2f2',
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  charRow: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  charCount: {
    color: '#52525b',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ff1039',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  generateLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

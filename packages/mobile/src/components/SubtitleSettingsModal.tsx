/**
 * SubtitleSettingsModal — Bottom-Sheet mit allen ~30 Subtitle-Properties
 * analog Desktop's SubtitleControls. Sektionen scrollbar:
 *
 *   1. Preset (style)
 *   2. Position (top/center/bottom + customY-Slider)
 *   3. Typography (fontFamily / fontSize / letterSpacing / uppercase)
 *   4. Colors (textColor + highlightColor + gradient-Toggle/From/To)
 *   5. Stroke (width / color)
 *   6. Glow (enabled / blur / strength / color)
 *   7. Shadow (enabled / offsetX/Y / color / blur)
 *   8. Layered Settings (nur bei style='layered')
 *
 * Mini-Preview oben im Sheet zeigt die aktuelle Settings (RN <Text>-basiert,
 * ~80% der Effekte; echter Render via FFmpeg-Native im Export).
 *
 * Save → updateProject(id, { subtitles }). Reset → DEFAULT_SUBTITLES.
 */

import { useState } from 'react';
import {
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
import { ColorPickerButton } from './ColorPickerModal';
import { SimpleSlider } from './SimpleSlider';
import { SubtitlePreviewCard } from './SubtitlePreviewCard';
import { CueEditorModal } from './CueEditorModal';
import {
  DEFAULT_SUBTITLES,
  type SubtitleFontFamily,
  type SubtitlePosition,
  type SubtitleSettings,
  type SubtitleStyle,
} from '../data/demoProjects';
import { haptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  settings: SubtitleSettings;
  onClose: () => void;
  onChange: (next: SubtitleSettings) => void;
}

const STYLE_OPTIONS: { id: SubtitleStyle; label: string; desc: string }[] = [
  { id: 'default', label: 'Default', desc: 'Clean & simple' },
  { id: 'bold',    label: 'Bold',    desc: 'Heavy, bold text' },
  { id: 'gaming',  label: 'Gaming',  desc: 'Impact yellow' },
  { id: 'fiano',   label: 'Fiano',   desc: 'Brand uppercase' },
  { id: 'layered', label: 'Layered', desc: 'Big word + small below' },
];

const POSITION_OPTIONS: { id: SubtitlePosition; label: string }[] = [
  { id: 'top',    label: 'Top' },
  { id: 'center', label: 'Center' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'custom', label: 'Custom' },
];

/** Curated + Android-System-Fonts. Auf Android sind sans-serif* + serif* + monospace
 *  garantiert verfügbar. Custom-Input erlaubt jeden weiteren Font-Namen (System-Query-
 *  API gibt's auf RN nicht von Haus aus — alternativ kann der User ein font-name
 *  per Hand eintippen). */
const FONT_OPTIONS: { id: SubtitleFontFamily; label: string }[] = [
  // Curated (1:1 zu Desktop)
  { id: 'helvetica',           label: 'Helvetica' },
  { id: 'arial-black',         label: 'Arial Black' },
  { id: 'impact',              label: 'Impact' },
  { id: 'geist',               label: 'Geist' },
  { id: 'georgia',             label: 'Georgia' },
  { id: 'mono',                label: 'Mono' },
  // Android System-Fonts
  { id: 'sans-serif',          label: 'Sans Serif' },
  { id: 'sans-serif-black',    label: 'Sans Black' },
  { id: 'sans-serif-condensed',label: 'Sans Condensed' },
  { id: 'sans-serif-light',    label: 'Sans Light' },
  { id: 'sans-serif-medium',   label: 'Sans Medium' },
  { id: 'sans-serif-thin',     label: 'Sans Thin' },
  { id: 'sans-serif-smallcaps',label: 'Small Caps' },
  { id: 'serif',               label: 'Serif' },
  { id: 'serif-monospace',     label: 'Serif Mono' },
  { id: 'monospace',           label: 'Monospace' },
  { id: 'cursive',             label: 'Cursive' },
  { id: 'casual',              label: 'Casual' },
  { id: 'Roboto',              label: 'Roboto' },
  { id: 'Roboto-Bold',         label: 'Roboto Bold' },
  { id: 'Roboto-Italic',       label: 'Roboto Italic' },
];

export function SubtitleSettingsModal({ visible, settings, onClose, onChange }: Props) {
  const [cueEditorOpen, setCueEditorOpen] = useState(false);
  // KEIN lokaler State — wir lesen direkt vom parent (single source of truth).
  // Vorheriger local-buffer hatte stale-closure-Probleme: Slider/ColorPicker
  // riefen patch() mit alten local-werten weil React 18 batching + setLocal-
  // callback einen race-condition mit onChange einging.
  const local = settings;

  const patch = (p: Partial<SubtitleSettings>) => {
    onChange({ ...local, ...p });
  };

  const reset = () => {
    haptic.warning();
    onChange(DEFAULT_SUBTITLES);
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
                <Ionicons name="chatbubble-ellipses" size={20} color="#ff1039" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Subtitle styling</Text>
                <Text style={styles.subtitle}>
                  Configure font, color, glow, shadow, and word-highlights.
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={reset} style={styles.resetBtn}>
                <Ionicons name="refresh" size={16} color="#a1a1aa" />
              </Pressable>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#a1a1aa" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: 18, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Live-Preview oben */}
              <SubtitlePreviewCard settings={local} />

              {/* 0. Enable-Toggle als Erstes — sonst sieht der User Subtitle nur im
                  Modal-Preview, nicht in der echten Stacked-Preview oben im Tab. */}
              <View style={styles.enableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.enableTitle}>Enable subtitles</Text>
                  <Text style={styles.enableSub}>
                    {(local.cues?.length ?? 0) > 0
                      ? `${local.cues!.length} cues from AI analysis. Tap Edit to refine text.`
                      : local.enabled
                        ? 'Style preview active. Run AI Analysis in Highlights tab to generate cues.'
                        : 'Enable to preview subtitle styles.'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    haptic.selection();
                    patch({ enabled: !local.enabled });
                  }}
                  style={[styles.toggleTrack, local.enabled && styles.toggleTrackOn]}
                >
                  <View style={[styles.toggleThumb, local.enabled && styles.toggleThumbOn]} />
                </Pressable>
              </View>

              {/* Edit-Cues-Button — sichtbar wenn cues vorhanden. Direkter Pfad
                  zum CueEditor analog Desktop-9:16-Tab. */}
              {(local.cues?.length ?? 0) > 0 && (
                <Pressable
                  onPress={() => {
                    haptic.medium();
                    setCueEditorOpen(true);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
                    marginTop: -8,
                  })}
                >
                  <Ionicons name="create-outline" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    Edit cues ({local.cues!.length})
                  </Text>
                </Pressable>
              )}

              {/* 1. Preset */}
              <Section title="STYLE">
                <View style={styles.optionGrid}>
                  {STYLE_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.id}
                      label={o.label}
                      desc={o.desc}
                      active={local.style === o.id}
                      onPress={() => patch({ style: o.id })}
                    />
                  ))}
                </View>
              </Section>

              {/* 2. Position */}
              <Section title="POSITION">
                <View style={styles.pillRow}>
                  {POSITION_OPTIONS.map((p) => (
                    <Pill
                      key={p.id}
                      label={p.label}
                      active={local.position === p.id}
                      onPress={() => patch({ position: p.id })}
                    />
                  ))}
                </View>
                {local.position === 'custom' && (
                  <SliderRow
                    label="Custom Y"
                    value={local.customY ?? 0.85}
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    display={`${Math.round((local.customY ?? 0.85) * 100)}%`}
                    onChange={(v) => patch({ customY: v })}
                  />
                )}
              </Section>

              {/* 3. Typography */}
              <Section title="TYPOGRAPHY">
                <Text style={styles.subLabel}>Font family</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingRight: 12 }}
                >
                  {FONT_OPTIONS.map((f) => (
                    <Pill
                      key={f.id}
                      label={f.label}
                      active={local.fontFamily === f.id}
                      onPress={() => patch({ fontFamily: f.id })}
                    />
                  ))}
                </ScrollView>
                <CustomFontInput
                  value={local.fontFamily ?? ''}
                  onCommit={(v) => patch({ fontFamily: v })}
                />
                <SliderRow
                  label="Font size"
                  value={local.fontSize ?? 26}
                  min={14}
                  max={48}
                  step={1}
                  display={`${local.fontSize ?? 26}px`}
                  onChange={(v) => patch({ fontSize: Math.round(v) })}
                />
                <SliderRow
                  label="Letter spacing"
                  value={local.letterSpacing ?? 0}
                  min={-0.05}
                  max={0.3}
                  step={0.01}
                  display={`${(local.letterSpacing ?? 0).toFixed(2)}em`}
                  onChange={(v) => patch({ letterSpacing: v })}
                />
                <ToggleRow
                  label="Uppercase"
                  value={local.uppercase ?? false}
                  onChange={(v) => patch({ uppercase: v })}
                />
              </Section>

              {/* 4. Colors */}
              <Section title="COLORS">
                <ColorPickerButton
                  label="Text color"
                  value={local.textColor ?? '#ffffff'}
                  onChange={(c) => patch({ textColor: c })}
                />
                <ColorPickerButton
                  label="Highlight color"
                  value={local.highlightColor ?? '#ff1039'}
                  onChange={(c) => patch({ highlightColor: c })}
                />
                <ToggleRow
                  label="Use gradient"
                  value={local.useGradient ?? false}
                  onChange={(v) => patch({ useGradient: v })}
                />
                {local.useGradient && (
                  <>
                    <ColorPickerButton
                      label="Gradient from"
                      value={local.gradientFrom ?? '#ff1039'}
                      onChange={(c) => patch({ gradientFrom: c })}
                    />
                    <ColorPickerButton
                      label="Gradient to"
                      value={local.gradientTo ?? '#ff8c00'}
                      onChange={(c) => patch({ gradientTo: c })}
                    />
                  </>
                )}
                <ToggleRow
                  label="Metallic effect"
                  value={local.metallic ?? false}
                  onChange={(v) => patch({ metallic: v })}
                />
              </Section>

              {/* 5. Stroke */}
              <Section title="STROKE / OUTLINE">
                <ToggleRow
                  label="Enabled"
                  value={local.strokeEnabled ?? false}
                  onChange={(v) => patch({ strokeEnabled: v })}
                />
                {local.strokeEnabled && (
                  <>
                    <SliderRow
                      label="Width"
                      value={local.strokeWidth ?? 3}
                      min={0.5}
                      max={8}
                      step={0.5}
                      display={`${(local.strokeWidth ?? 3).toFixed(1)}px`}
                      onChange={(v) => patch({ strokeWidth: v })}
                    />
                    <ColorPickerButton
                      label="Stroke color"
                      value={local.strokeColor ?? '#000000'}
                      onChange={(c) => patch({ strokeColor: c })}
                    />
                  </>
                )}
              </Section>

              {/* 6. Glow */}
              <Section title="GLOW">
                <ToggleRow
                  label="Enabled"
                  value={local.glowEnabled ?? false}
                  onChange={(v) => patch({ glowEnabled: v })}
                />
                {local.glowEnabled && (
                  <>
                    <SliderRow
                      label="Blur"
                      value={local.glowBlur ?? 8}
                      min={0}
                      max={40}
                      step={1}
                      display={`${local.glowBlur ?? 8}px`}
                      onChange={(v) => patch({ glowBlur: Math.round(v) })}
                    />
                    <SliderRow
                      label="Strength"
                      value={local.glowStrength ?? 0.7}
                      min={0}
                      max={1}
                      step={0.05}
                      display={`${Math.round((local.glowStrength ?? 0.7) * 100)}%`}
                      onChange={(v) => patch({ glowStrength: v })}
                    />
                    <ColorPickerButton
                      label="Glow color"
                      value={local.glowColor ?? '#ff1039'}
                      onChange={(c) => patch({ glowColor: c })}
                    />
                  </>
                )}
              </Section>

              {/* 7. Shadow */}
              <Section title="DROP SHADOW">
                <ToggleRow
                  label="Enabled"
                  value={local.shadowEnabled ?? false}
                  onChange={(v) => patch({ shadowEnabled: v })}
                />
                {local.shadowEnabled && (
                  <>
                    <SliderRow
                      label="Offset X"
                      value={local.shadowOffsetX ?? 0}
                      min={-20}
                      max={20}
                      step={1}
                      display={`${local.shadowOffsetX ?? 0}px`}
                      onChange={(v) => patch({ shadowOffsetX: Math.round(v) })}
                    />
                    <SliderRow
                      label="Offset Y"
                      value={local.shadowOffsetY ?? 0}
                      min={-20}
                      max={20}
                      step={1}
                      display={`${local.shadowOffsetY ?? 0}px`}
                      onChange={(v) => patch({ shadowOffsetY: Math.round(v) })}
                    />
                    <SliderRow
                      label="Blur"
                      value={local.shadowBlur ?? 0}
                      min={0}
                      max={40}
                      step={1}
                      display={`${local.shadowBlur ?? 0}px`}
                      onChange={(v) => patch({ shadowBlur: Math.round(v) })}
                    />
                    <ColorPickerButton
                      label="Shadow color"
                      value={local.shadowColor ?? '#000000'}
                      onChange={(c) => patch({ shadowColor: c })}
                    />
                  </>
                )}
              </Section>

              {/* 8. Layered Settings (nur wenn style='layered') */}
              {local.style === 'layered' && (
                <Section title="LAYERED — HIGHLIGHT WORD">
                  <SliderRow
                    label="Size scale"
                    value={local.highlightFontScale ?? 1.4}
                    min={1.0}
                    max={3.0}
                    step={0.05}
                    display={`${(local.highlightFontScale ?? 1.4).toFixed(2)}×`}
                    onChange={(v) => patch({ highlightFontScale: v })}
                  />
                  <SliderRow
                    label="Drop-shadow"
                    value={local.highlightDropShadow ?? 0}
                    min={0}
                    max={40}
                    step={1}
                    display={`${local.highlightDropShadow ?? 0}px`}
                    onChange={(v) => patch({ highlightDropShadow: Math.round(v) })}
                  />
                  <ToggleRow
                    label="Metallic"
                    value={local.highlightMetallic ?? false}
                    onChange={(v) => patch({ highlightMetallic: v })}
                  />
                  <ToggleRow
                    label="Glow"
                    value={local.highlightGlow ?? false}
                    onChange={(v) => patch({ highlightGlow: v })}
                  />
                  {local.highlightGlow && (
                    <>
                      <SliderRow
                        label="Glow strength"
                        value={local.highlightGlowStrength ?? 0.6}
                        min={0}
                        max={1}
                        step={0.05}
                        display={`${Math.round((local.highlightGlowStrength ?? 0.6) * 100)}%`}
                        onChange={(v) => patch({ highlightGlowStrength: v })}
                      />
                      <ColorPickerButton
                        label="Glow color"
                        value={local.highlightGlowColor ?? '#ffffff'}
                        onChange={(c) => patch({ highlightGlowColor: c })}
                      />
                    </>
                  )}
                </Section>
              )}

              {/* 9. Max Words */}
              <Section title="WORDS PER CHUNK">
                <SliderRow
                  label="Max words"
                  value={local.maxWordsPerChunk ?? 2}
                  min={1}
                  max={10}
                  step={1}
                  display={`${local.maxWordsPerChunk ?? 2}`}
                  onChange={(v) => patch({ maxWordsPerChunk: Math.round(v) })}
                />
                <Text style={styles.helper}>
                  1 = single-word · 2-3 = phrase · 999 = full sentence
                </Text>
              </Section>
            </ScrollView>

            <Pressable
              onPress={() => {
                haptic.success();
                onClose();
              }}
              style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Cue-Editor als overlay-Modal (sibling). */}
      <CueEditorModal
        visible={cueEditorOpen}
        cues={local.cues ?? []}
        onClose={() => setCueEditorOpen(false)}
        onSave={(nextCues) => patch({ cues: nextCues })}
      />
    </Modal>
  );
}

/* ─── Sub-Komponenten ─────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OptionCard({
  label,
  desc,
  active,
  onPress,
}: {
  label: string;
  desc: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.optionCard,
        active && styles.optionCardActive,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[styles.optionLabel, active && { color: '#ff1039' }]}>{label}</Text>
      <Text style={styles.optionDesc}>{desc}</Text>
    </Pressable>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.sliderHeader}>
        <Text style={styles.subLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{display}</Text>
      </View>
      <SimpleSlider value={value} min={min} max={max} step={step} onChange={onChange} />
    </View>
  );
}

function CustomFontInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: SubtitleFontFamily) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Text style={[styles.subLabel, { width: 78 }]}>Custom</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed.length > 0 && trimmed !== value) onCommit(trimmed);
        }}
        placeholder="z.B. Roboto-Italic"
        placeholderTextColor="#52525b"
        style={{
          flex: 1,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: 'rgba(0,0,0,0.4)',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          color: '#f1f2f2',
          fontSize: 13,
        }}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.selection();
        onChange(!value);
      }}
      style={({ pressed }) => [styles.toggleRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.subLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

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
    maxHeight: '95%',
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
    gap: 10,
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
  resetBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  subLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionCard: {
    flexGrow: 1,
    flexBasis: '30%',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  optionCardActive: {
    backgroundColor: 'rgba(255,16,57,0.12)',
    borderColor: 'rgba(255,16,57,0.45)',
  },
  optionLabel: {
    color: '#f1f2f2',
    fontSize: 12,
    fontWeight: '700',
  },
  optionDesc: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    fontSize: 11,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#ff1039',
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderValue: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.10)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: '#ff1039',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  toggleThumbOn: {
    transform: [{ translateX: 16 }],
  },
  helper: {
    color: '#52525b',
    fontSize: 10,
    fontStyle: 'italic',
  },
  enableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,16,57,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,16,57,0.18)',
  },
  enableTitle: {
    color: '#f1f2f2',
    fontSize: 13,
    fontWeight: '700',
  },
  enableSub: {
    color: '#a1a1aa',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  doneBtn: {
    backgroundColor: '#ff1039',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  doneLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

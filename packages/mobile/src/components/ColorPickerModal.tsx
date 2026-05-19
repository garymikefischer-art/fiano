/**
 * ColorPickerModal — Bottom-Sheet-Popup zum Auswählen einer Farbe.
 *
 * Inhalt:
 *   - Header mit Title + Live-Preview-Block (große aktuelle Farbe)
 *   - Hex-Input mit Validierung
 *   - Preset-Grid mit ~30 typischen Brand- und Neutral-Farben
 *   - RGB-Sliders für Custom-Fine-Tuning
 *   - Done-Button
 *
 * onChange wird live committed während User mit Sliders/Hex spielt — Caller-State
 * updates sofort, kein "Apply"-Confirm nötig. Done schließt nur.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { SimpleSlider } from './SimpleSlider';
import { haptic } from '../lib/haptics';
import { useColors, type ColorPalette } from '../lib/theme';

interface Props {
  visible: boolean;
  value: string;
  title?: string;
  onClose: () => void;
  onChange: (next: string) => void;
}

const PRESET_GRID = [
  '#ffffff', '#e5e5e5', '#a1a1aa', '#52525b', '#27272a', '#000000',
  '#ff1039', '#dc2626', '#f97316', '#fbbf24', '#facc15', '#84cc16',
  '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ff6b35', '#ff8c00',
];

export function ColorPickerModal({ visible, value, title = 'Farbe wählen', onClose, onChange }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [draft, setDraft] = useState(value);
  const rgb = parseHex(value) ?? { r: 255, g: 255, b: 255 };

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitHex = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (normalized) {
      onChange(normalized);
    } else {
      setDraft(value);
    }
  };

  const setRGBComponent = (component: 'r' | 'g' | 'b', v: number) => {
    const next = { ...rgb, [component]: Math.round(v) };
    const hex = `#${[next.r, next.g, next.b].map(toHex).join('')}`;
    onChange(hex);
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
              <View
                style={[
                  styles.previewBlock,
                  { backgroundColor: isValidHex(value) ? value : '#444' },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{value.toUpperCase()}</Text>
              </View>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#a1a1aa" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
              {/* Hex Input */}
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>HEX</Text>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onBlur={() => commitHex(draft)}
                  onSubmitEditing={() => commitHex(draft)}
                  autoCapitalize="characters"
                  maxLength={7}
                  placeholder="#ffffff"
                  placeholderTextColor="#52525b"
                  style={styles.hexInput}
                />
              </View>

              {/* Preset Grid */}
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>PRESETS</Text>
                <View style={styles.presetGrid}>
                  {PRESET_GRID.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => {
                        haptic.selection();
                        onChange(p);
                      }}
                      style={({ pressed }) => [
                        styles.presetCell,
                        {
                          backgroundColor: p,
                          borderColor:
                            value.toLowerCase() === p.toLowerCase()
                              ? '#ff1039'
                              : 'rgba(255,255,255,0.10)',
                          borderWidth:
                            value.toLowerCase() === p.toLowerCase() ? 3 : 1,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>

              {/* RGB Sliders */}
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>RGB FINE-TUNE</Text>
                <ChannelSlider label="R" channel="r" rgb={rgb} onChange={setRGBComponent} accent="#ef4444" />
                <ChannelSlider label="G" channel="g" rgb={rgb} onChange={setRGBComponent} accent="#10b981" />
                <ChannelSlider label="B" channel="b" rgb={rgb} onChange={setRGBComponent} accent="#3b82f6" />
              </View>
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
    </Modal>
  );
}

function ChannelSlider({
  label,
  channel,
  rgb,
  onChange,
  accent,
}: {
  label: string;
  channel: 'r' | 'g' | 'b';
  rgb: { r: number; g: number; b: number };
  onChange: (c: 'r' | 'g' | 'b', v: number) => void;
  accent: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={[styles.channelLabel, { color: accent }]}>{label}</Text>
      <View style={{ flex: 1 }}>
        <SimpleSlider
          value={rgb[channel]}
          min={0}
          max={255}
          step={1}
          onChange={(v) => onChange(channel, v)}
        />
      </View>
      <Text style={styles.channelValue}>{rgb[channel]}</Text>
    </View>
  );
}

/* ─── Color-Display-Trigger (im Modal an textColor/highlightColor/...) ── */

export function ColorPickerButton({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          haptic.light();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.triggerRow,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.triggerLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.triggerHex}>{value.toUpperCase()}</Text>
          <View
            style={[
              styles.triggerSwatch,
              { backgroundColor: isValidHex(value) ? value : '#444' },
            ]}
          />
        </View>
      </Pressable>
      {open && (
        <ColorPickerModal
          visible={open}
          value={value}
          title={label}
          onClose={() => setOpen(false)}
          onChange={onChange}
        />
      )}
    </>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return {
    r: parseInt(m.substring(0, 2), 16),
    g: parseInt(m.substring(2, 4), 16),
    b: parseInt(m.substring(4, 6), 16),
  };
}

function normalizeHex(raw: string): string | null {
  let v = raw.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    v = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toLowerCase();
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/* ─── Styles ──────────────────────────────────────────────────────── */

// Phase B3.9 (2026-05-19): theme-aware styles.
function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.bg.backdrop, justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: colors.bg.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 28,
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.strong,
      marginBottom: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    previewBlock: {
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border.strong,
    },
    title: { color: colors.text.primary, fontSize: 16, fontWeight: '700' },
    subtitle: { color: colors.text.tertiary, fontSize: 12, marginTop: 2, fontFamily: 'monospace' },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { color: colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
    hexInput: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.bg.elevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      color: colors.text.primary,
      fontSize: 16,
      fontFamily: 'monospace',
    },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    presetCell: { width: 44, height: 44, borderRadius: 10 },
    channelLabel: { fontSize: 13, fontWeight: '800', width: 18, textAlign: 'center' },
    channelValue: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      minWidth: 32,
      textAlign: 'right',
    },
    doneBtn: {
      backgroundColor: colors.accent.base,
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 12,
      alignItems: 'center',
    },
    doneLabel: { color: colors.text.onAccent, fontSize: 14, fontWeight: '700' },
    triggerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    triggerLabel: { color: colors.text.primary, fontSize: 13, fontWeight: '600' },
    triggerHex: { color: colors.text.tertiary, fontSize: 12, fontFamily: 'monospace' },
    triggerSwatch: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.strong,
    },
  });
}

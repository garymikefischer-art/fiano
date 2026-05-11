/**
 * MiniColorPicker — pragmatischer Color-Picker für Mobile ohne Native-Deps.
 *
 * Layout:
 *   [farbiger Preview-Block] [hex-input #ffffff] [preset swatches row]
 *
 * Hex-Input validiert auf #RRGGBB (oder #RGB → expanded). Bei invalid bleibt der
 * letzte gültige Wert via `value` prop. Preset-Swatches sind eine vorgegebene
 * Palette (analog Desktop's color-presets).
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { haptic } from '../lib/haptics';

interface Props {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  /** Custom Preset-Swatches. Default: brand + neutral palette. */
  presets?: string[];
}

const DEFAULT_PRESETS = [
  '#ffffff', '#000000', '#ff1039', '#fbbf24', '#10b981', '#3b82f6', '#a855f7', '#ec4899',
];

export function MiniColorPicker({ value, onChange, label, presets = DEFAULT_PRESETS }: Props) {
  const [draft, setDraft] = useState(value);

  // Sync wenn value von außen ändert (z.B. preset tap)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (normalized) onChange(normalized);
    else setDraft(value); // revert auf last valid
  };

  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <View style={[styles.swatch, { backgroundColor: isValidHex(value) ? value : '#444' }]} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => commit(draft)}
          onSubmitEditing={() => commit(draft)}
          autoCapitalize="characters"
          maxLength={7}
          placeholder="#ffffff"
          placeholderTextColor="#52525b"
          style={styles.input}
        />
      </View>
      <View style={styles.presetRow}>
        {presets.map((p) => (
          <Pressable
            key={p}
            onPress={() => {
              haptic.selection();
              onChange(p);
            }}
            style={({ pressed }) => [
              styles.presetSwatch,
              {
                backgroundColor: p,
                borderColor:
                  value.toLowerCase() === p.toLowerCase() ? '#ff1039' : 'rgba(255,255,255,0.16)',
                borderWidth: value.toLowerCase() === p.toLowerCase() ? 2 : 1,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function normalizeHex(raw: string): string | null {
  let v = raw.trim();
  if (!v.startsWith('#')) v = '#' + v;
  // #RGB → #RRGGBB
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    v = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toLowerCase();
}

const styles = StyleSheet.create({
  label: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: '#f1f2f2',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  presetSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
});

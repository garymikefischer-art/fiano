/**
 * ExportSettingsModal — vor jedem Export öffnet sich Bottom-Sheet mit
 * Auflösung / FPS / Bitrate. User confirmt → Export startet.
 *
 * Defaults aus appStore.exportSettings (Settings-Tab konfigurierbar) —
 * User kann per-Export override. Bei "Save as default" werden die
 * neuen Werte in appStore persistiert.
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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../lib/haptics';
import { useFeature, type FeatureId } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import type {
  ExportBitrate,
  ExportFps,
  ExportResolution,
  ExportSettings,
} from '../stores/appStore';

// Phase A5: pro Option ein optionaler Feature-Lock.
// Resolution: 720p/1080p = creator, 4k = pro (export_4k).
// Bitrate: 5M = creator, alles >5M = pro (export_high_bitrate).
const RES_LOCK: Record<ExportResolution, FeatureId | null> = {
  '720p': null,
  '1080p': null,
  '4k': 'export_4k',
};
const BR_LOCK: Record<ExportBitrate, FeatureId | null> = {
  '5M': null,
  '10M': 'export_high_bitrate',
  '20M': 'export_high_bitrate',
  '40M': 'export_high_bitrate',
  '80M': 'export_high_bitrate',
};

interface Props {
  visible: boolean;
  initialSettings: ExportSettings;
  onClose: () => void;
  onConfirm: (settings: ExportSettings, saveAsDefault: boolean) => void;
}

const RESOLUTION_OPTIONS: { id: ExportResolution; label: string; desc: string }[] = [
  { id: '720p',  label: '720p',  desc: 'HD, klein' },
  { id: '1080p', label: '1080p', desc: 'Full HD, empfohlen' },
  { id: '4k',    label: '4K',    desc: 'Ultra, große Datei' },
];

const FPS_OPTIONS: { id: ExportFps; label: string }[] = [
  { id: 24, label: '24 fps' },
  { id: 30, label: '30 fps' },
  { id: 60, label: '60 fps' },
];

const BITRATE_OPTIONS: { id: ExportBitrate; label: string }[] = [
  { id: '5M',  label: '5 Mbps' },
  { id: '10M', label: '10 Mbps' },
  { id: '20M', label: '20 Mbps' },
  { id: '40M', label: '40 Mbps' },
  { id: '80M', label: '80 Mbps' },
];

export function ExportSettingsModal({ visible, initialSettings, onClose, onConfirm }: Props) {
  const [settings, setSettings] = useState<ExportSettings>(initialSettings);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  // Phase A5: Feature-Locks (4K + >5M Bitrate sind Pro).
  const { unlocked: res4kUnlocked } = useFeature('export_4k');
  const { unlocked: hiBitrateUnlocked } = useFeature('export_high_bitrate');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const isResLocked = (id: ExportResolution): boolean =>
    RES_LOCK[id] === 'export_4k' && !res4kUnlocked;
  const isBitrateLocked = (id: ExportBitrate): boolean =>
    BR_LOCK[id] === 'export_high_bitrate' && !hiBitrateUnlocked;

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
                <Ionicons name="settings-outline" size={20} color="#ff1039" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Export-Einstellungen</Text>
                <Text style={styles.subtitle}>
                  Wähle Auflösung, FPS und Bitrate vor dem Render.
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#a1a1aa" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ gap: 18, paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Resolution */}
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>AUFLÖSUNG</Text>
                <View style={{ gap: 6 }}>
                  {RESOLUTION_OPTIONS.map((o) => {
                    const locked = isResLocked(o.id);
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          haptic.selection();
                          if (locked) {
                            openUpgrade('export_4k');
                            return;
                          }
                          setSettings((s) => ({ ...s, resolution: o.id }));
                        }}
                        style={({ pressed }) => [
                          styles.optionRow,
                          settings.resolution === o.id && !locked && styles.optionRowActive,
                          { opacity: pressed ? 0.7 : locked ? 0.55 : 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.radio,
                            settings.resolution === o.id && !locked && styles.radioActive,
                          ]}
                        >
                          {settings.resolution === o.id && !locked && <View style={styles.radioDot} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.optionLabel}>{o.label}</Text>
                          <Text style={styles.optionDesc}>{o.desc}</Text>
                        </View>
                        {locked && (
                          <View style={{
                            width: 22, height: 22, borderRadius: 999,
                            backgroundColor: 'rgba(255,16,57,0.85)',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ionicons name="lock-closed" size={11} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* FPS */}
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>FPS</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {FPS_OPTIONS.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => {
                        haptic.selection();
                        setSettings((s) => ({ ...s, fps: o.id }));
                      }}
                      style={({ pressed }) => [
                        styles.pill,
                        settings.fps === o.id && styles.pillActive,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          settings.fps === o.id && styles.pillTextActive,
                        ]}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Bitrate */}
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>BITRATE</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {BITRATE_OPTIONS.map((o) => {
                    const locked = isBitrateLocked(o.id);
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => {
                          haptic.selection();
                          if (locked) {
                            openUpgrade('export_high_bitrate');
                            return;
                          }
                          setSettings((s) => ({ ...s, bitrate: o.id }));
                        }}
                        style={({ pressed }) => [
                          styles.pill,
                          settings.bitrate === o.id && !locked && styles.pillActive,
                          { opacity: pressed ? 0.7 : locked ? 0.55 : 1 },
                          locked && { paddingRight: 26 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            settings.bitrate === o.id && !locked && styles.pillTextActive,
                          ]}
                        >
                          {o.label}
                        </Text>
                        {locked && (
                          <Ionicons
                            name="lock-closed"
                            size={10}
                            color="#ff1039"
                            style={{ position: 'absolute', right: 8, top: '50%', marginTop: -5 }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Save as default */}
              <Pressable
                onPress={() => {
                  haptic.selection();
                  setSaveAsDefault((v) => !v);
                }}
                style={({ pressed }) => [styles.saveDefaultRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View
                  style={[styles.checkbox, saveAsDefault && styles.checkboxActive]}
                >
                  {saveAsDefault && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.saveDefaultLabel}>Als Standard speichern</Text>
              </Pressable>
            </ScrollView>

            <Pressable
              onPress={() => {
                haptic.success();
                onConfirm(settings, saveAsDefault);
              }}
              style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="logo-tiktok" size={16} color="#fff" />
              <Text style={styles.confirmLabel}>Export starten</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
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
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
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
  title: { color: '#f1f2f2', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#71717a', fontSize: 11, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#71717a', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  optionRow: {
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
  optionRowActive: {
    backgroundColor: 'rgba(255,16,57,0.10)',
    borderColor: 'rgba(255,16,57,0.45)',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: '#ff1039' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff1039' },
  optionLabel: { color: '#f1f2f2', fontSize: 13, fontWeight: '600' },
  optionDesc: { color: '#71717a', fontSize: 11, marginTop: 1 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  pillActive: { backgroundColor: 'rgba(255,16,57,0.16)', borderColor: 'rgba(255,16,57,0.5)' },
  pillText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  pillTextActive: { color: '#ff1039' },
  saveDefaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: '#ff1039', backgroundColor: '#ff1039' },
  saveDefaultLabel: { color: '#f1f2f2', fontSize: 13, fontWeight: '600' },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ff1039',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  confirmLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

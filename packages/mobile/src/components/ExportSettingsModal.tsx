/**
 * ExportSettingsModal — vor jedem Export öffnet sich Bottom-Sheet mit
 * Auflösung / FPS / Bitrate. User confirmt → Export startet.
 *
 * Defaults aus appStore.exportSettings (Settings-Tab konfigurierbar) —
 * User kann per-Export override. Bei "Save as default" werden die
 * neuen Werte in appStore persistiert.
 *
 * Phase B3.8 (2026-05-19): Modal → absolute View (Reanimated v3 + RN-<Modal>
 * conflict im Builder verursachte App-Stuck). Plus komplett theme-aware
 * via inline-styles statt StyleSheet.create.
 */

import { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
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
import { useColors } from '../lib/theme';
import type {
  ExportBitrate,
  ExportFps,
  ExportResolution,
  ExportSettings,
} from '../stores/appStore';

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
  const colors = useColors();
  const [settings, setSettings] = useState<ExportSettings>(initialSettings);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const { unlocked: res4kUnlocked } = useFeature('export_4k');
  const { unlocked: hiBitrateUnlocked } = useFeature('export_high_bitrate');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const isResLocked = (id: ExportResolution): boolean =>
    RES_LOCK[id] === 'export_4k' && !res4kUnlocked;
  const isBitrateLocked = (id: ExportBitrate): boolean =>
    BR_LOCK[id] === 'export_high_bitrate' && !hiBitrateUnlocked;

  // Phase B3.8: Modal-Replacement (absolute View) braucht BackHandler.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        elevation: 24,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ width: '100%' }}
      >
        <View
          style={{
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
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border.strong,
              marginBottom: 14,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: 'rgba(255,16,57,0.15)',
                borderWidth: 1,
                borderColor: colors.accent.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="settings-outline" size={20} color={colors.accent.base} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>
                Export-Einstellungen
              </Text>
              <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }}>
                Wähle Auflösung, FPS und Bitrate vor dem Render.
              </Text>
            </View>
            <Pressable
              hitSlop={10}
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.bg.elevated,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ gap: 18, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Resolution */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }}>
                AUFLÖSUNG
              </Text>
              <View style={{ gap: 6 }}>
                {RESOLUTION_OPTIONS.map((o) => {
                  const locked = isResLocked(o.id);
                  const active = settings.resolution === o.id && !locked;
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
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderRadius: 12,
                        backgroundColor: active ? colors.accent.subtle : colors.bg.elevated,
                        borderWidth: 1,
                        borderColor: active ? colors.accent.border : colors.border.subtle,
                        opacity: pressed ? 0.7 : locked ? 0.55 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 1.5,
                          borderColor: active ? colors.accent.base : colors.border.strong,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && (
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: colors.accent.base,
                            }}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                          {o.label}
                        </Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 1 }}>
                          {o.desc}
                        </Text>
                      </View>
                      {locked && (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            backgroundColor: 'rgba(255,16,57,0.85)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="lock-closed" size={11} color={colors.text.onAccent} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* FPS */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }}>
                FPS
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {FPS_OPTIONS.map((o) => {
                  const active = settings.fps === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => {
                        haptic.selection();
                        setSettings((s) => ({ ...s, fps: o.id }));
                      }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active ? colors.accent.subtle : colors.bg.elevated,
                        borderWidth: 1,
                        borderColor: active ? colors.accent.border : colors.border.subtle,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? colors.accent.base : colors.text.secondary,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Bitrate */}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }}>
                BITRATE
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {BITRATE_OPTIONS.map((o) => {
                  const locked = isBitrateLocked(o.id);
                  const active = settings.bitrate === o.id && !locked;
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
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: active ? colors.accent.subtle : colors.bg.elevated,
                        borderWidth: 1,
                        borderColor: active ? colors.accent.border : colors.border.subtle,
                        opacity: pressed ? 0.7 : locked ? 0.55 : 1,
                        paddingRight: locked ? 26 : 14,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? colors.accent.base : colors.text.secondary,
                          fontSize: 12,
                          fontWeight: '600',
                        }}
                      >
                        {o.label}
                      </Text>
                      {locked && (
                        <Ionicons
                          name="lock-closed"
                          size={10}
                          color={colors.accent.base}
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
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 8,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: saveAsDefault ? colors.accent.base : colors.border.strong,
                  backgroundColor: saveAsDefault ? colors.accent.base : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {saveAsDefault && <Ionicons name="checkmark" size={14} color={colors.text.onAccent} />}
              </View>
              <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>
                Als Standard speichern
              </Text>
            </Pressable>
          </ScrollView>

          <Pressable
            onPress={() => {
              haptic.success();
              onConfirm(settings, saveAsDefault);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: colors.accent.base,
              borderRadius: 14,
              paddingVertical: 14,
              marginTop: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="logo-tiktok" size={16} color={colors.text.onAccent} />
            <Text style={{ color: colors.text.onAccent, fontSize: 14, fontWeight: '700' }}>
              Export starten
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

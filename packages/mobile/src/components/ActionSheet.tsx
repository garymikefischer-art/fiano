/**
 * ActionSheet — App-Style Modal mit BlurView, Glass-Card und Action-Buttons.
 *
 * Phase A3.9.b1 (2026-05-17): Ersetzt RN `Alert.alert` an Stellen wo wir
 * ein fiano-styled Choice-Modal wollen (statt iOS/Android-System-Alert).
 *
 * Pattern analog `UpgradeModal.tsx`:
 *  - Modal mit transparent + BlurView (40 intensity, dark tint)
 *  - Glass-Card mit fiano-Red accents
 *  - Backdrop-Tap schließt
 *
 * Usage:
 *   <ActionSheet
 *     visible={open}
 *     title="Got him - clean shot"
 *     subtitle="0:42 – 0:55 · 13s · 87%"
 *     body="short: 2 kill-phrase, 3 audio-peak"
 *     icon="sparkles"
 *     items={[
 *       { label: 'Export 9:16', icon: 'share-outline', variant: 'primary', onPress: ... },
 *       { label: 'Add to 9:16', icon: 'phone-portrait-outline', onPress: ... },
 *       { label: 'Add to Builder', icon: 'apps-outline', onPress: ... },
 *     ]}
 *     onClose={() => setOpen(false)}
 *   />
 */

import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { appAlert } from './AppAlert';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useColors, useResolvedMode, type ColorPalette } from '../lib/theme';

export interface ActionSheetItem {
  label: string;
  /** Ionicons name. Optional. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Visual style. 'primary'=filled-red, 'secondary'=outlined-red, 'destructive'=red-text, 'disabled'=greyed out. */
  variant?: 'primary' | 'secondary' | 'destructive' | 'disabled';
  /** Optional sub-label unter dem main label (z.B. "Multi-Clip unsupported"). */
  hint?: string;
  /** Callback bei Tap. ActionSheet schließt sich danach automatisch (außer disabled). */
  onPress: () => void;
}

interface Props {
  visible: boolean;
  /** Hauptüberschrift (z.B. Highlight-Name). */
  title: string;
  /** Optionale Sub-Headline (z.B. Time-Range). */
  subtitle?: string;
  /** Optionaler Body-Text (z.B. Reason). */
  body?: string;
  /** Optionales Ionicons-Icon oben im Glow-Box. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Action-Buttons. */
  items: ActionSheetItem[];
  /** Cancel-Button-Label. Default: "Cancel". */
  cancelLabel?: string;
  onClose: () => void;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  body,
  icon = 'sparkles',
  items,
  cancelLabel,
  onClose,
}: Props) {
  const colors = useColors();
  const mode = useResolvedMode();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView intensity={40} tint={mode === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Close-X */}
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            hitSlop={10}
          >
            <Ionicons name="close" size={16} color={colors.text.secondary} />
          </Pressable>

          {/* Icon im Glow-Kreis */}
          <View style={styles.iconWrapper}>
            <View style={styles.iconBox}>
              <Ionicons name={icon} size={26} color="#ff1039" />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>

          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}

          {body && (
            <Text style={styles.body} numberOfLines={3}>
              {body}
            </Text>
          )}

          {/* Action-Buttons */}
          <View style={styles.actions}>
            {items.map((item, idx) => {
              const variant = item.variant ?? (idx === 0 ? 'primary' : 'secondary');
              const isDisabled = variant === 'disabled';
              return (
                <Pressable
                  key={`action-${idx}`}
                  disabled={isDisabled}
                  onPress={() => {
                    if (isDisabled) return;
                    item.onPress();
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    variant === 'primary' && styles.actionBtnPrimary,
                    variant === 'secondary' && styles.actionBtnSecondary,
                    variant === 'destructive' && styles.actionBtnDestructive,
                    variant === 'disabled' && styles.actionBtnDisabled,
                    pressed && !isDisabled && { opacity: 0.7 },
                  ]}
                >
                  {item.icon && (
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={
                        isDisabled
                          ? '#52525b'
                          : variant === 'primary'
                            ? '#fff'
                            : variant === 'destructive'
                              ? '#ef4444'
                              : '#ff1039'
                      }
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.actionLabel,
                        variant === 'primary' && { color: '#fff' },
                        variant === 'secondary' && { color: '#ff1039' },
                        variant === 'destructive' && { color: '#ef4444' },
                        variant === 'disabled' && { color: '#52525b' },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.hint && (
                      <Text style={styles.actionHint}>{item.hint}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { backgroundColor: 'rgba(255,255,255,0.06)' },
            ]}
          >
            <Text style={styles.cancelLabel}>{cancelLabel ?? 'Cancel'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Phase B3.9 (2026-05-19): theme-aware styles.
function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.bg.backdrop,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: colors.bg.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      padding: 24,
      shadowColor: '#000',
      shadowOpacity: 0.7,
      shadowRadius: 60,
      shadowOffset: { width: 0, height: 24 },
      elevation: 16,
    },
    closeBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapper: { alignItems: 'center', marginBottom: 14 },
    iconBox: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: 'rgba(255,16,57,0.15)',
      borderWidth: 1,
      borderColor: colors.accent.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.accent.base,
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 0 },
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 4,
    },
    body: {
      fontSize: 11,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 12,
    },
    actions: { gap: 8, marginTop: 12 },
    actionBtn: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    actionBtnPrimary: {
      backgroundColor: colors.accent.base,
      shadowColor: colors.accent.base,
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    actionBtnSecondary: {
      backgroundColor: colors.accent.subtle,
      borderWidth: 1,
      borderColor: colors.accent.border,
    },
    actionBtnDestructive: {
      backgroundColor: 'rgba(239,68,68,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.35)',
    },
    actionBtnDisabled: {
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    actionLabel: { fontSize: 13, fontWeight: '700' },
    actionHint: { fontSize: 10, color: colors.text.tertiary, marginTop: 2 },
    cancelBtn: { marginTop: 6, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    cancelLabel: { fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  });
}

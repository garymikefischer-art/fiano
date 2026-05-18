/**
 * AppAlert (Phase A6.3.7 — 2026-05-18).
 *
 * Custom-Styled Replacement für RN's native Alert.alert(). Identische API,
 * aber rendert in fiano-Design (dark glass-morphism + Red-Accent) statt
 * OS-Native (weiß/grau, fremder Look).
 *
 * Usage (drop-in):
 *   import { appAlert } from '../components/AppAlert';
 *   appAlert('Title', 'Body text');
 *   appAlert('Title', 'Body', [
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'OK', onPress: () => doStuff() },
 *   ]);
 *
 * Mount-Stelle: <AppAlertHost /> einmal in App.tsx (wie UpgradeModal).
 */

import { create } from 'zustand';
import { Modal, Pressable, Text, View } from 'react-native';

import { useColors, useResolvedMode } from '../lib/theme';

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AppAlertState {
  visible: boolean;
  title: string;
  body?: string;
  buttons: AppAlertButton[];
  show: (title: string, body?: string, buttons?: AppAlertButton[]) => void;
  dismiss: () => void;
}

const useAppAlertStore = create<AppAlertState>((set) => ({
  visible: false,
  title: '',
  body: undefined,
  buttons: [],
  show: (title, body, buttons) =>
    set({
      visible: true,
      title,
      body,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    }),
  dismiss: () => set({ visible: false }),
}));

/**
 * Drop-in replacement für Alert.alert(). Selbe Signatur. Stylet sich
 * automatisch in fiano-Design.
 */
export function appAlert(
  title: string,
  body?: string,
  buttons?: AppAlertButton[],
): void {
  useAppAlertStore.getState().show(title, body, buttons);
}

/**
 * Host-Component. Einmal in App.tsx mounten (z.B. neben <UpgradeModal />).
 */
export function AppAlertHost() {
  const visible = useAppAlertStore((s) => s.visible);
  const title = useAppAlertStore((s) => s.title);
  const body = useAppAlertStore((s) => s.body);
  const buttons = useAppAlertStore((s) => s.buttons);
  const dismiss = useAppAlertStore((s) => s.dismiss);
  // Phase B3 (2026-05-18): theme-aware card-surface + text.
  const colors = useColors();
  const mode = useResolvedMode();

  const onPressBtn = (btn: AppAlertButton) => {
    dismiss();
    // Defer button handler bis nach dismiss-Animation startet, sonst
    // race condition wenn handler navigiert.
    setTimeout(() => btn.onPress?.(), 50);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
        onPress={dismiss}
      >
        <Pressable
          // inner Pressable mit onPress no-op verhindert dismiss bei
          // Tap auf Card selber (nur Background-Tap dismissed).
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: mode === 'dark' ? '#1a0c12' : colors.bg.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.accent.border,
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
            overflow: 'hidden',
          }}
        >
          {/* Content */}
          <View style={{ padding: 20, gap: 8 }}>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: -0.2,
              }}
            >
              {title}
            </Text>
            {body && (
              <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19 }}>
                {body}
              </Text>
            )}
          </View>

          {/* Button-Row */}
          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: colors.border.subtle,
            }}
          >
            {buttons.map((btn, i) => {
              const isLast = i === buttons.length - 1;
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <Pressable
                  key={i}
                  onPress={() => onPressBtn(btn)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.bg.elevated : 'transparent',
                    borderRightWidth: isLast ? 0 : 1,
                    borderRightColor: colors.border.subtle,
                  })}
                >
                  <Text
                    style={{
                      color: isDestructive
                        ? colors.accent.base
                        : isCancel
                          ? colors.text.secondary
                          : colors.accent.base,
                      fontSize: 14,
                      fontWeight: isDestructive || !isCancel ? '700' : '500',
                    }}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * UrlPromptModal — wiederverwendbares YouTube/Twitch-URL-Eingabe-Popup im
 * AppAlert-Look (2026-06-08). Genutzt im „Add video"-Flow von
 * AddVideoProjectScreen (neues Projekt) und ProjectDetailScreen (Source zum
 * bestehenden Projekt). Visuell identisch zu AppAlert (dunkle Card, Red-Accent-
 * Border, border-getrennte Button-Row) plus Eingabefeld + optionaler Download-
 * Progress.
 */

import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { useColors, useResolvedMode } from '../lib/theme';
import { useT } from '../lib/i18n';

export interface UrlPromptModalProps {
  visible: boolean;
  url: string;
  onChangeUrl: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  phase: 'requesting' | 'downloading' | null;
  progress: number;
}

export function UrlPromptModal({
  visible,
  url,
  onChangeUrl,
  onSubmit,
  onClose,
  busy,
  phase,
  progress,
}: UrlPromptModalProps) {
  const colors = useColors();
  const mode = useResolvedMode();
  const t = useT();
  const canSubmit = !busy && url.trim().length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
        onPress={() => {
          if (!busy) onClose();
        }}
      >
        <Pressable
          // innerer Pressable absorbiert Taps auf die Card (nur Backdrop schließt)
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
          <View style={{ padding: 20, gap: 12 }}>
            <Text
              style={{
                color: colors.text.primary,
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: -0.2,
              }}
            >
              {t('addProject.urlModalTitle', 'Paste a YouTube / Twitch link')}
            </Text>
            <View
              style={{
                backgroundColor: colors.bg.primary,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border.subtle,
                paddingHorizontal: 14,
              }}
            >
              <TextInput
                value={url}
                onChangeText={onChangeUrl}
                placeholder={t('addProject.urlPlaceholder', 'YouTube / Twitch URL…')}
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                editable={!busy}
                onSubmitEditing={() => {
                  if (canSubmit) onSubmit();
                }}
                style={{ color: colors.text.primary, fontSize: 14, paddingVertical: 13 }}
              />
            </View>
            {busy && phase && (
              <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                {phase === 'requesting'
                  ? t('addProject.urlPhaseRequesting', 'Server downloading from YouTube/Twitch…')
                  : t(
                      'addProject.urlPhaseDownloading',
                      `Downloading to phone… ${Math.round(progress * 100)}%`,
                    )}
              </Text>
            )}
          </View>

          {/* Button-Row (AppAlert-Stil: border-getrennt, full-width) */}
          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: colors.border.subtle,
            }}
          >
            <Pressable
              onPress={() => {
                if (!busy) onClose();
              }}
              disabled={busy}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.bg.elevated : 'transparent',
                borderRightWidth: 1,
                borderRightColor: colors.border.subtle,
                opacity: busy ? 0.5 : 1,
              })}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 14, fontWeight: '500' }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (canSubmit) onSubmit();
              }}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 13,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.bg.elevated : 'transparent',
                opacity: canSubmit ? 1 : 0.5,
              })}
            >
              <Text style={{ color: colors.accent.base, fontSize: 14, fontWeight: '700' }}>
                {busy ? t('common.busy', 'Working…') : t('addProject.importButton', 'Import')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

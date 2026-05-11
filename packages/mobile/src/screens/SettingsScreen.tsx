/**
 * SettingsScreen — Mobile-Pendant zur Desktop SettingsPage (gekürzt).
 * Ziel der Avatar-Pressables aus Home/Library/ComingSoon/ProjectDetail.
 *
 * Sektionen:
 *  - Account: Avatar, Email, Plan-Badge, Manage / Upgrade-CTA
 *  - Preferences: Sprache (Picker stub), Notifications (Toggle stub)
 *  - About: App-Version, Build-Channel
 *  - Sign out (destructive)
 *  - Delete account (destructive, mit Confirm-Alert)
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { useAuthStore } from '../stores/authStore';
import {
  useAppStore,
  type ExportFps,
  type ExportResolution,
  type ExportBitrate,
} from '../stores/appStore';
import { BackgroundGlow } from '../components/BackgroundGlow';
import { RegionPreview } from '../components/RegionPreview';
import { RegionPickerModal } from '../components/RegionPickerModal';
import { haptic } from '../lib/haptics';
import { useT, useLanguage, LANGUAGES } from '../lib/i18n';
import { ensureNotificationPermissions, scheduleLocalNotification } from '../lib/pushNotifications';
import * as sounds from '../lib/sounds';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const facecamRegion = useAppStore((s) => s.facecamRegion);
  const gameplayRegion = useAppStore((s) => s.gameplayRegion);
  const setFacecamRegion = useAppStore((s) => s.setFacecamRegion);
  const setGameplayRegion = useAppStore((s) => s.setGameplayRegion);
  const openaiKey = useAppStore((s) => s.openaiKey);
  const geminiKey = useAppStore((s) => s.geminiKey);
  const setOpenaiKey = useAppStore((s) => s.setOpenaiKey);
  const setGeminiKey = useAppStore((s) => s.setGeminiKey);
  const exportSettings = useAppStore((s) => s.exportSettings);
  const setExportSettings = useAppStore((s) => s.setExportSettings);
  const [openaiInput, setOpenaiInput] = useState(openaiKey);
  const [geminiInput, setGeminiInput] = useState(geminiKey);
  const [openaiVisible, setOpenaiVisible] = useState(false);
  const [geminiVisible, setGeminiVisible] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(!sounds.isMuted());
  const [regionModalVisible, setRegionModalVisible] = useState(false);

  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  const planLabel = subscription?.plan === 'creator'
    ? t('settings.account.planCreator')
    : subscription?.plan === 'pro'
      ? t('settings.account.planPro')
      : subscription?.plan === 'studio_lifetime'
        ? t('settings.account.planLifetime')
        : t('settings.account.planNone');
  const planBadge = subscription?.plan === 'creator'
    ? 'Creator'
    : subscription?.plan === 'pro'
      ? 'Pro'
      : subscription?.plan === 'studio_lifetime'
        ? 'Lifetime'
        : 'Free';

  const version = (Constants.expoConfig?.version ?? '0.0.1') as string;
  const currentLangCode = useLanguage();
  const currentLangName = LANGUAGES.find((l) => l.code === currentLangCode)?.nativeName ?? 'English';

  const onSignOut = () => {
    Alert.alert(
      t('settings.account.signOutTitle'),
      t('settings.account.signOutBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.account.signOut'), style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert(
      t('settings.account.deleteConfirmTitle'),
      t('settings.account.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.deleteFinal'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              // Auth-State-Change im Root-Navigator routet automatisch zur LoginScreen.
            } catch (err: any) {
              Alert.alert(
                t('settings.account.deleteFailedTitle', 'Deletion failed'),
                err?.message ?? String(err),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={18} color="#f1f2f2" />
        </Pressable>
        <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>{t('settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 8, gap: 18 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account-Card */}
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 18,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#ff1039',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{initial}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ color: '#f1f2f2', fontSize: 15, fontWeight: '700' }}>
                {user?.email ?? 'Signed in'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,16,57,0.15)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,16,57,0.4)',
                  }}
                >
                  <Text style={{ color: '#ff1039', fontSize: 10, fontWeight: '700' }}>{planBadge}</Text>
                </View>
                <Text style={{ color: '#71717a', fontSize: 11 }}>{planLabel}</Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => nav.navigate('Pricing')}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              borderRadius: 12,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            })}
          >
            <Ionicons name="rocket-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {subscription?.plan
                ? t('settings.account.manageBilling')
                : t('settings.account.upgradeToPro')}
            </Text>
          </Pressable>
        </View>

        {/* Preferences-Group */}
        <SectionLabel>{t('settings.preferencesHeading', 'PREFERENCES').toUpperCase()}</SectionLabel>
        <Group>
          <Row
            icon="language-outline"
            label={t('settings.languageHeading')}
            value={currentLangName}
            onPress={() => nav.navigate('LanguagePicker')}
          />
          <Divider />
          <Row
            icon="notifications-outline"
            label={t('topBar.notifications')}
            right={
              <Switch
                value={notifEnabled}
                onValueChange={async (next) => {
                  if (next) {
                    const status = await ensureNotificationPermissions();
                    if (status === 'granted') {
                      setNotifEnabled(true);
                    } else {
                      setNotifEnabled(false);
                      Alert.alert(
                        t('settings.notifsBlockedTitle', 'Notifications blocked'),
                        t(
                          'settings.notifsBlockedBody',
                          'Enable notifications for fiano in System Settings to get export + analyze updates.',
                        ),
                      );
                    }
                  } else {
                    setNotifEnabled(false);
                  }
                }}
                trackColor={{ true: '#ff1039', false: '#3f3f46' }}
                thumbColor="#fff"
              />
            }
          />
          <Divider />
          <Row
            icon="musical-note-outline"
            label={t('settings.sounds', 'Sounds')}
            right={
              <Switch
                value={soundsEnabled}
                onValueChange={async (next) => {
                  setSoundsEnabled(next);
                  await sounds.setMuted(!next);
                  if (next) sounds.notify(); // kleine Quittung beim Anschalten
                }}
                trackColor={{ true: '#ff1039', false: '#3f3f46' }}
                thumbColor="#fff"
              />
            }
          />
          <Divider />
          <Row
            icon="paper-plane-outline"
            label={t('settings.sendTestNotification', 'Send test notification')}
            onPress={async () => {
              const id = await scheduleLocalNotification({
                title: 'fiano',
                body: t('settings.testNotifBody', 'This is what an export-complete ping looks like.'),
                delaySec: 2,
              });
              if (!id) {
                Alert.alert(
                  t('settings.notifsBlockedTitle', 'Notifications blocked'),
                  t(
                    'settings.notifsBlockedBody',
                    'Enable notifications for fiano in System Settings to get export + analyze updates.',
                  ),
                );
              }
            }}
          />
        </Group>

        {/* Capture Regions — analog Desktop Settings → Appearance / Capture */}
        <SectionLabel>{t('settings.captureHeading', 'CAPTURE REGIONS').toUpperCase()}</SectionLabel>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            lineHeight: 15,
            marginTop: -8,
          }}
        >
          {t(
            'settings.captureDescription',
            'Default positions applied to every new 9:16 export. Override per project in the 9:16 tab.',
          )}
        </Text>

        <Pressable
          onPress={() => {
            haptic.medium();
            setRegionModalVisible(true);
          }}
          style={({ pressed }) => ({
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <RegionPreview facecam={facecamRegion} gameplay={gameplayRegion} width={108} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700' }}>
              {t('settings.captureLivePreview', 'Edit regions')}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 11, lineHeight: 16 }}>
              {t(
                'settings.captureLegend',
                'Upload a test clip + drag the red & blue boxes for pixel-precise control.',
              )}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#52525b" />
        </Pressable>

        {/* API Keys */}
        <SectionLabel>{t('settings.apiKeysHeading', 'API KEYS').toUpperCase()}</SectionLabel>
        <Text style={{ color: '#71717a', fontSize: 11, lineHeight: 15, marginTop: -8 }}>
          {t(
            'settings.apiKeysDescription',
            'Stored encrypted in device secure-store. Required for Podcast Highlights (OpenAI) and Thumbnail generation (Gemini).',
          )}
        </Text>

        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <ApiKeyRow
            label={t('settings.openaiKey', 'OpenAI key')}
            value={openaiInput}
            onChange={setOpenaiInput}
            onSave={() => setOpenaiKey(openaiInput.trim())}
            onClear={() => {
              setOpenaiInput('');
              void setOpenaiKey('');
            }}
            visible={openaiVisible}
            onToggleVisible={() => setOpenaiVisible((v) => !v)}
            saved={openaiKey}
          />
          <Divider />
          <ApiKeyRow
            label={t('settings.geminiKey', 'Gemini key')}
            value={geminiInput}
            onChange={setGeminiInput}
            onSave={() => setGeminiKey(geminiInput.trim())}
            onClear={() => {
              setGeminiInput('');
              void setGeminiKey('');
            }}
            visible={geminiVisible}
            onToggleVisible={() => setGeminiVisible((v) => !v)}
            saved={geminiKey}
          />
        </View>

        {/* Export-Settings */}
        <SectionLabel>{t('settings.exportHeading', 'EXPORT DEFAULTS').toUpperCase()}</SectionLabel>
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 14,
            gap: 12,
          }}
        >
          <ExportPickerRow
            label={t('settings.fpsLabel', 'FPS')}
            options={[24, 30, 60] as ExportFps[]}
            value={exportSettings.fps}
            format={(v) => `${v}`}
            onPick={(v) => {
              haptic.selection();
              void setExportSettings({ ...exportSettings, fps: v });
            }}
          />
          <ExportPickerRow
            label={t('settings.resolutionLabel', 'Resolution')}
            options={['720p', '1080p', '4k'] as ExportResolution[]}
            value={exportSettings.resolution}
            format={(v) => v}
            onPick={(v) => {
              haptic.selection();
              void setExportSettings({ ...exportSettings, resolution: v });
            }}
          />
          <ExportPickerRow
            label={t('settings.bitrateLabel', 'Bitrate')}
            options={['5M', '10M', '20M', '40M', '80M'] as ExportBitrate[]}
            value={exportSettings.bitrate}
            format={(v) => v.replace('M', ' Mbps')}
            onPick={(v) => {
              haptic.selection();
              void setExportSettings({ ...exportSettings, bitrate: v });
            }}
          />
        </View>

        {/* About-Group */}
        <SectionLabel>{t('settings.aboutHeading', 'ABOUT').toUpperCase()}</SectionLabel>
        <Group>
          <Row
            icon="information-circle-outline"
            label={t('settings.versionLabel', 'Version')}
            value={version}
          />
          <Divider />
          <Row
            icon="help-circle-outline"
            label={t('topBar.helpAbout', 'Help & Support')}
            onPress={() => nav.navigate('Help')}
          />
          <Divider />
          <Row
            icon="document-text-outline"
            label={t('settings.privacyTerms', 'Privacy & Terms')}
            onPress={() => nav.navigate('Legal')}
          />
          <Divider />
          <Row
            icon="play-circle-outline"
            label={t('settings.replayIntro', 'Replay introduction')}
            onPress={() => void resetOnboarding()}
          />
        </Group>

        {/* Destructive */}
        <SectionLabel>{t('settings.sectionAccount').toUpperCase()}</SectionLabel>
        <Group>
          <Row
            icon="log-out-outline"
            label={t('settings.account.signOut')}
            tone="warn"
            onPress={onSignOut}
          />
          <Divider />
          <Row
            icon="trash-outline"
            label={t('settings.account.deleteTitle')}
            tone="danger"
            onPress={onDelete}
          />
        </Group>

        <Text style={{ color: '#52525b', fontSize: 11, textAlign: 'center', marginTop: 6 }}>
          fiano · v{version}
        </Text>
      </ScrollView>

      <RegionPickerModal
        visible={regionModalVisible}
        initialFacecam={facecamRegion}
        initialGameplay={gameplayRegion}
        onClose={() => setRegionModalVisible(false)}
        onSave={(fc, gp) => {
          void setFacecamRegion(fc);
          void setGameplayRegion(gp);
          setRegionModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

function ApiKeyRow({
  label,
  value,
  onChange,
  onSave,
  onClear,
  visible,
  onToggleVisible,
  saved,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  onSave: () => void;
  onClear: () => void;
  visible: boolean;
  onToggleVisible: () => void;
  saved: string;
}) {
  const isStored = saved.length > 0;
  const dirty = value.trim() !== saved;
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '600' }}>{label}</Text>
        {isStored && (
          <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: '700' }}>● saved</Text>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(0,0,0,0.25)',
          borderRadius: 8,
          paddingHorizontal: 10,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="sk-…"
          placeholderTextColor="#52525b"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!visible}
          style={{ flex: 1, color: '#f1f2f2', fontSize: 12, paddingVertical: 8 }}
        />
        <Pressable onPress={onToggleVisible} hitSlop={6} style={{ padding: 4 }}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={14} color="#71717a" />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onSave}
          disabled={!dirty || !value.trim()}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: !dirty || !value.trim()
              ? 'rgba(255,255,255,0.04)'
              : pressed
                ? '#cc0d2e'
                : '#ff1039',
            alignItems: 'center',
            opacity: !dirty || !value.trim() ? 0.5 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Save</Text>
        </Pressable>
        {isStored && (
          <Pressable
            onPress={onClear}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: '#a1a1aa', fontSize: 11, fontWeight: '700' }}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ExportPickerRow<T extends string | number>({
  label,
  options,
  value,
  format,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#71717a', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={String(opt)}
              onPress={() => onPick(opt)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: active ? 'rgba(255,16,57,0.16)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: active ? 'rgba(255,16,57,0.4)' : 'rgba(255,255,255,0.08)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  color: active ? '#ff1039' : '#f1f2f2',
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {format(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: '#a1a1aa',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginTop: 2,
      }}
    >
      {children}
    </Text>
  );
}


function Group({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 48 }} />;
}

function Row({
  icon,
  label,
  value,
  right,
  onPress,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const labelColor = tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#fbbf24' : '#f1f2f2';
  const iconColor = tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#fbbf24' : '#a1a1aa';

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14 }}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={{ flex: 1, color: labelColor, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      {right ?? (value ? (
        <Text style={{ color: '#71717a', fontSize: 13 }}>{value}</Text>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color="#52525b" />
      ) : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

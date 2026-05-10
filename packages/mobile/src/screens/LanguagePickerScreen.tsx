/**
 * LanguagePickerScreen — Modal-Sheet mit allen 9 unterstützten Sprachen.
 * Tap auf eine Zeile setzt die Sprache (persistent via expo-secure-store)
 * und schließt das Modal. Live-Switch — alle useT()-Consumer re-rendern sofort.
 */

import { Pressable, ScrollView, Text, View, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { LANGUAGES, useLanguage, setLanguage, useT, type LanguageCode } from '../lib/i18n';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'LanguagePicker'>;

export function LanguagePickerScreen() {
  const nav = useNavigation<Nav>();
  const t = useT();
  const current = useLanguage();

  const onSelect = (code: LanguageCode) => {
    setLanguage(code);
    nav.goBack();
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
        <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>
          {t('settings.languageHeading', 'Language')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8, gap: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            borderRadius: 16,
            overflow: 'hidden',
            marginTop: 8,
          }}
        >
          {LANGUAGES.map((lang, i) => {
            const active = lang.code === current;
            return (
              <View key={lang.code}>
                {i > 0 && (
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 16 }} />
                )}
                <Pressable
                  onPress={() => onSelect(lang.code)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 22,
                        borderRadius: 4,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.10)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#a1a1aa', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 }}>
                        {lang.code.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, color: '#f1f2f2', fontSize: 14, fontWeight: '600' }}>
                      {lang.nativeName}
                    </Text>
                    {active && <Ionicons name="checkmark" size={20} color="#ff1039" />}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={{ color: '#71717a', fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 16 }}>
          Strings kommen aus @fiano/shared/i18n — gleiche Quelle wie auf Desktop.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

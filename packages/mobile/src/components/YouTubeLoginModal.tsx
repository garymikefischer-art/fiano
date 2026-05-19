/**
 * YouTube Login Modal (Phase 9.5.8.3) — In-App-WebView mit dem User loggt sich
 * in seinem YouTube-Account ein. Nach Erfolg werden die Cookies aus dem WebView-
 * Cookie-Jar (inkl. HttpOnly) via @react-native-cookies/cookies ausgelesen,
 * ins Netscape-Format konvertiert und im appStore gespeichert. yt-dlp nutzt
 * sie dann beim Server-Download für Bot-Detection-Bypass.
 *
 * Caveat: Google blockt in-app WebViews seit 2021 oft mit "Couldn't sign you
 * in - this browser may not be secure". Workaround: Desktop-Chrome User-Agent.
 * Wenn das nicht klappt → Manual-Paste-Fallback in Settings.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';

import { useAppStore } from '../stores/appStore';
import { useT } from '../lib/i18n';
import { haptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Wird nach erfolgreichem Save aufgerufen. */
  onSaved?: () => void;
}

const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/';
const YT_HOME_URL = 'https://www.youtube.com/';

// Desktop-Chrome-UA — Google blockt "in-app webview"-UAs ("Couldn't sign you in").
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function YouTubeLoginModal({ visible, onClose, onSaved }: Props) {
  const t = useT();
  const setYoutubeCookies = useAppStore((s) => s.setYoutubeCookies);
  const [reachedYouTube, setReachedYouTube] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNavStateChange = (state: WebViewNavigation) => {
    // Nach Login redirected Google zu youtube.com. Der "I'm signed in"-Button
    // wird erst sichtbar wenn wir auf youtube.com sind.
    const url = state.url;
    const isYouTube = /^https?:\/\/(www\.|m\.)?youtube\.com\//i.test(url);
    if (isYouTube && !state.loading) {
      setReachedYouTube(true);
    }
  };

  const captureCookies = async () => {
    setBusy(true);
    setError(null);
    try {
      // CookieManager.get(url, useWebKit=true) liest cookies inkl. HttpOnly aus
      // dem WebView-Jar. useWebKit=true ist iOS-only, wird auf Android ignoriert.
      const cookies = await CookieManager.get(YT_HOME_URL, true);
      const entries = Object.entries(cookies);
      if (entries.length === 0) {
        throw new Error(
          t(
            'youtubeLogin.noCookies',
            'No cookies found. Please sign in to YouTube first.',
          ),
        );
      }

      // Netscape-Format: # Netscape HTTP Cookie File
      //   domain  includeSubdomains  path  secure  expires  name  value
      const lines: string[] = ['# Netscape HTTP Cookie File'];
      const now = Math.floor(Date.now() / 1000);
      const oneYear = 60 * 60 * 24 * 365;
      for (const [name, c] of entries) {
        const domain = c.domain ?? '.youtube.com';
        const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const path = c.path ?? '/';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        let expires = now + oneYear;
        if (c.expires) {
          const parsed = new Date(c.expires).getTime();
          if (!Number.isNaN(parsed)) expires = Math.floor(parsed / 1000);
        }
        // yt-dlp tolerates value with spaces, no escaping needed.
        lines.push(
          `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expires}\t${name}\t${c.value}`,
        );
      }
      const netscape = lines.join('\n');
      await setYoutubeCookies(netscape);
      haptic.success();
      onSaved?.();
      onClose();
    } catch (err: any) {
      haptic.error();
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomColor: 'rgba(255,255,255,0.06)',
            borderBottomWidth: 1,
          }}
        >
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close" size={22} color="#f1f2f2" />
          </Pressable>
          <Text
            style={{ flex: 1, color: '#f1f2f2', fontSize: 14, fontWeight: '700' }}
            numberOfLines={1}
          >
            {t('youtubeLogin.title', 'Sign in to YouTube')}
          </Text>
          {reachedYouTube && !busy && (
            <Pressable
              onPress={captureCookies}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
              })}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {t('youtubeLogin.done', "I'm signed in")}
              </Text>
            </Pressable>
          )}
        </View>

        {/* WebView */}
        <WebView
          source={{ uri: LOGIN_URL }}
          userAgent={DESKTOP_UA}
          onNavigationStateChange={onNavStateChange}
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          domStorageEnabled
          incognito={false}
          startInLoadingState
          renderLoading={() => (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0d0509',
              }}
            >
              <ActivityIndicator color="#ff1039" size="large" />
            </View>
          )}
          style={{ flex: 1, backgroundColor: '#fff' }}
        />

        {/* Status-Footer */}
        {(busy || error) && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderTopColor: 'rgba(255,255,255,0.06)',
              borderTopWidth: 1,
            }}
          >
            {busy && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#ff1039" />
                <Text style={{ color: '#a1a1aa', fontSize: 12 }}>
                  {t('youtubeLogin.capturing', 'Capturing cookies…')}
                </Text>
              </View>
            )}
            {error && (
              <Text style={{ color: '#ef4444', fontSize: 11, lineHeight: 15 }}>
                {error}
              </Text>
            )}
          </View>
        )}

        {/* Hint-Footer */}
        {!reachedYouTube && !busy && !error && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderTopColor: 'rgba(255,255,255,0.06)',
              borderTopWidth: 1,
            }}
          >
            <Text style={{ color: '#71717a', fontSize: 11, lineHeight: 15 }}>
              {t(
                'youtubeLogin.hint',
                "Sign in with your YouTube account. Once you land on youtube.com, the 'I'm signed in' button appears at the top.",
              )}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

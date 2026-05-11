/**
 * ThumbnailGeneratorScreen (Phase 9.8) — Mobile-Port der Desktop ThumbnailPage.
 *
 * UI:
 *  - Header: project.title + Close-Button
 *  - Genre-Chips: 4 Optionen (Battle Royale, Modern Combat, Tactical Shooter, Custom)
 *  - 3 Prompt-Fields: Background, Effects, Weapons/Skins
 *  - Reference-Image-Picker (optional)
 *  - Generate-Button (mit Spinner während API-Call)
 *  - Latest Generated-Image-Preview + Save-to-Camera-Roll
 *  - History-Gallery: alle generated thumbnails von diesem Project
 *
 * Generic Genres ohne Markennamen (Markenrechts-Verantwortung beim User wenn er
 * Custom-Game-Name eintippt). Analog Desktop-Pattern.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { BackgroundGlow } from '../components/BackgroundGlow';
import { useProject, useProjectsStore, flushProjectsNow } from '../stores/projectsStore';
import { useAppStore } from '../stores/appStore';
import { generateThumbnail } from '../lib/gemini';
import { haptic } from '../lib/haptics';
import { useT } from '../lib/i18n';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ThumbnailGenerator'>;
type R = RouteProp<RootStackParamList, 'ThumbnailGenerator'>;

type Genre = 'custom' | 'battle_royale' | 'modern_combat' | 'tactical_shooter' | 'competitive_fps';

const GENRE_OPTIONS: { id: Genre; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'battle_royale', label: 'Battle Royale', icon: 'rocket-outline' },
  { id: 'modern_combat', label: 'Modern Combat', icon: 'shield-outline' },
  { id: 'tactical_shooter', label: 'Tactical', icon: 'locate-outline' },
  { id: 'competitive_fps', label: 'Competitive', icon: 'medal-outline' },
  { id: 'custom', label: 'Custom', icon: 'sparkles-outline' },
];

// Generic Placeholders ohne Markennamen — analog Desktop FIELD_PLACEHOLDERS.
const FIELD_PLACEHOLDERS: Record<Genre, { background: string; effects: string; weapons: string }> = {
  custom: {
    background: 'daylight, describe the scene, depth of field',
    effects: 'Strong rim light, glow, volumetric particles, cinematic',
    weapons: 'objects in hand / weapons',
  },
  battle_royale: {
    background: 'daylight, desert buildings, gas clouds spreading, debris, depth of field',
    effects: 'Strong rim light, toxic yellow glow, volumetric gas, cinematic',
    weapons: 'futuristic rifle with skin',
  },
  modern_combat: {
    background: 'daylight, war-torn urban area, smoke grenade, gas clouds, debris, depth of field',
    effects: 'Strong rim light, green tactical glow, volumetric smoke, cinematic',
    weapons: 'tactical assault rifle in hand',
  },
  tactical_shooter: {
    background: 'sci-fi map control point, ability burst, particles, depth of field',
    effects: 'Strong rim light, teal ability glow, volumetric light, cinematic',
    weapons: 'glowing ability orb',
  },
  competitive_fps: {
    background: 'desert site, smoke + muzzle flash, debris, depth of field',
    effects: 'Strong rim light, dark contrast, sparks, dust, cinematic',
    weapons: 'iconic sniper rifle / pistol',
  },
};

function buildPrompt(genre: Genre, fields: { background: string; effects: string; weapons: string }, customGameName: string): string {
  const game = genre === 'custom' && customGameName.trim() ? customGameName.trim() : 'a competitive online game';
  return `Photorealistic YouTube thumbnail for ${game}.
Scene: ${fields.background.trim() || FIELD_PLACEHOLDERS[genre].background}
Effects: ${fields.effects.trim() || FIELD_PLACEHOLDERS[genre].effects}
Foreground: ${fields.weapons.trim() || FIELD_PLACEHOLDERS[genre].weapons}
Style: 16:9 aspect ratio, high detail, dramatic lighting, depth of field, eye-catching, clickable, no text overlay.`;
}

export function ThumbnailGeneratorScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const t = useT();
  const project = useProject(route.params.projectId);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const geminiKey = useAppStore((s) => s.geminiKey);

  const [genre, setGenre] = useState<Genre>('battle_royale');
  const [background, setBackground] = useState('');
  const [effects, setEffects] = useState('');
  const [weapons, setWeapons] = useState('');
  const [customGameName, setCustomGameName] = useState('');
  const [refImageBase64, setRefImageBase64] = useState<string | null>(null);
  const [refImageUri, setRefImageUri] = useState<string | null>(null);
  const [refMime, setRefMime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [latestUri, setLatestUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const history = project?.thumbnailHistory ?? [];
  const placeholders = FIELD_PLACEHOLDERS[genre];

  const pickReferenceImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to pick a reference image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setRefImageUri(asset.uri);
    setRefImageBase64(asset.base64 ?? null);
    setRefMime(asset.mimeType ?? 'image/jpeg');
    haptic.success();
  };

  const onGenerate = async () => {
    if (!project) return;
    if (!geminiKey?.trim()) {
      Alert.alert(
        'Gemini API key required',
        'Set your Gemini API key in Settings → API Keys first.',
      );
      return;
    }
    haptic.medium();
    setBusy(true);
    setErrorMsg(null);
    try {
      const prompt = buildPrompt(genre, { background, effects, weapons }, customGameName);
      const result = await generateThumbnail({
        prompt,
        projectId: project.id,
        referenceImageBase64: refImageBase64 ?? undefined,
        referenceMime: refMime ?? undefined,
      });
      setLatestUri(result.uri);
      // Persist in project.thumbnailHistory.
      const nextHistory = [result.uri, ...(project.thumbnailHistory ?? [])].slice(0, 30);
      updateProject(project.id, { thumbnailHistory: nextHistory });
      await flushProjectsNow();
      haptic.success();
    } catch (err: any) {
      haptic.error();
      setErrorMsg(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveToGallery = async (uri: string) => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Allow photo library access to save thumbnails.');
        return;
      }
      await MediaLibrary.createAssetAsync(uri);
      haptic.success();
      Alert.alert('Saved', 'Thumbnail saved to gallery.');
    } catch (e: any) {
      haptic.error();
      Alert.alert('Save failed', e?.message ?? String(e));
    }
  };

  const deleteFromHistory = (uri: string) => {
    if (!project) return;
    haptic.warning();
    Alert.alert('Delete thumbnail', 'Remove this thumbnail from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const next = (project.thumbnailHistory ?? []).filter((u) => u !== uri);
          updateProject(project.id, { thumbnailHistory: next });
          await flushProjectsNow();
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          if (latestUri === uri) setLatestUri(null);
        },
      },
    ]);
  };

  if (!project) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>Project not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <BackgroundGlow />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
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
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={18} color="#f1f2f2" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#f1f2f2', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            Thumbnail Generator
          </Text>
          <Text style={{ color: '#71717a', fontSize: 11 }} numberOfLines={1}>
            {project.title}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 18 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!geminiKey?.trim() && (
          <View
            style={{
              backgroundColor: 'rgba(251,191,36,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(251,191,36,0.32)',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>
              ⚠ Gemini API key required
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 11, marginTop: 4 }}>
              Set it in Settings → API Keys before generating thumbnails.
            </Text>
          </View>
        )}

        {/* Genre Chips */}
        <View style={{ gap: 8 }}>
          <Text style={SECTION_LABEL}>GAME TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {GENRE_OPTIONS.map((g) => {
              const active = genre === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    haptic.selection();
                    setGenre(g.id);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: active
                      ? 'rgba(255,16,57,0.16)'
                      : pressed
                        ? 'rgba(255,255,255,0.10)'
                        : 'rgba(255,255,255,0.04)',
                    borderWidth: 1,
                    borderColor: active ? 'rgba(255,16,57,0.45)' : 'rgba(255,255,255,0.08)',
                  })}
                >
                  <Ionicons name={g.icon} size={14} color={active ? '#ff1039' : '#a1a1aa'} />
                  <Text
                    style={{
                      color: active ? '#ff1039' : '#f1f2f2',
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {genre === 'custom' && (
          <View style={{ gap: 6 }}>
            <Text style={SECTION_LABEL}>CUSTOM GAME NAME</Text>
            <TextInput
              value={customGameName}
              onChangeText={setCustomGameName}
              placeholder="e.g. Fortnite, Warzone, Valorant — type your own"
              placeholderTextColor="#52525b"
              style={INPUT_STYLE}
            />
            <Text style={{ color: '#71717a', fontSize: 10, lineHeight: 14 }}>
              Using a real game name? You are responsible for trademark compliance.
            </Text>
          </View>
        )}

        {/* Prompt-Fields */}
        <View style={{ gap: 6 }}>
          <Text style={SECTION_LABEL}>BACKGROUND</Text>
          <TextInput
            value={background}
            onChangeText={setBackground}
            placeholder={placeholders.background}
            placeholderTextColor="#52525b"
            multiline
            style={[INPUT_STYLE, MULTILINE_STYLE]}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={SECTION_LABEL}>EFFECTS</Text>
          <TextInput
            value={effects}
            onChangeText={setEffects}
            placeholder={placeholders.effects}
            placeholderTextColor="#52525b"
            multiline
            style={[INPUT_STYLE, MULTILINE_STYLE]}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={SECTION_LABEL}>WEAPONS / SKINS / FOREGROUND</Text>
          <TextInput
            value={weapons}
            onChangeText={setWeapons}
            placeholder={placeholders.weapons}
            placeholderTextColor="#52525b"
            multiline
            style={[INPUT_STYLE, MULTILINE_STYLE]}
          />
        </View>

        {/* Reference Image (optional) */}
        <View style={{ gap: 6 }}>
          <Text style={SECTION_LABEL}>REFERENCE IMAGE (OPTIONAL)</Text>
          {refImageUri ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: 'rgba(255,255,255,0.04)',
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Image
                source={{ uri: refImageUri }}
                style={{ width: 60, height: 60, borderRadius: 8 }}
                resizeMode="cover"
              />
              <Text style={{ flex: 1, color: '#a1a1aa', fontSize: 11 }}>
                Reference will guide style + composition.
              </Text>
              <Pressable
                onPress={() => {
                  setRefImageUri(null);
                  setRefImageBase64(null);
                  setRefMime(null);
                  haptic.selection();
                }}
                hitSlop={6}
              >
                <Ionicons name="close-circle" size={20} color="#a1a1aa" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={pickReferenceImage}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                borderStyle: 'dashed',
              })}
            >
              <Ionicons name="image-outline" size={16} color="#a1a1aa" />
              <Text style={{ color: '#a1a1aa', fontSize: 12 }}>Pick reference image (optional)</Text>
            </Pressable>
          )}
        </View>

        {/* Generate Button */}
        <Pressable
          onPress={onGenerate}
          disabled={busy || !geminiKey?.trim()}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            borderRadius: 12,
            backgroundColor: busy || !geminiKey?.trim()
              ? 'rgba(255,255,255,0.06)'
              : pressed
                ? '#cc0d2e'
                : '#ff1039',
            opacity: busy || !geminiKey?.trim() ? 0.5 : 1,
            marginTop: 4,
          })}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
            {busy ? 'Generating…' : 'Generate Thumbnail'}
          </Text>
        </Pressable>

        {errorMsg && (
          <View
            style={{
              backgroundColor: 'rgba(239,68,68,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(239,68,68,0.32)',
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Text style={{ color: '#ef4444', fontSize: 11, lineHeight: 15 }}>{errorMsg}</Text>
          </View>
        )}

        {/* Latest Generated */}
        {latestUri && (
          <View style={{ gap: 8 }}>
            <Text style={SECTION_LABEL}>LATEST</Text>
            <View
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,16,57,0.32)',
              }}
            >
              <Image
                source={{ uri: latestUri }}
                style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}
                resizeMode="cover"
              />
            </View>
            <Pressable
              onPress={() => saveToGallery(latestUri)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="download-outline" size={14} color="#f1f2f2" />
              <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>
                Save to gallery
              </Text>
            </Pressable>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={SECTION_LABEL}>HISTORY · {history.length}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {history.map((uri) => (
                <Pressable
                  key={uri}
                  onPress={() => {
                    haptic.selection();
                    setLatestUri(uri);
                  }}
                  onLongPress={() => deleteFromHistory(uri)}
                  delayLongPress={400}
                  style={{
                    width: '48%',
                    aspectRatio: 16 / 9,
                    borderRadius: 10,
                    overflow: 'hidden',
                    backgroundColor: '#000',
                    borderWidth: 1,
                    borderColor: latestUri === uri ? '#ff1039' : 'rgba(255,255,255,0.10)',
                  }}
                >
                  <Image source={{ uri }} style={{ flex: 1 }} resizeMode="cover" />
                </Pressable>
              ))}
            </View>
            <Text style={{ color: '#52525b', fontSize: 9, lineHeight: 13 }}>
              Tap to preview · Long-press to delete.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const SECTION_LABEL = {
  color: '#a1a1aa',
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 0.6,
};

const INPUT_STYLE = {
  backgroundColor: 'rgba(0,0,0,0.30)',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: '#f1f2f2',
  fontSize: 12,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
};

const MULTILINE_STYLE = {
  minHeight: 64,
  textAlignVertical: 'top' as const,
};

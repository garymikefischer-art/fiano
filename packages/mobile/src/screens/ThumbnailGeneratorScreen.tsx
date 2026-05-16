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
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ThumbnailGenerator'>;
type R = RouteProp<RootStackParamList, 'ThumbnailGenerator'>;

// Genre-Liste 1:1 wie Desktop src/renderer/src/pages/ThumbnailPage.tsx:14-22.
// Generic ohne Markennamen — User-Custom-Mode für eigenen Spielnamen.
type Genre =
  | 'custom'
  | 'battle_royale'
  | 'modern_combat'
  | 'tactical_shooter'
  | 'competitive_fps'
  | 'blocky_sandbox'
  | 'open_world_crime'
  | 'moba';

type CustomStyle = 'default' | 'comic' | 'realistic';

const GENRE_OPTIONS: { id: Genre; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  // User-Wunsch (Phase Builder-10): Custom als erstes — eigener Spielname
  // ist der häufigste Use-Case, also zuerst in der Auswahl.
  { id: 'custom', label: 'Custom', icon: 'sparkles-outline' },
  { id: 'battle_royale', label: 'Battle Royale', icon: 'rocket-outline' },
  { id: 'modern_combat', label: 'Modern Combat', icon: 'shield-outline' },
  { id: 'tactical_shooter', label: 'Tactical', icon: 'locate-outline' },
  { id: 'competitive_fps', label: 'Competitive', icon: 'medal-outline' },
  { id: 'blocky_sandbox', label: 'Sandbox', icon: 'cube-outline' },
  { id: 'open_world_crime', label: 'Crime', icon: 'car-sport-outline' },
  { id: 'moba', label: 'MOBA', icon: 'flash-outline' },
];

// 1:1 Port von Desktop src/renderer/src/pages/ThumbnailPage.tsx:63-72.
const FIELD_PLACEHOLDERS: Record<Genre, { background: string; effects: string; weapons: string }> = {
  custom: {
    background: 'daylight, describe the scene, depth of field',
    effects: 'Strong rim light, [color] glow, volumetric gas, cinematic',
    weapons: 'objects in hand / weapons',
  },
  battle_royale: {
    background: 'daylight, desert buildings, stink bomb explosion, yellow gas clouds spreading, debris, depth of field',
    effects: 'Strong rim light, toxic yellow glow, volumetric gas, cinematic',
    weapons: 'futuristic rifle with skin',
  },
  modern_combat: {
    background: 'daylight, war-torn urban hospital, smoke grenade, green gas clouds spreading, debris, depth of field',
    effects: 'Strong rim light, toxic green glow, volumetric smoke, cinematic',
    weapons: 'tactical assault rifle in hand',
  },
  tactical_shooter: {
    background: 'daylight, sci-fi map control point, ability burst, particles, depth of field',
    effects: 'Strong rim light, teal ability glow, volumetric light, cinematic',
    weapons: 'glowing ability orb',
  },
  competitive_fps: {
    background: 'daylight, desert site, smoke + muzzle flash, debris, depth of field',
    effects: 'Strong rim light, dark contrast, sparks, dust, cinematic',
    weapons: 'iconic sniper rifle / pistol',
  },
  blocky_sandbox: {
    background: 'daylight, vibrant biome, lush shaders, giant pixel-style boss, depth of field',
    effects: 'Strong rim light, blocky particles, vibrant colors, cinematic',
    weapons: 'enchanted sword, glowing pickaxe',
  },
  open_world_crime: {
    background: 'neon city at night, police chase, dramatic lighting, depth of field',
    effects: 'Strong rim light, police lights, money particles, cinematic',
    weapons: 'luxury car, gold pistol',
  },
  moba: {
    background: 'splash-art arena baron pit, ability splashes, depth of field',
    effects: 'Strong rim light, splash-art glow, particles, cinematic',
    weapons: 'champion ability animation',
  },
};

// Hardcoded Custom-Style-Defaults für 'comic' und 'realistic' (mit Markennamen —
// User-bewusste Wahl mit Disclaimer). Direkt portiert aus Desktop.
const COMIC_STYLE_DEFAULTS = {
  background: 'Painted Palms, daylight, stink bomb explosion, yellow gas clouds spreading through desert buildings, debris, depth of field.',
  effects: 'Strong rim light, toxic yellow glow, volumetric gas, cinematic.',
  weapons: 'futuristic rifle with skin',
};
const REALISTIC_STYLE_DEFAULTS = {
  background: 'Verdansk Dam area, daylight, massive water-side explosion, shockwave, spray mist, debris, smoke pillars, bullet tracers, depth of field.',
  effects: 'Strong rim light, sunlight + water reflections, cool shadows, volumetric smoke, particles, high contrast, cinematic.',
  weapons: 'tactical assault rifle in hand',
};

// Genre-Headers + STYLE-Strings für jeden Genre. Body-Sections (FACE & HAIR,
// FACE DETAILS, EYES, HANDS) sind identisch und werden in composePrompt geteilt.
const GENRE_PROMPTS: Record<Genre, { intro: string; eyes: string; faceDetails: string; style: string }> = {
  battle_royale: {
    intro: 'Create a highly realistic YouTube thumbnail in a Battle Royale game style.\nElite operator (esport sweat), Battle Royale outfit, no helmet. Ultra close-up (Dutch tilt).',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Ultra-realistic, NO TEXT.',
  },
  modern_combat: {
    intro: 'Create a highly realistic YouTube thumbnail in a Modern Combat / military shooter game style.\nElite special forces operator, tactical gear, no helmet. Ultra close-up.',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Ultra-realistic, NO TEXT.',
  },
  tactical_shooter: {
    intro: 'Create a highly realistic YouTube thumbnail in a Tactical Hero Shooter game style.\nHero-shooter agent, sci-fi outfit, no helmet. Ultra close-up.',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Ultra-realistic, NO TEXT.',
  },
  competitive_fps: {
    intro: 'Create a highly realistic YouTube thumbnail in a Competitive Tactical FPS game style.\nPro player operator, focused tactical pose. Ultra close-up.',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Ultra-realistic, NO TEXT.',
  },
  blocky_sandbox: {
    intro: 'Create a vibrant cinematic YouTube thumbnail in a Blocky Sandbox / pixel-style game.\nPlayer character, exaggerated emotional expression. Ultra close-up.',
    faceDetails: 'Identity 100%, vibrant lighting, exaggerated emotion.',
    eyes: 'Bright, large.',
    style: 'Vibrant colors, exaggerated emotions, NO TEXT.',
  },
  open_world_crime: {
    intro: 'Create a cinematic YouTube thumbnail in an Open-World Crime / heist game style.\nStylish character, dramatic expression. Ultra close-up.',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Cinematic realism, NO TEXT.',
  },
  moba: {
    intro: 'Create a cinematic YouTube thumbnail in a MOBA / splash-art-style game.\nChampion-styled portrait blending splash-art aesthetic with realistic features. Ultra close-up.',
    faceDetails: 'Identity 100%, splash-art highlights, magical glow.',
    eyes: 'Glowing.',
    style: 'Cinematic splash-art realism, NO TEXT.',
  },
  custom: {
    intro: 'Create a highly realistic YouTube thumbnail inspired by [GAME].\nStylized character/operator from the game (esport sweat), no helmet. Ultra close-up (Dutch tilt).',
    faceDetails: 'Identity 100%, pores, sweat, strong glow.',
    eyes: 'Sharp.',
    style: 'Ultra-realistic, NO TEXT.',
  },
};

/**
 * Builds the final Gemini-Prompt analog Desktop's PROMPTS[genre](fields).
 * Wichtigster Bestandteil: "Replace face with provided photo" + FACE & HAIR
 * STRICT — das ist was Gemini zwingt das ref-image als Person-Face zu nutzen
 * statt nur als style-reference.
 */
function buildPrompt(
  genre: Genre,
  fields: { background: string; effects: string; weapons: string },
  customGameName: string,
  customStyle: CustomStyle,
): string {
  // Custom-Mode mit Hardcoded-Styles
  if (genre === 'custom' && customStyle === 'comic') {
    const game = customGameName.trim() || 'Fortnite';
    return `Create a highly realistic YouTube thumbnail inspired by ${game}.
Elite operator styled as Siren skin (esport sweat), ${game} outfit, no helmet. Ultra close-up (Dutch tilt).
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
Identity 100%, pores, sweat, strong glow.
EYES:
Sharp.
HANDS:
Visible.
BACKGROUND:
${fields.background.trim() || COMIC_STYLE_DEFAULTS.background}
EFFECTS:
${fields.effects.trim() || COMIC_STYLE_DEFAULTS.effects}
WEAPONS/SKINS:
${fields.weapons.trim() || COMIC_STYLE_DEFAULTS.weapons}
STYLE:
Ultra-realistic, NO TEXT.`;
  }

  if (genre === 'custom' && customStyle === 'realistic') {
    const game = customGameName.trim() || 'Call of Duty: Warzone (Verdansk)';
    const weaponsBlock = fields.weapons.trim() ? `\nWEAPONS/SKINS:\n${fields.weapons.trim()}\n` : '';
    return `Create a highly realistic YouTube thumbnail inspired by ${game}.
Elite special forces operator, dark tactical gear, no helmet. Ultra close-up (cinematic action tilt, slight zoom-in), face dominant, slightly off-center, aggressive forward-leaning pose.
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%), hairstyle EXACTLY the same, no changes, realistic relighting only.
FACE DETAILS:
Identity 100%, natural skin texture, pores, slight dirt + sweat, intense expression, slightly open mouth or clenched teeth.
EYES:
Sharp, strong contrast, cinematic catchlights, focused squint.
HANDS:
Visible, correct anatomy, natural, slight motion blur.
BACKGROUND:
${fields.background.trim() || REALISTIC_STYLE_DEFAULTS.background}
EFFECTS:
${fields.effects.trim() || REALISTIC_STYLE_DEFAULTS.effects}
${weaponsBlock}STYLE:
Ultra-realistic, no text`;
  }

  // Default genre-Prompt
  const p = GENRE_PROMPTS[genre];
  const intro =
    genre === 'custom'
      ? p.intro.replace('[GAME]', customGameName.trim() || 'a video game of your choice')
      : p.intro;
  const ph = FIELD_PLACEHOLDERS[genre];
  return `${intro}
Replace face with provided photo.
FACE & HAIR (STRICT):
Perfect alignment, head slightly larger (10–15%).
FACE DETAILS:
${p.faceDetails}
EYES:
${p.eyes}
HANDS:
Visible.
BACKGROUND:
${fields.background.trim() || ph.background}
EFFECTS:
${fields.effects.trim() || ph.effects}
WEAPONS/SKINS:
${fields.weapons.trim() || ph.weapons}
STYLE:
${p.style}`;
}

export function ThumbnailGeneratorScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<R>();
  const t = useT();
  const project = useProject(route.params.projectId);
  const updateProject = useProjectsStore((s) => s.updateProject);
  const geminiKey = useAppStore((s) => s.geminiKey);
  // Phase A5: Feature-Lock — Pro-only.
  const { unlocked: thumbUnlocked } = useFeature('thumbnail_generator');
  const openUpgrade = useUpgradeModal((s) => s.open);

  const [genre, setGenre] = useState<Genre>('battle_royale');
  const [customStyle, setCustomStyle] = useState<CustomStyle>('default');
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
      // Quality 0.5 = ~200-400 KB statt 700+ KB. Mobile-Upload zu Gemini
      // wird sonst langsam (60-90s nur für die POST mit großem ref-image).
      quality: 0.5,
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
      const prompt = buildPrompt(
        genre,
        { background, effects, weapons },
        customGameName,
        customStyle,
      );
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

  // Phase A5: Pro-Feature-Lock. Free/Creator-User sehen Lock-Screen.
  if (!thumbUnlocked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top']}>
        <RNStatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <BackgroundGlow />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 22,
              backgroundColor: 'rgba(255,16,57,0.15)',
              borderWidth: 1,
              borderColor: 'rgba(255,16,57,0.3)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              shadowColor: '#ff1039',
              shadowOpacity: 0.35,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 0 },
              elevation: 8,
            }}
          >
            <Ionicons name="lock-closed" size={32} color="#ff1039" />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#f1f2f2', textAlign: 'center', marginBottom: 8 }}>
            {t('features.thumbnail_generator', 'Thumbnail Generator')}
          </Text>
          <Text style={{ fontSize: 13, color: '#a1a1aa', textAlign: 'center', lineHeight: 19, marginBottom: 28 }}>
            {t('upgradeModal.body', 'This feature is part of {plan}. Upgrade now to unlock it.').replace(
              '{plan}',
              t('pricing.proName', 'Pro'),
            )}
          </Text>
          <Pressable
            onPress={() => openUpgrade('thumbnail_generator')}
            style={({ pressed }) => ({
              paddingHorizontal: 24,
              paddingVertical: 13,
              borderRadius: 12,
              backgroundColor: '#ff1039',
              opacity: pressed ? 0.85 : 1,
              shadowColor: '#ff1039',
              shadowOpacity: 0.45,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 0 },
            })}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {t('upgradeModal.upgradeNow', 'Upgrade now')} →
            </Text>
          </Pressable>
          <Pressable onPress={() => nav.goBack()} style={{ marginTop: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#71717a', fontSize: 12 }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
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
          <>
            <View style={{ gap: 6 }}>
              <Text style={SECTION_LABEL}>STYLE</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['default', 'comic', 'realistic'] as CustomStyle[]).map((s) => {
                  const active = customStyle === s;
                  const label = s === 'default' ? 'Default' : s === 'comic' ? 'Comic' : 'Realistic';
                  return (
                    <Pressable
                      key={s}
                      onPress={() => {
                        haptic.selection();
                        setCustomStyle(s);
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: active
                          ? 'rgba(255,16,57,0.16)'
                          : pressed
                            ? 'rgba(255,255,255,0.10)'
                            : 'rgba(255,255,255,0.04)',
                        borderWidth: 1,
                        borderColor: active ? 'rgba(255,16,57,0.45)' : 'rgba(255,255,255,0.08)',
                        alignItems: 'center',
                      })}
                    >
                      <Text
                        style={{
                          color: active ? '#ff1039' : '#f1f2f2',
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {customStyle !== 'default' && (
                <Text style={{ color: '#fbbf24', fontSize: 10, lineHeight: 14 }}>
                  ⚠ {customStyle === 'comic' ? 'Comic' : 'Realistic'} preset uses hardcoded references to real games (Fortnite / Warzone). You are responsible for trademark compliance.
                </Text>
              )}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={SECTION_LABEL}>CUSTOM GAME NAME (OPTIONAL)</Text>
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
          </>
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

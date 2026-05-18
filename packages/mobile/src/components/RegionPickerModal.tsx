/**
 * RegionPickerModal — Vollbild-Modal zum Editieren der Default-Capture-Regions.
 *
 * - Test-Clip-Upload (expo-document-picker / gallery) → echtes 16:9-Frame
 * - Draggable Facecam (rot) + Gameplay (blau) Rechtecke via PanResponder
 * - Active-Region-Tabs zum Wechseln welche Box bewegt wird
 * - Quick-Preset-Chips für schnelle Reset-Positionen
 * - Save persistiert via appStore (SecureStore)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appAlert } from './AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { VideoPlayer } from './VideoPlayer';
import { BackgroundGlow } from './BackgroundGlow';
import {
  FACECAM_PRESETS,
  GAMEPLAY_PRESETS,
  type FacecamPreset,
  type GameplayPreset,
  type Region,
} from '../stores/appStore';
import { pickVideoFromFiles, pickVideoFromGallery } from '../lib/mediaPicker';
import { haptic } from '../lib/haptics';

interface Props {
  visible: boolean;
  initialFacecam: Region | null;
  initialGameplay: Region;
  onClose: () => void;
  onSave: (facecam: Region | null, gameplay: Region) => void;
}

type ActiveBox = 'facecam' | 'gameplay';

export function RegionPickerModal({
  visible,
  initialFacecam,
  initialGameplay,
  onClose,
  onSave,
}: Props) {
  const [facecam, setFacecam] = useState<Region | null>(initialFacecam);
  const [gameplay, setGameplay] = useState<Region>(initialGameplay);
  const [active, setActive] = useState<ActiveBox>('facecam');
  const [testUri, setTestUri] = useState<string | null>(null);
  // Phase B4 (2026-05-18): Test-Image-Upload als Alternative zu Test-Video.
  // Useful wenn User nur ein Screenshot statt vollständiges Video hat.
  const [testType, setTestType] = useState<'video' | 'image'>('video');
  const [busy, setBusy] = useState(false);

  // Bei jedem visible-Reset: state zurück auf die Props (frischer Edit-State).
  useEffect(() => {
    if (visible) {
      setFacecam(initialFacecam);
      setGameplay(initialGameplay);
      setActive('facecam');
    }
  }, [visible, initialFacecam, initialGameplay]);

  const onUploadTestClip = async (fromFiles: boolean) => {
    setBusy(true);
    try {
      const picker = fromFiles ? pickVideoFromFiles : pickVideoFromGallery;
      const picked = await picker({ maxDurationSec: 600 });
      if (picked) {
        setTestUri(picked.uri);
        setTestType('video');
        haptic.success();
      }
    } catch (e: any) {
      haptic.error();
      appAlert('Test clip', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // Phase B4 (2026-05-18): Test-Image-Upload. Alternative für User die nur
  // einen Screenshot haben statt vollständiges Video. Selber RegionStage,
  // nur <Image> statt <Video> als Hintergrund.
  const onUploadTestImage = async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        appAlert('Permission required', 'Allow photo library access to pick a test image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1, // full quality — wir brauchen scharfe Refs für Region-Picking
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]) return;
      setTestUri(result.assets[0].uri);
      setTestType('image');
      haptic.success();
    } catch (e: any) {
      haptic.error();
      appAlert('Test image', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyPresetFacecam = (p: FacecamPreset) => {
    haptic.selection();
    setActive('facecam');
    setFacecam(FACECAM_PRESETS[p]);
  };
  const applyPresetGameplay = (p: GameplayPreset) => {
    haptic.selection();
    setActive('gameplay');
    setGameplay(GAMEPLAY_PRESETS[p]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0509' }} edges={['top', 'bottom']}>
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
            onPress={onClose}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              height: 40,
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: '#a1a1aa', fontSize: 14, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: '#f1f2f2', fontSize: 16, fontWeight: '700' }}>
            Capture regions
          </Text>
          <Pressable
            onPress={() => {
              haptic.success();
              onSave(facecam, gameplay);
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              height: 40,
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: '#ff1039', fontSize: 14, fontWeight: '700' }}>Save</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stage — 16:9 Video oder Upload-CTA */}
          {testUri ? (
            <View style={{ gap: 10 }}>
              <RegionStage
                uri={testUri}
                type={testType}
                facecam={facecam}
                gameplay={gameplay}
                active={active}
                onChangeFacecam={setFacecam}
                onChangeGameplay={setGameplay}
              />
              {/* Phase B4 (2026-05-18): drei Replace-Buttons (Files / Gallery / Image). */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => onUploadTestClip(true)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="videocam-outline" size={14} color="#f1f2f2" />
                  <Text style={{ color: '#f1f2f2', fontSize: 11, fontWeight: '700' }}>
                    Replace clip
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onUploadTestImage}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="image-outline" size={14} color="#f1f2f2" />
                  <Text style={{ color: '#f1f2f2', fontSize: 11, fontWeight: '700' }}>
                    Replace image
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View
              style={{
                aspectRatio: 16 / 9,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                paddingHorizontal: 24,
              }}
            >
              <Ionicons name="images-outline" size={36} color="rgba(255,255,255,0.32)" />
              <Text style={{ color: '#f1f2f2', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                Upload a test clip or image
              </Text>
              <Text
                style={{
                  color: '#a1a1aa',
                  fontSize: 11,
                  textAlign: 'center',
                  lineHeight: 16,
                  maxWidth: 280,
                }}
              >
                Pick any 16:9 video or screenshot to position the facecam (red) + gameplay
                (blue) regions visually. Used for preview only.
              </Text>
              {/* Phase B4 (2026-05-18): drei Upload-Buttons (Gallery video / Files
                  video / Image). Image-Upload für User die nur Screenshot haben. */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Pressable
                  onPress={() => onUploadTestClip(false)}
                  disabled={busy}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: pressed ? '#cc0d2e' : '#ff1039',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: busy ? 0.6 : 1,
                  })}
                >
                  <Ionicons name="videocam-outline" size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Gallery video</Text>
                </Pressable>
                <Pressable
                  onPress={() => onUploadTestClip(true)}
                  disabled={busy}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Ionicons name="folder-open-outline" size={14} color="#f1f2f2" />
                  <Text style={{ color: '#f1f2f2', fontSize: 11, fontWeight: '700' }}>Files video</Text>
                </Pressable>
                <Pressable
                  onPress={onUploadTestImage}
                  disabled={busy}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Ionicons name="image-outline" size={14} color="#f1f2f2" />
                  <Text style={{ color: '#f1f2f2', fontSize: 11, fontWeight: '700' }}>Image</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Active-Box-Tabs */}
          {testUri && (
            <View
              style={{
                flexDirection: 'row',
                padding: 4,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                borderRadius: 12,
              }}
            >
              <ActiveTab
                color="#ff1039"
                label="Facecam"
                active={active === 'facecam'}
                onPress={() => setActive('facecam')}
              />
              <ActiveTab
                color="#60a5fa"
                label="Gameplay"
                active={active === 'gameplay'}
                onPress={() => setActive('gameplay')}
              />
            </View>
          )}

          {/* Facecam Presets */}
          <FieldLabel>FACECAM</FieldLabel>
          <PresetRow>
            {(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'none'] as FacecamPreset[]).map(
              (p) => (
                <PresetChip
                  key={p}
                  label={facecamLabel(p)}
                  onPress={() => applyPresetFacecam(p)}
                />
              ),
            )}
          </PresetRow>

          {/* Gameplay Presets */}
          <FieldLabel>GAMEPLAY</FieldLabel>
          <PresetRow>
            {(['center', 'bottom', 'stretch', 'full'] as GameplayPreset[]).map((p) => (
              <PresetChip
                key={p}
                label={gameplayLabel(p)}
                onPress={() => applyPresetGameplay(p)}
              />
            ))}
          </PresetRow>

          <Text
            style={{
              color: '#71717a',
              fontSize: 11,
              textAlign: 'center',
              lineHeight: 16,
              marginTop: 4,
            }}
          >
            Tap a preset to snap the box, then drag to fine-tune. Switch the active box via the
            tabs.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ─── Stage with draggable boxes ──────────────────────────────── */

function RegionStage({
  uri,
  type,
  facecam,
  gameplay,
  active,
  onChangeFacecam,
  onChangeGameplay,
}: {
  uri: string;
  /** Phase B4 (2026-05-18): 'video' = VideoPlayer, 'image' = statisches Bild. */
  type: 'video' | 'image';
  facecam: Region | null;
  gameplay: Region;
  active: ActiveBox;
  onChangeFacecam: (r: Region) => void;
  onChangeGameplay: (r: Region) => void;
}) {
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      }}
      onLayout={(e) =>
        setStageSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      {type === 'video' ? (
        <VideoPlayer uri={uri} />
      ) : (
        <Image
          source={{ uri }}
          style={{ aspectRatio: 16 / 9, width: '100%' }}
          resizeMode="cover"
        />
      )}

      {stageSize.width > 0 && (
        <>
          <DraggableBox
            region={gameplay}
            stageSize={stageSize}
            color="gameplay"
            isActive={active === 'gameplay'}
            onChange={onChangeGameplay}
          />
          {facecam && (
            <DraggableBox
              region={facecam}
              stageSize={stageSize}
              color="facecam"
              isActive={active === 'facecam'}
              onChange={onChangeFacecam}
            />
          )}
        </>
      )}
    </View>
  );
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const MIN_REGION = 0.08; // mind. 8% Breite/Höhe

function DraggableBox({
  region,
  stageSize,
  color,
  isActive,
  onChange,
}: {
  region: Region;
  stageSize: { width: number; height: number };
  color: 'facecam' | 'gameplay';
  isActive: boolean;
  onChange: (r: Region) => void;
}) {
  const regionRef = useRef(region);
  regionRef.current = region;
  const startRef = useRef<Region | null>(null);

  // Drag-to-Move PanResponder.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isActive,
        onMoveShouldSetPanResponder: () => isActive,
        onPanResponderGrant: () => {
          startRef.current = { ...regionRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const start = startRef.current;
          if (!start) return;
          const dx = g.dx / stageSize.width;
          const dy = g.dy / stageSize.height;
          const x = clamp(start.x + dx, 0, 1 - start.w);
          const y = clamp(start.y + dy, 0, 1 - start.h);
          onChange({ ...start, x, y });
        },
        onPanResponderRelease: () => {
          startRef.current = null;
          haptic.light();
        },
      }),
    [isActive, stageSize.width, stageSize.height, onChange],
  );

  const palette = color === 'facecam' ? facecamPalette : gameplayPalette;

  return (
    <View
      pointerEvents={isActive ? 'auto' : 'box-none'}
      style={{
        position: 'absolute',
        left: region.x * stageSize.width,
        top: region.y * stageSize.height,
        width: region.w * stageSize.width,
        height: region.h * stageSize.height,
      }}
    >
      <View
        {...panResponder.panHandlers}
        style={{
          flex: 1,
          backgroundColor: palette.fill,
          borderWidth: isActive ? 2 : 1,
          borderColor: palette.border,
          borderRadius: 4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: palette.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
          {color.toUpperCase()}
        </Text>
      </View>
      {isActive && (
        <>
          <ResizeHandle corner="tl" region={region} stageSize={stageSize} onChange={onChange} regionRef={regionRef} color={palette.border} />
          <ResizeHandle corner="tr" region={region} stageSize={stageSize} onChange={onChange} regionRef={regionRef} color={palette.border} />
          <ResizeHandle corner="bl" region={region} stageSize={stageSize} onChange={onChange} regionRef={regionRef} color={palette.border} />
          <ResizeHandle corner="br" region={region} stageSize={stageSize} onChange={onChange} regionRef={regionRef} color={palette.border} />
        </>
      )}
    </View>
  );
}

function ResizeHandle({
  corner,
  region,
  stageSize,
  onChange,
  regionRef,
  color,
}: {
  corner: Corner;
  region: Region;
  stageSize: { width: number; height: number };
  onChange: (r: Region) => void;
  regionRef: React.MutableRefObject<Region>;
  color: string;
}) {
  const startRef = useRef<Region | null>(null);
  const HANDLE_SIZE = 22;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = { ...regionRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const start = startRef.current;
          if (!start) return;
          const dx = g.dx / stageSize.width;
          const dy = g.dy / stageSize.height;
          let { x, y, w, h } = start;
          // Pro Ecke: zwei der vier Werte (Position bzw. Größe) ändern sich.
          if (corner === 'tl') {
            const nx = clamp(start.x + dx, 0, start.x + start.w - MIN_REGION);
            const ny = clamp(start.y + dy, 0, start.y + start.h - MIN_REGION);
            w = start.w + (start.x - nx);
            h = start.h + (start.y - ny);
            x = nx;
            y = ny;
          } else if (corner === 'tr') {
            const ny = clamp(start.y + dy, 0, start.y + start.h - MIN_REGION);
            w = clamp(start.w + dx, MIN_REGION, 1 - start.x);
            h = start.h + (start.y - ny);
            y = ny;
          } else if (corner === 'bl') {
            const nx = clamp(start.x + dx, 0, start.x + start.w - MIN_REGION);
            w = start.w + (start.x - nx);
            h = clamp(start.h + dy, MIN_REGION, 1 - start.y);
            x = nx;
          } else {
            // br
            w = clamp(start.w + dx, MIN_REGION, 1 - start.x);
            h = clamp(start.h + dy, MIN_REGION, 1 - start.y);
          }
          onChange({ x, y, w, h });
        },
        onPanResponderRelease: () => {
          startRef.current = null;
          haptic.light();
        },
      }),
    [corner, stageSize.width, stageSize.height, onChange, regionRef],
  );

  const positionStyle: { top?: number; bottom?: number; left?: number; right?: number } = {};
  if (corner === 'tl' || corner === 'tr') positionStyle.top = -HANDLE_SIZE / 2;
  if (corner === 'bl' || corner === 'br') positionStyle.bottom = -HANDLE_SIZE / 2;
  if (corner === 'tl' || corner === 'bl') positionStyle.left = -HANDLE_SIZE / 2;
  if (corner === 'tr' || corner === 'br') positionStyle.right = -HANDLE_SIZE / 2;

  return (
    <View
      {...panResponder.panHandlers}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{
        position: 'absolute',
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        borderRadius: HANDLE_SIZE / 2,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: color,
        ...positionStyle,
      }}
    />
  );
}

const facecamPalette = {
  fill: 'rgba(255,16,57,0.45)',
  border: '#ff1039',
  text: '#fff',
};
const gameplayPalette = {
  fill: 'rgba(96,165,250,0.35)',
  border: '#60a5fa',
  text: '#fff',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ─── Sub-Components ──────────────────────────────────────────── */

function ActiveTab({
  color,
  label,
  active,
  onPress,
}: {
  color: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 9,
        borderRadius: 9,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: active ? `${color}22` : 'transparent',
        borderWidth: 1,
        borderColor: active ? color : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: active ? color : '#a1a1aa', fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: '#71717a',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.6,
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  );
}

function PresetRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

function PresetChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: '#f1f2f2', fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

function facecamLabel(p: FacecamPreset): string {
  switch (p) {
    case 'top-left':
      return 'Top-Left';
    case 'top-right':
      return 'Top-Right';
    case 'bottom-left':
      return 'Bottom-Left';
    case 'bottom-right':
      return 'Bottom-Right';
    case 'none':
      return 'None';
  }
}

function gameplayLabel(p: GameplayPreset): string {
  switch (p) {
    case 'center':
      return 'Center';
    case 'bottom':
      return 'Bottom';
    case 'stretch':
      return 'Stretch';
    case 'full':
      return 'Full';
  }
}

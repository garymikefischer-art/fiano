/**
 * ClipEffectsSection (Phase C1.A — 2026-05-19).
 *
 * Per-Project Color-Grading Section für TikTok-Tab + Builder-Tab.
 * Schreibt nach project.effectsAll (applies to ALL clips beim Export).
 *
 * 4 Sliders:
 *  - Brightness   -1.0 .. 1.0
 *  - Contrast      0.5 .. 2.0
 *  - Saturation    0.0 .. 2.0   (Pro-Lock)
 *  - Sharpen       0.0 .. 5.0   (Pro-Lock)
 *
 * Reset-Button setzt alle Werte zurück. Pro-Lock zeigt Schloss-Badge auf
 * Saturation + Sharpen — Tap → UpgradeModal.
 *
 * Filter werden im EXPORT angewendet (Phase C1.B = Worker-Integration);
 * Live-Preview im hero-player nutzt VideoPlayer.tintColor / ColorMatrix
 * (rudimentär — brightness/contrast/saturation, kein sharpen).
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SimpleSlider } from './SimpleSlider';
import { haptic } from '../lib/haptics';
import { useT } from '../lib/i18n';
import { useColors } from '../lib/theme';
import { useFeature } from '../lib/features';
import { useUpgradeModal } from '../stores/upgradeModalStore';
import {
  DEFAULT_CLIP_EFFECTS,
  hasActiveEffects,
  type ClipEffects,
} from '../data/demoProjects';

interface Props {
  /** Aktuelle Effects-Werte. */
  value: ClipEffects | undefined;
  /** Live-update bei Slider-drag. */
  onChange: (next: ClipEffects) => void;
}

export function ClipEffectsSection({ value, onChange }: Props) {
  const t = useT();
  const colors = useColors();
  const { unlocked: advancedUnlocked } = useFeature('advanced_effects');
  const openUpgrade = useUpgradeModal((s) => s.open);
  const [expanded, setExpanded] = useState(hasActiveEffects(value));

  const effects: ClipEffects = { ...DEFAULT_CLIP_EFFECTS, ...value };
  const active = hasActiveEffects(effects);

  const patch = (p: Partial<ClipEffects>) => {
    onChange({ ...effects, ...p });
  };

  const reset = () => {
    haptic.warning();
    onChange({ ...DEFAULT_CLIP_EFFECTS });
  };

  const onAdvancedSliderTouch = () => {
    if (!advancedUnlocked) {
      haptic.warning();
      openUpgrade('advanced_effects');
      return true; // blocked
    }
    return false;
  };

  return (
    <View
      style={{
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: active ? colors.accent.border : colors.border.subtle,
        borderRadius: 14,
        padding: 14,
        gap: 12,
      }}
    >
      {/* Header — Toggle expand */}
      <Pressable
        onPress={() => {
          haptic.light();
          setExpanded((v) => !v);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: active ? 'rgba(255,16,57,0.18)' : colors.bg.elevated,
            borderWidth: 1,
            borderColor: active ? colors.accent.border : colors.border.subtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name="color-wand-outline"
            size={16}
            color={active ? colors.accent.base : colors.text.secondary}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '700' }}>
            {t('effects.title', 'Effects')}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
            {active
              ? t('effects.activeDesc', 'Color-grade applied to all clips on export')
              : t('effects.inactiveDesc', 'Brightness, contrast, saturation, sharpen')}
          </Text>
        </View>
        {active && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              reset();
            }}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: pressed ? colors.bg.elevated : 'transparent',
            })}
          >
            <Text style={{ color: colors.text.secondary, fontSize: 11, fontWeight: '700' }}>
              {t('common.reset', 'Reset')}
            </Text>
          </Pressable>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.text.tertiary}
        />
      </Pressable>

      {expanded && (
        <View style={{ gap: 16, marginTop: 4 }}>
          <SliderBlock
            label={t('effects.brightness', 'Brightness')}
            value={effects.brightness ?? 0}
            min={-1}
            max={1}
            step={0.05}
            displayFmt={(v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}`}
            onChange={(v) => patch({ brightness: v })}
            colors={colors}
          />
          <SliderBlock
            label={t('effects.contrast', 'Contrast')}
            value={effects.contrast ?? 1}
            min={0.5}
            max={2.0}
            step={0.05}
            displayFmt={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => patch({ contrast: v })}
            colors={colors}
          />
          <SliderBlock
            label={t('effects.saturation', 'Saturation')}
            value={effects.saturation ?? 1}
            min={0}
            max={2.0}
            step={0.05}
            displayFmt={(v) => `${(v * 100).toFixed(0)}%`}
            locked={!advancedUnlocked}
            onLockedPress={onAdvancedSliderTouch}
            onChange={(v) => patch({ saturation: v })}
            colors={colors}
          />
          <SliderBlock
            label={t('effects.sharpen', 'Sharpen')}
            value={effects.sharpen ?? 0}
            min={0}
            max={5}
            step={0.1}
            displayFmt={(v) => v.toFixed(1)}
            locked={!advancedUnlocked}
            onLockedPress={onAdvancedSliderTouch}
            onChange={(v) => patch({ sharpen: v })}
            colors={colors}
          />

          {/* Phase C6 (2026-05-19): Color-Wheels (Lift/Gamma/Gain × R/G/B).
              Pro-locked. 9 Sliders organized in 3 groups. */}
          <ColorWheelsBlock
            effects={effects}
            colors={colors}
            locked={!advancedUnlocked}
            onLockedPress={onAdvancedSliderTouch}
            onChange={(cw) => patch({ colorWheels: cw })}
          />

          {/* Phase C1.A.2 (2026-05-19): Motion-Blur Preset für "240Hz look".
              tmix=frames=N temporal-average. Pro-locked. */}
          <View style={{ gap: 6 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
                  {t('effects.motionBlur', 'Motion Blur')}
                </Text>
                {!advancedUnlocked && (
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: 'rgba(255,16,57,0.18)',
                      borderWidth: 1,
                      borderColor: colors.accent.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Ionicons name="lock-closed" size={8} color={colors.accent.base} />
                    <Text style={{ color: colors.accent.base, fontSize: 9, fontWeight: '700' }}>
                      PRO
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600' }}
              >
                {t('effects.motionBlurHint', '240Hz Gaming Look')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['off', 'low', 'medium', 'high'] as const).map((preset) => {
                const isActive = (effects.motionBlur ?? 'off') === preset;
                return (
                  <Pressable
                    key={preset}
                    onPress={() => {
                      if (!advancedUnlocked) {
                        onAdvancedSliderTouch();
                        return;
                      }
                      haptic.selection();
                      patch({ motionBlur: preset });
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: isActive ? colors.accent.subtle : colors.bg.elevated,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent.border : colors.border.subtle,
                      alignItems: 'center',
                      opacity: !advancedUnlocked ? 0.55 : pressed ? 0.7 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: isActive ? colors.accent.base : colors.text.primary,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {preset === 'off'
                        ? t('effects.mbOff', 'Off')
                        : preset === 'low'
                          ? t('effects.mbLow', 'Low')
                          : preset === 'medium'
                            ? t('effects.mbMedium', 'Med')
                            : t('effects.mbHigh', 'High')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ColorWheelsBlock({
  effects,
  colors,
  locked,
  onLockedPress,
  onChange,
}: {
  effects: ClipEffects;
  colors: ReturnType<typeof useColors>;
  locked: boolean;
  onLockedPress: () => boolean;
  onChange: (cw: NonNullable<ClipEffects['colorWheels']>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cw = effects.colorWheels ?? {};
  const patchCw = (p: Partial<NonNullable<ClipEffects['colorWheels']>>) => {
    onChange({ ...cw, ...p });
  };
  const hasActive =
    Object.values(cw).some(
      (v) => typeof v === 'number' && Math.abs(v - (v && v < 0.4 ? 0 : 1)) > 0.01,
    );

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => {
          if (locked) {
            onLockedPress();
            return;
          }
          setExpanded((v) => !v);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: pressed ? colors.bg.elevated : 'transparent',
          opacity: locked ? 0.55 : 1,
        })}
      >
        <Ionicons
          name="color-palette-outline"
          size={14}
          color={hasActive ? '#ff1039' : colors.text.secondary}
        />
        <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600', flex: 1 }}>
          Color Wheels {hasActive ? '·' : ''}
        </Text>
        {locked && (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: 'rgba(255,16,57,0.18)',
              borderWidth: 1,
              borderColor: colors.accent.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Ionicons name="lock-closed" size={8} color={colors.accent.base} />
            <Text style={{ color: colors.accent.base, fontSize: 9, fontWeight: '700' }}>PRO</Text>
          </View>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.text.tertiary}
        />
      </Pressable>

      {expanded && !locked && (
        <View style={{ gap: 10, paddingTop: 4 }}>
          <WheelGroup
            label="Lift (Shadows)"
            colors={colors}
            r={cw.liftR ?? 0} g={cw.liftG ?? 0} b={cw.liftB ?? 0}
            min={-0.3} max={0.3} step={0.01} neutral={0}
            onR={(v) => patchCw({ liftR: v })}
            onG={(v) => patchCw({ liftG: v })}
            onB={(v) => patchCw({ liftB: v })}
          />
          <WheelGroup
            label="Gamma (Midtones)"
            colors={colors}
            r={cw.gammaR ?? 1} g={cw.gammaG ?? 1} b={cw.gammaB ?? 1}
            min={0.5} max={2} step={0.02} neutral={1}
            onR={(v) => patchCw({ gammaR: v })}
            onG={(v) => patchCw({ gammaG: v })}
            onB={(v) => patchCw({ gammaB: v })}
          />
          <WheelGroup
            label="Gain (Highlights)"
            colors={colors}
            r={cw.gainR ?? 1} g={cw.gainG ?? 1} b={cw.gainB ?? 1}
            min={0.5} max={1.5} step={0.01} neutral={1}
            onR={(v) => patchCw({ gainR: v })}
            onG={(v) => patchCw({ gainG: v })}
            onB={(v) => patchCw({ gainB: v })}
          />
        </View>
      )}
    </View>
  );
}

function WheelGroup({
  label,
  colors,
  r, g, b,
  min, max, step, neutral,
  onR, onG, onB,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  r: number; g: number; b: number;
  min: number; max: number; step: number; neutral: number;
  onR: (v: number) => void;
  onG: (v: number) => void;
  onB: (v: number) => void;
}) {
  const channelRow = (
    chName: 'R' | 'G' | 'B',
    chColor: string,
    val: number,
    onCh: (v: number) => void,
  ) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: chColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{chName}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <SimpleSlider value={val} min={min} max={max} step={step} onChange={onCh} />
      </View>
      <Text
        style={{
          color: colors.text.tertiary,
          fontSize: 10,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          minWidth: 40,
          textAlign: 'right',
        }}
      >
        {neutral === 0
          ? `${val > 0 ? '+' : ''}${(val * 100).toFixed(0)}`
          : `${Math.round(val * 100)}%`}
      </Text>
    </View>
  );
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.02)',
        gap: 6,
      }}
    >
      <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      {channelRow('R', '#ef4444', r, onR)}
      {channelRow('G', '#22c55e', g, onG)}
      {channelRow('B', '#3b82f6', b, onB)}
    </View>
  );
}

function SliderBlock({
  label,
  value,
  min,
  max,
  step,
  displayFmt,
  locked,
  onLockedPress,
  onChange,
  colors,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayFmt: (v: number) => string;
  locked?: boolean;
  onLockedPress?: () => boolean;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text.secondary, fontSize: 12, fontWeight: '600' }}>
            {label}
          </Text>
          {locked && (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: 'rgba(255,16,57,0.18)',
                borderWidth: 1,
                borderColor: colors.accent.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <Ionicons name="lock-closed" size={8} color={colors.accent.base} />
              <Text
                style={{ color: colors.accent.base, fontSize: 9, fontWeight: '700' }}
              >
                PRO
              </Text>
            </View>
          )}
        </View>
        <Text
          style={{
            color: colors.text.tertiary,
            fontSize: 11,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
          }}
        >
          {displayFmt(value)}
        </Text>
      </View>
      <Pressable
        onPress={() => onLockedPress?.()}
        disabled={!locked}
        style={{ opacity: locked ? 0.45 : 1 }}
      >
        <View pointerEvents={locked ? 'none' : 'auto'}>
          <SimpleSlider value={value} min={min} max={max} step={step} onChange={onChange} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * MultiAudioPicker — Liste von Audio-Tracks für Music-Slot in TikTok + Builder.
 *
 * - Add-Button startet Multi-File-Picker
 * - Liste mit Filename + ↑/↓-Reorder + Delete
 * - Shuffle-Toggle (Random-Order beim Render — wird in Phase X.x als
 *   Shuffle-Flag an FFmpeg-Command-Builder weitergereicht)
 * - Pro-Track Volume-Slider (0..1.5), default 0.6
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { pickAudiosFromFiles, type PickedAudio } from '../lib/mediaPicker';
import { haptic } from '../lib/haptics';
import { SimpleSlider } from './SimpleSlider';
import { useColors } from '../lib/theme';

export interface AudioTrack {
  uri: string;
  filename: string;
  /** 0..1.5. Default 0.6 (Music soll source-audio nicht überdecken). */
  volume?: number;
}

interface Props {
  tracks: AudioTrack[];
  shuffle: boolean;
  onChange: (tracks: AudioTrack[]) => void;
  onShuffleChange: (shuffle: boolean) => void;
  label: string;
  desc: string;
}

export function MultiAudioPicker({ tracks, shuffle, onChange, onShuffleChange, label, desc }: Props) {
  const colors = useColors();
  const onAdd = async () => {
    haptic.medium();
    const picked: PickedAudio[] = await pickAudiosFromFiles();
    if (picked.length === 0) return;
    haptic.success();
    const newTracks: AudioTrack[] = picked.map((p) => ({
      uri: p.uri,
      filename: p.filename ?? 'audio',
      volume: 0.6,
    }));
    onChange([...tracks, ...newTracks]);
  };

  const onVolumeChange = (idx: number, vol: number) => {
    const next = tracks.map((t, i) => (i === idx ? { ...t, volume: vol } : t));
    onChange(next);
  };

  const onRemove = (idx: number) => {
    haptic.light();
    onChange(tracks.filter((_, i) => i !== idx));
  };

  const onMove = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= tracks.length) return;
    haptic.selection();
    const next = [...tracks];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    onChange(next);
  };

  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Ionicons
          name="musical-notes-outline"
          size={18}
          color={tracks.length > 0 ? '#ff1039' : '#a1a1aa'}
          style={{ marginTop: 1 }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
            {tracks.length === 0
              ? desc
              : `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}${shuffle ? ' · shuffle' : ''}`}
          </Text>
        </View>
      </View>

      {tracks.length > 0 && (
        <View style={{ gap: 6 }}>
          {tracks.map((track, idx) => (
            <TrackRow
              key={track.uri}
              track={track}
              idx={idx}
              isLast={idx === tracks.length - 1}
              shuffle={shuffle}
              onMove={onMove}
              onRemove={onRemove}
              onVolumeChange={onVolumeChange}
            />
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: 'rgba(255,16,57,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,16,57,0.32)',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="add" size={14} color="#ff1039" />
          <Text style={{ color: '#ff1039', fontSize: 12, fontWeight: '700' }}>
            {tracks.length === 0 ? 'Add audio' : 'Add more'}
          </Text>
        </Pressable>

        {tracks.length > 1 && (
          <Pressable
            onPress={() => {
              haptic.selection();
              onShuffleChange(!shuffle);
            }}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: shuffle ? 'rgba(255,16,57,0.18)' : colors.bg.elevated,
              borderWidth: 1,
              borderColor: shuffle ? 'rgba(255,16,57,0.4)' : colors.border.subtle,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="shuffle" size={14} color={shuffle ? '#ff1039' : '#a1a1aa'} />
            <Text
              style={{
                color: shuffle ? '#ff1039' : '#a1a1aa',
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              Shuffle
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TrackRow({
  track,
  idx,
  isLast,
  shuffle,
  onMove,
  onRemove,
  onVolumeChange,
}: {
  track: AudioTrack;
  idx: number;
  isLast: boolean;
  shuffle: boolean;
  onMove: (idx: number, dir: -1 | 1) => void;
  onRemove: (idx: number) => void;
  onVolumeChange: (idx: number, vol: number) => void;
}) {
  const colors = useColors();
  const [localVol, setLocalVol] = useState(track.volume ?? 0.6);
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: colors.bg.elevated,
        borderWidth: 1,
        borderColor: colors.bg.elevated,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ gap: 2 }}>
          <ReorderArrow
            icon="chevron-up"
            disabled={idx === 0 || shuffle}
            onPress={() => onMove(idx, -1)}
          />
          <ReorderArrow
            icon="chevron-down"
            disabled={isLast || shuffle}
            onPress={() => onMove(idx, 1)}
          />
        </View>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            backgroundColor: 'rgba(255,16,57,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#ff1039', fontSize: 10, fontWeight: '800' }}>{idx + 1}</Text>
        </View>
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: colors.text.primary, fontSize: 12, fontWeight: '600' }}
        >
          {track.filename}
        </Text>
        <Pressable onPress={() => onRemove(idx)} hitSlop={6} style={{ padding: 4 }}>
          <Ionicons name="close-circle" size={16} color="#71717a" />
        </Pressable>
      </View>

      {/* Volume-Slider (0..1.5). Live-Update via setLocalVol, persist auf release. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 32 }}>
        <Ionicons
          name={localVol === 0 ? 'volume-mute' : localVol < 0.5 ? 'volume-low' : 'volume-high'}
          size={12}
          color="#71717a"
        />
        <View style={{ flex: 1 }}>
          <SimpleSlider
            value={localVol}
            min={0}
            max={1.5}
            step={0.05}
            onChange={setLocalVol}
            onCommit={(v) => {
              haptic.selection();
              onVolumeChange(idx, v);
            }}
          />
        </View>
        <Text
          style={{
            color: colors.text.secondary,
            fontSize: 10,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            minWidth: 32,
            textAlign: 'right',
          }}
        >
          {Math.round(localVol * 100)}%
        </Text>
      </View>
    </View>
  );
}

function ReorderArrow({
  icon,
  disabled,
  onPress,
}: {
  icon: 'chevron-up' | 'chevron-down';
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 22,
        height: 16,
        borderRadius: 4,
        backgroundColor: colors.bg.elevated,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={12} color="#a1a1aa" />
    </Pressable>
  );
}

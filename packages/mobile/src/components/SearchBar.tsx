/**
 * SearchBar — pill-shaped Glass-Style mit Suchicon links + Filter-Button rechts.
 * Optisch analog Apple-UISearchBar im Dark-Mode.
 */

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  placeholder?: string;
  value?: string;
  onChangeText?: (s: string) => void;
  onFilterPress?: () => void;
}

export function SearchBar({ placeholder = 'Search…', value, onChangeText, onFilterPress }: Props) {
  const [internal, setInternal] = useState('');
  const text = value ?? internal;
  const setText = onChangeText ?? setInternal;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Ionicons name="search" size={16} color="#71717a" />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#71717a"
          style={{ flex: 1, color: '#f1f2f2', fontSize: 14, padding: 0 }}
        />
      </View>
      <Pressable
        onPress={onFilterPress}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="options-outline" size={18} color="#f1f2f2" />
      </Pressable>
    </View>
  );
}

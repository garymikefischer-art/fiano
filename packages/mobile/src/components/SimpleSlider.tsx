/**
 * SimpleSlider — JS-only Slider via PanResponder + Track + Thumb.
 *
 * Kein @react-native-community/slider (Native-Dep) — wir bauen das selber
 * analog zum Scrubber im VideoPlayer. Werte 0..1 werden als value-Prop
 * angenommen und via onChange (live) + onCommit (release) zurückgegeben.
 *
 * Beispiel:
 *   <SimpleSlider
 *     value={splitRatio}
 *     min={0.2} max={0.8} step={0.05}
 *     onChange={setSplitRatio}
 *     onCommit={(v) => updateProject(id, { splitRatio: v })}
 *   />
 */

import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  value: number;
  min?: number;
  max?: number;
  /** Default 0.01 — auf step-Vielfache snappen. */
  step?: number;
  /** Live-Update beim Drag. */
  onChange: (next: number) => void;
  /** Beim Release. Optional — sonst reicht onChange. */
  onCommit?: (next: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function SimpleSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onCommit,
  style,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);

  // Refs für volatilen State, sodass der einmal-erstellte PanResponder die
  // aktuellen Werte liest (Closures cachen sonst alte States).
  const stateRef = useRef({ trackWidth, min, max, step });
  useEffect(() => {
    stateRef.current = { trackWidth, min, max, step };
  }, [trackWidth, min, max, step]);

  const valueFromX = (x: number): number => {
    const { trackWidth: w, min: mn, max: mx, step: s } = stateRef.current;
    if (w <= 0) return mn;
    const frac = Math.max(0, Math.min(1, x / w));
    let v = mn + frac * (mx - mn);
    if (s > 0) v = Math.round(v / s) * s;
    return Math.max(mn, Math.min(mx, v));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        onChange(valueFromX(evt.nativeEvent.locationX));
      },
      onPanResponderMove: (evt) => {
        onChange(valueFromX(evt.nativeEvent.locationX));
      },
      onPanResponderRelease: (evt) => {
        const v = valueFromX(evt.nativeEvent.locationX);
        onChange(v);
        onCommit?.(v);
      },
      onPanResponderTerminate: () => {
        onCommit?.(value);
      },
    }),
  ).current;

  const frac = (value - min) / (max - min);
  const pct = Math.max(0, Math.min(1, frac)) * 100;

  return (
    <View
      style={[styles.hit, style]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={[styles.thumb, { left: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 28,
    justifyContent: 'center',
    width: '100%',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#ff1039',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});

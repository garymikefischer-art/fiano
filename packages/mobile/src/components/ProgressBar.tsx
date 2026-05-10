/**
 * ProgressBar — schmaler Glas-Track + roter Füll-Balken mit Glow.
 */

import { StyleSheet, View } from 'react-native';

export function ProgressBar({ percent }: { percent: number }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          {
            width: `${w}%`,
            shadowColor: '#ff1039',
            shadowOpacity: w > 0 ? 0.5 : 0,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#ff1039',
    borderRadius: 3,
  },
});

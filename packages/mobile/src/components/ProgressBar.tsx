import { View } from 'react-native';

export function ProgressBar({ percent }: { percent: number }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <View className="h-2 w-full bg-fiano-panel rounded-full overflow-hidden">
      <View className="h-full bg-brand" style={{ width: `${w}%` }} />
    </View>
  );
}

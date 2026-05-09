/**
 * fiano Logo — exakt 1:1 aus Desktop src/renderer/src/components/FianoLogo.tsx.
 * - 'wordmark': Pfeil + "fiano"-Schriftzug (Buchstaben weiß)
 * - 'mark':     nur Pfeil-Symbol
 */

import Svg, { Polygon, Path, G } from 'react-native-svg';

type LogoVariant = 'wordmark' | 'mark';

interface Props {
  variant?: LogoVariant;
  /** Höhe in px. Breite wird aus viewBox-Ratio abgeleitet. */
  height?: number;
  /** Buchstaben-Farbe (default weiß). Pfeil bleibt brand-rot. */
  letterColor?: string;
}

export function FianoLogo({ variant = 'wordmark', height = 56, letterColor = '#f1f2f2' }: Props) {
  if (variant === 'mark') {
    const ratio = 1000 / 858.6;
    return (
      <Svg width={height * ratio} height={height} viewBox="0 0 1000 858.6">
        <Polygon
          fill="#ff1039"
          points="946.96 97.09 760.99 286.19 331.69 286.19 517.66 97.09 946.96 97.09"
        />
        <Polygon
          fill="#ff1039"
          points="518.93 761.51 518.93 466.77 331.69 286.19 53.04 286.19 518.93 761.51"
        />
      </Svg>
    );
  }

  // wordmark — exakt aus Desktop FianoLogo.tsx, viewBox 1000×572.64
  const ratio = 1000 / 572.64;
  return (
    <Svg width={height * ratio} height={height} viewBox="0 0 1000 572.64">
      {/* Pfeil-Symbol (immer rot) */}
      <Polygon fill="#ff1039" points="321.29 194.98 270.15 246.97 152.12 246.97 203.25 194.98 321.29 194.98" />
      <Polygon fill="#ff1039" points="203.6 377.66 203.6 296.62 152.12 246.97 75.51 246.97 203.6 377.66" />
      {/* Wortmarke "fiano" */}
      <G fill={letterColor}>
        <Path d="M622.84,369h37.7l0-75.6c-.95-34.41,57.75-28.88,57.75,2V369h38.09V244.65H718.27v13.23c-16.07-18.37-42.86-23.5-65.76-16.24-13.81,4.38-29.67,18.48-29.67,34.08Z" />
        <Path d="M432.39,244.65h0l-37.29.39v-8.22c0-2.54,2.47-5.55,4.82-6.4a30.34,30.34,0,0,1,4.2-1h19.45V198.14c-13.71-.22-28.18-1.34-41.79.92-18.89,3.13-24.3,14.37-25.17,32.56-.21,4.46.15,9,0,13.43H343.38v30.47h13.23V369H395.1V275.52h37.29V369h38.09V244.65Z" />
        <Path d="M837.68,239.15c-31.32,1.74-64.8,16.6-72.7,49.6-7.7,32.17,3.89,62.22,34.14,76.53,47.25,22.35,121.76,6.81,125.24-54.68C927.19,260.84,882.08,236.68,837.68,239.15Zm34,95.57c-20.93,20.39-61.29,11.19-67.11-18.61-6.12-31.35,20.57-54.95,51.12-45.91C883.56,278.45,892.6,314.38,871.7,334.72Z" />
        <Path d="M604,337.43c0,1.6-25.09,29.81-24.81,31.52h37.29a64.24,64.24,0,0,1-2.82-16.23c-1.1-23.48,1.14-47.92,0-71.4-2-43.08-52.64-47.67-85.9-41.76-23.1,4.11-43.84,18.62-44.43,44H522.6c1.06-10.28,7.69-16.13,17.57-17.91,10.08-1.82,32.1-2.12,35.25,10.6,3.44,13.87-14.36,15.87-24.15,16.93-22.07,2.39-53,2-68.35,20.67-7.91,9.64-8.1,29.66-2.22,40.29,15.48,28,70.63,24.66,92.61,6.39m3.83-35.07c0,5.79-8,13.43-12.71,16.16-11.35,6.66-46.09,13-47.46-6.52C515.71,317,541.88,317.51,554,316a82.15,82.15,0,0,0,23.11-6Z" />
      </G>
    </Svg>
  );
}

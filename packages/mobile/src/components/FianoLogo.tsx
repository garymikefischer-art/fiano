/**
 * fiano-Wortmarke als SVG-Logo. Roter Pfeil + "fiano"-Text rechts daneben.
 * Pfade übernommen aus build/icon.svg des Desktop-Projekts (1:1).
 */

import Svg, { Polygon, Text as SvgText } from 'react-native-svg';

interface Props {
  /** Höhe in px. Breite skaliert automatisch (~2.7× Höhe). */
  height?: number;
  /** Mit Wortmarke "fiano" rechts vom Pfeil-Symbol (default true). */
  showText?: boolean;
  /** Pfeil-Farbe (default brand-red). */
  color?: string;
  /** Text-Farbe wenn showText (default fiano-fg). */
  textColor?: string;
}

export function FianoLogo({
  height = 56,
  showText = true,
  color = '#ff1039',
  textColor = '#f1f2f2',
}: Props) {
  const arrowHeight = height;
  const arrowWidth = arrowHeight * 0.95;
  const totalWidth = showText ? arrowWidth + arrowHeight * 2.4 : arrowWidth;

  return (
    <Svg width={totalWidth} height={arrowHeight} viewBox={`0 0 ${showText ? 2700 : 1000} 1000`}>
      {/* Roter Pfeil aus build/icon.svg */}
      <Polygon
        fill={color}
        points="946.96 97.09 760.99 286.19 331.69 286.19 517.66 97.09 946.96 97.09"
      />
      <Polygon
        fill={color}
        points="518.93 761.51 518.93 466.77 331.69 286.19 53.04 286.19 518.93 761.51"
      />
      {showText && (
        <SvgText
          x="1080"
          y="640"
          fontSize="640"
          fontWeight="800"
          fontFamily="System"
          fill={textColor}
        >
          fiano
        </SvgText>
      )}
    </Svg>
  );
}

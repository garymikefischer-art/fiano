/**
 * Fisora Logo als inline-SVG (Phase Rebrand 2026-05-26).
 * - 'wordmark': Vollständige Wort-Marke (Default, weiß auf dunklem Background)
 * - 'mark':     Nur das Pfeil-Symbol (Icon-Variante, immer rot)
 *
 * `colorClass` überschreibt fill für die wordmark — z.B. "fill-fiano-white" oder "fill-fiano-red".
 * Tailwind-Klasse heißt aus Legacy-Gründen weiterhin `fill-fiano-white`/`fill-fiano-red` (Theme-Token
 * geben wir später um); rein Cosmetic-Refactor.
 */
type LogoVariant = 'wordmark' | 'mark';

interface Props {
  variant?: LogoVariant;
  className?: string;
  /** Tailwind fill-* class für die wordmark Buchstaben (Default: weiß). */
  colorClass?: string;
}

export function FisoraLogo({ variant = 'wordmark', className = '', colorClass }: Props) {
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 245.78 182.68"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="Fisora"
      >
        <polygon
          fill="#ff1039"
          points="245.78 0 194.64 51.99 76.61 51.99 127.74 0 245.78 0"
        />
        <polygon
          fill="#ff1039"
          points="128.09 182.68 128.09 101.64 76.61 51.99 0 51.99 128.09 182.68"
        />
      </svg>
    );
  }

  // wordmark: Pfeil bleibt rot (brand), Buchstaben kriegen colorClass (Default: weiß)
  // Phase Rebrand Iter 2 (2026-05-26): viewBox um vertikales Padding erweitert
  // (Höhe 538 statt 183) damit aspect-ratio 1.75 = altes fiano-Wordmark.
  const letterFill = colorClass ?? 'fill-fiano-white';
  return (
    <svg
      viewBox="0 -177.66 941.25 538"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Fisora"
    >
      {/* Pfeil-Symbol (immer rot) */}
      <polygon
        fill="#ff1039"
        points="245.78 0 194.64 51.99 76.61 51.99 127.74 0 245.78 0"
      />
      <polygon
        fill="#ff1039"
        points="128.09 182.68 128.09 101.64 76.61 51.99 0 51.99 128.09 182.68"
      />
      {/* Wortmarke "fisora" */}
      <g className={letterFill}>
        {/* s */}
        <path d="M539.93,84.21h-41.18c-1.34-6.36-5.65-11.08-11.81-13.05-9.09-2.91-32.84-3.26-38.23,6.36-4.94,8.82,5.89,11.66,12.41,12.66,27.37,4.22,79.75-2.35,82.49,37.29,3.24,46.89-53.42,53.25-88.1,48.67-24.48-3.23-51.74-17.03-50.79-45.3h42.41c1,8.93,4.66,14.74,13.39,17.61,9.7,3.19,39.71,4.29,41.88-9.37,1.52-9.55-6.03-12.09-13.79-13.15-28.7-3.9-85.13,1.81-82.07-42.05,3.01-43.08,68.53-45.98,99.59-37.39,18.66,5.16,32.79,17.35,33.8,37.72Z" />
        {/* o */}
        <path d="M566.57,154.53c-9.56-9.7-16.05-26.43-16.8-39.97-5.53-98.74,174.26-94.33,159.01,6.59-9.39,62.13-103.98,72.16-142.2,33.38ZM625.23,72.12c-52.33,4.54-43.18,87.67,14.38,75.08,44.7-9.78,36.05-79.46-14.38-75.08Z" />
        {/* r */}
        <path d="M803.59,46.18v34.96c-12.69-1.4-30.44-.97-39.32,9.52-5.5,6.5-6.39,15.05-6.8,23.27-.93,18.84.75,38.46.03,57.38h-37.49V48.63h37.49c-.34.78.61,1.82.61,2.15v15.03l5.22-7.37c5.34-6.55,16.77-12.26,25.21-12.26h15.06Z" />
        {/* f-i */}
        <path d="M356.7,48.84h0s-36.79.41-36.79.41v-8.33c0-2.57,2.43-5.62,4.76-6.49.65-.24,3.65-1.03,4.14-1.03h19.19V1.72c-13.53-.22-27.8-1.36-41.23.93-18.64,3.18-23.98,14.56-24.84,32.99-.21,4.51.15,9.09,0,13.6h-13.06v30.87h13.06v94.64h37.98v-94.64h36.79v94.64h37.58V48.84h-37.58Z" />
        {/* a */}
        <path d="M929.02,139.47c0,1.57-24.59,29.22-24.32,30.9h36.55c-1.61-5.17-2.51-10.48-2.77-15.9-1.07-23.02,1.12-46.98.03-70-2-42.23-51.61-46.73-84.2-40.93-22.64,4.03-42.97,18.25-43.56,43.11h38.52c1.04-10.08,7.54-15.82,17.22-17.56,9.88-1.78,31.46-2.07,34.55,10.4,3.37,13.59-14.08,15.56-23.68,16.59-21.64,2.34-51.99,1.94-67,20.26-7.75,9.46-7.94,29.08-2.18,39.5,15.18,27.47,69.24,24.17,90.79,6.27M902.73,127.72c0,5.68-7.89,13.16-12.46,15.84-11.12,6.53-45.18,12.77-46.52-6.39-1.24-17.75,24.41-17.23,36.33-18.74,7.82-.99,15.44-2.67,22.65-5.85v15.13Z" />
      </g>
    </svg>
  );
}

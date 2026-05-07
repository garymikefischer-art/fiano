/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // fiano brand palette — als CSS-vars damit data-theme="light" automatisch greift
        // <alpha-value> Placeholder: Tailwind ersetzt durch 1, 0.5, etc. bei `bg-fiano-black/50`
        fiano: {
          red:   'rgb(var(--fiano-red-rgb) / <alpha-value>)',
          white: 'rgb(var(--fiano-white-rgb) / <alpha-value>)',
          black: 'rgb(var(--fiano-black-rgb) / <alpha-value>)',
        },
        brand:   'rgb(var(--fiano-red-rgb) / <alpha-value>)',
        surface: 'rgb(var(--fiano-black-rgb) / <alpha-value>)',
        panel:   'rgb(var(--fiano-panel-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans:    ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'glass':       '0 4px 24px rgba(0,0,0,0.35)',
        'glass-hover': '0 12px 40px rgba(0,0,0,0.55)',
        'glow-red':    '0 0 24px rgba(255,16,57,0.35)',
      },
    },
  },
  plugins: [],
};

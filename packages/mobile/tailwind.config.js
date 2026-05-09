/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand strict — gleiche Werte wie Desktop
        brand: '#ff1039',
        'brand-dark': '#cc0d2e',
        'fiano-bg': '#090b0c',
        'fiano-fg': '#f1f2f2',
        'fiano-panel': '#13161a',
        'fiano-border': '#2a2e34',
      },
      fontFamily: {
        sans: ['Geist'],
      },
    },
  },
  plugins: [],
};

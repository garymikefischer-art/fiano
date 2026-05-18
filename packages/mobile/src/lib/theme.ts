/**
 * Theme-System (Phase B3 — 2026-05-18).
 *
 * Token-basierte Farb-Palette für Dark + Light Mode.
 * - `useColors()` hook → resolved palette für aktuellen Mode
 * - `useThemeMode()` hook → aktuellen ThemeMode ('light' | 'dark' | 'system')
 * - `useResolvedMode()` hook → resolved ('light' | 'dark', system → OS)
 * - Persistenz via appStore.themeMode (SecureStore)
 *
 * Migration-Strategie: hardcoded `#0d0509`, `#f1f2f2`, etc. wandern nach und
 * nach in Screens auf `colors.bg.primary`, `colors.text.primary` etc. Solange
 * der Migrations-Lauf nicht durch ist, sieht der Light-Mode noch teilweise
 * dark aus — das ist erwartet und wird in B3.2/B3.3 nachgezogen.
 */

import { useColorScheme } from 'react-native';
import { useAppStore } from '../stores/appStore';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

export interface ColorPalette {
  bg: {
    /** Haupt-Hintergrund (App-Background, SafeArea). */
    primary: string;
    /** Sekundärer Hintergrund (Status-Bar-Bereich, Modal-Backdrop). */
    secondary: string;
    /** Card-Background (Liste, Modal-Surface). */
    card: string;
    /** Elevated-Card (Hover, Pressed-state, Subtle-Highlight). */
    elevated: string;
    /** Backdrop-Overlay für Modals (rgba mit Alpha). */
    backdrop: string;
  };
  text: {
    /** Primärer Text (Headings, Body). */
    primary: string;
    /** Sekundärer Text (Subheading, descriptions). */
    secondary: string;
    /** Tertiärer Text (timecode, captions). */
    tertiary: string;
    /** Gemuteter Text (placeholder, disabled). */
    muted: string;
    /** Text auf Accent-Background (i.d.R. immer weiß). */
    onAccent: string;
  };
  accent: {
    /** Marken-Akzent (fiano-Rot). */
    base: string;
    /** Pressed-State des Akzents. */
    pressed: string;
    /** Subtile Akzent-Tönung (Card-Background mit Accent-Tint). */
    subtle: string;
    /** Akzent-Border (Card-Border mit Accent). */
    border: string;
  };
  status: {
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  border: {
    /** Subtle border (Default-Card-Border). */
    subtle: string;
    /** Strong border (Selected, Focus). */
    strong: string;
  };
  /** Glow / Gradient Stops für BackgroundGlow & Hero-Gradients. */
  glow: {
    top: string;
    middle: string;
    bottom: string;
  };
}

const DARK: ColorPalette = {
  bg: {
    primary: '#0d0509',
    secondary: '#090b0c',
    card: '#13161a',
    elevated: 'rgba(255,255,255,0.04)',
    backdrop: 'rgba(0,0,0,0.6)',
  },
  text: {
    primary: '#f1f2f2',
    secondary: '#a1a1aa',
    tertiary: '#71717a',
    muted: '#52525b',
    onAccent: '#ffffff',
  },
  accent: {
    base: '#ff1039',
    pressed: '#cc0d2e',
    subtle: 'rgba(255,16,57,0.08)',
    border: 'rgba(255,16,57,0.25)',
  },
  status: {
    error: '#ef4444',
    warning: '#fbbf24',
    success: '#22c55e',
    info: '#60a5fa',
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    strong: 'rgba(255,255,255,0.18)',
  },
  glow: {
    top: 'rgba(255,16,57,0.18)',
    middle: 'rgba(255,16,57,0.08)',
    bottom: 'rgba(13,5,9,0)',
  },
};

const LIGHT: ColorPalette = {
  bg: {
    primary: '#fafafa',
    secondary: '#f3f4f6',
    card: '#ffffff',
    elevated: 'rgba(0,0,0,0.04)',
    backdrop: 'rgba(0,0,0,0.4)',
  },
  text: {
    primary: '#18181b',
    secondary: '#52525b',
    tertiary: '#71717a',
    muted: '#a1a1aa',
    onAccent: '#ffffff',
  },
  accent: {
    base: '#ff1039',
    pressed: '#cc0d2e',
    subtle: 'rgba(255,16,57,0.08)',
    border: 'rgba(255,16,57,0.30)',
  },
  status: {
    error: '#dc2626',
    warning: '#d97706',
    success: '#16a34a',
    info: '#2563eb',
  },
  border: {
    subtle: 'rgba(0,0,0,0.08)',
    strong: 'rgba(0,0,0,0.16)',
  },
  glow: {
    top: 'rgba(255,16,57,0.10)',
    middle: 'rgba(255,16,57,0.04)',
    bottom: 'rgba(250,250,250,0)',
  },
};

export const PALETTES: Record<ResolvedMode, ColorPalette> = {
  dark: DARK,
  light: LIGHT,
};

/** Resolved theme-mode hook — folgt System wenn themeMode='system'. */
export function useResolvedMode(): ResolvedMode {
  const themeMode = useAppStore((s) => s.themeMode);
  const systemScheme = useColorScheme();
  if (themeMode === 'system') {
    return systemScheme === 'light' ? 'light' : 'dark';
  }
  return themeMode;
}

/** Theme-Palette für aktuellen Mode. Re-rendert bei System- oder User-Switch. */
export function useColors(): ColorPalette {
  return PALETTES[useResolvedMode()];
}

/** Static palette getter (für nicht-react Kontexte: NavigationContainer-theme etc.). */
export function getPalette(mode: ResolvedMode): ColorPalette {
  return PALETTES[mode];
}

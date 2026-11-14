import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '../hooks/useSettings';

const dark = {
  mode: 'dark',
  bg: '#0B0D14', surface: '#151824', surface2: '#1E2232', border: '#2A2F44',
  text: '#F4F5FA', textMuted: '#9BA1B8', textFaint: '#666C85',
  primary: '#7C8CFF', onPrimary: '#0B0D14', primary2: '#A78BFA',
  success: '#5FD39A', warning: '#F0B95A', danger: '#F0776D',
  shadow: '#000000', overlay: 'rgba(5,6,12,0.65)',
  glass: 'rgba(255,255,255,0.06)', glassStrong: 'rgba(255,255,255,0.11)', glassBorder: 'rgba(255,255,255,0.14)', glassHighlight: 'rgba(255,255,255,0.28)',
  glow1: '#5B6CFF', glow2: '#B45CFF', glow3: '#22C5B5', bar: '#1A1E30',
};
const light = {
  mode: 'light',
  bg: '#EEF0F8', surface: '#FFFFFF', surface2: '#E9ECF6', border: '#D9DDEC',
  text: '#14172A', textMuted: '#5A6079', textFaint: '#8A90A8',
  primary: '#4F5BE0', onPrimary: '#FFFFFF', primary2: '#8B5CF6',
  success: '#1F9D63', warning: '#B77B14', danger: '#D2453B',
  shadow: '#2A3160', overlay: 'rgba(20,22,40,0.45)',
  glass: 'rgba(255,255,255,0.62)', glassStrong: 'rgba(255,255,255,0.85)', glassBorder: 'rgba(255,255,255,0.95)', glassHighlight: 'rgba(255,255,255,1)',
  glow1: '#8E9BFF', glow2: '#D4A8FF', glow3: '#8EE6D8', bar: '#FFFFFF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };
export const type = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
};

/** Accent palettes: [dark primary, dark primary2, light primary, light primary2, glow1, glow2, glow3]. */
export const ACCENTS = {
  indigo: ['#7C8CFF', '#A78BFA', '#4F5BE0', '#8B5CF6', '#5B6CFF', '#B45CFF', '#22C5B5'],
  teal: ['#2DD4BF', '#38BDF8', '#0F8F7E', '#0284C7', '#14B8A6', '#38BDF8', '#818CF8'],
  rose: ['#FB7185', '#F472B6', '#DB2150', '#C026A3', '#F43F5E', '#EC4899', '#F59E0B'],
  emerald: ['#34D399', '#22D3EE', '#059669', '#0E7490', '#10B981', '#06B6D4', '#A3E635'],
  sunset: ['#FB923C', '#F472B6', '#C2570C', '#BE185D', '#F97316', '#EC4899', '#FACC15'],
};

const ThemeContext = createContext({ theme: dark, preference: 'system', setPreference: () => {} });

export function ThemeProvider({ preference = 'system', setPreference = () => {}, children }) {
  const system = useColorScheme();
  const { accent, pureBlack } = useSettings();
  const theme = useMemo(() => {
    const mode = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    const a = ACCENTS[accent] || ACCENTS.indigo;
    if (mode === 'light') return { ...light, primary: a[2], primary2: a[3], glow1: a[4], glow2: a[5], glow3: a[6] };
    const d = { ...dark, primary: a[0], primary2: a[1], glow1: a[4], glow2: a[5], glow3: a[6] };
    return pureBlack === '1' ? { ...d, bg: '#000000', surface: '#09090B', surface2: '#141418', border: '#1F1F26', bar: '#0E0E12', glass: 'rgba(255,255,255,0.05)' } : d;
  }, [preference, system, accent, pureBlack]);
  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext).theme;
export const useThemePreference = () => {
  const { preference, setPreference } = useContext(ThemeContext);
  return [preference, setPreference];
};

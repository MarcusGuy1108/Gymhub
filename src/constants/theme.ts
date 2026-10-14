import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0B0F',
    textSecondary: '#62656D',
    background: '#F2F2F5',
    card: '#FFFFFF',
    backgroundElement: '#E9E9EE',
    backgroundSelected: '#DDDEE4',
    border: '#E1E1E7',
    accent: '#C94A06',
    accentText: '#FFFFFF',
    accentSoft: '#FCE6D8',
    success: '#1B7F45',
    danger: '#C62828',
    cardio: '#0E6FA8',
    cardioSoft: '#DCEEF9',
    chart: '#C94A06',
    grid: '#E6E6EB',
  },
  dark: {
    text: '#F4F4F6',
    textSecondary: '#A0A3AB',
    background: '#000000',
    card: '#151518',
    backgroundElement: '#222227',
    backgroundSelected: '#303036',
    border: '#2A2A30',
    accent: '#FF7A2E',
    accentText: '#1A0A00',
    accentSoft: '#3B1E0B',
    success: '#4CC47E',
    danger: '#FF6B6B',
    cardio: '#5BB8F0',
    cardioSoft: '#0E2A3B',
    chart: '#E8601A',
    grid: '#26262B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rounded: '"SF Pro Rounded", system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 8, medium: 14, large: 20, pill: 999 } as const;

/** Native tab bars float over content on iOS; leave room for them. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 720;

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';

import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGym } from '@/store/gym';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useGym.persist.onFinishHydration(onChange),
    () => useGym.persist.hasHydrated(),
    () => false,
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const hydrated = useHydrated();
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.background, card: c.card, text: c.text, border: c.border },
  };

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <AppTabs />
    </ThemeProvider>
  );
}

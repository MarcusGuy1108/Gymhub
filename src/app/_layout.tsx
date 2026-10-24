import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGym } from '@/store/gym';
import { connectHeartRate } from '@/store/heart-rate';

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

  // Reconnect the heart-rate strap on launch and whenever the app comes back to the foreground.
  const heartRateMonitor = useGym((s) => s.heartRateMonitor);
  useEffect(() => {
    if (!hydrated || !heartRateMonitor) return;
    connectHeartRate();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && connectHeartRate());
    return () => sub.remove();
  }, [hydrated, heartRateMonitor]);

  if (!hydrated) return null;
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <AppTabs />
    </ThemeProvider>
  );
}

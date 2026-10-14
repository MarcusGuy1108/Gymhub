import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'anthropic_api_key';

// SecureStore (iOS Keychain) isn't available on web; fall back to localStorage there.
export async function getApiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(value: string | null): Promise<void> {
  const v = value?.trim() || null;
  if (Platform.OS === 'web') {
    if (v) globalThis.localStorage?.setItem(KEY, v);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (v) await SecureStore.setItemAsync(KEY, v);
  else await SecureStore.deleteItemAsync(KEY);
}

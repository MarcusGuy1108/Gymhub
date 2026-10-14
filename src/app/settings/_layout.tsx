import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerLargeTitleShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
    </Stack>
  );
}

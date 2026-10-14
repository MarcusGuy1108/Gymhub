import { Stack } from 'expo-router';

export default function HistoryLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'History', headerLargeTitleEnabled: true }} />
      <Stack.Screen name="[id]" options={{ title: 'Session' }} />
      <Stack.Screen name="exercise/[name]" options={{ title: 'Exercise' }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true, headerLargeTitleShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Workout' }} />
    </Stack>
  );
}

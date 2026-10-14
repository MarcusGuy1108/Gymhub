import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useActiveSession } from '@/store/gym';

export default function AppTabs() {
  const theme = useTheme();
  const active = useActiveSession();

  return (
    <NativeTabs tintColor={theme.accent}>
      <NativeTabs.Trigger name="(coach)">
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.text.bubble.right', selected: 'bubble.left.and.text.bubble.right.fill' }} md="chat" />
        <NativeTabs.Trigger.Label>Coach</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="workout">
        <NativeTabs.Trigger.Icon sf="dumbbell.fill" md="fitness_center" />
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={!active}>●</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

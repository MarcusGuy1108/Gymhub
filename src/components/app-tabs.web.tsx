import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { Icon } from './ui';

type IconName = ComponentProps<typeof Icon>['name'];

// Native tabs only have a basic web fallback, so the web build gets a phone-style bottom bar.
export default function AppTabs() {
  const theme = useTheme();
  return (
    <Tabs style={{ flex: 1, backgroundColor: theme.background }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TabTrigger name="coach" href="/" asChild>
          <TabButton icon={{ web: 'chat' }}>Coach</TabButton>
        </TabTrigger>
        <TabTrigger name="workout" href="/workout" asChild>
          <TabButton icon={{ web: 'fitness_center' }}>Workout</TabButton>
        </TabTrigger>
        <TabTrigger name="history" href="/history" asChild>
          <TabButton icon={{ web: 'history' }}>History</TabButton>
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton icon={{ web: 'settings' }}>Settings</TabButton>
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, icon, ref: _ref, ...props }: TabTriggerSlotProps & { icon: IconName }) {
  return (
    <Pressable {...props} style={styles.tab}>
      <View style={styles.tabInner}>
        <Icon name={icon} size={22} color={isFocused ? 'accent' : 'textSecondary'} />
        <ThemedText type="caption" themeColor={isFocused ? 'accent' : 'textSecondary'}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    paddingTop: 6,
    justifyContent: 'center',
    width: '100%',
  },
  tab: { flex: 1, maxWidth: MaxContentWidth / 4 },
  tabInner: { alignItems: 'center', gap: 2, paddingVertical: 4 },
});

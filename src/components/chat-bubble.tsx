import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LogChip } from '@/lib/workout';
import type { ChatMessage } from '@/store/gym';

import { ThemedText } from './themed-text';
import { Icon } from './ui';

const CHIP_ICON = {
  strength: { ios: 'dumbbell.fill', web: 'fitness_center', android: 'fitness_center' },
  cardio: { ios: 'figure.run', web: 'directions_run', android: 'directions_run' },
  session: { ios: 'flag.fill', web: 'flag', android: 'flag' },
} as const;

function LogPill({ chip }: { chip: LogChip }) {
  const theme = useTheme();
  const cardio = chip.kind === 'cardio';
  return (
    <View style={[styles.pill, { backgroundColor: cardio ? theme.cardioSoft : theme.accentSoft }]}>
      <Icon name={CHIP_ICON[chip.kind]} size={13} color={cardio ? 'cardio' : 'accent'} />
      <ThemedText type="caption" style={styles.pillText}>
        {chip.text}
      </ThemedText>
    </View>
  );
}

export const ChatBubble = memo(function ChatBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  if (message.role === 'divider') {
    return (
      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <ThemedText type="caption" themeColor="textSecondary">
          {message.text}
        </ThemedText>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
      </View>
    );
  }
  const mine = message.role === 'user';
  return (
    <View style={[styles.row, mine ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: theme.accent, borderBottomRightRadius: 6 }
            : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 },
        ]}>
        {message.chips?.length ? (
          <View style={styles.pills}>
            {message.chips.map((c, i) => (
              <LogPill key={i} chip={c} />
            ))}
          </View>
        ) : null}
        <ThemedText selectable themeColor={mine ? 'accentText' : message.error ? 'danger' : 'text'}>
          {message.text}
        </ThemedText>
        {message.source === 'offline' ? (
          <ThemedText type="caption" themeColor="textSecondary">
            Offline coach
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
});

export function TypingBubble() {
  const theme = useTheme();
  return (
    <View style={[styles.row, styles.left]}>
      <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <ThemedText themeColor="textSecondary">Logging…</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.three, marginVertical: 4, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: Radius.large, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  pills: { gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.small, paddingHorizontal: 8, paddingVertical: 5 },
  pillText: { flexShrink: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, marginVertical: Spacing.three },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});

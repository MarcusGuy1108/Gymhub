import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardioCard, StrengthCard } from '@/components/entry-cards';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Stat, confirm } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration, formatTime, formatVolume } from '@/lib/format';
import { sessionDurationMin, summarizeSession } from '@/lib/stats';
import { useGym } from '@/store/gym';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useGym((s) => s.sessions.find((x) => x.id === id));
  const prefs = useGym((s) => s.prefs);
  const remove = useGym((s) => s.deleteSession);

  if (!session) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <ThemedText themeColor="textSecondary">This session no longer exists.</ThemedText>
      </View>
    );
  }
  const sum = summarizeSession(session);

  return (
    <>
      <Stack.Screen options={{ title: session.title }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + Spacing.four }]}>
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(session.startedAt)}, {formatTime(session.startedAt)} · {formatDuration(sessionDurationMin(session))}
            {session.endedAt == null ? ' · in progress' : ''}
          </ThemedText>
          <View style={styles.stats}>
            <Stat label="Sets" value={String(sum.sets)} />
            <Stat label={`Volume (${prefs.weightUnit})`} value={formatVolume(sum.volumeKg, prefs).replace(/ (kg|lb)$/, '')} />
            <Stat label="Cardio (min)" value={String(Math.round(sum.cardioMin))} />
          </View>
          {session.notes ? <ThemedText type="small">{session.notes}</ThemedText> : null}
        </Card>
        {session.entries.map((e) =>
          e.kind === 'strength' ? (
            <StrengthCard key={e.id} entry={e} sessionId={session.id} prefs={prefs} />
          ) : (
            <CardioCard key={e.id} entry={e} sessionId={session.id} prefs={prefs} />
          ),
        )}
        <ThemedText type="caption" themeColor="textSecondary" style={styles.hint}>
          Tip: long-press a set to delete it.
        </ThemedText>
        <Button
          title="Delete session"
          kind="danger"
          onPress={() =>
            confirm('Delete this session?', `${session.title} on ${formatDate(session.startedAt)} will be removed.`, () => {
              remove(session.id);
              router.back();
            })
          }
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  hint: { textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

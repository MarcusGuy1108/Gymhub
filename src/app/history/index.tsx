import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Card, Segmented } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CARDIO_LABELS } from '@/lib/exercises';
import { formatDate, formatDistance, formatDuration, formatNumber, formatSet, formatTime, formatVolume } from '@/lib/format';
import { allExercises, e1rm, sessionDurationMin, summarizeSession } from '@/lib/stats';
import type { Session } from '@/lib/types';
import { useGym } from '@/store/gym';

export default function HistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sessions = useGym((s) => s.sessions);
  const [tab, setTab] = useState<'sessions' | 'exercises'>('sessions');

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + Spacing.four }]}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sessions', label: 'Sessions' },
          { value: 'exercises', label: 'Exercises' },
        ]}
      />
      {sessions.length === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No workouts yet. Your sessions will show up here.
        </ThemedText>
      ) : tab === 'sessions' ? (
        sessions.map((s) => <SessionRow key={s.id} session={s} />)
      ) : (
        <ExerciseList sessions={sessions} />
      )}
    </ScrollView>
  );
}

function SessionRow({ session }: { session: Session }) {
  const prefs = useGym((s) => s.prefs);
  const sum = summarizeSession(session);
  const parts: string[] = [];
  if (sum.sets) parts.push(`${sum.sets} sets`, formatVolume(sum.volumeKg, prefs));
  if (sum.cardioMin) parts.push(`${Math.round(sum.cardioMin)} min cardio${sum.cardioKm ? ` (${formatDistance(sum.cardioKm, prefs)})` : ''}`);
  const names = session.entries.map((e) => (e.kind === 'strength' ? e.exercise : CARDIO_LABELS[e.activity]));

  return (
    <Card onPress={() => router.push({ pathname: '/history/[id]', params: { id: session.id } })}>
      <View style={styles.row}>
        <ThemedText type="heading" style={styles.flex}>
          {session.title}
        </ThemedText>
        {session.endedAt == null ? (
          <ThemedText type="caption" themeColor="accent">
            IN PROGRESS
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(session.startedAt)}, {formatTime(session.startedAt)} · {formatDuration(sessionDurationMin(session))}
      </ThemedText>
      {parts.length ? <ThemedText type="smallBold">{parts.join(' · ')}</ThemedText> : null}
      {names.length ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {names.join(', ')}
        </ThemedText>
      ) : null}
    </Card>
  );
}

function ExerciseList({ sessions }: { sessions: Session[] }) {
  const stats = useMemo(() => allExercises(sessions), [sessions]);
  if (!stats.length) {
    return (
      <ThemedText themeColor="textSecondary" style={styles.empty}>
        No lifts logged yet.
      </ThemedText>
    );
  }
  return (
    <>
      {stats.map((x) => (
        <Card key={x.name} onPress={() => router.push({ pathname: '/history/exercise/[name]', params: { name: x.name } })}>
          <View style={styles.row}>
            <ThemedText type="heading" style={styles.flex}>
              {x.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {x.sessions} session{x.sessions === 1 ? '' : 's'}
            </ThemedText>
          </View>
          {x.best ? (
            <ThemedText type="small" themeColor="textSecondary">
              Best {formatSet(x.best)} · e1RM {formatNumber(e1rm(x.best))} {x.best.unit} · last {formatDate(x.lastDate)}
            </ThemedText>
          ) : null}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddSetRow, CardioCard, StrengthCard } from '@/components/entry-cards';
import { CardioPicker, ExercisePicker } from '@/components/pickers';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Icon, SectionHeader, Stat, confirm } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration, formatMinutes, formatVolume } from '@/lib/format';
import { sessionDurationMin, summarizeSession } from '@/lib/stats';
import type { Session } from '@/lib/types';
import { useActiveSession, useGym } from '@/store/gym';

const QUICK_STARTS = ['Push day', 'Pull day', 'Leg day', 'Upper body', 'Cardio'];

export default function WorkoutScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useActiveSession();
  const lastDone = useGym((s) => s.sessions.find((x) => x.endedAt != null));

  return (
    <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + Spacing.four }]}>
        {session ? <ActiveWorkout session={session} /> : <StartWorkout last={lastDone} />}
    </ScrollView>
  );
}

function StartWorkout({ last }: { last?: Session }) {
  const dispatch = useGym((s) => s.dispatch);
  const prefs = useGym((s) => s.prefs);
  const start = (title?: string) => dispatch({ type: 'start_session', title });

  return (
    <View style={styles.stack}>
      <Card>
        <ThemedText type="subtitle">No workout in progress</ThemedText>
        <ThemedText themeColor="textSecondary">
          Start one here, or just tell the Coach what you’re doing and it’ll start one for you.
        </ThemedText>
        <Button title="Start workout" icon={{ ios: 'play.fill', web: 'play_arrow', android: 'play_arrow' }} onPress={() => start()} />
        <View style={styles.chips}>
          {QUICK_STARTS.map((t) => (
            <Chip key={t} label={t} tone="accent" onPress={() => start(t)} />
          ))}
        </View>
      </Card>
      {last ? (
        <>
          <SectionHeader title="Last workout" />
          <Card onPress={() => router.push({ pathname: '/history/[id]', params: { id: last.id } })}>
            <ThemedText type="heading">{last.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(last.startedAt)} · {formatDuration(sessionDurationMin(last))}
            </ThemedText>
            <SummaryStats session={last} volumeUnit={prefs.weightUnit} />
          </Card>
        </>
      ) : null}
    </View>
  );
}

function SummaryStats({ session, volumeUnit }: { session: Session; volumeUnit: 'kg' | 'lb' }) {
  const sum = summarizeSession(session);
  return (
    <View style={styles.stats}>
      <Stat label="Sets" value={String(sum.sets)} />
      <Stat label={`Volume (${volumeUnit})`} value={formatVolume(sum.volumeKg, { weightUnit: volumeUnit }).replace(/ (kg|lb)$/, '')} />
      <Stat label="Cardio (min)" value={String(Math.round(sum.cardioMin))} />
    </View>
  );
}

function ActiveWorkout({ session }: { session: Session }) {
  const theme = useTheme();
  const prefs = useGym((s) => s.prefs);
  const dispatch = useGym((s) => s.dispatch);
  const rename = useGym((s) => s.renameSession);
  const now = useNow();
  const [pickExercise, setPickExercise] = useState(false);
  const [pickCardio, setPickCardio] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(session.title);

  const hasPending = pending && !session.entries.some((e) => e.kind === 'strength' && e.exercise.toLowerCase() === pending.toLowerCase());

  return (
    <View style={styles.stack}>
      <Card>
        <View style={styles.row}>
          {editingTitle ? (
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              onBlur={() => {
                rename(session.id, title);
                setEditingTitle(false);
              }}
              onSubmitEditing={() => {
                rename(session.id, title);
                setEditingTitle(false);
              }}
              style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
            />
          ) : (
            <Pressable onPress={() => setEditingTitle(true)} style={[styles.row, styles.flex]}>
              <ThemedText type="heading">{session.title}</ThemedText>
              <Icon name={{ ios: 'pencil', web: 'edit', android: 'edit' }} size={14} color="textSecondary" />
            </Pressable>
          )}
          <ThemedText type="stat" themeColor="accent">
            {formatMinutes((now - session.startedAt) / 60000)}
          </ThemedText>
        </View>
        <SummaryStats session={session} volumeUnit={prefs.weightUnit} />
      </Card>

      {session.entries.length === 0 && !hasPending ? (
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          Nothing logged yet. Add an exercise below, or tell the Coach.
        </ThemedText>
      ) : null}

      {session.entries.map((e) =>
        e.kind === 'strength' ? (
          <StrengthCard key={e.id} entry={e} sessionId={session.id} editable prefs={prefs} />
        ) : (
          <CardioCard key={e.id} entry={e} sessionId={session.id} editable prefs={prefs} />
        ),
      )}

      {hasPending ? <PendingExercise name={pending} unit={prefs.weightUnit} onCancel={() => setPending(null)} /> : null}

      <View style={styles.actions}>
        <Button title="Exercise" kind="secondary" icon={{ ios: 'dumbbell.fill', web: 'fitness_center', android: 'fitness_center' }} onPress={() => setPickExercise(true)} style={styles.flex} />
        <Button title="Cardio" kind="secondary" icon={{ ios: 'figure.run', web: 'directions_run', android: 'directions_run' }} onPress={() => setPickCardio(true)} style={styles.flex} />
      </View>
      <Button
        title="Finish workout"
        icon={{ ios: 'flag.checkered', web: 'sports_score', android: 'sports_score' }}
        onPress={() => confirm('Finish workout?', `Wrap up "${session.title}".`, () => dispatch({ type: 'finish_session' }), 'Finish')}
      />

      <ExercisePicker visible={pickExercise} onClose={() => setPickExercise(false)} onPick={setPending} />
      <CardioPicker visible={pickCardio} onClose={() => setPickCardio(false)} />
    </View>
  );
}

function PendingExercise({ name, unit, onCancel }: { name: string; unit: 'kg' | 'lb'; onCancel: () => void }) {
  const dispatch = useGym((s) => s.dispatch);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const add = () => {
    const r = parseInt(reps, 10);
    const w = parseFloat(weight.replace(',', '.'));
    if (!r) return;
    dispatch({ type: 'log_sets', exercise: name, sets: [{ reps: r, weight: Number.isFinite(w) ? w : null, unit }] });
  };
  return (
    <Card>
      <View style={styles.row}>
        <ThemedText type="heading" themeColor="accent" style={styles.flex}>
          {name}
        </ThemedText>
        <Pressable onPress={onCancel} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>
      </View>
      <AddSetRow weight={weight} reps={reps} setWeight={setWeight} setReps={setReps} unit={unit} onAdd={add} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  stack: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.three },
  titleInput: { flex: 1, fontSize: 17, fontWeight: '600', borderBottomWidth: 1, paddingVertical: 4 },
});

import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CARDIO_ACTIVITIES, CARDIO_LABELS, EXERCISE_NAMES, canonicalExercise, usesLevel, usesSpeed } from '@/lib/exercises';
import { allExercises } from '@/lib/stats';
import type { CardioActivity } from '@/lib/types';
import { speedUnitFor } from '@/lib/units';
import { useGym } from '@/store/gym';

import { ThemedText } from './themed-text';
import { Button, Chip, Field } from './ui';

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.sheetHeader}>
          <ThemedText type="subtitle" style={styles.flex}>
            {title}
          </ThemedText>
          <Pressable onPress={onClose} hitSlop={10}>
            <ThemedText type="heading" themeColor="accent">
              Close
            </ThemedText>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

export function ExercisePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (name: string) => void }) {
  const theme = useTheme();
  const sessions = useGym((s) => s.sessions);
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const used = allExercises(sessions).map((e) => e.name);
    const all = [...new Set([...used, ...EXERCISE_NAMES])];
    const q = query.trim().toLowerCase();
    return q ? all.filter((n) => n.toLowerCase().includes(q)) : all;
  }, [sessions, query]);
  const custom = query.trim() && !names.some((n) => n.toLowerCase() === query.trim().toLowerCase()) ? canonicalExercise(query) : null;

  const pick = (name: string) => {
    onPick(name);
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} title="Add exercise" onClose={onClose}>
      <Field value={query} onChangeText={setQuery} placeholder="Search or type a new exercise" autoFocus autoCorrect={false} containerStyle={styles.search} />
      <FlatList
        data={custom ? [custom, ...names] : names}
        keyExtractor={(n) => n}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <Pressable onPress={() => pick(item)} style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText>{custom && index === 0 ? `Add “${item}”` : item}</ThemedText>
          </Pressable>
        )}
      />
    </Sheet>
  );
}

export function CardioPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const prefs = useGym((s) => s.prefs);
  const dispatch = useGym((s) => s.dispatch);
  const [activity, setActivity] = useState<CardioActivity>('treadmill');
  const [speed, setSpeed] = useState('');
  const [incline, setIncline] = useState('');
  const [level, setLevel] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const n = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };
  const speedOk = usesSpeed(activity);
  const levelOk = usesLevel(activity);
  const settings = { speed: speedOk ? n(speed) : undefined, incline: speedOk ? n(incline) : undefined, level: levelOk ? n(level) : undefined };

  const start = () => {
    dispatch({ type: 'cardio_update', activity, atMin: 0, speedUnit: speedUnitFor(prefs), ...settings });
    onClose();
  };
  const logDone = () => {
    const m = n(minutes);
    dispatch({
      type: 'log_cardio',
      activity,
      intervals: m ? [{ minutes: m, ...settings }] : [],
      speedUnit: speedUnitFor(prefs),
      distance: n(distance),
      distanceUnit: activity === 'rower' || activity === 'swim' ? 'm' : prefs.distanceUnit,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} title="Add cardio" onClose={onClose}>
      <View style={styles.chips}>
        {CARDIO_ACTIVITIES.map((a) => (
          <Chip key={a} label={CARDIO_LABELS[a]} selected={a === activity} onPress={() => setActivity(a)} />
        ))}
      </View>
      {speedOk || levelOk ? (
        <View style={styles.inputs}>
          {speedOk ? <Field label={`Speed (${speedUnitFor(prefs)})`} value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" placeholder="5" /> : null}
          {speedOk ? <Field label="Incline %" value={incline} onChangeText={setIncline} keyboardType="decimal-pad" placeholder="10" /> : null}
          {levelOk ? <Field label="Level" value={level} onChangeText={setLevel} keyboardType="decimal-pad" placeholder="8" /> : null}
        </View>
      ) : null}
      <Button title="Start now (live)" icon={{ ios: 'play.fill', web: 'play_arrow', android: 'play_arrow' }} onPress={start} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.or}>
        OR LOG ONE YOU’VE FINISHED
      </ThemedText>
      <View style={styles.inputs}>
        <Field label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder="20" />
        <Field
          label={`Distance (${activity === 'rower' || activity === 'swim' ? 'm' : prefs.distanceUnit})`}
          value={distance}
          onChangeText={setDistance}
          keyboardType="decimal-pad"
          placeholder="optional"
        />
      </View>
      <Button title="Log finished cardio" kind="secondary" onPress={logDone} disabled={!n(minutes) && !n(distance)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { flex: 1, padding: Spacing.three, gap: Spacing.three },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.two },
  search: { flex: 0 },
  row: { paddingVertical: 14, paddingHorizontal: Spacing.one, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: Radius.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  inputs: { flexDirection: 'row', gap: Spacing.two },
  or: { textAlign: 'center', letterSpacing: 0.6, marginTop: Spacing.two },
});

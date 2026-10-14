import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CARDIO_LABELS, usesLevel, usesSpeed } from '@/lib/exercises';
import { formatCardioTotals, formatMinutes, formatNumber, formatSegment, formatSet } from '@/lib/format';
import { cardioCalories, currentSegment, e1rm } from '@/lib/stats';
import type { CardioEntry, Prefs, StrengthEntry } from '@/lib/types';
import { KM_PER_MILE, speedUnitFor } from '@/lib/units';
import { useGym } from '@/store/gym';

import { ThemedText } from './themed-text';
import { Button, Card, Field, Icon, confirm } from './ui';

const num = (s: string): number | undefined => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
};

export function StrengthCard({ entry, sessionId, editable, prefs }: { entry: StrengthEntry; sessionId?: string; editable?: boolean; prefs: Prefs }) {
  const theme = useTheme();
  const removeSet = useGym((s) => s.deleteSet);
  const dispatch = useGym((s) => s.dispatch);
  const last = entry.sets[entry.sets.length - 1];
  const [weight, setWeight] = useState(last?.weight != null ? String(last.weight) : '');
  const [reps, setReps] = useState(last ? String(last.reps) : '');
  const best = entry.sets.reduce((m, s) => Math.max(m, e1rm(s)), 0);

  const add = () => {
    const r = num(reps);
    if (!r) return;
    const w = num(weight);
    dispatch({ type: 'log_sets', exercise: entry.exercise, sets: [{ reps: r, weight: w ?? null, unit: last?.unit ?? prefs.weightUnit }] });
  };

  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/history/exercise/[name]', params: { name: entry.exercise } })} style={styles.titleRow}>
        <ThemedText type="heading" themeColor="accent" style={styles.flex}>
          {entry.exercise}
        </ThemedText>
        {best > 0 ? (
          <ThemedText type="caption" themeColor="textSecondary">
            e1RM {formatNumber(best)} {last?.unit}
          </ThemedText>
        ) : null}
      </Pressable>
      {entry.sets.map((s, i) => (
        <Pressable
          key={s.id}
          disabled={!sessionId}
          onLongPress={() => sessionId && confirm('Delete set?', `${entry.exercise} set ${i + 1}: ${formatSet(s)}`, () => removeSet(sessionId, entry.id, s.id))}
          style={[styles.setRow, { borderTopColor: theme.border }]}>
          <View style={[styles.setNum, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="caption">{i + 1}</ThemedText>
          </View>
          <ThemedText type="mono" style={styles.flex}>
            {formatSet(s)}
          </ThemedText>
          {sessionId ? (
            <Pressable hitSlop={8} accessibilityLabel="Delete set" onPress={() => confirm('Delete set?', `${entry.exercise} set ${i + 1}: ${formatSet(s)}`, () => removeSet(sessionId, entry.id, s.id))}>
              <Icon name={{ ios: 'xmark', web: 'close', android: 'close' }} size={12} color="textSecondary" />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
      {entry.notes ? (
        <ThemedText type="small" themeColor="textSecondary">
          {entry.notes}
        </ThemedText>
      ) : null}
      {editable ? <AddSetRow weight={weight} reps={reps} setWeight={setWeight} setReps={setReps} unit={last?.unit ?? prefs.weightUnit} onAdd={add} /> : null}
    </Card>
  );
}

export function AddSetRow(props: { weight: string; reps: string; setWeight: (s: string) => void; setReps: (s: string) => void; unit: string; onAdd: () => void }) {
  return (
    <View style={styles.inputRow}>
      <Field label={`Weight (${props.unit})`} value={props.weight} onChangeText={props.setWeight} keyboardType="decimal-pad" placeholder="BW" />
      <Field label="Reps" value={props.reps} onChangeText={props.setReps} keyboardType="number-pad" placeholder="8" />
      <Button title="Add set" compact icon={{ ios: 'plus', web: 'add', android: 'add' }} onPress={props.onAdd} disabled={!num(props.reps)} style={styles.addBtn} />
    </View>
  );
}

export function CardioCard({ entry, sessionId, editable, prefs }: { entry: CardioEntry; sessionId?: string; editable?: boolean; prefs: Prefs }) {
  const removeEntry = useGym((s) => s.deleteEntry);
  const kcal = cardioCalories(entry, prefs.bodyWeightKg);
  const running = !entry.finished;

  return (
    <Card>
      <View style={styles.titleRow}>
        <Icon name={{ ios: 'figure.run', web: 'directions_run', android: 'directions_run' }} size={16} color="cardio" />
        <ThemedText type="heading" themeColor="cardio" style={styles.flex}>
          {CARDIO_LABELS[entry.activity]}
          {running ? ' · live' : ''}
        </ThemedText>
        {sessionId ? (
          <Pressable hitSlop={8} accessibilityLabel="Delete cardio" onPress={() => confirm('Delete cardio?', `${CARDIO_LABELS[entry.activity]} · ${formatCardioTotals(entry, prefs)}`, () => removeEntry(sessionId, entry.id))}>
            <Icon name={{ ios: 'trash', web: 'delete', android: 'delete' }} size={15} color="textSecondary" />
          </Pressable>
        ) : null}
      </View>
      <ThemedText type="smallBold">
        {formatCardioTotals(entry, prefs)}
        {kcal != null ? ` · ~${Math.round(kcal)} kcal` : ''}
        {entry.avgHeartRate ? ` · ${entry.avgHeartRate} bpm avg` : ''}
      </ThemedText>
      {entry.segments.map((seg) => (
        <ThemedText key={seg.id} type="mono" themeColor="textSecondary">
          {formatSegment(seg, entry, prefs)}
        </ThemedText>
      ))}
      {entry.notes ? (
        <ThemedText type="small" themeColor="textSecondary">
          {entry.notes}
        </ThemedText>
      ) : null}
      {editable && running ? <CardioUpdateRow entry={entry} prefs={prefs} /> : null}
    </Card>
  );
}

function CardioUpdateRow({ entry, prefs }: { entry: CardioEntry; prefs: Prefs }) {
  const dispatch = useGym((s) => s.dispatch);
  const seg = currentSegment(entry);
  const toPref = (kmh: number) => (prefs.distanceUnit === 'mi' ? kmh / KM_PER_MILE : kmh);
  const [minutes, setMinutes] = useState('');
  const [speed, setSpeed] = useState(seg?.speedKmh != null ? formatNumber(toPref(seg.speedKmh)) : '');
  const [incline, setIncline] = useState(seg?.incline != null ? String(seg.incline) : '');
  const [level, setLevel] = useState(seg?.level != null ? String(seg.level) : '');
  const speedOk = usesSpeed(entry.activity);
  const levelOk = usesLevel(entry.activity);

  const update = (finished?: boolean) => {
    dispatch({
      type: 'cardio_update',
      activity: entry.activity,
      atMin: num(minutes),
      speed: speedOk ? num(speed) : undefined,
      speedUnit: speedUnitFor(prefs),
      incline: speedOk ? num(incline) : undefined,
      level: levelOk ? num(level) : undefined,
      finished,
    });
    setMinutes('');
  };

  return (
    <View style={styles.updateBox}>
      <View style={styles.inputRow}>
        <Field label="At (min)" value={minutes} onChangeText={setMinutes} keyboardType="decimal-pad" placeholder={formatMinutes(entry.lastAtMin)} />
        {speedOk ? <Field label={speedUnitFor(prefs)} value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" placeholder="5" /> : null}
        {speedOk ? <Field label="Incline %" value={incline} onChangeText={setIncline} keyboardType="decimal-pad" placeholder="0" /> : null}
        {levelOk ? <Field label="Level" value={level} onChangeText={setLevel} keyboardType="decimal-pad" placeholder="8" /> : null}
      </View>
      <View style={styles.inputRow}>
        <Button title="Update" compact kind="secondary" onPress={() => update()} style={styles.flex} />
        <Button title="Finish" compact icon={{ ios: 'checkmark', web: 'check', android: 'check' }} onPress={() => update(true)} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  setNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  addBtn: { minHeight: 44 },
  updateBox: { gap: Spacing.two, marginTop: Spacing.one },
});

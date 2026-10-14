import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { TrendChart, type TrendPoint } from '@/components/trend-chart';
import { Card, SectionHeader, Stat } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatNumber, formatSet } from '@/lib/format';
import { e1rm, exerciseHistory, topSet } from '@/lib/stats';
import type { WeightUnit } from '@/lib/types';
import { convertWeight, round } from '@/lib/units';
import { useGym } from '@/store/gym';

export default function ExerciseDetail() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sessions = useGym((s) => s.sessions);
  const unit: WeightUnit = useGym((s) => s.prefs.weightUnit);
  const history = useMemo(() => exerciseHistory(sessions, name ?? ''), [sessions, name]);

  const points: TrendPoint[] = useMemo(
    () =>
      [...history]
        .reverse()
        .slice(-20)
        .map(({ date, entry }) => {
          const best = entry.sets.reduce((a, b) => (convertWeight(e1rm(b), b.unit, unit) > convertWeight(e1rm(a), a.unit, unit) ? b : a));
          const value = round(convertWeight(e1rm(best), best.unit, unit));
          return { x: date, y: value, detail: `${formatDate(date)} · ${formatNumber(value)} ${unit} e1RM from ${formatSet(best)}` };
        }),
    [history, unit],
  );

  const allSets = history.flatMap((h) => h.entry.sets);
  const heaviest = allSets.reduce<(typeof allSets)[number] | undefined>(
    (a, b) => (b.weight != null && (!a || convertWeight(b.weight, b.unit, unit) > convertWeight(a.weight ?? 0, a.unit, unit)) ? b : a),
    undefined,
  );
  const bestE1rm = Math.max(0, ...points.map((p) => p.y));
  const hasWeights = points.some((p) => p.y > 0);

  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Exercise' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + Spacing.four }]}>
        {history.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No sets logged for {name} yet.
          </ThemedText>
        ) : (
          <>
            <Card>
              <View style={styles.stats}>
                <Stat label="Best e1RM" value={bestE1rm ? `${formatNumber(bestE1rm)} ${unit}` : '—'} />
                <Stat
                  label={heaviest ? `Heaviest (× ${heaviest.reps})` : 'Heaviest'}
                  value={heaviest?.weight != null ? `${formatNumber(heaviest.weight, 2)} ${heaviest.unit}` : '—'}
                />
                <Stat label="Sessions" value={String(history.length)} />
              </View>
            </Card>
            {hasWeights && points.length > 1 ? (
              <Card>
                <ThemedText type="heading">Estimated 1RM</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  Best set each session, in {unit}. Tap the chart for any session.
                </ThemedText>
                <TrendChart points={points} unit={unit} />
              </Card>
            ) : null}
            <SectionHeader title="Sessions" />
            {history.map(({ sessionId, date, entry }) => {
              const top = topSet(entry);
              return (
                <Card key={entry.id} onPress={() => router.push({ pathname: '/history/[id]', params: { id: sessionId } })}>
                  <View style={styles.row}>
                    <ThemedText type="smallBold" style={styles.flex}>
                      {formatDate(date)}
                    </ThemedText>
                    {top ? (
                      <ThemedText type="caption" themeColor="textSecondary">
                        top {formatSet(top)}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText type="mono" themeColor="textSecondary">
                    {entry.sets.map(formatSet).join('   ')}
                  </ThemedText>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});

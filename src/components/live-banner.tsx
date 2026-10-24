import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { CARDIO_LABELS } from '@/lib/exercises';
import { formatMinutes, formatSegmentSettings } from '@/lib/format';
import { currentSegment, summarizeSession } from '@/lib/stats';
import type { CardioEntry } from '@/lib/types';
import { useActiveSession, useGym } from '@/store/gym';
import { liveHeartRate } from '@/store/heart-rate';

import { ThemedText } from './themed-text';
import { Icon } from './ui';

/** Compact strip showing the workout in progress; tap to open it. */
export function LiveBanner() {
  const session = useActiveSession();
  const prefs = useGym((s) => s.prefs);
  const theme = useTheme();
  const now = useNow(!!session);
  if (!session) return null;

  const sum = summarizeSession(session);
  const running = session.entries.find((e): e is CardioEntry => e.kind === 'cardio' && !e.finished);
  const seg = running ? currentSegment(running) : undefined;
  const bits = [formatMinutes((now - session.startedAt) / 60000)];
  if (sum.sets) bits.push(`${sum.sets} set${sum.sets === 1 ? '' : 's'}`);
  if (sum.cardioMin && !running) bits.push(`${Math.round(sum.cardioMin)} min cardio`);
  const bpm = liveHeartRate(now);
  if (bpm) bits.push(`♥ ${bpm}`);

  return (
    <Pressable onPress={() => router.navigate('/workout')} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.7 }]}>
      <View style={[styles.banner, { backgroundColor: running ? theme.cardioSoft : theme.accentSoft }]}>
        <View style={[styles.dot, { backgroundColor: running ? theme.cardio : theme.accent }]} />
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {session.title} · {bits.join(' · ')}
          </ThemedText>
          {running ? (
            <ThemedText type="caption" themeColor="cardio" numberOfLines={1}>
              {CARDIO_LABELS[running.activity]} at {formatMinutes(running.lastAtMin)}
              {seg ? ` · ${formatSegmentSettings(seg, prefs)}` : ''}
            </ThemedText>
          ) : null}
        </View>
        <Icon name={{ ios: 'chevron.right', web: 'chevron_right', android: 'chevron_right' }} size={14} color="textSecondary" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.medium, paddingHorizontal: 12, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1 },
});

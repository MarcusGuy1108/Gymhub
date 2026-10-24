import { CARDIO_ACTIVITIES, CARDIO_LABELS } from '@/lib/exercises';
import { formatCardioTotals, formatDate, formatDuration, formatMinutes, formatSegment, formatSet, formatTime } from '@/lib/format';
import { cardioHistory, exerciseHistory, maxIncline, maxSpeed, sessionDurationMin, topSet } from '@/lib/stats';
import type { CardioActivity, Prefs, Session, WorkoutState } from '@/lib/types';
import { activeSession } from '@/lib/workout';
import { liveHeartRate } from '@/store/heart-rate';

function describeSession(s: Session, prefs: Prefs, detailed: boolean): string[] {
  const lines: string[] = [];
  for (const e of s.entries) {
    if (e.kind === 'strength') {
      if (detailed) lines.push(`- ${e.exercise}: ${e.sets.map(formatSet).join(', ')}`);
      else {
        const top = topSet(e);
        lines.push(`  ${e.exercise} ${e.sets.length} sets${top ? `, top ${formatSet(top)}` : ''}`);
      }
    } else {
      const label = CARDIO_LABELS[e.activity];
      if (detailed) {
        const state = e.finished ? 'finished' : `running; last reported at ${formatMinutes(e.lastAtMin)}, ${Math.round((Date.now() - e.lastAtTime) / 60000)} min ago`;
        lines.push(`- ${label} (${state}): ${formatCardioTotals(e, prefs)}`);
        for (const seg of e.segments) lines.push(`    ${formatSegment(seg, e, prefs)}`);
      } else {
        const bits = [formatCardioTotals(e, prefs)];
        const inc = maxIncline(e);
        if (inc != null) bits.push(`max ${inc}%`);
        lines.push(`  ${label} ${bits.join(', ')}`);
      }
    }
  }
  return lines;
}

/**
 * Snapshot of the user's log that rides along with each message, so Claude
 * always sees current state without extra tool calls.
 */
export function buildAppState(state: WorkoutState, prefs: Prefs, now = Date.now(), recentCount = 6): string {
  const speed = prefs.distanceUnit === 'mi' ? 'mph' : 'km/h';
  const lines: string[] = [
    `Now: ${formatDate(now)}, ${formatTime(now)}`,
    `Units: weights in ${prefs.weightUnit}, speeds in ${speed}, distances in ${prefs.distanceUnit}. Body weight ${prefs.bodyWeightKg} kg.`,
  ];
  const bpm = liveHeartRate(now);
  if (bpm) lines.push(`Heart rate right now: ${bpm} bpm (live from their strap).`);
  const active = activeSession(state);
  if (active) {
    lines.push(
      `Active session: "${active.title}", started ${formatTime(active.startedAt)} (${formatDuration(sessionDurationMin(active, now))} ago)`,
    );
    const body = describeSession(active, prefs, true);
    lines.push(...(body.length ? body : ['- nothing logged yet']));
  } else {
    lines.push('No active session (one starts automatically when something is logged).');
  }
  const recent = state.sessions.filter((s) => s.id !== active?.id).slice(0, recentCount);
  if (recent.length) {
    lines.push('Recent sessions:');
    for (const s of recent) {
      lines.push(`- ${formatDate(s.startedAt)} "${s.title}" (${formatDuration(sessionDurationMin(s))})`);
      lines.push(...describeSession(s, prefs, false));
    }
  }
  return `<app_state>\n${lines.join('\n')}\n</app_state>`;
}

/** Answer for the get_history tool: an exercise or a cardio activity. */
export function historyFor(state: WorkoutState, name: string, prefs: Prefs, limit = 6): string {
  const activity = CARDIO_ACTIVITIES.find(
    (a) => a === name.toLowerCase() || CARDIO_LABELS[a].toLowerCase() === name.toLowerCase(),
  ) as CardioActivity | undefined;
  if (activity) {
    const items = cardioHistory(state.sessions, activity).slice(0, limit);
    if (!items.length) return `No ${CARDIO_LABELS[activity]} history.`;
    return items
      .map(({ date, entry }) => {
        const bits = [formatCardioTotals(entry, prefs)];
        const inc = maxIncline(entry);
        const spd = maxSpeed(entry);
        if (inc != null) bits.push(`max ${inc}% incline`);
        if (spd != null) bits.push(`max ${Math.round(spd * 10) / 10} km/h`);
        return `${formatDate(date)}: ${bits.join(', ')}; ${entry.segments.map((s) => formatSegment(s, entry, prefs)).join(' | ')}`;
      })
      .join('\n');
  }
  const items = exerciseHistory(state.sessions, name).slice(0, limit);
  if (!items.length) return `No history for "${name}".`;
  return items.map(({ date, entry }) => `${formatDate(date)}: ${entry.sets.map(formatSet).join(', ')}`).join('\n');
}

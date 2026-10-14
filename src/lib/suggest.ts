/**
 * Rule-based coaching used when Claude isn't available. Deliberately simple:
 * progressive overload against last time, sensible rest, small cardio bumps.
 */
import { CARDIO_LABELS, sameExercise, usesLevel, usesSpeed } from './exercises';
import { formatDistance, formatDuration, formatMinutes, formatNumber, formatSet } from './format';
import {
  cardioCalories,
  cardioDistanceKm,
  cardioDurationMin,
  cardioHistory,
  currentSegment,
  exerciseHistory,
  maxIncline,
  sessionDurationMin,
  summarizeSession,
} from './stats';
import type { CardioEntry, Prefs, StrengthEntry, WorkoutState } from './types';
import { convertWeight, round, weightStep } from './units';
import { activeSession, type CoachAction } from './workout';

function nextMark(elapsed: number): number {
  return Math.floor(elapsed / 5) * 5 + 5;
}

function strengthTip(state: WorkoutState, exercise: string, prefs: Prefs): string | undefined {
  const session = activeSession(state);
  const entry = session?.entries.find((e): e is StrengthEntry => e.kind === 'strength' && sameExercise(e.exercise, exercise));
  if (!session || !entry) return undefined;
  const last = entry.sets[entry.sets.length - 1];
  const n = entry.sets.length;
  const prev = exerciseHistory(state.sessions, exercise, session.id)[0];
  const step = weightStep(last.unit);

  if (n >= 4) return `That's ${n} sets of ${entry.exercise}. Move on when you're ready, or finish with a back-off set at ~80%.`;

  const target = prev?.entry.sets[n];
  if (target && target.weight != null && last.weight != null) {
    const tw = round(convertWeight(target.weight, target.unit, last.unit), 2);
    if (tw > last.weight) return `Last time set ${n + 1} was ${formatSet(target)}. Rest 2 min and go for it.`;
    return `Last time set ${n + 1} was ${formatSet(target)}. Rest 2 min, then try ${formatNumber(last.weight, 2)} ${last.unit} × ${target.reps + 1} to beat it.`;
  }
  if (last.weight == null) {
    return last.reps >= 15
      ? 'Bodyweight is getting easy — add weight or slow the tempo next set.'
      : `Rest ~90 s, then aim for ${last.reps} again.`;
  }
  if (last.reps >= 12) return `Plenty in the tank? Add ${step} ${last.unit} next set.`;
  if (last.reps <= 3) return 'Heavy one — rest 3–4 min before the next set.';
  return `Rest ~2 min, then aim for ${formatSet({ ...last, rpe: undefined })} again.`;
}

function cardioTip(state: WorkoutState, entry: CardioEntry, prefs: Prefs): string {
  const elapsed = cardioDurationMin(entry);
  const km = cardioDistanceKm(entry);
  const kcal = cardioCalories(entry, prefs.bodyWeightKg);
  const status = [formatMinutes(elapsed)];
  if (km != null) status.push(`≈${formatDistance(km, prefs)}`);
  if (kcal != null) status.push(`~${Math.round(kcal)} kcal`);

  const prev = cardioHistory(state.sessions, entry.activity, entry.id)[0]?.entry;
  const seg = currentSegment(entry);

  if (entry.finished) {
    let next = 'Next time, add 2 minutes or 1% incline.';
    if (prev) {
      const diff = Math.round(elapsed - cardioDurationMin(prev));
      if (diff > 0) next = `${diff} min longer than last time — nice progression.`;
      else if (diff < 0) next = `${-diff} min shorter than last time; aim to match it next session.`;
    }
    return `${CARDIO_LABELS[entry.activity]} done: ${status.join(', ')}. ${next}`;
  }

  const mark = nextMark(elapsed);
  let tip: string;
  if (usesSpeed(entry.activity) && seg?.incline != null && (seg.speedKmh ?? 0) <= 6.5) {
    const prevMax = prev ? maxIncline(prev) : undefined;
    if (prevMax != null && seg.incline < prevMax) {
      tip = `Last time you peaked at ${prevMax}% — try ${Math.min(seg.incline + 1, prevMax)}% at the ${mark}-minute mark.`;
    } else if (seg.incline >= 15) {
      tip = `That's steep. Hold it, stay off the handrails, and check in at ${mark} min.`;
    } else {
      tip = `Feeling good? Bump to ${seg.incline + 1}% at ${mark} min, or hold and check in then.`;
    }
  } else if (usesSpeed(entry.activity) && seg?.speedKmh != null) {
    const pace = 60 / (prefs.distanceUnit === 'mi' ? seg.speedKmh / 1.609344 : seg.speedKmh);
    tip = `That's ${formatMinutes(pace)}/${prefs.distanceUnit} pace. Hold it to ${mark} min, then decide whether to push 0.5 faster.`;
  } else if (usesLevel(entry.activity) && seg?.level != null) {
    tip = `Try level ${seg.level + 1} for 2 minutes at the ${mark}-minute mark, then back down.`;
  } else {
    tip = `Keep it steady and check in at ${mark} min.`;
  }
  return `${status.join(' · ')}. ${tip}`;
}

/** One or two sentences of coaching for what was just logged. */
export function suggestAfter(state: WorkoutState, action: CoachAction, prefs: Prefs): string | undefined {
  switch (action.type) {
    case 'log_sets':
      return strengthTip(state, action.exercise, prefs);
    case 'cardio_update':
    case 'log_cardio': {
      const session = activeSession(state);
      const entry = [...(session?.entries ?? [])].reverse().find((e): e is CardioEntry => e.kind === 'cardio' && e.activity === action.activity);
      return entry ? cardioTip(state, entry, prefs) : undefined;
    }
    case 'start_session':
      return "Let's go. Tell me what you're doing as you go — e.g. \"bench 60kg x 10\" or \"treadmill 5 min, 10% incline at 5k\".";
    case 'finish_session': {
      const done = state.sessions
        .filter((s) => s.endedAt != null)
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
      if (!done) return undefined;
      const sum = summarizeSession(done);
      const bits = [formatDuration(sessionDurationMin(done))];
      if (sum.sets) bits.push(`${sum.sets} sets across ${sum.exercises} exercise${sum.exercises === 1 ? '' : 's'}`);
      if (sum.cardioMin) bits.push(`${Math.round(sum.cardioMin)} min cardio`);
      return `Session done: ${bits.join(', ')}. Eat some protein and get some sleep.`;
    }
  }
}

export const OFFLINE_HELP =
  "I didn't catch that. Try things like \"bench 80kg x 8\", \"3x10 squats at 60\", \"treadmill 5 min, 10% incline at 5k\" or \"done for today\". Add a Claude API key in Settings and I can handle anything you say.";

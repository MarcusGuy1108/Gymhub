import { sameExercise } from './exercises';
import type { CardioEntry, CardioSegment, Session, StrengthEntry, StrengthSet, WeightUnit } from './types';
import { convertWeight, round, toKg } from './units';

/** Epley estimated one-rep max, in the set's own unit. */
export function e1rm(set: Pick<StrengthSet, 'weight' | 'reps'>): number {
  if (set.weight == null || set.reps <= 0) return 0;
  if (set.reps === 1) return set.weight;
  return set.weight * (1 + set.reps / 30);
}

export function setVolumeKg(set: StrengthSet): number {
  if (set.weight == null) return 0;
  return toKg(set.weight, set.unit) * set.reps;
}

export function entryVolumeKg(entry: StrengthEntry): number {
  return entry.sets.reduce((sum, s) => sum + setVolumeKg(s), 0);
}

/** Heaviest set, ties broken by reps. */
export function topSet(entry: StrengthEntry): StrengthSet | undefined {
  return [...entry.sets].sort((a, b) => {
    const wa = a.weight == null ? -1 : toKg(a.weight, a.unit);
    const wb = b.weight == null ? -1 : toKg(b.weight, b.unit);
    return wb - wa || b.reps - a.reps;
  })[0];
}

// ---------- cardio ----------

/** End of a segment, using the latest reported time for the running one. */
export function segmentEnd(seg: CardioSegment, entry: CardioEntry): number {
  return seg.endMin ?? Math.max(entry.lastAtMin, seg.startMin);
}

export function cardioDurationMin(entry: CardioEntry): number {
  const last = entry.segments[entry.segments.length - 1];
  const segEnd = last ? segmentEnd(last, entry) : 0;
  return Math.max(entry.lastAtMin, segEnd);
}

/** Reported distance if the user gave one, else speed × time. */
export function cardioDistanceKm(entry: CardioEntry): number | undefined {
  if (entry.distanceKm != null) return entry.distanceKm;
  let km = 0;
  let any = false;
  for (const seg of entry.segments) {
    if (seg.speedKmh == null) continue;
    any = true;
    km += (seg.speedKmh * (segmentEnd(seg, entry) - seg.startMin)) / 60;
  }
  return any ? km : undefined;
}

/**
 * ACSM metabolic equations for walking/running on a grade. Returns kcal for
 * the segment, or undefined when there's no speed to work from.
 */
function treadmillKcal(seg: CardioSegment, minutes: number, bodyKg: number): number | undefined {
  if (seg.speedKmh == null || minutes <= 0) return undefined;
  const mPerMin = (seg.speedKmh * 1000) / 60;
  const grade = (seg.incline ?? 0) / 100;
  const running = seg.speedKmh > 6.5;
  const vo2 = running ? 0.2 * mPerMin + 0.9 * mPerMin * grade + 3.5 : 0.1 * mPerMin + 1.8 * mPerMin * grade + 3.5;
  return ((vo2 * bodyKg) / 1000) * 5 * minutes;
}

/** Rough MET values for machines we can't model from speed. */
const METS: Partial<Record<CardioEntry['activity'], number>> = {
  bike: 7,
  rower: 7,
  elliptical: 5,
  stairs: 9,
  swim: 7,
  other: 6,
};

export function cardioCalories(entry: CardioEntry, bodyKg: number): number | undefined {
  if (entry.calories != null) return entry.calories;
  const duration = cardioDurationMin(entry);
  if (duration <= 0) return undefined;
  const met = METS[entry.activity];
  if (met != null) return (met * 3.5 * bodyKg * duration) / 200;
  let kcal = 0;
  let any = false;
  for (const seg of entry.segments) {
    const k = treadmillKcal(seg, segmentEnd(seg, entry) - seg.startMin, bodyKg);
    if (k != null) {
      kcal += k;
      any = true;
    }
  }
  return any ? kcal : undefined;
}

export function maxIncline(entry: CardioEntry): number | undefined {
  const vals = entry.segments.map((s) => s.incline).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : undefined;
}

export function maxSpeed(entry: CardioEntry): number | undefined {
  const vals = entry.segments.map((s) => s.speedKmh).filter((v): v is number => v != null);
  return vals.length ? Math.max(...vals) : undefined;
}

export function currentSegment(entry: CardioEntry): CardioSegment | undefined {
  return entry.segments[entry.segments.length - 1];
}

// ---------- sessions & history ----------

export function sessionDurationMin(session: Session, now = Date.now()): number {
  return ((session.endedAt ?? now) - session.startedAt) / 60000;
}

export interface SessionSummary {
  sets: number;
  volumeKg: number;
  exercises: number;
  cardioMin: number;
  cardioKm: number;
}

export function summarizeSession(session: Session): SessionSummary {
  const summary: SessionSummary = { sets: 0, volumeKg: 0, exercises: 0, cardioMin: 0, cardioKm: 0 };
  for (const e of session.entries) {
    if (e.kind === 'strength') {
      summary.exercises += 1;
      summary.sets += e.sets.length;
      summary.volumeKg += entryVolumeKg(e);
    } else {
      summary.cardioMin += cardioDurationMin(e);
      summary.cardioKm += cardioDistanceKm(e) ?? 0;
    }
  }
  return summary;
}

export interface ExerciseHistoryItem {
  sessionId: string;
  date: number;
  entry: StrengthEntry;
}

/** Past entries for one lift, newest first. */
export function exerciseHistory(sessions: Session[], exercise: string, excludeSessionId?: string): ExerciseHistoryItem[] {
  const items: ExerciseHistoryItem[] = [];
  for (const s of sessions) {
    if (s.id === excludeSessionId) continue;
    for (const e of s.entries) {
      if (e.kind === 'strength' && e.sets.length && sameExercise(e.exercise, exercise)) {
        items.push({ sessionId: s.id, date: e.startedAt, entry: e });
      }
    }
  }
  return items.sort((a, b) => b.date - a.date);
}

export function cardioHistory(sessions: Session[], activity: CardioEntry['activity'], excludeEntryId?: string) {
  const items: { sessionId: string; date: number; entry: CardioEntry }[] = [];
  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.kind === 'cardio' && e.activity === activity && e.id !== excludeEntryId) {
        items.push({ sessionId: s.id, date: e.startedAt, entry: e });
      }
    }
  }
  return items.sort((a, b) => b.date - a.date);
}

/** Best estimated 1RM across all history, converted to `unit`. */
export function bestE1rm(sessions: Session[], exercise: string, unit: WeightUnit, excludeSetId?: string): number {
  let best = 0;
  for (const { entry } of exerciseHistory(sessions, exercise)) {
    for (const set of entry.sets) {
      if (set.id === excludeSetId) continue;
      best = Math.max(best, convertWeight(e1rm(set), set.unit, unit));
    }
  }
  return best;
}

export interface ExerciseStat {
  name: string;
  lastDate: number;
  sessions: number;
  best?: StrengthSet;
}

export function allExercises(sessions: Session[]): ExerciseStat[] {
  const map = new Map<string, ExerciseStat>();
  for (const s of sessions) {
    for (const e of s.entries) {
      if (e.kind !== 'strength' || !e.sets.length) continue;
      const key = e.exercise.toLowerCase();
      const stat = map.get(key) ?? { name: e.exercise, lastDate: 0, sessions: 0 };
      stat.sessions += 1;
      stat.lastDate = Math.max(stat.lastDate, e.startedAt);
      for (const set of e.sets) {
        if (!stat.best || toKg(e1rm(set), set.unit) > toKg(e1rm(stat.best), stat.best.unit)) stat.best = set;
      }
      map.set(key, stat);
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate - a.lastDate);
}

export { round };

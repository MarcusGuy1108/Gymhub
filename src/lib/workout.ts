import { CARDIO_LABELS, canonicalExercise, sameExercise } from './exercises';
import { formatCardioTotals, formatDate, formatDuration, formatMinutes, formatSegmentSettings, formatSet } from './format';
import { uid } from './id';
import {
  bestE1rm,
  cardioCalories,
  cardioHistory,
  cardioDurationMin,
  e1rm,
  exerciseHistory,
  maxIncline,
  maxSpeed,
  sessionDurationMin,
  summarizeSession,
} from './stats';
import type {
  CardioActivity,
  CardioEntry,
  CardioSegment,
  DistanceUnit,
  Prefs,
  Session,
  SpeedUnit,
  StrengthEntry,
  StrengthSet,
  WeightUnit,
  WorkoutState,
} from './types';
import { convertWeight, round, toKm, toKmh } from './units';

export interface SetInput {
  reps: number;
  /** null or undefined = bodyweight */
  weight?: number | null;
  unit?: WeightUnit;
  rpe?: number;
}

export interface IntervalInput {
  minutes: number;
  speed?: number;
  incline?: number;
  level?: number;
}

export type CoachAction =
  | { type: 'start_session'; title?: string }
  | { type: 'log_sets'; exercise: string; sets: SetInput[]; notes?: string }
  | {
      type: 'cardio_update';
      activity: CardioActivity;
      /** Minutes into the activity; estimated from the clock when omitted */
      atMin?: number;
      speed?: number;
      speedUnit?: SpeedUnit;
      incline?: number;
      level?: number;
      heartRate?: number;
      distance?: number;
      distanceUnit?: DistanceUnit;
      calories?: number;
      finished?: boolean;
      notes?: string;
    }
  | {
      type: 'log_cardio';
      activity: CardioActivity;
      intervals: IntervalInput[];
      speedUnit?: SpeedUnit;
      totalMin?: number;
      distance?: number;
      distanceUnit?: DistanceUnit;
      calories?: number;
      avgHeartRate?: number;
      notes?: string;
    }
  | { type: 'finish_session'; notes?: string };

export interface LogChip {
  kind: 'strength' | 'cardio' | 'session';
  text: string;
}

export interface ApplyResult {
  state: WorkoutState;
  ok: boolean;
  /** Detailed result, fed back to Claude as the tool result */
  message: string;
  chip?: LogChip;
  /** Something worth celebrating, e.g. a PR */
  highlight?: string;
}

export interface ApplyContext {
  now: number;
  prefs: Prefs;
}

/** A session left open this long after its last log is treated as over. */
export const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function activeSession(state: WorkoutState): Session | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId && s.endedAt == null);
}

export function lastActivityAt(session: Session): number {
  let t = session.startedAt;
  for (const e of session.entries) {
    t = Math.max(t, e.startedAt);
    if (e.kind === 'strength') for (const s of e.sets) t = Math.max(t, s.loggedAt);
    else t = Math.max(t, e.lastAtTime);
  }
  return t;
}

function defaultTitle(now: number): string {
  const h = new Date(now).getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  return `${part} workout`;
}

function replaceSession(state: WorkoutState, session: Session): WorkoutState {
  const exists = state.sessions.some((s) => s.id === session.id);
  return {
    ...state,
    sessions: exists ? state.sessions.map((s) => (s.id === session.id ? session : s)) : [session, ...state.sessions],
  };
}

function closeCardio(entry: CardioEntry, atMin: number) {
  const open = entry.segments[entry.segments.length - 1];
  if (open && open.endMin == null) open.endMin = Math.max(atMin, open.startMin);
  entry.lastAtMin = Math.max(entry.lastAtMin, atMin);
  entry.finished = true;
}

function estimateNowMin(entry: CardioEntry, now: number): number {
  return round(entry.lastAtMin + Math.max(0, now - entry.lastAtTime) / 60000, 1);
}

/**
 * When cardio ends implicitly (the user moved on without saying), trust the
 * last time they reported. If they never gave one, fall back to the clock.
 */
function implicitEndMin(entry: CardioEntry, now: number): number {
  return entry.lastAtMin > 0 ? entry.lastAtMin : Math.min(estimateNowMin(entry, now), 90);
}

function finishSessionObject(session: Session, endedAt: number): Session {
  const s = clone(session);
  for (const e of s.entries) {
    if (e.kind === 'cardio' && !e.finished) closeCardio(e, implicitEndMin(e, endedAt));
  }
  s.endedAt = endedAt;
  return s;
}

/**
 * Returns the session new logs should go into, closing a stale one and
 * starting a fresh one if needed.
 */
function ensureSession(state: WorkoutState, now: number, title?: string): { state: WorkoutState; session: Session; started: boolean } {
  let current = activeSession(state);
  if (current && now - lastActivityAt(current) > STALE_SESSION_MS) {
    state = replaceSession(state, finishSessionObject(current, lastActivityAt(current)));
    current = undefined;
  }
  if (current) return { state, session: clone(current), started: false };
  const session: Session = { id: uid(), title: title?.trim() || defaultTitle(now), startedAt: now, endedAt: null, entries: [] };
  return { state: { ...replaceSession(state, session), activeSessionId: session.id }, session, started: true };
}

// ---------- strength ----------

function logSets(state: WorkoutState, a: Extract<CoachAction, { type: 'log_sets' }>, ctx: ApplyContext): ApplyResult {
  const sets = a.sets.filter((s) => Number.isFinite(s.reps) && s.reps > 0);
  if (!a.exercise.trim() || sets.length === 0) {
    return { state, ok: false, message: 'Nothing logged: need an exercise name and at least one set with reps > 0.' };
  }
  const ensured = ensureSession(state, ctx.now);
  const session = ensured.session;
  // Moving on to lifting ends any cardio that was still running.
  for (const e of session.entries) {
    if (e.kind === 'cardio' && !e.finished) closeCardio(e, implicitEndMin(e, ctx.now));
  }
  const exercise = canonicalExercise(a.exercise);
  let entry = session.entries.find((e): e is StrengthEntry => e.kind === 'strength' && sameExercise(e.exercise, exercise));
  if (!entry) {
    entry = { id: uid(), kind: 'strength', exercise, sets: [], startedAt: ctx.now };
    session.entries.push(entry);
  }
  const previousBest = bestE1rm(ensured.state.sessions, exercise, ctx.prefs.weightUnit);
  const added: StrengthSet[] = sets.map((s, i) => ({
    id: uid(),
    reps: Math.round(s.reps),
    weight: s.weight == null ? null : round(s.weight, 2),
    unit: s.unit ?? ctx.prefs.weightUnit,
    ...(s.rpe != null ? { rpe: s.rpe } : {}),
    loggedAt: ctx.now + i,
  }));
  entry.sets.push(...added);
  if (a.notes) entry.notes = entry.notes ? `${entry.notes}\n${a.notes}` : a.notes;

  const next = replaceSession(ensured.state, session);
  const lines = [`Logged ${added.length} set${added.length > 1 ? 's' : ''} of ${exercise}: ${added.map(formatSet).join(', ')}.`];
  if (ensured.started) lines.unshift(`Started a new session "${session.title}".`);
  lines.push(`${exercise} today: ${entry.sets.map(formatSet).join(', ')}.`);
  const prev = exerciseHistory(next.sessions, exercise, session.id)[0];
  if (prev) lines.push(`Previous ${exercise} (${formatDate(prev.date)}): ${prev.entry.sets.map(formatSet).join(', ')}.`);
  else lines.push(`First time logging ${exercise}.`);
  const newBest = Math.max(...added.map((s) => convertWeight(e1rm(s), s.unit, ctx.prefs.weightUnit)));
  let highlight: string | undefined;
  if (previousBest > 0 && newBest > previousBest) {
    highlight = `New estimated 1RM PR on ${exercise}: ${round(newBest)} ${ctx.prefs.weightUnit} (was ${round(previousBest)}).`;
    lines.push(`New estimated 1RM PR: ${round(newBest)} ${ctx.prefs.weightUnit} (was ${round(previousBest)}).`);
  } else if (previousBest > 0) {
    lines.push(`Best estimated 1RM: ${round(previousBest)} ${ctx.prefs.weightUnit}.`);
  }

  const chipSets = added.length > 2 ? `${added.length} sets · ${formatSet(added[added.length - 1])}` : added.map(formatSet).join(', ');
  return { state: next, ok: true, message: lines.join(' '), chip: { kind: 'strength', text: `${exercise} · ${chipSets}` }, highlight };
}

// ---------- cardio ----------

function cardioSummary(entry: CardioEntry, state: WorkoutState, ctx: ApplyContext): string {
  const seg = entry.segments[entry.segments.length - 1];
  const parts = [
    `${CARDIO_LABELS[entry.activity]}${entry.finished ? ' finished' : ''}: ${formatCardioTotals(entry, ctx.prefs)}`,
  ];
  if (seg) parts.push(`current settings ${formatSegmentSettings(seg, ctx.prefs)}`);
  const kcal = cardioCalories(entry, ctx.prefs.bodyWeightKg);
  if (kcal != null) parts.push(`≈${Math.round(kcal)} kcal`);
  if (entry.segments.length > 1) {
    parts.push(
      `segments: ${entry.segments
        .map((s) => `${formatMinutes(s.startMin)}-${s.endMin == null ? 'now' : formatMinutes(s.endMin)} ${formatSegmentSettings(s, ctx.prefs)}`)
        .join('; ')}`,
    );
  }
  const prev = cardioHistory(state.sessions, entry.activity, entry.id)[0];
  if (prev) {
    const p = prev.entry;
    const bits = [`${formatMinutes(cardioDurationMin(p))}`];
    const inc = maxIncline(p);
    const spd = maxSpeed(p);
    if (inc != null) bits.push(`max ${inc}% incline`);
    if (spd != null) bits.push(`max ${round(spd)} km/h`);
    parts.push(`previous ${CARDIO_LABELS[p.activity]} (${formatDate(prev.date)}): ${bits.join(', ')}`);
  }
  return parts.join('. ') + '.';
}

function cardioChip(entry: CardioEntry, ctx: ApplyContext): LogChip {
  const seg = entry.segments[entry.segments.length - 1];
  const settings = seg ? ` · ${formatSegmentSettings(seg, ctx.prefs)}` : '';
  return {
    kind: 'cardio',
    text: `${CARDIO_LABELS[entry.activity]}${entry.finished ? ' ✓' : ''} · ${formatCardioTotals(entry, ctx.prefs)}${settings}`,
  };
}

function cardioUpdate(state: WorkoutState, a: Extract<CoachAction, { type: 'cardio_update' }>, ctx: ApplyContext): ApplyResult {
  const ensured = ensureSession(state, ctx.now);
  const session = ensured.session;
  const speedUnit = a.speedUnit ?? (ctx.prefs.distanceUnit === 'mi' ? 'mph' : 'km/h');

  // Starting a different machine finishes whatever cardio was still running.
  for (const e of session.entries) {
    if (e.kind === 'cardio' && !e.finished && e.activity !== a.activity) closeCardio(e, implicitEndMin(e, ctx.now));
  }

  let entry = [...session.entries]
    .reverse()
    .find((e): e is CardioEntry => e.kind === 'cardio' && e.activity === a.activity && !e.finished);
  const isNew = !entry;
  if (!entry) {
    entry = { id: uid(), kind: 'cardio', activity: a.activity, segments: [], lastAtMin: 0, lastAtTime: ctx.now, startedAt: ctx.now, finished: false };
    session.entries.push(entry);
  }

  let at = a.atMin ?? (isNew ? 0 : estimateNowMin(entry, ctx.now));
  const open: CardioSegment | undefined = entry.segments.find((s) => s.endMin == null);
  if (open) at = Math.max(at, open.startMin);

  const speedKmh = a.speed != null ? round(toKmh(a.speed, speedUnit), 2) : undefined;
  const settings = { speedKmh, incline: a.incline, level: a.level };
  const hasSettings = Object.values(settings).some((v) => v != null);

  if (!open) {
    if (hasSettings || entry.segments.length === 0) {
      const lastEnd = entry.segments.length ? (entry.segments[entry.segments.length - 1].endMin ?? 0) : 0;
      entry.segments.push({ id: uid(), startMin: lastEnd, endMin: null, ...stripUndefined(settings), ...(a.heartRate != null ? { heartRate: a.heartRate } : {}) });
    }
  } else {
    const changed =
      (speedKmh != null && speedKmh !== open.speedKmh) ||
      (a.incline != null && a.incline !== open.incline) ||
      (a.level != null && a.level !== open.level);
    const blank = open.speedKmh == null && open.incline == null && open.level == null;
    if (changed && (blank || at - open.startMin < 0.1)) {
      // Same moment the segment began, or it had no settings yet: fill it in rather than split.
      Object.assign(open, stripUndefined(settings));
      if (a.heartRate != null) open.heartRate = a.heartRate;
    } else if (changed) {
      open.endMin = at;
      entry.segments.push({
        id: uid(),
        startMin: at,
        endMin: null,
        ...stripUndefined({
          speedKmh: speedKmh ?? open.speedKmh,
          incline: a.incline ?? open.incline,
          level: a.level ?? open.level,
          heartRate: a.heartRate,
        }),
      });
    } else if (a.heartRate != null) {
      open.heartRate = a.heartRate;
    }
  }

  entry.lastAtMin = Math.max(at, entry.segments.find((s) => s.endMin == null)?.startMin ?? 0);
  entry.lastAtTime = ctx.now;
  if (a.distance != null) entry.distanceKm = round(toKm(a.distance, a.distanceUnit ?? ctx.prefs.distanceUnit), 3);
  if (a.calories != null) entry.calories = a.calories;
  if (a.notes) entry.notes = entry.notes ? `${entry.notes}\n${a.notes}` : a.notes;
  if (a.finished) closeCardio(entry, at);

  const next = replaceSession(ensured.state, session);
  const msg = (ensured.started ? `Started a new session "${session.title}". ` : '') + cardioSummary(entry, next, ctx);
  return { state: next, ok: true, message: msg, chip: cardioChip(entry, ctx) };
}

function logCardio(state: WorkoutState, a: Extract<CoachAction, { type: 'log_cardio' }>, ctx: ApplyContext): ApplyResult {
  const intervals = a.intervals.filter((i) => Number.isFinite(i.minutes) && i.minutes > 0);
  if (!intervals.length && !(a.totalMin && a.totalMin > 0) && a.distance == null) {
    return { state, ok: false, message: 'Nothing logged: give a duration (or intervals) or a distance.' };
  }
  const ensured = ensureSession(state, ctx.now);
  const session = ensured.session;
  const speedUnit = a.speedUnit ?? (ctx.prefs.distanceUnit === 'mi' ? 'mph' : 'km/h');
  const segments: CardioSegment[] = [];
  let t = 0;
  for (const i of intervals) {
    segments.push({
      id: uid(),
      startMin: t,
      endMin: t + i.minutes,
      ...stripUndefined({ speedKmh: i.speed != null ? round(toKmh(i.speed, speedUnit), 2) : undefined, incline: i.incline, level: i.level }),
    });
    t += i.minutes;
  }
  const total = Math.max(t, a.totalMin ?? 0);
  if (!segments.length && total > 0) segments.push({ id: uid(), startMin: 0, endMin: total });
  const entry: CardioEntry = {
    id: uid(),
    kind: 'cardio',
    activity: a.activity,
    segments,
    lastAtMin: total,
    lastAtTime: ctx.now,
    startedAt: ctx.now,
    finished: true,
    ...stripUndefined({
      distanceKm: a.distance != null ? round(toKm(a.distance, a.distanceUnit ?? ctx.prefs.distanceUnit), 3) : undefined,
      calories: a.calories,
      avgHeartRate: a.avgHeartRate,
      notes: a.notes,
    }),
  };
  session.entries.push(entry);
  const next = replaceSession(ensured.state, session);
  const msg = (ensured.started ? `Started a new session "${session.title}". ` : '') + cardioSummary(entry, next, ctx);
  return { state: next, ok: true, message: msg, chip: cardioChip(entry, ctx) };
}

// ---------- sessions ----------

function startSession(state: WorkoutState, a: Extract<CoachAction, { type: 'start_session' }>, ctx: ApplyContext): ApplyResult {
  const ensured = ensureSession(state, ctx.now, a.title);
  if (!ensured.started && a.title?.trim()) {
    const renamed = { ...ensured.session, title: a.title.trim() };
    return {
      state: replaceSession(ensured.state, renamed),
      ok: true,
      message: `A session was already in progress; renamed it to "${renamed.title}".`,
      chip: { kind: 'session', text: `Session: ${renamed.title}` },
    };
  }
  if (!ensured.started) {
    return { state: ensured.state, ok: true, message: `Session "${ensured.session.title}" is already in progress.` };
  }
  return {
    state: ensured.state,
    ok: true,
    message: `Started session "${ensured.session.title}".`,
    chip: { kind: 'session', text: `Started ${ensured.session.title}` },
  };
}

function finishSession(state: WorkoutState, a: Extract<CoachAction, { type: 'finish_session' }>, ctx: ApplyContext): ApplyResult {
  const current = activeSession(state);
  if (!current) return { state, ok: false, message: 'No session is in progress.' };
  const finished = finishSessionObject(current, ctx.now);
  if (a.notes) finished.notes = a.notes;
  const next = { ...replaceSession(state, finished), activeSessionId: null };
  const sum = summarizeSession(finished);
  const bits = [formatDuration(sessionDurationMin(finished))];
  if (sum.sets) bits.push(`${sum.sets} sets`, `${Math.round(sum.volumeKg)} kg volume`);
  if (sum.cardioMin) bits.push(`${Math.round(sum.cardioMin)} min cardio`);
  return {
    state: next,
    ok: true,
    message: `Finished "${finished.title}": ${bits.join(', ')}.`,
    chip: { kind: 'session', text: `Finished · ${bits.join(' · ')}` },
  };
}

export function applyAction(state: WorkoutState, action: CoachAction, ctx: ApplyContext): ApplyResult {
  switch (action.type) {
    case 'start_session':
      return startSession(state, action, ctx);
    case 'log_sets':
      return logSets(state, action, ctx);
    case 'cardio_update':
      return cardioUpdate(state, action, ctx);
    case 'log_cardio':
      return logCardio(state, action, ctx);
    case 'finish_session':
      return finishSession(state, action, ctx);
  }
}

// ---------- direct edits from the UI ----------

export function deleteSet(state: WorkoutState, sessionId: string, entryId: string, setId: string): WorkoutState {
  return mapSession(state, sessionId, (s) => ({
    ...s,
    entries: s.entries
      .map((e) => (e.id === entryId && e.kind === 'strength' ? { ...e, sets: e.sets.filter((x) => x.id !== setId) } : e))
      .filter((e) => e.kind !== 'strength' || e.sets.length > 0),
  }));
}

export function deleteEntry(state: WorkoutState, sessionId: string, entryId: string): WorkoutState {
  return mapSession(state, sessionId, (s) => ({ ...s, entries: s.entries.filter((e) => e.id !== entryId) }));
}

export function renameSession(state: WorkoutState, sessionId: string, title: string): WorkoutState {
  return mapSession(state, sessionId, (s) => ({ ...s, title: title.trim() || s.title }));
}

export function deleteSession(state: WorkoutState, sessionId: string): WorkoutState {
  return {
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
  };
}

function mapSession(state: WorkoutState, id: string, fn: (s: Session) => Session): WorkoutState {
  return { ...state, sessions: state.sessions.map((s) => (s.id === id ? fn(s) : s)) };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
}

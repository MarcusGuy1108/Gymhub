import { cardioCalories, cardioDistanceKm, cardioDurationMin } from '../stats';
import type { CardioEntry, StrengthEntry, WorkoutState } from '../types';
import { activeSession, applyAction, STALE_SESSION_MS, type CoachAction } from '../workout';

const prefs = { weightUnit: 'kg' as const, distanceUnit: 'km' as const, bodyWeightKg: 75 };
const T0 = new Date('2026-10-14T18:00:00').getTime();
const MIN = 60_000;

function run(actions: [number, CoachAction][], start: WorkoutState = { sessions: [], activeSessionId: null }) {
  let state = start;
  const results = [];
  for (const [minute, action] of actions) {
    const r = applyAction(state, action, { now: T0 + minute * MIN, prefs });
    state = r.state;
    results.push(r);
  }
  return { state, results };
}

const cardio = (state: WorkoutState, i = 0) => activeSession(state)!.entries.filter((e): e is CardioEntry => e.kind === 'cardio')[i];

describe('live treadmill updates', () => {
  it('builds segments as settings change', () => {
    const { state, results } = run([
      [5, { type: 'cardio_update', activity: 'treadmill', atMin: 5, incline: 10, speed: 5 }],
      [10, { type: 'cardio_update', activity: 'treadmill', atMin: 10, incline: 12 }],
      [15, { type: 'cardio_update', activity: 'treadmill', atMin: 15, speed: 5.5 }],
      [20, { type: 'cardio_update', activity: 'treadmill', atMin: 20, finished: true }],
    ]);
    const tm = cardio(state);
    expect(tm.segments.map((s) => [s.startMin, s.endMin, s.speedKmh, s.incline])).toEqual([
      [0, 10, 5, 10],
      [10, 15, 5, 12],
      [15, 20, 5.5, 12],
    ]);
    expect(tm.finished).toBe(true);
    expect(cardioDurationMin(tm)).toBe(20);
    // 10 min @5 + 5 min @5 + 5 min @5.5 = 0.8333 + 0.4167 + 0.4583
    expect(cardioDistanceKm(tm)).toBeCloseTo(1.7083, 3);
    expect(cardioCalories(tm, 75)).toBeGreaterThan(100);
    expect(results[0].message).toMatch(/Started a new session/);
    expect(results[0].chip?.text).toMatch(/Treadmill · 5:00 · ≈0.42 km · 5 km\/h, 10% incline/);
  });

  it('estimates elapsed time from the clock when not given', () => {
    const { state } = run([
      [0, { type: 'cardio_update', activity: 'treadmill', speed: 5, incline: 8 }],
      [7, { type: 'cardio_update', activity: 'treadmill', incline: 10 }],
    ]);
    const tm = cardio(state);
    expect(tm.segments.map((s) => [s.startMin, s.endMin, s.incline])).toEqual([
      [0, 7, 8],
      [7, null, 10],
    ]);
  });

  it('closes running cardio when lifting starts', () => {
    const { state } = run([
      [10, { type: 'cardio_update', activity: 'treadmill', atMin: 10, speed: 5, incline: 10 }],
      [14, { type: 'log_sets', exercise: 'squats', sets: [{ reps: 5, weight: 100 }] }],
    ]);
    const tm = cardio(state);
    expect(tm.finished).toBe(true);
    expect(cardioDurationMin(tm)).toBe(10);
  });

  it('logs finished cardio with intervals', () => {
    const { state } = run([
      [0, { type: 'log_cardio', activity: 'treadmill', intervals: [{ minutes: 10, speed: 5, incline: 10 }, { minutes: 10, speed: 6, incline: 12 }], distance: 1.9 }],
    ]);
    const tm = cardio(state);
    expect(tm.segments.map((s) => [s.startMin, s.endMin])).toEqual([
      [0, 10],
      [10, 20],
    ]);
    expect(cardioDistanceKm(tm)).toBe(1.9);
  });
});

describe('strength logging', () => {
  it('groups sets by exercise and flags PRs against history', () => {
    const day1 = run([[0, { type: 'log_sets', exercise: 'bench', sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }] }]]);
    const finished = applyAction(day1.state, { type: 'finish_session' }, { now: T0 + 60 * MIN, prefs }).state;
    const later = T0 + 2 * 24 * 60 * MIN;
    const r1 = applyAction(finished, { type: 'log_sets', exercise: 'Bench Press', sets: [{ reps: 6, weight: 85 }] }, { now: later, prefs });
    const r2 = applyAction(r1.state, { type: 'log_sets', exercise: 'flat bench', sets: [{ reps: 5, weight: 85 }] }, { now: later + 3 * MIN, prefs });

    const session = activeSession(r2.state)!;
    expect(session.entries).toHaveLength(1);
    const bench = session.entries[0] as StrengthEntry;
    expect(bench.exercise).toBe('Bench Press');
    expect(bench.sets.map((s) => s.reps)).toEqual([6, 5]);
    expect(r1.message).toMatch(/Previous Bench Press .*80 kg × 8, 80 kg × 8/);
    // 85×6 e1RM = 102 > 80×8 e1RM = 101.3
    expect(r1.message).toMatch(/New estimated 1RM PR: 102 kg/);
    expect(r2.state.sessions).toHaveLength(2);
  });

  it('starts a fresh session when the active one has gone stale', () => {
    const first = run([[0, { type: 'log_sets', exercise: 'squat', sets: [{ reps: 5, weight: 100 }] }]]);
    const r = applyAction(first.state, { type: 'log_sets', exercise: 'squat', sets: [{ reps: 5, weight: 102.5 }] }, { now: T0 + STALE_SESSION_MS + MIN, prefs });
    expect(r.state.sessions).toHaveLength(2);
    expect(r.state.sessions[1].endedAt).toBe(T0);
    expect(r.message).toMatch(/Started a new session/);
  });

  it('rejects empty sets', () => {
    const r = applyAction({ sessions: [], activeSessionId: null }, { type: 'log_sets', exercise: 'squat', sets: [] }, { now: T0, prefs });
    expect(r.ok).toBe(false);
    expect(r.state.sessions).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('renames on start_session while in progress and summarises on finish', () => {
    const { state, results } = run([
      [0, { type: 'log_sets', exercise: 'ohp', sets: [{ reps: 8, weight: 40 }] }],
      [1, { type: 'start_session', title: 'Push day' }],
      [45, { type: 'finish_session' }],
    ]);
    expect(results[1].message).toMatch(/renamed it to "Push day"/);
    expect(state.activeSessionId).toBeNull();
    expect(state.sessions[0].title).toBe('Push day');
    expect(results[2].message).toMatch(/45 min, 1 sets, 320 kg volume/);
  });
});

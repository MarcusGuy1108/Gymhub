import { parseMessage, type ParseContext } from '../parser';

const prefs = { weightUnit: 'kg' as const, distanceUnit: 'km' as const, bodyWeightKg: 75 };
const ctx = (extra: Partial<ParseContext> = {}): ParseContext => ({ prefs, ...extra });

describe('strength phrases', () => {
  const cases: [string, string, { reps: number; weight: number | null; unit?: string }[]][] = [
    ['bench 80kg x 8', 'Bench Press', [{ weight: 80, reps: 8, unit: 'kg' }]],
    ['Bench press 80 for 8', 'Bench Press', [{ weight: 80, reps: 8 }]],
    ['squat 3x5 at 100kg', 'Squat', Array(3).fill({ weight: 100, reps: 5, unit: 'kg' })],
    ['3 sets of 10 squats at 60', 'Squat', Array(3).fill({ weight: 60, reps: 10 })],
    ['did 8 reps at 80 on bench', 'Bench Press', [{ weight: 80, reps: 8 }]],
    ['deadlift 140kg 5 reps', 'Deadlift', [{ weight: 140, reps: 5, unit: 'kg' }]],
    ['pull ups 3x8', 'Pull Up', Array(3).fill({ weight: null, reps: 8 })],
    ['bench 80kg 8, 8, 6', 'Bench Press', [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 6 }]],
    ['10 push ups', 'Push Up', [{ weight: null, reps: 10 }]],
    ['curls 12.5kg x 10 rpe 8', 'Bicep Curl', [{ weight: 12.5, reps: 10 }]],
    ['bench 185 lbs for 5', 'Bench Press', [{ weight: 185, reps: 5, unit: 'lb' }]],
    ['leg press 3 x 12 @ 150', 'Leg Press', Array(3).fill({ weight: 150, reps: 12 })],
    ['Bench eighty kilos for eight reps', 'Bench Press', [{ weight: 80, reps: 8, unit: 'kg' }]],
    ['RDLs 3 sets of 8 at 90kg', 'Romanian Deadlift', Array(3).fill({ weight: 90, reps: 8 })],
  ];
  it.each(cases)('%s', (text, exercise, sets) => {
    const r = parseMessage(text, ctx());
    expect(r.unparsed).toEqual([]);
    expect(r.actions).toHaveLength(1);
    const a = r.actions[0];
    expect(a.type).toBe('log_sets');
    if (a.type !== 'log_sets') return;
    expect(a.exercise).toBe(exercise);
    expect(a.sets).toHaveLength(sets.length);
    a.sets.forEach((s, i) => {
      expect(s.reps).toBe(sets[i].reps);
      expect(s.weight ?? null).toBe(sets[i].weight);
      if (sets[i].unit) expect(s.unit).toBe(sets[i].unit);
    });
  });

  it('applies rpe', () => {
    const a = parseMessage('curls 12.5kg x 10 rpe 8', ctx()).actions[0];
    expect(a.type === 'log_sets' && a.sets[0].rpe).toBe(8);
  });

  it('uses the last exercise when none is named', () => {
    const r = parseMessage('80 x 7', ctx({ lastExercise: 'Bench Press' }));
    expect(r.actions[0]).toMatchObject({ type: 'log_sets', exercise: 'Bench Press', sets: [{ weight: 80, reps: 7 }] });
  });

  it('repeats the last set on "same again"', () => {
    const r = parseMessage('same again', ctx({ lastExercise: 'Squat', lastSet: { weight: 100, unit: 'kg', reps: 5 } }));
    expect(r.actions[0]).toMatchObject({ type: 'log_sets', exercise: 'Squat', sets: [{ weight: 100, reps: 5 }] });
  });

  it('"one more set of 6" keeps the weight', () => {
    const r = parseMessage('one more set of 6', ctx({ lastExercise: 'Squat', lastSet: { weight: 100, unit: 'kg', reps: 5 } }));
    expect(r.actions[0]).toMatchObject({ type: 'log_sets', exercise: 'Squat', sets: [{ weight: 100, reps: 6 }] });
  });

  it('splits several exercises in one message', () => {
    const r = parseMessage('bench 80x8, squats 100x5', ctx());
    expect(r.actions).toMatchObject([
      { type: 'log_sets', exercise: 'Bench Press', sets: [{ weight: 80, reps: 8 }] },
      { type: 'log_sets', exercise: 'Squat', sets: [{ weight: 100, reps: 5 }] },
    ]);
  });

  it('carries the exercise across "then"', () => {
    const r = parseMessage('lat pulldown 55kg x 12 then 60kg x 10', ctx());
    expect(r.actions).toMatchObject([
      { exercise: 'Lat Pulldown', sets: [{ weight: 55, reps: 12 }] },
      { exercise: 'Lat Pulldown', sets: [{ weight: 60, reps: 10 }] },
    ]);
  });

  it('names unknown exercises from the leftover words', () => {
    const r = parseMessage('cable kickbacks 20kg x 12', ctx());
    expect(r.actions[0]).toMatchObject({ type: 'log_sets', exercise: 'cable kickbacks', sets: [{ weight: 20, reps: 12 }] });
  });
});

describe('cardio phrases', () => {
  it('reads the treadmill status update from the brief', () => {
    const r = parseMessage('yeah currently at 5 minutes pushing 10%inc at 5k', ctx());
    expect(r.unparsed).toEqual([]);
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'cardio_update', activity: 'treadmill', atMin: 5, incline: 10, speed: 5, speedUnit: 'km/h' }),
    ]);
  });

  it('handles explicit units and mm:ss', () => {
    const r = parseMessage('treadmill 12:30 in, 3.5 mph at 12% incline', ctx());
    expect(r.actions[0]).toMatchObject({ type: 'cardio_update', activity: 'treadmill', incline: 12, speed: 3.5, speedUnit: 'mph' });
    expect(r.actions[0].type === 'cardio_update' && r.actions[0].atMin).toBeCloseTo(12.5);
  });

  it('follows up on the running activity', () => {
    const r = parseMessage('now at 12 minutes, upped it to 12%', ctx({ activeCardio: 'treadmill' }));
    expect(r.actions).toEqual([expect.objectContaining({ type: 'cardio_update', activity: 'treadmill', atMin: 12, incline: 12 })]);
  });

  it('finishes the running activity', () => {
    const r = parseMessage('done, 30 mins total, 2.6km', ctx({ activeCardio: 'treadmill' }));
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'cardio_update', activity: 'treadmill', atMin: 30, distance: 2.6, distanceUnit: 'km', finished: true }),
    ]);
  });

  it('logs after-the-fact cardio', () => {
    const r = parseMessage('did 30 minutes on the bike at level 8', ctx());
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'log_cardio', activity: 'bike', intervals: [expect.objectContaining({ minutes: 30, level: 8 })] }),
    ]);
  });

  it('treats "ran 5k" as distance', () => {
    const r = parseMessage('ran 5k in 25 minutes', ctx());
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'log_cardio', activity: 'run', distance: 5, distanceUnit: 'km', intervals: [expect.objectContaining({ minutes: 25 })] }),
    ]);
  });

  it('reads rower metres', () => {
    const r = parseMessage('did the rower 2000m in 8:05', ctx());
    const a = r.actions[0];
    expect(a).toMatchObject({ type: 'log_cardio', activity: 'rower', distance: 2000, distanceUnit: 'm' });
    expect(a.type === 'log_cardio' && a.intervals[0].minutes).toBeCloseTo(8.083, 2);
  });

  it('turns an inclined walk into treadmill', () => {
    const r = parseMessage('walking at 5.5 km/h 15% incline', ctx());
    expect(r.actions[0]).toMatchObject({ type: 'cardio_update', activity: 'treadmill', speed: 5.5, incline: 15 });
  });

  it('logs heart rate on the running activity', () => {
    const r = parseMessage('heart rate 145', ctx({ activeCardio: 'bike' }));
    expect(r.actions[0]).toMatchObject({ type: 'cardio_update', activity: 'bike', heartRate: 145 });
  });
});

describe('session commands', () => {
  it('starts a named session', () => {
    expect(parseMessage("starting push day", ctx()).actions).toEqual([{ type: 'start_session', title: 'Push day' }]);
  });
  it('finishes the session', () => {
    expect(parseMessage("that's it for today", ctx()).actions).toEqual([{ type: 'finish_session' }]);
    expect(parseMessage('end workout', ctx()).actions).toEqual([{ type: 'finish_session' }]);
  });
  it('undoes', () => {
    expect(parseMessage('scratch that', ctx()).undo).toBe(true);
  });
  it('reports what it could not read', () => {
    const r = parseMessage('how should I warm up?', ctx());
    expect(r.actions).toEqual([]);
    expect(r.unparsed.length).toBe(1);
  });
});

import { toActions } from '../apple';

describe('toActions (Apple on-device output)', () => {
  it('maps the treadmill status update', () => {
    const r = toActions({
      actions: [{ type: 'cardio_update', activity: 'treadmill', elapsedMinutes: 5, speed: 5, speedUnit: 'km/h', incline: 10 }],
      reply: '',
    });
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'cardio_update', activity: 'treadmill', atMin: 5, speed: 5, speedUnit: 'km/h', incline: 10 }),
    ]);
    expect(r.undo).toBe(false);
  });

  it('maps sets, treats missing weight as bodyweight, and keeps the reply', () => {
    const r = toActions({
      actions: [
        { type: 'log_sets', exercise: 'Pull Up', sets: [{ reps: 8 }, { reps: 7 }] },
        { type: 'log_sets', exercise: 'Bench Press', sets: [{ reps: 8, weight: 80, unit: 'kg' }] },
      ],
      reply: 'Nice work.',
    });
    expect(r.actions).toEqual([
      { type: 'log_sets', exercise: 'Pull Up', sets: [{ reps: 8, weight: null, unit: undefined }, { reps: 7, weight: null, unit: undefined }] },
      { type: 'log_sets', exercise: 'Bench Press', sets: [{ reps: 8, weight: 80, unit: 'kg' }] },
    ]);
    expect(r.reply).toBe('Nice work.');
  });

  it('uses the running activity when the model leaves it out', () => {
    const r = toActions({ actions: [{ type: 'cardio_update', incline: 12 }], reply: '' }, 'bike');
    expect(r.actions[0]).toMatchObject({ type: 'cardio_update', activity: 'bike', incline: 12 });
  });

  it('maps finished cardio, sessions and undo', () => {
    const r = toActions({
      actions: [
        { type: 'undo' },
        { type: 'log_cardio', activity: 'run', minutes: 25, distance: 5, distanceUnit: 'km' },
        { type: 'start_session', title: 'Leg day' },
        { type: 'finish_session' },
      ],
      reply: '',
    });
    expect(r.undo).toBe(true);
    expect(r.actions).toEqual([
      expect.objectContaining({ type: 'log_cardio', activity: 'run', distance: 5, distanceUnit: 'km', intervals: [expect.objectContaining({ minutes: 25 })] }),
      { type: 'start_session', title: 'Leg day' },
      { type: 'finish_session' },
    ]);
  });

  it('drops malformed items instead of logging them', () => {
    const r = toActions({
      actions: [
        { type: 'log_sets', exercise: 'Squat', sets: [{ reps: -3 }] },
        { type: 'log_sets', sets: [{ reps: 5 }] },
        { type: 'delete_everything' },
        { type: 'cardio_update', activity: 'spaceship' },
        'nonsense',
      ],
      reply: 42,
    });
    expect(r.actions).toEqual([]);
    expect(r.reply).toBe('');
    expect(toActions(null)).toEqual({ actions: [], undo: false, reply: '' });
  });
});

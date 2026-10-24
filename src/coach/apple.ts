import { FoundationModels } from 'expo-foundation-models';
import * as z from 'zod/v4';

import { CARDIO_ACTIVITIES } from '@/lib/exercises';
import type { CardioActivity } from '@/lib/types';
import type { CoachAction } from '@/lib/workout';

const INSTRUCTIONS = `You turn gym messages into workout log actions for the GymHub app, and answer questions briefly.
Each prompt starts with the app state (the current workout and recent history), then the user's message.
- Make one action per thing the user did or is doing. Don't log plans.
- log_sets: one item in "sets" per set; "3x10 at 60" is three sets of 10 reps at 60. Leave weight out for bodyweight. If no exercise is named, use the most recent exercise in the app state.
- cardio_update: a live update during cardio. elapsedMinutes is time into the activity ("12:30" is 12.5). On a treadmill, "at 5k" or "pushing 6.5k" means speed 5 or 6.5 km/h, and "10% inc" means incline 10. Set finished when they say they've stopped.
- log_cardio: cardio that's already over, described afterwards ("did 20 min on the bike at level 8"; "ran 5k in 25 minutes" is distance 5 km, minutes 25).
- start_session to start or name a workout, finish_session when they're done for the day, undo when they say the last log was wrong.
- reply: if they asked a question, answer in one or two sentences using the app state. Otherwise leave it empty.
Example: "currently at 5 minutes pushing 10%inc at 5k" gives one cardio_update with activity treadmill, elapsedMinutes 5, speed 5, speedUnit km/h, incline 10.`;

const TYPES = ['log_sets', 'cardio_update', 'log_cardio', 'start_session', 'finish_session', 'undo'] as const;

// Flat on purpose: the on-device model is small and does best with simple shapes.
const SCHEMA = {
  type: 'object' as const,
  properties: {
    actions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: [...TYPES] },
          exercise: { type: 'string' as const, description: 'Standard exercise name, e.g. Bench Press' },
          sets: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                reps: { type: 'integer' as const },
                weight: { type: 'number' as const },
                unit: { type: 'string' as const, enum: ['kg', 'lb'] },
              },
              required: ['reps'],
            },
          },
          activity: { type: 'string' as const, enum: [...CARDIO_ACTIVITIES] },
          elapsedMinutes: { type: 'number' as const },
          minutes: { type: 'number' as const, description: 'Duration of finished cardio' },
          speed: { type: 'number' as const },
          speedUnit: { type: 'string' as const, enum: ['km/h', 'mph'] },
          incline: { type: 'number' as const },
          level: { type: 'number' as const },
          heartRate: { type: 'number' as const },
          distance: { type: 'number' as const },
          distanceUnit: { type: 'string' as const, enum: ['km', 'mi', 'm'] },
          calories: { type: 'number' as const },
          finished: { type: 'boolean' as const },
          title: { type: 'string' as const, description: 'Workout name, e.g. Push day' },
        },
        required: ['type'],
      },
    },
    reply: { type: 'string' as const },
  },
  required: ['actions', 'reply'],
};

// The model's output is untrusted input: validate before it touches the log.
const Item = z.object({
  type: z.enum(TYPES),
  exercise: z.string().optional(),
  sets: z.array(z.object({ reps: z.number().positive(), weight: z.number().optional(), unit: z.enum(['kg', 'lb']).optional() })).optional(),
  activity: z.enum(CARDIO_ACTIVITIES as [CardioActivity, ...CardioActivity[]]).optional(),
  elapsedMinutes: z.number().nonnegative().optional(),
  minutes: z.number().positive().optional(),
  speed: z.number().positive().optional(),
  speedUnit: z.enum(['km/h', 'mph']).optional(),
  incline: z.number().optional(),
  level: z.number().optional(),
  heartRate: z.number().positive().optional(),
  distance: z.number().positive().optional(),
  distanceUnit: z.enum(['km', 'mi', 'm']).optional(),
  calories: z.number().nonnegative().optional(),
  finished: z.boolean().optional(),
  title: z.string().optional(),
});

export interface AppleResult {
  actions: CoachAction[];
  undo: boolean;
  reply: string;
}

/** Map validated model output to log actions; malformed items are dropped. */
export function toActions(output: unknown, defaultActivity: CardioActivity = 'treadmill'): AppleResult {
  const raw = (output ?? {}) as { actions?: unknown; reply?: unknown };
  const result: AppleResult = { actions: [], undo: false, reply: typeof raw.reply === 'string' ? raw.reply.trim() : '' };
  for (const item of Array.isArray(raw.actions) ? raw.actions : []) {
    const parsed = Item.safeParse(item);
    if (!parsed.success) continue;
    const a = parsed.data;
    const activity = a.activity ?? defaultActivity;
    switch (a.type) {
      case 'log_sets':
        if (a.exercise && a.sets?.length) {
          result.actions.push({ type: 'log_sets', exercise: a.exercise, sets: a.sets.map((s) => ({ reps: s.reps, weight: s.weight ?? null, unit: s.unit })) });
        }
        break;
      case 'cardio_update':
        result.actions.push({
          type: 'cardio_update', activity, atMin: a.elapsedMinutes, speed: a.speed, speedUnit: a.speedUnit, incline: a.incline,
          level: a.level, heartRate: a.heartRate, distance: a.distance, distanceUnit: a.distanceUnit, calories: a.calories, finished: a.finished,
        });
        break;
      case 'log_cardio':
        result.actions.push({
          type: 'log_cardio', activity, speedUnit: a.speedUnit, distance: a.distance, distanceUnit: a.distanceUnit, calories: a.calories, avgHeartRate: a.heartRate,
          intervals: a.minutes ? [{ minutes: a.minutes, speed: a.speed, incline: a.incline, level: a.level }] : [],
        });
        break;
      case 'start_session':
        result.actions.push({ type: 'start_session', title: a.title });
        break;
      case 'finish_session':
        result.actions.push({ type: 'finish_session' });
        break;
      case 'undo':
        result.undo = true;
        break;
    }
  }
  return result;
}

/** Apple Intelligence on this device (iOS 26+, supported iPhone, switched on). */
export function appleAvailable(): boolean {
  return FoundationModels.isAvailable();
}

export async function runAppleTurn(appState: string, userText: string, defaultActivity?: CardioActivity): Promise<AppleResult> {
  // A fresh session per message: the model's context is small, and app state carries what matters.
  const session = await FoundationModels.createSession(INSTRUCTIONS);
  try {
    const out = await FoundationModels.respondWithSchema(session, `${appState}\n\nUser: ${userText}`, SCHEMA, { temperature: 0 });
    return toActions(out, defaultActivity);
  } finally {
    FoundationModels.closeSession(session).catch(() => {});
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaMessage, BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import * as z from 'zod/v4';

import { CARDIO_ACTIVITIES } from '@/lib/exercises';
import type { CardioActivity } from '@/lib/types';
import type { ApplyResult, CoachAction, LogChip } from '@/lib/workout';
import type { ModelId } from '@/store/gym';

import { SYSTEM_PROMPT } from './prompt';

/** What the tools need from the app; injected so this module stays testable. */
export interface CoachEnv {
  dispatch: (action: CoachAction) => ApplyResult;
  undo: () => string;
  history: (name: string) => string;
}

/** Filled in as tools run, so the caller sees what was logged even if the turn later fails. */
export interface TurnLog {
  chips: LogChip[];
  highlights: string[];
}

export interface ClaudeTurn {
  text: string;
  /** Full transcript to keep for the next turn */
  messages: BetaMessageParam[];
}

const activity = z.enum(CARDIO_ACTIVITIES as [CardioActivity, ...CardioActivity[]]);
const speedUnit = z.enum(['km/h', 'mph']).optional().describe("Defaults to the user's preferred unit");
const distanceUnit = z.enum(['km', 'mi', 'm']).optional().describe("Defaults to the user's preferred unit");

function buildTools(env: CoachEnv, out: TurnLog) {
  const apply = (action: CoachAction): string => {
    const r = env.dispatch(action);
    if (!r.ok) throw new Error(r.message);
    if (r.chip) out.chips.push(r.chip);
    if (r.highlight) out.highlights.push(r.highlight);
    return r.message;
  };

  return [
    betaZodTool({
      name: 'log_strength_sets',
      description:
        'Record sets the user has completed for one exercise. One item per set, in order ("3x10 at 60" is three items). Sets for the same exercise in the same session are grouped automatically.',
      inputSchema: z.object({
        exercise: z.string().describe('Standard exercise name, e.g. "Bench Press", "Lat Pulldown", "Romanian Deadlift"'),
        sets: z
          .array(
            z.object({
              reps: z.number(),
              weight: z.number().nullable().describe('Load used; null for bodyweight'),
              unit: z.enum(['kg', 'lb']).optional().describe("Defaults to the user's preferred unit"),
              rpe: z.number().optional().describe('Rate of perceived exertion, if the user gave one'),
            }),
          )
          .min(1),
        notes: z.string().optional(),
      }),
      run: (i) => apply({ type: 'log_sets', exercise: i.exercise, sets: i.sets, notes: i.notes }),
    }),
    betaZodTool({
      name: 'cardio_update',
      description:
        "Record a live status update for cardio in progress, e.g. \"currently at 5 minutes pushing 10% incline at 5k\". Settings apply from now until the next update; the first update for an activity is assumed to cover the time since it started. Also use it with finished=true when they say they've stopped.",
      inputSchema: z.object({
        activity,
        elapsed_min: z
          .number()
          .optional()
          .describe('Minutes into this activity as the user said ("5 minutes in" → 5, "12:30" → 12.5). Omit if not said; the app estimates it from the clock.'),
        speed: z.number().optional(),
        speed_unit: speedUnit,
        incline_pct: z.number().optional(),
        level: z.number().optional().describe('Resistance level on bikes, ellipticals, stair climbers, rowers'),
        heart_rate: z.number().optional(),
        distance_so_far: z.number().optional().describe('Distance shown on the machine, if mentioned'),
        distance_unit: distanceUnit,
        calories: z.number().optional().describe('Calories shown on the machine, if mentioned'),
        finished: z.boolean().optional(),
        notes: z.string().optional(),
      }),
      run: (i) =>
        apply({
          type: 'cardio_update',
          activity: i.activity,
          atMin: i.elapsed_min,
          speed: i.speed,
          speedUnit: i.speed_unit,
          incline: i.incline_pct,
          level: i.level,
          heartRate: i.heart_rate,
          distance: i.distance_so_far,
          distanceUnit: i.distance_unit,
          calories: i.calories,
          finished: i.finished,
          notes: i.notes,
        }),
    }),
    betaZodTool({
      name: 'log_cardio',
      description:
        'Record a cardio bout that is already over, described after the fact (e.g. "did 20 min on the bike at level 8", "ran 5k in 26 minutes").',
      inputSchema: z.object({
        activity,
        intervals: z
          .array(
            z.object({
              minutes: z.number(),
              speed: z.number().optional(),
              incline_pct: z.number().optional(),
              level: z.number().optional(),
            }),
          )
          .describe('Consecutive stretches at constant settings; a single item for a steady effort. Empty if only a distance was given.'),
        speed_unit: speedUnit,
        total_min: z.number().optional(),
        distance: z.number().optional(),
        distance_unit: distanceUnit,
        calories: z.number().optional(),
        avg_heart_rate: z.number().optional(),
        notes: z.string().optional(),
      }),
      run: (i) =>
        apply({
          type: 'log_cardio',
          activity: i.activity,
          intervals: i.intervals.map((x) => ({ minutes: x.minutes, speed: x.speed, incline: x.incline_pct, level: x.level })),
          speedUnit: i.speed_unit,
          totalMin: i.total_min,
          distance: i.distance,
          distanceUnit: i.distance_unit,
          calories: i.calories,
          avgHeartRate: i.avg_heart_rate,
          notes: i.notes,
        }),
    }),
    betaZodTool({
      name: 'start_session',
      description:
        'Start a workout session, or rename the one in progress (e.g. "Push day"). Not required before logging: the first log starts a session automatically.',
      inputSchema: z.object({ title: z.string().optional() }),
      run: (i) => apply({ type: 'start_session', title: i.title }),
    }),
    betaZodTool({
      name: 'finish_session',
      description: 'End the current workout session when the user says they are done for the day. Running cardio is closed at its last reported time.',
      inputSchema: z.object({ notes: z.string().optional() }),
      run: (i) => apply({ type: 'finish_session', notes: i.notes }),
    }),
    betaZodTool({
      name: 'undo_last_log',
      description: 'Revert the most recent change to the log. Use when the user says something was logged wrong, then log the correction.',
      inputSchema: z.object({}),
      run: () => {
        out.chips.push({ kind: 'session', text: 'Undid last log' });
        return env.undo();
      },
    }),
    betaZodTool({
      name: 'get_history',
      description:
        'Look up past sessions for one exercise (e.g. "Squat") or cardio activity (e.g. "treadmill"), newest first. Use it for questions about progress or to set targets beyond what app_state shows.',
      inputSchema: z.object({ name: z.string() }),
      run: (i) => env.history(i.name),
    }),
  ];
}

function textOf(message: BetaMessage): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();
}

/** Server-side refusal fallback is available on these models. */
function supportsFallback(model: ModelId): boolean {
  return model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
}

export class ClaudeTurnError extends Error {
  constructor(
    message: string,
    public readonly kind: 'auth' | 'rate_limit' | 'connection' | 'api' | 'refusal',
    /** Transcript up to the last complete tool round, if any tools already ran */
    public readonly messages?: BetaMessageParam[],
  ) {
    super(message);
  }
}

export async function runClaudeTurn(opts: {
  apiKey: string;
  model: ModelId;
  history: BetaMessageParam[];
  appState: string;
  userText: string;
  env: CoachEnv;
  log: TurnLog;
  fetch?: typeof fetch;
}): Promise<ClaudeTurn> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    // The key is the user's own, kept on their device; there's no server in between.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: 90_000,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const fallback = supportsFallback(opts.model);

  const runner = client.beta.messages.toolRunner({
    model: opts.model,
    max_tokens: 16000,
    // Chat replies mid-set should be quick; low effort keeps thinking short.
    output_config: { effort: 'low' },
    cache_control: { type: 'ephemeral' },
    system: SYSTEM_PROMPT,
    tools: buildTools(opts.env, opts.log),
    messages: [
      ...opts.history,
      {
        role: 'user',
        content: [
          { type: 'text', text: opts.appState },
          { type: 'text', text: opts.userText },
        ],
      },
    ],
    max_iterations: 8,
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });

  let last: BetaMessage | undefined;
  try {
    for await (const message of runner) {
      last = message;
      if (message.stop_reason === 'refusal') break;
    }
  } catch (err) {
    const partial = runner.params.messages.length > opts.history.length + 1 ? [...runner.params.messages] : undefined;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ClaudeTurnError('Your Anthropic API key was rejected. Check it in Settings.', 'auth', partial);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ClaudeTurnError('Claude is rate limited right now. Try again in a moment.', 'rate_limit', partial);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new ClaudeTurnError("Couldn't reach Claude (no connection?).", 'connection', partial);
    }
    if (err instanceof Anthropic.APIError) {
      throw new ClaudeTurnError(`Claude API error ${err.status ?? ''}: ${err.message}`.trim(), 'api', partial);
    }
    throw err;
  }

  if (!last) throw new ClaudeTurnError('Claude returned no reply.', 'api');
  if (last.stop_reason === 'refusal') {
    // Drop the declined turn so it doesn't poison the rest of the conversation.
    throw new ClaudeTurnError("Claude couldn't help with that one.", 'refusal');
  }

  return { text: textOf(last), messages: [...runner.params.messages] };
}

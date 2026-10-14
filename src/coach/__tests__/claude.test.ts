import type { WorkoutState } from '@/lib/types';
import { applyAction, type CoachAction } from '@/lib/workout';

import { runClaudeTurn, type TurnLog } from '../claude';

const prefs = { weightUnit: 'kg' as const, distanceUnit: 'km' as const, bodyWeightKg: 75 };

function reply(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const usage = { input_tokens: 10, output_tokens: 10 };

describe('runClaudeTurn', () => {
  it('runs tool calls against the log and returns the transcript', async () => {
    let state: WorkoutState = { sessions: [], activeSessionId: null };
    const dispatched: CoachAction[] = [];
    const requests: { url: string; headers: Record<string, string>; body: any }[] = [];

    const fakeFetch = jest.fn(async (url: string, init: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
      requests.push({ url, headers, body: JSON.parse(init.body as string) });
      if (requests.length === 1) {
        return reply({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'cardio_update',
              input: { activity: 'treadmill', elapsed_min: 5, speed: 5, speed_unit: 'km/h', incline_pct: 10 },
            },
          ],
          usage,
        });
      }
      return reply({
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Logged 5:00 at 10%, 5 km/h. Bump to 11% at 10 min.' }],
        usage,
      });
    });

    const log: TurnLog = { chips: [], highlights: [] };
    const turn = await runClaudeTurn({
      apiKey: 'sk-ant-test',
      model: 'claude-opus-5-5',
      history: [],
      appState: '<app_state>\nNo active session\n</app_state>',
      userText: 'yeah currently at 5 minutes pushing 10%inc at 5k',
      log,
      fetch: fakeFetch as unknown as typeof fetch,
      env: {
        dispatch: (action) => {
          dispatched.push(action);
          const r = applyAction(state, action, { now: Date.now(), prefs });
          state = r.state;
          return r;
        },
        undo: () => 'Nothing to undo.',
        history: () => 'No history.',
      },
    });

    // The model's tool call became a log entry.
    expect(dispatched).toEqual([
      expect.objectContaining({ type: 'cardio_update', activity: 'treadmill', atMin: 5, speed: 5, speedUnit: 'km/h', incline: 10 }),
    ]);
    expect(log.chips).toEqual([expect.objectContaining({ kind: 'cardio', text: expect.stringContaining('Treadmill · 5:00') })]);
    expect(turn.text).toMatch(/Bump to 11%/);

    // Request shape.
    const first = requests[0];
    expect(first.url).toMatch(/\/v1\/messages/);
    expect(first.headers['x-api-key']).toBe('sk-ant-test');
    expect(first.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(first.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
    });
    expect(first.body.thinking).toBeUndefined();
    expect(first.body.tool_choice).toBeUndefined();
    expect(first.body.tools.map((t: { name: string }) => t.name)).toEqual([
      'log_strength_sets',
      'cardio_update',
      'log_cardio',
      'start_session',
      'finish_session',
      'undo_last_log',
      'get_history',
    ]);
    expect(first.body.messages[0].content[1].text).toMatch(/10%inc at 5k/);

    // Second request carries the tool result back.
    const toolResult = requests[1].body.messages[2].content[0];
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
    expect(JSON.stringify(toolResult.content)).toMatch(/Treadmill: 5:00/);

    // Transcript: user, assistant(tool_use), user(tool_result), assistant(text)
    expect(turn.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('skips fallbacks on Haiku and surfaces auth errors', async () => {
    let body: any;
    const fakeFetch = jest.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    });
    await expect(
      runClaudeTurn({
        apiKey: 'bad',
        model: 'claude-haiku-5-5',
        history: [],
        appState: '<app_state></app_state>',
        userText: 'bench 80 x 8',
        log: { chips: [], highlights: [] },
        fetch: fakeFetch as unknown as typeof fetch,
        env: { dispatch: jest.fn(), undo: jest.fn(), history: jest.fn() },
      }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(body.fallbacks).toBeUndefined();
    expect(body.model).toBe('claude-haiku-5-5');
  });
});

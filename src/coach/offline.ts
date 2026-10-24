import { parseMessage, type ParseContext } from '@/lib/parser';
import { OFFLINE_HELP, suggestAfter } from '@/lib/suggest';
import type { CardioEntry, StrengthEntry } from '@/lib/types';
import { activeSession, type CoachAction, type LogChip } from '@/lib/workout';
import { useGym } from '@/store/gym';

export function parseContext(): ParseContext {
  const s = useGym.getState();
  const session = activeSession(s);
  let lastStrength: StrengthEntry | undefined;
  let lastAt = -1;
  for (const e of session?.entries ?? []) {
    if (e.kind !== 'strength') continue;
    const t = e.sets[e.sets.length - 1]?.loggedAt ?? e.startedAt;
    if (t > lastAt) {
      lastAt = t;
      lastStrength = e;
    }
  }
  const lastSet = lastStrength?.sets[lastStrength.sets.length - 1];
  const running = session?.entries.find((e): e is CardioEntry => e.kind === 'cardio' && !e.finished);
  return {
    prefs: s.prefs,
    lastExercise: lastStrength?.exercise,
    lastSet: lastSet ? { weight: lastSet.weight, unit: lastSet.unit, reps: lastSet.reps } : undefined,
    activeCardio: running?.activity,
  };
}

export interface TurnReply {
  text: string;
  chips: LogChip[];
  logged: boolean;
}

/** Apply actions to the log and reply with any PRs plus a rule-based tip. */
export function applyActions(actions: CoachAction[], undo = false): TurnReply {
  const chips: LogChip[] = [];
  const notes: string[] = [];
  if (undo) {
    notes.push(useGym.getState().undo());
    chips.push({ kind: 'session', text: 'Undid last log' });
  }
  let tip: string | undefined;
  for (const action of actions) {
    const r = useGym.getState().dispatch(action);
    if (!r.ok) {
      notes.push(r.message);
      continue;
    }
    if (r.chip) chips.push(r.chip);
    if (r.highlight) notes.push(r.highlight);
    const s = useGym.getState();
    tip = suggestAfter(s, action, s.prefs) ?? tip;
  }

  if (tip) notes.push(tip);
  return { text: notes.join(' '), chips, logged: chips.length > 0 };
}

/** Log a message with the built-in parser and reply with rule-based coaching. */
export function offlineTurn(text: string): TurnReply {
  const parsed = parseMessage(text, parseContext());
  const r = applyActions(parsed.actions, parsed.undo);
  if (!r.logged) return { ...r, text: r.text || OFFLINE_HELP };
  if (parsed.unparsed.length) r.text += ` (Couldn't read: "${parsed.unparsed.join('", "')}")`;
  return r;
}

import { parseMessage, type ParseContext } from '@/lib/parser';
import { OFFLINE_HELP, suggestAfter } from '@/lib/suggest';
import type { CardioEntry, StrengthEntry } from '@/lib/types';
import { activeSession, type LogChip } from '@/lib/workout';
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

/** Log a message with the built-in parser and reply with rule-based coaching. */
export function offlineTurn(text: string): { text: string; chips: LogChip[]; logged: boolean } {
  const parsed = parseMessage(text, parseContext());
  if (parsed.undo) {
    const msg = useGym.getState().undo();
    return { text: msg, chips: [{ kind: 'session', text: 'Undid last log' }], logged: true };
  }

  const chips: LogChip[] = [];
  const notes: string[] = [];
  let tip: string | undefined;
  for (const action of parsed.actions) {
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

  if (!chips.length) return { text: notes.join(' ') || OFFLINE_HELP, chips, logged: false };
  const parts = [...notes];
  if (tip) parts.push(tip);
  if (parsed.unparsed.length) parts.push(`(Couldn't read: "${parsed.unparsed.join('", "')}")`);
  return { text: parts.join(' '), chips, logged: true };
}

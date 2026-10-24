import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uid } from '@/lib/id';
import type { Prefs, Session, WorkoutState } from '@/lib/types';
import {
  activeSession,
  applyAction,
  deleteEntry,
  deleteSession,
  deleteSet,
  renameSession,
  type ApplyResult,
  type CoachAction,
  type LogChip,
} from '@/lib/workout';

import { liveHeartRate } from './heart-rate';

export type ModelId = 'apple' | 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

export const MODELS: { id: ModelId; label: string; blurb: string }[] = [
  { id: 'apple', label: 'Apple Intelligence', blurb: 'On-device, free and private (default)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', blurb: 'Smartest coaching · needs an API key' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', blurb: 'Faster, cheaper' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', blurb: 'Fastest, cheapest' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'coach' | 'divider';
  text: string;
  at: number;
  chips?: LogChip[];
  /** Who wrote a coach message: Claude, Apple's on-device model, or the built-in offline parser */
  source?: 'claude' | 'apple' | 'offline';
  error?: boolean;
}

/** Sessions as they were before one change, so it can be undone. */
interface UndoStep {
  activeSessionId: string | null;
  before: { id: string; session: Session | null }[];
}

interface GymState extends WorkoutState {
  prefs: Prefs;
  model: ModelId;
  speakReplies: boolean;
  /** Stream live heart rate from a Bluetooth strap (e.g. Whoop) */
  heartRateMonitor: boolean;
  chat: ChatMessage[];
  /** Claude conversation transcript (append-only, reset per gym visit) */
  apiMessages: BetaMessageParam[];
  undoStack: UndoStep[];

  dispatch: (action: CoachAction, now?: number) => ApplyResult;
  undo: () => string;
  deleteSet: (sessionId: string, entryId: string, setId: string) => void;
  deleteEntry: (sessionId: string, entryId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;

  addChat: (msg: Omit<ChatMessage, 'id' | 'at'> & { at?: number }) => string;
  setApiMessages: (messages: BetaMessageParam[]) => void;
  newConversation: () => void;
  clearChat: () => void;

  setPrefs: (p: Partial<Prefs>) => void;
  setModel: (m: ModelId) => void;
  setSpeakReplies: (v: boolean) => void;
  setHeartRateMonitor: (v: boolean) => void;
  resetAll: () => void;
}

const DEFAULT_PREFS: Prefs = { weightUnit: 'kg', distanceUnit: 'km', bodyWeightKg: 75 };

function snapshot(prev: WorkoutState, next: WorkoutState): UndoStep | null {
  const before: UndoStep['before'] = [];
  const prevById = new Map(prev.sessions.map((s) => [s.id, s]));
  for (const s of next.sessions) {
    const old = prevById.get(s.id);
    if (old !== s) before.push({ id: s.id, session: old ?? null });
  }
  for (const s of prev.sessions) {
    if (!next.sessions.some((n) => n.id === s.id)) before.push({ id: s.id, session: s });
  }
  if (!before.length && prev.activeSessionId === next.activeSessionId) return null;
  return { activeSessionId: prev.activeSessionId, before };
}

function workout(s: GymState): WorkoutState {
  return { sessions: s.sessions, activeSessionId: s.activeSessionId };
}

export const useGym = create<GymState>()(
  persist(
    (set, get) => {
      const commit = (next: WorkoutState) => {
        const prev = workout(get());
        const step = snapshot(prev, next);
        set({
          sessions: next.sessions,
          activeSessionId: next.activeSessionId,
          undoStack: step ? [...get().undoStack, step].slice(-30) : get().undoStack,
        });
      };

      return {
        sessions: [],
        activeSessionId: null,
        prefs: DEFAULT_PREFS,
        model: 'apple',
        speakReplies: false,
        heartRateMonitor: false,
        chat: [],
        apiMessages: [],
        undoStack: [],

        dispatch: (action, now = Date.now()) => {
          // Stamp the strap's live reading onto cardio updates that don't carry one.
          const bpm = liveHeartRate(now);
          if (bpm && action.type === 'cardio_update' && action.heartRate == null) action = { ...action, heartRate: bpm };
          const result = applyAction(workout(get()), action, { now, prefs: get().prefs });
          if (result.ok) commit(result.state);
          return result;
        },

        undo: () => {
          const step = get().undoStack.at(-1);
          if (!step) return 'Nothing to undo.';
          let sessions = [...get().sessions];
          for (const { id, session } of step.before) {
            const idx = sessions.findIndex((s) => s.id === id);
            if (session == null) sessions = sessions.filter((s) => s.id !== id);
            else if (idx >= 0) sessions[idx] = session;
            else sessions = [session, ...sessions];
          }
          sessions.sort((a, b) => b.startedAt - a.startedAt);
          set({ sessions, activeSessionId: step.activeSessionId, undoStack: get().undoStack.slice(0, -1) });
          const active = activeSession({ sessions, activeSessionId: step.activeSessionId });
          return active ? `Undone. Current session "${active.title}" has ${active.entries.length} entr${active.entries.length === 1 ? 'y' : 'ies'}.` : 'Undone.';
        },

        deleteSet: (sessionId, entryId, setId) => commit(deleteSet(workout(get()), sessionId, entryId, setId)),
        deleteEntry: (sessionId, entryId) => commit(deleteEntry(workout(get()), sessionId, entryId)),
        deleteSession: (sessionId) => commit(deleteSession(workout(get()), sessionId)),
        renameSession: (sessionId, title) => commit(renameSession(workout(get()), sessionId, title)),

        addChat: (msg) => {
          const id = uid();
          set({ chat: [...get().chat, { ...msg, id, at: msg.at ?? Date.now() }].slice(-300) });
          return id;
        },
        setApiMessages: (apiMessages) => set({ apiMessages }),
        newConversation: () => {
          const chat = get().chat;
          const needsDivider = chat.length > 0 && chat[chat.length - 1].role !== 'divider';
          set({
            apiMessages: [],
            chat: needsDivider ? [...chat, { id: uid(), role: 'divider', text: 'New conversation', at: Date.now() }] : chat,
          });
        },
        clearChat: () => set({ chat: [], apiMessages: [] }),

        setPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
        setModel: (model) => set({ model }),
        setSpeakReplies: (speakReplies) => set({ speakReplies }),
        setHeartRateMonitor: (heartRateMonitor) => set({ heartRateMonitor }),
        resetAll: () =>
          set({ sessions: [], activeSessionId: null, chat: [], apiMessages: [], undoStack: [], prefs: DEFAULT_PREFS }),
      };
    },
    {
      name: 'gymhub',
      version: 2,
      // v1 defaulted to Claude; Apple's on-device model is the default from v2.
      migrate: (state, version) => (version < 2 ? { ...(state as object), model: 'apple' } : state) as GymState,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        prefs: s.prefs,
        model: s.model,
        speakReplies: s.speakReplies,
        heartRateMonitor: s.heartRateMonitor,
        chat: s.chat,
        apiMessages: s.apiMessages,
      }),
    },
  ),
);

export function useActiveSession(): Session | undefined {
  return useGym((s) => activeSession(s));
}

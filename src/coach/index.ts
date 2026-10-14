import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { useGym } from '@/store/gym';
import { getApiKey } from '@/store/secure';

import { ClaudeTurnError, runClaudeTurn, type TurnLog } from './claude';
import { buildAppState, historyFor } from './context';
import { offlineTurn } from './offline';

/** A gap this long starts a fresh Claude conversation (a new gym visit). */
const NEW_CONVERSATION_GAP_MS = 6 * 60 * 60 * 1000;

function feedback(logged: boolean) {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(logged ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function speak(text: string) {
  if (!useGym.getState().speakReplies || !text) return;
  Speech.stop();
  Speech.speak(text.replace(/[≈~]/g, 'about ').replace(/×/g, ' by '));
}

export async function sendToCoach(text: string): Promise<void> {
  const store = useGym.getState();
  const last = store.chat.filter((m) => m.role !== 'divider').at(-1);
  if (last && Date.now() - last.at > NEW_CONVERSATION_GAP_MS && store.apiMessages.length) store.newConversation();
  store.addChat({ role: 'user', text });

  const apiKey = await getApiKey();
  if (!apiKey) {
    const r = offlineTurn(text);
    store.addChat({ role: 'coach', text: r.text, chips: r.chips, source: 'offline' });
    feedback(r.logged);
    speak(r.text);
    return;
  }

  const log: TurnLog = { chips: [], highlights: [] };
  const s = useGym.getState();
  try {
    const turn = await runClaudeTurn({
      apiKey,
      model: s.model,
      history: s.apiMessages,
      appState: buildAppState(s, s.prefs),
      userText: text,
      log,
      env: {
        dispatch: (action) => useGym.getState().dispatch(action),
        undo: () => useGym.getState().undo(),
        history: (name) => historyFor(useGym.getState(), name, useGym.getState().prefs),
      },
    });
    useGym.getState().setApiMessages(turn.messages);
    const reply = turn.text || (log.chips.length ? 'Logged.' : '…');
    useGym.getState().addChat({ role: 'coach', text: reply, chips: log.chips, source: 'claude' });
    feedback(log.chips.length > 0);
    speak(reply);
  } catch (err) {
    const e = err instanceof ClaudeTurnError ? err : new ClaudeTurnError(String((err as Error)?.message ?? err), 'api');
    if (e.messages) useGym.getState().setApiMessages(e.messages);
    // No connection and nothing logged yet: fall back to the built-in parser.
    if (e.kind === 'connection' && !log.chips.length) {
      const r = offlineTurn(text);
      useGym.getState().addChat({ role: 'coach', text: `${r.text}\n\n(Offline — used the built-in parser.)`, chips: r.chips, source: 'offline' });
      feedback(r.logged);
      speak(r.text);
      return;
    }
    useGym.getState().addChat({ role: 'coach', text: e.message, chips: log.chips, error: true, source: 'claude' });
    feedback(false);
  }
}

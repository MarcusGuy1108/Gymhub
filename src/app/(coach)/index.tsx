import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble, TypingBubble } from '@/components/chat-bubble';
import { LiveBanner } from '@/components/live-banner';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip, Icon } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { sendToCoach } from '@/coach';
import { useKeyboardVisible } from '@/hooks/use-keyboard';
import { useTheme } from '@/hooks/use-theme';
import { CARDIO_LABELS } from '@/lib/exercises';
import { formatNumber } from '@/lib/format';
import { currentSegment } from '@/lib/stats';
import type { CardioEntry, StrengthEntry } from '@/lib/types';
import { KM_PER_MILE } from '@/lib/units';
import { MODELS, useActiveSession, useGym, type ChatMessage } from '@/store/gym';
import { getApiKey } from '@/store/secure';

const EXAMPLES = [
  'Starting push day',
  'Bench 60kg x 10',
  '3x8 squats at 100',
  'Currently at 5 minutes pushing 10% inc at 5k',
  'Did 20 min on the bike at level 8',
  "That's it for today",
];

function useQuickReplies(): { label: string; message: string }[] {
  const session = useActiveSession();
  const prefs = useGym((s) => s.prefs);
  return useMemo(() => {
    if (!session) return [];
    const replies: { label: string; message: string }[] = [];
    const running = session.entries.find((e): e is CardioEntry => e.kind === 'cardio' && !e.finished);
    if (running) {
      const seg = currentSegment(running);
      if (seg?.incline != null) replies.push({ label: `Incline ${formatNumber(seg.incline + 1)}%`, message: `incline ${formatNumber(seg.incline + 1)}%` });
      if (seg?.speedKmh != null) {
        const speed = prefs.distanceUnit === 'mi' ? seg.speedKmh / KM_PER_MILE : seg.speedKmh;
        const next = formatNumber(Math.round((speed + 0.5) * 10) / 10);
        replies.push({ label: `Speed ${next}`, message: `speed ${next}` });
      }
      if (seg?.level != null) replies.push({ label: `Level ${seg.level + 1}`, message: `level ${seg.level + 1}` });
      replies.push({ label: `Done with ${CARDIO_LABELS[running.activity].toLowerCase()}`, message: 'done' });
    } else {
      const lastStrength = [...session.entries].reverse().find((e): e is StrengthEntry => e.kind === 'strength');
      if (lastStrength) replies.push({ label: 'Same again', message: 'same again' });
    }
    replies.push({ label: 'Finish workout', message: 'finish workout' });
    return replies;
  }, [session, prefs.distanceUnit]);
}

export default function CoachScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const chat = useGym((s) => s.chat);
  const model = useGym((s) => s.model);
  const newConversation = useGym((s) => s.newConversation);
  const keyboard = useKeyboardVisible();
  const quick = useQuickReplies();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      getApiKey().then((k) => setHasKey(!!k));
    }, []),
  );

  const send = async (message?: string) => {
    const t = (message ?? text).trim();
    if (!t || busy) return;
    if (message == null) setText('');
    setBusy(true);
    try {
      await sendToCoach(t);
    } finally {
      setBusy(false);
    }
  };

  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const bottomPad = keyboard ? Spacing.two : insets.bottom + BottomTabInset + Spacing.two;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.flex}>
          <ThemedText type="title">Coach</ThemedText>
          <Pressable onPress={() => hasKey === false && router.navigate('/settings')}>
            <ThemedText type="small" themeColor={hasKey === false ? 'accent' : 'textSecondary'}>
              {hasKey === false ? 'Offline mode · tap to add a Claude API key →' : hasKey ? `Claude ${modelLabel}` : ' '}
            </ThemedText>
          </Pressable>
        </View>
        {chat.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="New conversation" onPress={newConversation} hitSlop={10} style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}>
            <Icon name={{ ios: 'square.and.pencil', web: 'edit_square', android: 'edit_square' }} size={18} color="accent" />
          </Pressable>
        ) : null}
      </View>

      <LiveBanner />

      <FlatList
        ref={listRef}
        style={styles.flex}
        data={chat}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={[styles.listContent, chat.length === 0 && styles.flexGrow]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Welcome onPick={(t) => { setText(t); inputRef.current?.focus(); }} />}
        ListFooterComponent={busy ? <TypingBubble /> : null}
      />

      <View style={[styles.composerWrap, { paddingBottom: bottomPad }]}>
        {quick.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
            {quick.map((q) => (
              <Chip key={q.label} label={q.label} tone={q.message === 'done' || q.label.startsWith('Incline') || q.label.startsWith('Speed') || q.label.startsWith('Level') ? 'cardio' : 'accent'} onPress={() => send(q.message)} />
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="What did you just do? (tap 🎤 on the keyboard to talk)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => send()}
            accessibilityLabel="Message the coach"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={() => send()}
            disabled={!text.trim() || busy}
            style={[styles.send, { backgroundColor: theme.accent, opacity: !text.trim() || busy ? 0.35 : 1 }]}>
            <Icon name={{ ios: 'arrow.up', web: 'arrow_upward', android: 'arrow_upward' }} size={18} color="accentText" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <View style={styles.welcome}>
      <Card>
        <ThemedText type="subtitle">Just tell me what you did.</ThemedText>
        <ThemedText themeColor="textSecondary">
          Type or dictate as you train and I’ll fill in your log — sets, reps, weights, treadmill speed and incline — and tell you what to go for next.
        </ThemedText>
      </Card>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.tryLabel}>
        TRY SAYING
      </ThemedText>
      <View style={styles.examples}>
        {EXAMPLES.map((e) => (
          <Chip key={e} label={e} onPress={() => onPick(e)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: Spacing.two },
  composerWrap: { paddingHorizontal: Spacing.three, paddingTop: Spacing.one, gap: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  quick: { gap: Spacing.two, paddingVertical: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: Radius.large + 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: Spacing.three,
    paddingRight: 6,
    paddingVertical: 6,
    gap: Spacing.two,
  },
  input: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  welcome: { flex: 1, justifyContent: 'center', padding: Spacing.three, gap: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  tryLabel: { marginTop: Spacing.two, letterSpacing: 0.6 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

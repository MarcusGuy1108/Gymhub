import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, SectionHeader, Segmented, confirm } from '@/components/ui';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MODELS, useGym } from '@/store/gym';
import { connectHeartRate, disconnectHeartRate, useHeartRate } from '@/store/heart-rate';
import { getApiKey, setApiKey } from '@/store/secure';

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = useGym((s) => s.prefs);
  const setPrefs = useGym((s) => s.setPrefs);
  const model = useGym((s) => s.model);
  const setModel = useGym((s) => s.setModel);
  const speak = useGym((s) => s.speakReplies);
  const setSpeak = useGym((s) => s.setSpeakReplies);
  const hrOn = useGym((s) => s.heartRateMonitor);
  const setHrOn = useGym((s) => s.setHeartRateMonitor);
  const hr = useHeartRate();
  const sessions = useGym((s) => s.sessions);
  const clearChat = useGym((s) => s.clearChat);
  const resetAll = useGym((s) => s.resetAll);

  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [bodyWeight, setBodyWeight] = useState(String(prefs.bodyWeightKg));

  useFocusEffect(
    useCallback(() => {
      getApiKey().then(setSavedKey);
    }, []),
  );

  const saveKey = async () => {
    await setApiKey(keyDraft);
    setSavedKey(keyDraft.trim() || null);
    setKeyDraft('');
  };

  const exportData = () => {
    Share.share({ title: 'GymHub export', message: JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2) }).catch(() => {});
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BottomTabInset + Spacing.four }]}>
      <SectionHeader title="Coach" />
      <Card>
        <ThemedText type="heading">Anthropic API key</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only needed for the Claude models below. The key is stored in your iPhone’s Keychain and only sent to Anthropic.
        </ThemedText>
        {savedKey ? (
          <View style={styles.row}>
            <ThemedText type="mono" style={styles.flex}>
              {savedKey.slice(0, 10)}…{savedKey.slice(-4)}
            </ThemedText>
            <Button title="Remove" kind="danger" compact onPress={() => confirm('Remove API key?', 'The Coach will switch to offline mode.', async () => { await setApiKey(null); setSavedKey(null); }, 'Remove')} />
          </View>
        ) : (
          <View style={styles.row}>
            <Field value={keyDraft} onChangeText={setKeyDraft} placeholder="sk-ant-…" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Button title="Save" compact onPress={saveKey} disabled={!keyDraft.trim()} style={styles.saveBtn} />
          </View>
        )}
        <Pressable onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}>
          <ThemedText type="small" themeColor="accent">
            Get a key at console.anthropic.com →
          </ThemedText>
        </Pressable>
      </Card>

      <Card>
        <ThemedText type="heading">Model</ThemedText>
        {MODELS.map((m) => (
          <Pressable key={m.id} onPress={() => setModel(m.id)} style={[styles.option, { borderTopColor: theme.border }]} accessibilityRole="radio" accessibilityState={{ selected: m.id === model }}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">{m.label}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {m.blurb}
              </ThemedText>
            </View>
            <View style={[styles.radio, { borderColor: m.id === model ? theme.accent : theme.border }]}>
              {m.id === model ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
            </View>
          </Pressable>
        ))}
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="heading">Read replies aloud</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Hands-free on the treadmill — pair with keyboard dictation.
            </ThemedText>
          </View>
          <Switch value={speak} onValueChange={setSpeak} trackColor={{ true: theme.accent }} />
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="heading">Live heart rate</ThemedText>
            <ThemedText type="small" themeColor={hr.status === 'error' ? 'danger' : 'textSecondary'}>
              {hr.status === 'connected'
                ? `${hr.device} · ${hr.bpm ?? '–'} bpm`
                : hr.status === 'searching'
                  ? 'Looking for your strap…'
                  : hr.status === 'error'
                    ? hr.error
                    : 'Reads your Whoop or any Bluetooth heart-rate strap. Works alongside noop.'}
            </ThemedText>
          </View>
          <Switch
            value={hrOn}
            onValueChange={(on) => {
              setHrOn(on);
              if (on) connectHeartRate();
              else disconnectHeartRate();
            }}
            trackColor={{ true: theme.accent }}
          />
        </View>
        {hrOn && hr.status === 'error' ? <Button title="Try again" kind="secondary" compact onPress={connectHeartRate} /> : null}
      </Card>

      <SectionHeader title="Units" />
      <Card>
        <ThemedText type="smallBold">Weight</ThemedText>
        <Segmented
          value={prefs.weightUnit}
          onChange={(weightUnit) => setPrefs({ weightUnit })}
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lb', label: 'lb' },
          ]}
        />
        <ThemedText type="smallBold">Distance & speed</ThemedText>
        <Segmented
          value={prefs.distanceUnit}
          onChange={(distanceUnit) => setPrefs({ distanceUnit })}
          options={[
            { value: 'km', label: 'km · km/h' },
            { value: 'mi', label: 'miles · mph' },
          ]}
        />
        <View style={styles.row}>
          <Field
            label="Body weight (kg) — for calorie estimates"
            value={bodyWeight}
            onChangeText={setBodyWeight}
            onEndEditing={() => {
              const v = parseFloat(bodyWeight.replace(',', '.'));
              if (v > 20 && v < 400) setPrefs({ bodyWeightKg: v });
              else setBodyWeight(String(prefs.bodyWeightKg));
            }}
            keyboardType="decimal-pad"
          />
        </View>
      </Card>

      <SectionHeader title="Data" />
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} stored on this device.
        </ThemedText>
        <Button title="Export workouts (JSON)" kind="secondary" onPress={exportData} />
        <Button title="Clear coach chat" kind="secondary" onPress={() => confirm('Clear chat?', 'Your workouts are kept.', clearChat, 'Clear')} />
        <Button title="Erase all data" kind="danger" onPress={() => confirm('Erase everything?', 'All workouts, chat and settings on this device will be deleted.', resetAll, 'Erase')} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  saveBtn: { minHeight: 44 },
  option: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});

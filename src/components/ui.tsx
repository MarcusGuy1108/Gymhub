import { SymbolView } from 'expo-symbols';
import type { ComponentProps, ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

export function Icon({ name, size = 20, color = 'text' }: { name: SymbolName; size?: number; color?: ThemeColor }) {
  const theme = useTheme();
  return <SymbolView name={name} size={size} tintColor={theme[color]} />;
}

export function Card({ children, style, onPress, onLongPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void }) {
  const theme = useTheme();
  const body = <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>;
  if (!onPress && !onLongPress) return body;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: SymbolName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const theme = useTheme();
  const bg = kind === 'primary' ? theme.accent : kind === 'secondary' ? theme.backgroundElement : 'transparent';
  const fg: ThemeColor = kind === 'primary' ? 'accentText' : kind === 'danger' ? 'danger' : kind === 'ghost' ? 'accent' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        kind === 'danger' && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}>
      {icon ? <Icon name={icon} size={compact ? 15 : 18} color={fg} /> : null}
      <ThemedText type={compact ? 'smallBold' : 'heading'} themeColor={fg}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

export function Chip({ label, onPress, selected, tone = 'neutral' }: { label: string; onPress?: () => void; selected?: boolean; tone?: 'neutral' | 'accent' | 'cardio' }) {
  const theme = useTheme();
  const bg = selected ? theme.accent : tone === 'accent' ? theme.accentSoft : tone === 'cardio' ? theme.cardioSoft : theme.backgroundElement;
  const fg: ThemeColor = selected ? 'accentText' : tone === 'cardio' ? 'cardio' : 'text';
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.chip, { backgroundColor: bg }, pressed && styles.pressed]}>
      <ThemedText type="smallBold" themeColor={fg}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="smallBold" themeColor={on ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, style, containerStyle, ...props }: TextInputProps & { label?: string; containerStyle?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, style]}
        {...props}
      />
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {right}
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="stat">{value}</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** Alert.alert is a no-op on web, so use the browser's confirm there. */
export function confirm(title: string, message: string, onConfirm: () => void, destructiveLabel = 'Delete') {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructiveLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.7 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 13,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    minHeight: 48,
  },
  buttonCompact: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, borderRadius: Radius.small, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill },
  segmented: { flexDirection: 'row', borderRadius: Radius.small + 2, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: Radius.small },
  field: { gap: 4, flex: 1 },
  input: { borderRadius: Radius.small, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 44 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three, marginBottom: Spacing.one, paddingHorizontal: Spacing.one },
  sectionTitle: { letterSpacing: 0.6 },
  stat: { flex: 1, gap: 2 },
});

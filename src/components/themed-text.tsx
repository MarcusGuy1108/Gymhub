import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'caption' | 'stat' | 'mono';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  smallBold: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.2 },
  stat: { fontSize: 24, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'], fontFamily: Fonts.rounded },
  mono: { fontSize: 14, lineHeight: 19, fontVariant: ['tabular-nums'] },
});

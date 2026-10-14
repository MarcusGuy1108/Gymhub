import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export interface TrendPoint {
  x: number;
  y: number;
  /** Shown when the point is tapped */
  detail: string;
}

const HEIGHT = 170;
const FONT = Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: undefined });
const PAD = { top: 20, right: 44, bottom: 8, left: 40 };

function niceTicks(min: number, max: number, count = 3): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [Math.floor(min / step) * step];
  while (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  if (ticks.length < 2) ticks.push(ticks[0] + step);
  return ticks.map((t) => Math.round(t * 100) / 100);
}

/**
 * Single-series line over time. No legend (the heading names the series);
 * the latest and best values are labelled directly, the rest are a tap away.
 */
export function TrendChart({ points, unit }: { points: TrendPoint[]; unit: string }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const sy = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const best = ys.indexOf(Math.max(...ys));
  const labelled = new Set([last, best]);

  const onPress = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let nearest = 0;
    points.forEach((_, i) => {
      if (Math.abs(sx(i) - x) < Math.abs(sx(nearest) - x)) nearest = i;
    });
    setSelected(nearest === selected ? null : nearest);
  };

  const shown = selected ?? last;

  return (
    <View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.readout}>
        {points[shown]?.detail}
      </ThemedText>
      <Pressable onPress={onPress} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Trend of ${points.length} sessions, latest ${points[last]?.y} ${unit}`}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((t) => (
              <Line key={t} x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} stroke={theme.grid} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`l${t}`} x={PAD.left - 8} y={sy(t) + 4} fontSize={11} fontFamily={FONT} fill={theme.textSecondary} textAnchor="end">
                {t}
              </SvgText>
            ))}
            {selected != null ? (
              <Line x1={sx(selected)} x2={sx(selected)} y1={PAD.top} y2={PAD.top + plotH} stroke={theme.textSecondary} strokeWidth={1} />
            ) : null}
            {points.length > 1 ? <Path d={path} stroke={theme.chart} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {points.map((p, i) =>
              labelled.has(i) || i === selected ? (
                <Circle key={i} cx={sx(i)} cy={sy(p.y)} r={i === selected ? 6 : 4.5} fill={theme.chart} stroke={theme.card} strokeWidth={2} />
              ) : null,
            )}
            {[...labelled].map((i) => (
              <SvgText
                key={`v${i}`}
                x={i === last ? sx(i) + 8 : sx(i)}
                y={i === last ? sy(points[i].y) + 4 : sy(points[i].y) - 10}
                fontSize={12}
                fontFamily={FONT}
                fontWeight="600"
                fill={theme.text}
                textAnchor={i === last ? 'start' : 'middle'}>
                {points[i].y}
              </SvgText>
            ))}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { minHeight: 19, marginBottom: Spacing.one },
});

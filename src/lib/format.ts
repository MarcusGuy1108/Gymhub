import { cardioDistanceKm, cardioDurationMin, segmentEnd } from './stats';
import type { CardioEntry, CardioSegment, Prefs, StrengthSet } from './types';
import { KM_PER_MILE, round } from './units';

export function formatNumber(n: number, dp = 1): string {
  return String(round(n, dp));
}

/** 7.5 -> "7:30", 65 -> "1:05:00" */
export function formatMinutes(min: number): string {
  const totalSec = Math.max(0, Math.round(min * 60));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Human duration for summaries: "45 min", "1 h 10 min" */
export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function formatSet(set: Pick<StrengthSet, 'weight' | 'unit' | 'reps' | 'rpe'>): string {
  const w = set.weight == null ? 'BW' : `${formatNumber(set.weight, 2)} ${set.unit}`;
  return `${w} × ${set.reps}${set.rpe != null ? ` @${formatNumber(set.rpe)}` : ''}`;
}

export function formatSpeed(kmh: number, prefs: Pick<Prefs, 'distanceUnit'>): string {
  return prefs.distanceUnit === 'mi' ? `${formatNumber(kmh / KM_PER_MILE)} mph` : `${formatNumber(kmh)} km/h`;
}

export function formatDistance(km: number, prefs: Pick<Prefs, 'distanceUnit'>): string {
  return prefs.distanceUnit === 'mi' ? `${formatNumber(km / KM_PER_MILE, 2)} mi` : `${formatNumber(km, 2)} km`;
}

export function formatVolume(kg: number, prefs: Pick<Prefs, 'weightUnit'>): string {
  const v = prefs.weightUnit === 'lb' ? kg * 2.2046226218 : kg;
  return `${Math.round(v).toLocaleString()} ${prefs.weightUnit}`;
}

export function formatSegmentSettings(seg: CardioSegment, prefs: Pick<Prefs, 'distanceUnit'>): string {
  const parts: string[] = [];
  if (seg.speedKmh != null) parts.push(formatSpeed(seg.speedKmh, prefs));
  if (seg.incline != null) parts.push(`${formatNumber(seg.incline)}% incline`);
  if (seg.level != null) parts.push(`level ${formatNumber(seg.level)}`);
  if (seg.heartRate != null) parts.push(`${seg.heartRate} bpm`);
  return parts.join(', ') || 'no settings';
}

export function formatSegment(seg: CardioSegment, entry: CardioEntry, prefs: Pick<Prefs, 'distanceUnit'>): string {
  const live = seg.endMin == null && !entry.finished;
  const range = `${formatMinutes(seg.startMin)}–${live ? 'now' : formatMinutes(segmentEnd(seg, entry))}`;
  return `${range} · ${formatSegmentSettings(seg, prefs)}`;
}

export function formatCardioTotals(entry: CardioEntry, prefs: Pick<Prefs, 'distanceUnit'>): string {
  const parts = [formatMinutes(cardioDurationMin(entry))];
  const km = cardioDistanceKm(entry);
  if (km != null) parts.push(`${entry.distanceKm == null ? '≈' : ''}${formatDistance(km, prefs)}`);
  return parts.join(' · ');
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

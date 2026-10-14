import type { DistanceUnit, Prefs, SpeedUnit, WeightUnit } from './types';

export const KM_PER_MILE = 1.609344;
export const LB_PER_KG = 2.2046226218;

export function toKmh(speed: number, unit: SpeedUnit): number {
  return unit === 'mph' ? speed * KM_PER_MILE : speed;
}

export function toKm(distance: number, unit: DistanceUnit): number {
  if (unit === 'mi') return distance * KM_PER_MILE;
  if (unit === 'm') return distance / 1000;
  return distance;
}

export function toKg(weight: number, unit: WeightUnit): number {
  return unit === 'lb' ? weight / LB_PER_KG : weight;
}

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  return to === 'kg' ? weight / LB_PER_KG : weight * LB_PER_KG;
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function speedUnitFor(prefs: Pick<Prefs, 'distanceUnit'>): SpeedUnit {
  return prefs.distanceUnit === 'mi' ? 'mph' : 'km/h';
}

/** Smallest sensible plate jump for progressive overload suggestions */
export function weightStep(unit: WeightUnit): number {
  return unit === 'lb' ? 5 : 2.5;
}

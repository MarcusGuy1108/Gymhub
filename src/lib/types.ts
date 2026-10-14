export type WeightUnit = 'kg' | 'lb';
export type SpeedUnit = 'km/h' | 'mph';
export type DistanceUnit = 'km' | 'mi' | 'm';

export interface StrengthSet {
  id: string;
  reps: number;
  /** null means bodyweight */
  weight: number | null;
  unit: WeightUnit;
  rpe?: number;
  loggedAt: number;
}

export interface StrengthEntry {
  id: string;
  kind: 'strength';
  exercise: string;
  sets: StrengthSet[];
  notes?: string;
  startedAt: number;
}

export type CardioActivity =
  | 'treadmill'
  | 'run'
  | 'walk'
  | 'bike'
  | 'rower'
  | 'elliptical'
  | 'stairs'
  | 'swim'
  | 'other';

/**
 * A stretch of a cardio activity at constant settings. Speeds are stored in
 * km/h; the UI converts to the user's preferred unit.
 */
export interface CardioSegment {
  id: string;
  startMin: number;
  /** null while the segment is still running */
  endMin: number | null;
  speedKmh?: number;
  incline?: number;
  level?: number;
  heartRate?: number;
}

export interface CardioEntry {
  id: string;
  kind: 'cardio';
  activity: CardioActivity;
  segments: CardioSegment[];
  /** Latest elapsed time the user reported, and when they reported it */
  lastAtMin: number;
  lastAtTime: number;
  /** Distance the user reported (overrides the estimate from speed × time) */
  distanceKm?: number;
  calories?: number;
  avgHeartRate?: number;
  notes?: string;
  startedAt: number;
  finished: boolean;
}

export type Entry = StrengthEntry | CardioEntry;

export interface Session {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  entries: Entry[];
  notes?: string;
}

export interface Prefs {
  weightUnit: WeightUnit;
  /** Drives both speed (km/h vs mph) and distance (km vs mi) display */
  distanceUnit: 'km' | 'mi';
  bodyWeightKg: number;
}

export interface WorkoutState {
  sessions: Session[];
  activeSessionId: string | null;
}

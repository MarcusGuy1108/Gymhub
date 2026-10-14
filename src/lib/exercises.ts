import type { CardioActivity } from './types';

/**
 * Common lifts and the ways people say them. The first entry in each list is
 * the canonical name stored in the log.
 */
const CATALOG: string[][] = [
  ['Bench Press', 'bench press', 'bench', 'flat bench', 'barbell bench'],
  ['Incline Bench Press', 'incline bench press', 'incline bench', 'incline barbell press'],
  ['Dumbbell Bench Press', 'dumbbell bench press', 'db bench', 'dumbbell bench', 'dumbbell press'],
  ['Incline Dumbbell Press', 'incline dumbbell press', 'incline db press', 'incline dumbbell bench'],
  ['Chest Fly', 'chest fly', 'chest flye', 'pec deck', 'pec fly', 'cable fly', 'flyes', 'flys'],
  ['Push Up', 'push up', 'push ups', 'pushup', 'pushups', 'press up', 'press ups'],
  ['Dips', 'dips', 'dip', 'tricep dips'],
  ['Overhead Press', 'overhead press', 'ohp', 'shoulder press', 'military press', 'standing press'],
  ['Dumbbell Shoulder Press', 'dumbbell shoulder press', 'db shoulder press', 'seated dumbbell press'],
  ['Lateral Raise', 'lateral raise', 'lateral raises', 'side raise', 'side raises', 'lat raises'],
  ['Face Pull', 'face pull', 'face pulls'],
  ['Squat', 'squat', 'squats', 'back squat', 'back squats', 'barbell squat'],
  ['Front Squat', 'front squat', 'front squats'],
  ['Goblet Squat', 'goblet squat', 'goblet squats'],
  ['Bulgarian Split Squat', 'bulgarian split squat', 'bulgarian split squats', 'split squat', 'split squats', 'bss'],
  ['Leg Press', 'leg press'],
  ['Leg Extension', 'leg extension', 'leg extensions', 'quad extension'],
  ['Leg Curl', 'leg curl', 'leg curls', 'hamstring curl', 'hamstring curls', 'lying leg curl', 'seated leg curl'],
  ['Lunge', 'lunge', 'lunges', 'walking lunges'],
  ['Hip Thrust', 'hip thrust', 'hip thrusts', 'glute bridge'],
  ['Calf Raise', 'calf raise', 'calf raises', 'calves'],
  ['Deadlift', 'deadlift', 'deadlifts', 'conventional deadlift', 'dl'],
  ['Romanian Deadlift', 'romanian deadlift', 'romanian deadlifts', 'rdl', 'rdls', 'stiff leg deadlift'],
  ['Barbell Row', 'barbell row', 'barbell rows', 'bent over row', 'bent over rows', 'bb row'],
  ['Dumbbell Row', 'dumbbell row', 'dumbbell rows', 'db row', 'one arm row'],
  ['Seated Cable Row', 'seated cable row', 'cable row', 'cable rows', 'seated row', 'seated rows'],
  ['Lat Pulldown', 'lat pulldown', 'lat pulldowns', 'lat pull down', 'pulldown', 'pulldowns'],
  ['Pull Up', 'pull up', 'pull ups', 'pullup', 'pullups', 'chin up', 'chin ups', 'chinups'],
  ['Shrug', 'shrug', 'shrugs'],
  ['Bicep Curl', 'bicep curl', 'bicep curls', 'biceps curl', 'curls', 'curl', 'dumbbell curl', 'barbell curl'],
  ['Hammer Curl', 'hammer curl', 'hammer curls'],
  ['Tricep Pushdown', 'tricep pushdown', 'tricep pushdowns', 'triceps pushdown', 'pushdown', 'pushdowns', 'rope pushdown'],
  ['Skull Crusher', 'skull crusher', 'skull crushers', 'skullcrushers'],
  ['Tricep Extension', 'tricep extension', 'tricep extensions', 'overhead tricep extension'],
  ['Plank', 'plank', 'planks'],
  ['Crunch', 'crunch', 'crunches', 'sit up', 'sit ups', 'situps'],
  ['Cable Crunch', 'cable crunch', 'cable crunches'],
  ['Hanging Leg Raise', 'hanging leg raise', 'hanging leg raises', 'leg raises'],
];

const ALIASES: { alias: string; name: string }[] = CATALOG.flatMap(([name, ...aliases]) =>
  aliases.map((alias) => ({ alias, name })),
).sort((a, b) => b.alias.length - a.alias.length);

export const EXERCISE_NAMES: string[] = CATALOG.map(([name]) => name);

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest known exercise mentioned in free text, if any. */
export function findExercise(text: string): { name: string; alias: string } | null {
  const lower = ` ${text.toLowerCase()} `;
  for (const { alias, name } of ALIASES) {
    if (new RegExp(`[^a-z]${escape(alias)}[^a-z]`).test(lower)) return { name, alias };
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Map whatever the user (or Claude) called a lift onto one stored name. */
export function canonicalExercise(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  const exact = ALIASES.find((a) => a.alias === cleaned.toLowerCase() || a.name.toLowerCase() === cleaned.toLowerCase());
  if (exact) return exact.name;
  return titleCase(cleaned);
}

export function sameExercise(a: string, b: string): boolean {
  return canonicalExercise(a).toLowerCase() === canonicalExercise(b).toLowerCase();
}

const CARDIO_WORDS: [CardioActivity, RegExp][] = [
  ['treadmill', /\b(treadmill|tread|incline walk(ing)?|12[- ]3[- ]30)\b/],
  ['bike', /\b(bike|cycle|cycling|spin|spinning|peloton|assault bike|airbike)\b/],
  ['rower', /\b(row(ing)? machine|rower|rowing|erg|concept ?2)\b/],
  ['elliptical', /\b(elliptical|cross ?trainer)\b/],
  ['stairs', /\b(stair ?master|stair ?climber|stairs|stepmill|step mill)\b/],
  ['swim', /\b(swim|swimming|swam|laps?)\b/],
  ['run', /\b(run|running|ran|jog|jogging|sprint(s|ing)?)\b/],
  ['walk', /\b(walk|walking|walked)\b/],
];

export function findCardioActivity(text: string): CardioActivity | null {
  const lower = text.toLowerCase();
  for (const [activity, re] of CARDIO_WORDS) {
    if (re.test(lower)) return activity;
  }
  return null;
}

export const CARDIO_LABELS: Record<CardioActivity, string> = {
  treadmill: 'Treadmill',
  run: 'Run',
  walk: 'Walk',
  bike: 'Bike',
  rower: 'Rower',
  elliptical: 'Elliptical',
  stairs: 'Stair Climber',
  swim: 'Swim',
  other: 'Cardio',
};

export const CARDIO_ACTIVITIES = Object.keys(CARDIO_LABELS) as CardioActivity[];

/** Activities where speed and incline settings make sense */
export function usesSpeed(activity: CardioActivity): boolean {
  return activity === 'treadmill' || activity === 'run' || activity === 'walk';
}

export function usesLevel(activity: CardioActivity): boolean {
  return activity === 'bike' || activity === 'elliptical' || activity === 'stairs' || activity === 'rower';
}

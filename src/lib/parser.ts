/**
 * Offline understanding of gym chatter. Covers the common ways people report
 * sets and cardio so logging works without a network or an API key; anything
 * fancier is left to Claude.
 */
import { findCardioActivity, findExercise } from './exercises';
import type { CardioActivity, DistanceUnit, Prefs, SpeedUnit, WeightUnit } from './types';
import type { CoachAction, SetInput } from './workout';

export interface ParseContext {
  prefs: Prefs;
  lastExercise?: string;
  lastSet?: { weight: number | null; unit: WeightUnit; reps: number };
  /** Cardio activity currently running in the active session */
  activeCardio?: CardioActivity;
}

export interface ParseResult {
  actions: CoachAction[];
  undo: boolean;
  unparsed: string[];
}

const NUM = '(\\d+(?:\\.\\d+)?)';

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Dictation often spells small numbers out ("eight reps"); turn them into digits. */
export function wordsToNumbers(text: string): string {
  return text
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, t, o) =>
      String(TENS[t] + ONES[o]),
    )
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (t) => String(TENS[t]))
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, (o) =>
      String(ONES[o]),
    )
    .replace(/(\d+) and a half\b/g, (_, n) => `${n}.5`)
    .replace(/(\d+) point (\d+)\b/g, '$1.$2');
}

export function normalize(text: string): string {
  let t = text.toLowerCase().replace(/[’‘]/g, "'").replace(/×/g, 'x').replace(/ /g, ' ');
  t = t.replace(/\bhalf an hour\b/g, '30 min').replace(/\ban hour\b/g, '60 min').replace(/\ba minute\b/g, '1 min');
  t = wordsToNumbers(t);
  t = t
    .replace(/\bkm\s*\/\s*h(?:r|our)?\b|\bkph\b|\bkm\s*per\s*hour\b|\bkmh\b|\bk\s*\/\s*h\b|\bkmph\b/g, ' kmh ')
    .replace(/\bmiles?\s*(?:per|an)\s*hour\b|\bm\s*\/\s*h\b/g, ' mph ')
    .replace(/(\d)\s*(?:minutes?|mins?)\b/g, '$1 min ')
    .replace(/(\d)\s*(?:seconds?|secs?)\b/g, '$1 sec ')
    .replace(/(\d)\s*(?:hours?|hrs?)\b/g, '$1 hr ')
    .replace(/%\s*inc(?:line)?\b/g, '% incline ')
    .replace(/\binc\b/g, 'incline')
    .replace(/(\d)\s*(?:kgs?|kilos?|kilograms?)\b/g, '$1 kg ')
    .replace(/(\d)\s*(?:lbs?|pounds?)\b/g, '$1 lb ')
    .replace(/(\d)\s+k\b/g, '$1k')
    .replace(/\bpercent\b/g, '%')
    .replace(/(\d+(?:\.\d+)?)\s*x\s*(\d+)/g, '$1 x $2')
    .replace(/\s+/g, ' ');
  return ` ${t.trim()} `;
}

/** Find a pattern, blank it out of the working text so it isn't read twice. */
class Scanner {
  constructor(public text: string) {}
  take(re: RegExp): RegExpMatchArray | null {
    const m = this.text.match(re);
    if (m && m.index != null) {
      this.text = this.text.slice(0, m.index) + ' '.repeat(m[0].length) + this.text.slice(m.index + m[0].length);
    }
    return m;
  }
  has(re: RegExp): boolean {
    return re.test(this.text);
  }
}

// ---------- session commands ----------

const UNDO_RE = /^\s*(undo|scratch that|delete (that|the last( one)?|last( one)?)|remove (that|the last( one)?|last( one)?)|that was wrong|oops)\b/;
const FINISH_SESSION_RE =
  /\b(done|finished|finishing|that'?s it|wrapping up|wrap up|end|ending|stop|stopping|calling it)\b.*\b(for (the )?(day|today|tonight|now)|workout|session|gym|training)\b|^\s*(end|finish|stop) (the )?(workout|session)\b/;
const START_SESSION_RE = /\b(start(ing)?|begin(ning)?|kick(ing)? off|let'?s (go|start|do))\b/;
const SESSION_WORD_RE = /\b(workout|session|day|training|gym)\b/;
const DAY_TYPE_RE = /\b(push|pull|legs?|upper( body)?|lower( body)?|full body|chest|back|arms|shoulders|glutes|core|cardio)\b/;

function sessionTitle(t: string): string | undefined {
  const m = t.match(DAY_TYPE_RE);
  if (!m) return undefined;
  const word = m[0] === 'legs' ? 'leg' : m[0];
  return `${word[0].toUpperCase()}${word.slice(1)} day`;
}

// ---------- cardio ----------

const LIVE_RE = /\b(currently|now|right now|so far|i'?m at|im at|been|going|pushing|starting|started|just hit|upped|bumped|dropped|increased|decreased)\b|\b\d+(?:\.\d+)? min in\b/;
const DONE_RE = /\b(did|done|finished|completed|total|in total|ended|stopped|that'?s it|all done|just did|ran|jogged|walked|rode|cycled|rowed|swam)\b/;
const CARDIO_SIGNAL_RE = /%|\bincline\b|\bkmh\b|\bmph\b|\bspeed\b|\blevel\b|\blvl\b|\bresistance\b|\bbpm\b|\bheart rate\b|\bpace\b/;

interface CardioFields {
  atMin?: number;
  speed?: number;
  speedUnit?: SpeedUnit;
  incline?: number;
  level?: number;
  heartRate?: number;
  distance?: number;
  distanceUnit?: DistanceUnit;
  calories?: number;
}

function extractCardio(sc: Scanner, prefs: Prefs): CardioFields {
  const f: CardioFields = {};
  const defaultSpeed: SpeedUnit = prefs.distanceUnit === 'mi' ? 'mph' : 'km/h';

  let m = sc.take(new RegExp(`${NUM}\\s*(?:kcal|cals?|calories)\\b`));
  if (m) f.calories = parseFloat(m[1]);
  m = sc.take(new RegExp(`${NUM}\\s*bpm\\b`)) ?? sc.take(new RegExp(`\\b(?:hr|heart rate|heart)\\s*(?:of|at|is|was)?\\s*${NUM}`));
  if (m) f.heartRate = Math.round(parseFloat(m[1]));

  m = sc.take(new RegExp(`${NUM}\\s*%\\s*(?:incline)?`)) ?? sc.take(new RegExp(`\\bincline\\s*(?:of|at|to|is)?\\s*${NUM}`)) ?? sc.take(new RegExp(`${NUM}\\s*incline`));
  if (m) f.incline = parseFloat(m[1]);

  m = sc.take(new RegExp(`\\b(?:level|lvl|resistance|res)\\s*(?:of|at|to|is)?\\s*${NUM}`));
  if (m) f.level = parseFloat(m[1]);

  m = sc.take(new RegExp(`${NUM}\\s*(kmh|mph)\\b`));
  if (m) {
    f.speed = parseFloat(m[1]);
    f.speedUnit = m[2] === 'mph' ? 'mph' : 'km/h';
  } else {
    // "at 5k", "pushing 6.5k", "speed 5": on a treadmill, these mean speed, not distance.
    m = sc.take(new RegExp(`\\b(?:at|@|pushing|speed|going|walking at|running at|set to|up to|upped to|bumped to|dropped to)\\s*(?:a\\s*)?(?:speed of\\s*)?${NUM}\\s*k?\\b(?!\\s*(?:min|sec|hr|%|m\\b|km|mi))`));
    if (m && parseFloat(m[1]) <= 30) {
      f.speed = parseFloat(m[1]);
      f.speedUnit = defaultSpeed;
    }
  }

  // Time: "12:30" or "12 min 30 sec" or "1 hr"
  m = sc.take(/\b(\d{1,3}):(\d{2})\b/);
  if (m) f.atMin = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  else {
    const hr = sc.take(new RegExp(`${NUM} hr\\b`));
    const min = sc.take(new RegExp(`${NUM} min\\b`));
    const sec = sc.take(new RegExp(`${NUM} sec\\b`));
    if (hr || min || sec) {
      f.atMin = (hr ? parseFloat(hr[1]) * 60 : 0) + (min ? parseFloat(min[1]) : 0) + (sec ? parseFloat(sec[1]) / 60 : 0);
    } else {
      // "20m" is minutes; "2000m" is metres
      const short = sc.take(/\b(\d{1,2})m\b/);
      if (short) f.atMin = parseFloat(short[1]);
    }
  }

  m = sc.take(new RegExp(`${NUM}\\s*(km|k|mi|miles?|m|meters?|metres?)\\b`));
  if (m) {
    const unit = m[2];
    f.distance = parseFloat(m[1]);
    f.distanceUnit = unit === 'mi' || unit.startsWith('mile') ? 'mi' : unit === 'km' || unit === 'k' ? 'km' : 'm';
  }
  return f;
}

function parseCardio(clause: string, ctx: ParseContext, activityHint: CardioActivity | undefined): CoachAction | null {
  const sc = new Scanner(clause);
  const named = findCardioActivity(clause);
  const f = extractCardio(sc, ctx.prefs);
  const hasData = Object.keys(f).length > 0;
  const finishing = DONE_RE.test(clause);
  if (!hasData && !named && !finishing) return null;

  let activity: CardioActivity = named ?? activityHint ?? ctx.activeCardio ?? 'treadmill';
  // Walking or running with an incline is a treadmill session.
  if ((activity === 'walk' || activity === 'run') && f.incline != null) activity = 'treadmill';
  if (activity === 'run' && ctx.activeCardio === 'treadmill' && !named?.match(/run/)) activity = 'treadmill';

  const running = ctx.activeCardio === activity;
  const live = LIVE_RE.test(clause);

  if (!running && finishing && !live && (f.atMin != null || f.distance != null)) {
    return {
      type: 'log_cardio',
      activity,
      intervals: f.atMin != null ? [{ minutes: f.atMin, speed: f.speed, incline: f.incline, level: f.level }] : [],
      speedUnit: f.speedUnit,
      distance: f.distance,
      distanceUnit: f.distanceUnit,
      calories: f.calories,
      avgHeartRate: f.heartRate,
    };
  }
  if (!hasData && !named) {
    // A bare "done" only means something if cardio is running.
    if (!running) return null;
  }
  return {
    type: 'cardio_update',
    activity,
    atMin: f.atMin,
    speed: f.speed,
    speedUnit: f.speedUnit,
    incline: f.incline,
    level: f.level,
    heartRate: f.heartRate,
    distance: f.distance,
    distanceUnit: f.distanceUnit,
    calories: f.calories,
    finished: running && finishing && !live ? true : undefined,
  };
}

// ---------- strength ----------

const REPEAT_RE = /\b(same again|same (weight|set)|another set|1 more( set)?|again)\b/;

function extractSets(clause: string, ctx: ParseContext): SetInput[] {
  const unit = ctx.prefs.weightUnit;
  const sc = new Scanner(clause);
  const rpeM = sc.take(new RegExp(`\\brpe\\s*${NUM}`));
  const rpe = rpeM ? parseFloat(rpeM[1]) : undefined;
  const bodyweight = sc.take(/\b(bodyweight|body weight|bw)\b/) != null;
  const withRpe = (s: SetInput): SetInput => (rpe != null ? { ...s, rpe } : s);

  // "80 kg 8, 8, 6": one weight, several sets
  const repList = sc.take(new RegExp(`${NUM} (kg|lb)\\s*(?:x|for)?\\s*((?:\\d+\\b\\s*,?\\s*){2,6})(?:reps?)?(?!\\s*(?:kg|lb|x|sets?|min|sec))`));
  if (repList) {
    const reps = repList[3].match(/\d+/g) ?? [];
    return reps.map((r) => withRpe({ weight: parseFloat(repList[1]), unit: repList[2] as WeightUnit, reps: parseInt(r, 10) }));
  }

  // "80 kg x 8", "80 kg for 8", "185 lb 5 reps", "80 for 8": one set per pair
  const pairs: SetInput[] = [];
  for (;;) {
    const m = sc.take(new RegExp(`${NUM} (kg|lb)\\s*(?:x|for|by)?\\s*(\\d+)\\b(?!\\s*(?:sets?|min|sec|kg|lb|x|\\.\\d))(?:\\s*reps?)?`));
    if (!m) break;
    pairs.push({ weight: parseFloat(m[1]), unit: m[2] as WeightUnit, reps: parseInt(m[3], 10) });
  }
  for (;;) {
    const m = sc.take(new RegExp(`${NUM} for (\\d+)\\b(?!\\s*(?:sets?|min|sec|kg|lb))`));
    if (!m) break;
    pairs.push({ weight: parseFloat(m[1]), unit, reps: parseInt(m[2], 10) });
  }
  // "8 reps at 80 kg"
  for (;;) {
    const m = sc.take(new RegExp(`(\\d+)\\s*reps?\\s*(?:at|@|with|of|on)?\\s*${NUM} (kg|lb)`));
    if (!m) break;
    pairs.push({ weight: parseFloat(m[2]), unit: m[3] as WeightUnit, reps: parseInt(m[1], 10) });
  }

  // A weight given on its own: "at 80", "@ 80", "with 80 kg", "80 kg"
  let weight: number | null | undefined;
  let weightUnit: WeightUnit = unit;
  const wUnit = sc.take(new RegExp(`${NUM} (kg|lb)\\b`));
  if (wUnit) {
    weight = parseFloat(wUnit[1]);
    weightUnit = wUnit[2] as WeightUnit;
  } else {
    const wAt = sc.take(new RegExp(`(?:\\bat|@|\\bwith|\\busing)\\s*${NUM}\\b(?!\\s*(?:reps?|sets?|x|min|sec|%))`));
    if (wAt) weight = parseFloat(wAt[1]);
  }

  if (pairs.length) {
    // "100 kg x 5, 3 sets"
    const count = sc.take(/(\d+)\s*sets?\b/);
    if (pairs.length === 1 && count) return Array.from({ length: Math.min(parseInt(count[1], 10), 20) }, () => withRpe(pairs[0]));
    return pairs.map(withRpe);
  }

  // "3 sets of 10", "3x10", "3 x 10"
  let setCount: number | undefined;
  let reps: number[] = [];
  sc.take(REPEAT_RE);
  const setOfOne = sc.take(/\bset of (\d+)\b/);
  if (setOfOne) reps = [parseInt(setOfOne[1], 10)];
  const setsOf = reps.length ? null : sc.take(/(\d+)\s*sets?\s*(?:of|x)\s*(\d+)/);
  if (setsOf) {
    setCount = parseInt(setsOf[1], 10);
    reps = [parseInt(setsOf[2], 10)];
  } else {
    const axb = reps.length ? null : sc.take(new RegExp(`${NUM} x (\\d+)`));
    if (axb) {
      const a = parseFloat(axb[1]);
      const b = parseInt(axb[2], 10);
      if (weight === undefined && (a > 10 || !Number.isInteger(a))) {
        // "80 x 8" is weight × reps
        weight = a;
      } else {
        setCount = a;
      }
      reps = [b];
    }
  }

  if (!reps.length) {
    // "8, 8, 6 reps" / "reps of 8 8 6" / "8 8 6"
    const list = sc.take(/\b(\d+)(?:\s*,\s*|\s+)(\d+)(?:(?:\s*,\s*|\s+)(\d+))?(?:(?:\s*,\s*|\s+)(\d+))?(?:(?:\s*,\s*|\s+)(\d+))?\s*(?:reps?)?\b/);
    if (list && weight !== undefined) {
      reps = list.slice(1).filter(Boolean).map((n) => parseInt(n, 10));
    } else {
      const r =
        sc.take(/(\d+)\s*(?:reps?|times)\b/) ??
        sc.take(/(?:\bx|\bfor)\s*(\d+)\b(?!\s*(?:min|sec|sets?))/) ??
        (list ? null : sc.take(/\b(\d+)\b/));
      if (r) reps = [parseInt(r[1], 10)];
      else if (list) reps = [parseInt(list[1], 10)];
    }
  }
  if (!setCount) {
    const s = sc.take(/(\d+)\s*sets?\b/);
    if (s) setCount = parseInt(s[1], 10);
  }

  if (!reps.length) return [];
  if (bodyweight) weight = null;
  const w = weight === undefined ? null : weight;
  const count = reps.length > 1 ? 1 : Math.min(setCount ?? 1, 20);
  const sets: SetInput[] = [];
  for (const r of reps) {
    for (let i = 0; i < count; i++) sets.push(withRpe({ reps: r, weight: w, unit: weightUnit }));
  }
  return sets;
}

function parseStrength(clause: string, ctx: ParseContext, exerciseHint: string | undefined): CoachAction | null {
  const found = findExercise(clause);
  let exercise = found?.name ?? exerciseHint ?? ctx.lastExercise;
  // Remove the exercise name so its words don't get read as numbers/units.
  const rest = found ? clause.replace(new RegExp(`\\b${found.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ' ') : clause;
  let sets = extractSets(rest, ctx);

  if (REPEAT_RE.test(clause) && ctx.lastSet && (found == null || exercise === ctx.lastExercise)) {
    const base = ctx.lastSet;
    if (!sets.length) sets = [{ reps: base.reps, weight: base.weight, unit: base.unit }];
    else sets = sets.map((s) => ({ ...s, weight: s.weight ?? base.weight, unit: s.weight == null ? base.unit : s.unit }));
    exercise = exercise ?? ctx.lastExercise;
  }

  if (!exercise) {
    // Unknown lift: use the leftover words as its name ("cable kickbacks 20 x 12").
    const words = rest
      .replace(/\d+(\.\d+)?/g, ' ')
      .replace(/\b(kg|lb|x|for|at|reps?|sets?|of|did|just|i|a|an|the|on|with|did|done|then|and|some|my|rpe|bw|bodyweight|got|hit|set|more|another)\b/g, ' ')
      .replace(/[^a-z\s-]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    if (words.length >= 3 && sets.length) exercise = words;
  }
  if (!exercise || !sets.length) return null;
  return { type: 'log_sets', exercise, sets };
}

// ---------- clause handling ----------

function isAnchored(piece: string): boolean {
  return (
    findExercise(piece) != null ||
    findCardioActivity(piece) != null ||
    START_SESSION_RE.test(piece) ||
    FINISH_SESSION_RE.test(piece) ||
    new RegExp(`${NUM}\\s*(?:kg|lb)?\\s*x\\s*\\d+`).test(piece) ||
    /\b\d+\s*sets?\b/.test(piece)
  );
}

function splitClauses(text: string): string[] {
  const strong = text.split(/\s*(?:[;\n]|\.\s|\bthen\b|\balso\b|\bafter that\b)\s*/);
  const out: string[] = [];
  for (const block of strong) {
    const weak = block.split(/\s*(?:,\s|\band\b|\bplus\b)\s*/);
    for (const piece of weak) {
      const p = piece.trim();
      if (!p) continue;
      if (out.length && !isAnchored(p)) out[out.length - 1] += ` ${p}`;
      else out.push(p);
    }
  }
  return out.map((c) => ` ${c} `);
}

function looksLikeCardio(clause: string, ctx: ParseContext): boolean {
  if (findExercise(clause)) return false;
  if (findCardioActivity(clause)) return true;
  if (CARDIO_SIGNAL_RE.test(clause)) return true;
  if (/\b\d+(?:\.\d+)?\s*(?:k|km|mi|miles?)\b/.test(clause)) return true;
  // Times and "done" mean cardio when something's running and no sets are mentioned.
  if (ctx.activeCardio && !/\b(kg|lb|reps?|sets?)\b|\d+\s*x\s*\d+/.test(clause)) {
    return /\b\d+(?:\.\d+)? (min|sec|hr)\b|\d{1,3}:\d{2}/.test(clause) || DONE_RE.test(clause);
  }
  return false;
}

export function parseMessage(text: string, ctx: ParseContext): ParseResult {
  const norm = normalize(text);
  const result: ParseResult = { actions: [], undo: false, unparsed: [] };
  if (UNDO_RE.test(norm)) {
    result.undo = true;
    return result;
  }

  let exerciseHint: string | undefined;
  let cardioHint: CardioActivity | undefined;
  let lastSet = ctx.lastSet;
  let activeCardio = ctx.activeCardio;

  for (const clause of splitClauses(norm)) {
    const local: ParseContext = { ...ctx, lastExercise: exerciseHint ?? ctx.lastExercise, lastSet, activeCardio };

    if (FINISH_SESSION_RE.test(clause)) {
      result.actions.push({ type: 'finish_session' });
      continue;
    }
    if (START_SESSION_RE.test(clause) && SESSION_WORD_RE.test(clause) && !findCardioActivity(clause)) {
      result.actions.push({ type: 'start_session', title: sessionTitle(clause) });
      continue;
    }

    const action = looksLikeCardio(clause, local)
      ? parseCardio(clause, local, cardioHint)
      : (parseStrength(clause, local, undefined) ?? (activeCardio ? parseCardio(clause, local, cardioHint) : null));

    if (!action) {
      result.unparsed.push(clause.trim());
      continue;
    }
    if (action.type === 'log_sets') {
      exerciseHint = action.exercise;
      const s = action.sets[action.sets.length - 1];
      lastSet = { weight: s.weight ?? null, unit: s.unit ?? ctx.prefs.weightUnit, reps: s.reps };
      activeCardio = undefined;
    } else if (action.type === 'cardio_update') {
      cardioHint = action.activity;
      activeCardio = action.finished ? undefined : action.activity;
    } else if (action.type === 'log_cardio') {
      cardioHint = action.activity;
    }
    result.actions.push(action);
  }
  return result;
}

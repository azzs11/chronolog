/**
 * How each service is doing right now, as one of six moods with a written reason and the log lines
 * behind it. The app draws every service as a small creature, and its face comes from here; nothing
 * on screen changes expression without a measured reason.
 *
 * The last RECENT_S seconds before `now` are compared with the BASELINE_S seconds before that:
 *   restarted  : new lines that read like a shutdown or startup (words from the bench's code-fault check)
 *   sick       : error lines at least HOT_FACTOR x the baseline rate, and at least MIN_BURST_ERRORS of them
 *                (the same bar an incident burst uses, see bursts.ts)
 *   stressed   : error and warning lines above STRESS_FACTOR x the baseline rate
 *   quiet      : far fewer lines than usual; silence can be a symptom
 *   new-phrase : a message template this service did not log in the baseline (RootRank's strongest signal)
 *   fine       : none of the above
 * The first mood in that list that applies wins. Thresholds are readable starting values, not tuned on
 * any benchmark. Pure: `now` is passed in.
 */
import { HOT_FACTOR, MIN_BURST_ERRORS, MIN_ERRORS_PER_BUCKET } from './bursts';
import { assignTemplates } from './templates';

export const MOODS = ['restarted', 'sick', 'stressed', 'quiet', 'new-phrase', 'fine'] as const;
export type Mood = (typeof MOODS)[number];

/** The "right now" window: 2 minutes. */
export const RECENT_S = 120;
/** What normal looked like: the 15 minutes before that. */
export const BASELINE_S = 900;
/** Error and warning lines above this multiple of the baseline rate mean stressed. */
export const STRESS_FACTOR = 2;
/** Fewer lines than this fraction of the expected count means quiet... */
export const QUIET_FRACTION = 0.2;
/** ...but only when at least this many lines were expected, so a sleepy service is not "quiet". */
export const MIN_EXPECTED_FOR_QUIET = 10;
/** Below this many baseline lines there is too little history to call anything new or quiet. */
export const MIN_BASELINE_LINES = 20;
/** Words that mark a shutdown or startup line (same list as bench/src/chronobench/codefault_check.py). */
export const RESTART_WORDS = ['shutting down', 'shut down', 'started', 'starting', 'initializ', 'banner'] as const;
/** How many log ids a mood cites. */
export const MAX_EVIDENCE = 5;

export interface MoodLine {
  id?: string;
  /** Unix seconds. */
  timestamp: number;
  service: string;
  severity: string;
  message: string;
}

export interface ServiceMood {
  service: string;
  mood: Mood;
  /** One plain sentence saying why, with the numbers. */
  reason: string;
  /** Ids of the lines behind the mood, oldest first (empty for quiet: silence has no lines). */
  evidenceIds: string[];
  /** For new-phrase and restarted: the templates that were new. */
  newTemplates: string[];
  recentLines: number;
  recentProblems: number;
  baselineLines: number;
}

interface Tagged extends MoodLine {
  template: number;
}

interface Window {
  baseline: Tagged[];
  recent: Tagged[];
}

const isError = (s: string): boolean => s === 'error' || s === 'critical';
const isProblem = (s: string): boolean => isError(s) || s === 'warning';
const isRestartText = (text: string): boolean => RESTART_WORDS.some((word) => text.toLowerCase().includes(word));
const idsOf = (lines: readonly MoodLine[]): string[] =>
  lines.flatMap((l) => (l.id === undefined ? [] : [l.id])).slice(0, MAX_EVIDENCE);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Lines in [now - RECENT_S - BASELINE_S, now], tagged with their Drain template, split per service. */
function windowsByService(lines: readonly MoodLine[], now: number): { byService: Map<string, Window>; texts: Map<number, string> } {
  const from = now - RECENT_S - BASELINE_S;
  const inRange = lines.filter((l) => l.timestamp >= from && l.timestamp <= now).sort((a, b) => a.timestamp - b.timestamp);
  const table = assignTemplates(inRange.map((l) => l.message));
  const byService = new Map<string, Window>();
  inRange.forEach((line, i) => {
    const w = byService.get(line.service) ?? { baseline: [], recent: [] };
    byService.set(line.service, w);
    (line.timestamp > now - RECENT_S ? w.recent : w.baseline).push({ ...line, template: table.ids[i] as number });
  });
  return { byService, texts: table.texts };
}

/** First line of each template the service did not log in the baseline, oldest first. */
function newTemplateLines(w: Window): Tagged[] {
  const seen = new Set(w.baseline.map((l) => l.template));
  const firsts = new Map<number, Tagged>();
  for (const line of w.recent) if (!seen.has(line.template) && !firsts.has(line.template)) firsts.set(line.template, line);
  return [...firsts.values()];
}

/** Count per second over the baseline, with a floor of one line per baseline window. */
const baselineRate = (count: number): number => Math.max(count, 1) / BASELINE_S;

type Verdict = Pick<ServiceMood, 'mood' | 'reason' | 'evidenceIds' | 'newTemplates'>;

function judgeRestart(fresh: Tagged[], texts: Map<number, string>): Verdict | null {
  const restart = fresh.filter((l) => isRestartText(texts.get(l.template) ?? l.message));
  if (restart.length === 0) return null;
  return {
    mood: 'restarted',
    reason: `Logged ${plural(restart.length, 'new shutdown or startup line')} in the last ${RECENT_S / 60} minutes.`,
    evidenceIds: idsOf(restart),
    newTemplates: restart.map((l) => texts.get(l.template) ?? l.message),
  };
}

function judgeErrors(w: Window): Verdict | null {
  const errors = w.recent.filter((l) => isError(l.severity));
  const baseErrors = w.baseline.filter((l) => isError(l.severity)).length;
  const expected = baselineRate(baseErrors) * RECENT_S;
  const usual = `usually about ${expected < 1 ? 'none' : Math.round(expected)}`;
  if (errors.length >= MIN_BURST_ERRORS && errors.length >= HOT_FACTOR * expected) {
    return { mood: 'sick', reason: `${plural(errors.length, 'error line')} in the last ${RECENT_S / 60} minutes; ${usual}.`, evidenceIds: idsOf(errors), newTemplates: [] };
  }
  const problems = w.recent.filter((l) => isProblem(l.severity));
  const baseProblems = w.baseline.filter((l) => isProblem(l.severity)).length;
  const expectedProblems = baselineRate(baseProblems) * RECENT_S;
  if (problems.length >= MIN_ERRORS_PER_BUCKET && problems.length > STRESS_FACTOR * expectedProblems) {
    const usualProblems = `usually about ${expectedProblems < 1 ? 'none' : Math.round(expectedProblems)}`;
    return { mood: 'stressed', reason: `${plural(problems.length, 'error or warning line')} in the last ${RECENT_S / 60} minutes; ${usualProblems}.`, evidenceIds: idsOf(problems), newTemplates: [] };
  }
  return null;
}

function judgeQuiet(w: Window): Verdict | null {
  if (w.baseline.length < MIN_BASELINE_LINES) return null;
  const expected = (w.baseline.length / BASELINE_S) * RECENT_S;
  if (expected < MIN_EXPECTED_FOR_QUIET || w.recent.length > QUIET_FRACTION * expected) return null;
  return {
    mood: 'quiet',
    reason: `Only ${plural(w.recent.length, 'line')} in the last ${RECENT_S / 60} minutes; usually about ${Math.round(expected)}.`,
    evidenceIds: [],
    newTemplates: [],
  };
}

function judge(w: Window, texts: Map<number, string>): Verdict {
  const hasHistory = w.baseline.length >= MIN_BASELINE_LINES;
  const fresh = hasHistory ? newTemplateLines(w) : [];
  const verdict = judgeRestart(fresh, texts) ?? judgeErrors(w) ?? judgeQuiet(w);
  if (verdict) return verdict;
  if (fresh.length > 0) {
    return {
      mood: 'new-phrase',
      reason: `Said ${plural(fresh.length, 'thing')} it had not said in the ${BASELINE_S / 60} minutes before.`,
      evidenceIds: idsOf(fresh),
      newTemplates: fresh.map((l) => texts.get(l.template) ?? l.message),
    };
  }
  const reason = hasHistory ? 'Normal amount of logs, no unusual errors, nothing new.' : 'Too little history yet to notice anything unusual.';
  return { mood: 'fine', reason, evidenceIds: [], newTemplates: [] };
}

/** The mood of every service that logged in the last RECENT_S + BASELINE_S seconds, worst first, then by name. */
export function serviceMoods(lines: readonly MoodLine[], now: number): ServiceMood[] {
  const { byService, texts } = windowsByService(lines, now);
  const moods = [...byService].map(([service, w]) => ({
    service,
    ...judge(w, texts),
    recentLines: w.recent.length,
    recentProblems: w.recent.filter((l) => isProblem(l.severity)).length,
    baselineLines: w.baseline.length,
  }));
  return moods.sort((a, b) => MOODS.indexOf(a.mood) - MOODS.indexOf(b.mood) || a.service.localeCompare(b.service));
}

/**
 * The face for a suspect in an incident's lineup, from its RootRank evidence over the incident
 * window (not the last two minutes): a new shutdown or startup message means restarted, a burst-sized
 * count of error lines means sick, any error means stressed, a new message means new-phrase. Like
 * every mood it is a symptom; the lineup's order is the ranking, not the face.
 */
export function suspectMood(evidence: { errorLines: number; novelTemplates: ReadonlyArray<{ template: string }> }): Mood {
  if (evidence.novelTemplates.some((t) => isRestartText(t.template))) return 'restarted';
  if (evidence.errorLines >= MIN_BURST_ERRORS) return 'sick';
  if (evidence.errorLines > 0) return 'stressed';
  if (evidence.novelTemplates.length > 0) return 'new-phrase';
  return 'fine';
}

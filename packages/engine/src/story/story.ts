/**
 * Evidence-locked incident stories. An optional language model writes a short narrative about a
 * RootRank result, and a checker keeps only the sentences it can verify.
 *
 * The model never sees raw logs. It gets numbered FACTS (E1, E2, ...), each one an evidence claim
 * the engine already computed, with the log ids behind it, and it must cite fact keys. The checker
 * then drops any sentence that:
 *   - cites nothing, or a key that does not exist          ("uncited", "unknown_fact")
 *   - names a service that is not a suspect in the input   ("unknown_service")
 *   - cites a fact about a service the sentence does not name ("off_topic_cite")
 *   - contains a number that is not in its cited services' facts ("unsupported_number")
 *   - gives a reason ("due to", "because", ...) that its facts do not state ("unsupported_cause")
 * The checks are mechanical: a sentence can still pass and say something its facts do not support
 * in other words; the benchmark audits kept sentences by hand to measure how often.
 * Kept sentences carry the real log ids of their facts. Everything here is pure; the model call
 * lives in apps/api.
 */
import { confidenceWord } from '../rootrank/explain';
import { evidenceClaims } from '../rootrank/explain';
import type { RankResult } from '../rootrank/types';

/** Suspects given to the model: the top 3, like the case file's lineup. */
export const STORY_SUSPECTS = 3;
export const MAX_STORY_SENTENCES = 6;
export const MAX_SENTENCE_CHARS = 300;

export interface StoryFact {
  key: string;
  service: string;
  text: string;
  logIds: string[];
}

export interface StoryInput {
  suspects: { service: string; rank: number; weight: number; word: string }[];
  facts: StoryFact[];
  /** Every candidate service (also those not given as suspects), to catch invented or extra names. */
  allServices: string[];
  candidateCount: number;
}

export type DropReason = 'uncited' | 'unknown_fact' | 'unknown_service' | 'off_topic_cite' | 'unsupported_number' | 'unsupported_cause' | 'malformed';

export interface StorySentence {
  text: string;
  factKeys: string[];
  logIds: string[];
}

export interface StoryCheck {
  kept: StorySentence[];
  dropped: { text: string; reason: DropReason }[];
  /** False if the reply was not the JSON shape asked for (then nothing is kept). */
  isWellFormed: boolean;
  stats: { sentences: number; kept: number; cites: number; validCites: number };
}

export function buildStoryInput(result: RankResult): StoryInput {
  const top = result.candidates.slice(0, STORY_SUSPECTS);
  const facts: StoryFact[] = [];
  for (const cause of top) {
    for (const claim of evidenceClaims(cause)) {
      facts.push({ key: `E${facts.length + 1}`, service: cause.service, text: claim.text, logIds: claim.cites });
    }
  }
  return {
    suspects: top.map((c) => ({ service: c.service, rank: c.rank, weight: Number(c.weight.toFixed(2)), word: confidenceWord(c.weight, c.rank) })),
    facts,
    allServices: result.candidates.map((c) => c.service),
    candidateCount: result.candidates.length,
  };
}

export function storyPrompt(input: StoryInput): { system: string; user: string } {
  const system = [
    'You write a short incident summary for an on-call engineer.',
    'Use ONLY the facts given. Every sentence must cite one or more fact keys, like ["E1"].',
    'Name the service each sentence is about. Do not invent numbers, services, causes or fixes.',
    'Restate what the facts say. Do not interpret what a message means or guess why it happened.',
    'The ranking is a best guess from logs, not proof: say "likely" or "possible", never "definitely".',
    `Reply with JSON only: {"sentences":[{"text":"...","cites":["E1"]}]}, at most ${MAX_STORY_SENTENCES} sentences.`,
  ].join('\n');
  const suspects = input.suspects
    .map((s) => `#${s.rank} ${s.service} (weight ${s.weight}, ${s.word})`)
    .join('\n');
  const facts = input.facts.map((f) => `${f.key} [${f.service}] ${f.text}`).join('\n');
  const user = `Suspects, best first, out of ${input.candidateCount} services:\n${suspects}\n\nFacts:\n${facts}`;
  return { system, user };
}

const NUMBER = /\d+(?:\.\d+)?/g;
/** Words that claim a reason. The engine's facts never state reasons, so a sentence with one is speculating. */
const CAUSAL =
  /\b(due to|because|caused by|as a result|result of|led to|leads to|triggered by|owing to|suggest(?:s|ing)?|point(?:s|ing) to|a sign of|potential|initiated)\b/i;
const numbersIn = (text: string): string[] => text.match(NUMBER) ?? [];
const FACT_REF = /\bE\d+\b/g;
const normalise = (n: string): string => String(Number(n));

function namedServices(text: string, services: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return services.filter((s) => new RegExp(`(^|[^a-z0-9-])${escapeRegExp(s.toLowerCase())}($|[^a-z0-9-])`).test(lower));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Numbers a sentence may use: those in its services' suspect line and facts, plus the totals. */
function allowedNumbers(input: StoryInput, services: readonly string[]): Set<string> {
  const allowed = new Set<string>([String(input.candidateCount), String(STORY_SUSPECTS)]);
  for (const s of input.suspects.filter((x) => services.includes(x.service))) {
    for (const n of [String(s.rank), String(s.weight), String(Math.round(s.weight * 100))]) allowed.add(normalise(n));
  }
  for (const f of input.facts.filter((x) => services.includes(x.service))) {
    for (const n of numbersIn(f.text)) allowed.add(normalise(n));
  }
  return allowed;
}

function checkSentence(raw: unknown, input: StoryInput): StorySentence | DropReason {
  if (typeof raw !== 'object' || raw === null) return 'malformed';
  const { text, cites } = raw as { text?: unknown; cites?: unknown };
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SENTENCE_CHARS) return 'malformed';
  const keys = Array.isArray(cites) ? [...new Set(cites.filter((c): c is string => typeof c === 'string'))] : [];
  if (keys.length === 0) return 'uncited';
  const facts = keys.map((k) => input.facts.find((f) => f.key === k));
  if (facts.some((f) => f === undefined)) return 'unknown_fact';
  const suspects = input.suspects.map((s) => s.service);
  const named = namedServices(text, input.allServices);
  if (named.length === 0 || named.some((s) => !suspects.includes(s))) return 'unknown_service';
  if (facts.some((f) => !named.includes((f as StoryFact).service))) return 'off_topic_cite';
  const allowed = allowedNumbers(input, named);
  // Fact keys written into the text, like "(E4)", are references, not numbers.
  if (numbersIn(text.replace(FACT_REF, '')).some((n) => !allowed.has(normalise(n)))) return 'unsupported_number';
  if (CAUSAL.test(text) && !facts.some((f) => CAUSAL.test((f as StoryFact).text))) return 'unsupported_cause';
  const logIds = [...new Set(facts.flatMap((f) => (f as StoryFact).logIds))];
  return { text, factKeys: keys, logIds };
}

/** Parse the model's reply and keep only the sentences that pass every check. */
export function checkStory(reply: string, input: StoryInput): StoryCheck {
  const sentences = parseSentences(reply);
  const out: StoryCheck = {
    kept: [],
    dropped: [],
    isWellFormed: sentences !== null,
    stats: { sentences: 0, kept: 0, cites: 0, validCites: 0 },
  };
  for (const raw of (sentences ?? []).slice(0, MAX_STORY_SENTENCES)) {
    const checked = checkSentence(raw, input);
    const cites = citesOf(raw);
    out.stats.sentences += 1;
    out.stats.cites += cites.length;
    if (typeof checked === 'string') {
      out.dropped.push({ text: textOf(raw), reason: checked });
      continue;
    }
    out.kept.push(checked);
    out.stats.kept += 1;
    out.stats.validCites += checked.factKeys.length;
  }
  return out;
}

function parseSentences(reply: string): unknown[] | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1)) as { sentences?: unknown };
    return Array.isArray(parsed.sentences) ? parsed.sentences : null;
  } catch {
    return null;
  }
}

function citesOf(raw: unknown): string[] {
  const cites = (raw as { cites?: unknown } | null)?.cites;
  return Array.isArray(cites) ? cites.filter((c): c is string => typeof c === 'string') : [];
}

function textOf(raw: unknown): string {
  const text = (raw as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : '';
}

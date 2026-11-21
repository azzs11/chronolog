/**
 * Plain-language wording for a ranked cause. Every sentence is built only from fields the engine
 * computed; nothing is added. Shared by the web app, the API clients and the CLI.
 */
import type { RankedCause } from './types';

const LIKELY_FROM = 0.6;
const POSSIBLE_FROM = 0.3;
const MAX_TEMPLATE_CHARS = 90;

/**
 * A word for how strongly the model favours a candidate. The weight is relative to the other
 * candidates, not a probability, so the word depends on rank: the leader is never called
 * "unlikely" (it is the model's best guess), and it is only "likely" when it clearly stands out.
 * Calibrating these words against measured hit rates is still to do.
 */
export function confidenceWord(weight: number, rank = Number.POSITIVE_INFINITY): 'likely' | 'possible' | 'unlikely' {
  if (weight >= LIKELY_FROM) return 'likely';
  if (weight >= POSSIBLE_FROM || rank === 1) return 'possible';
  return 'unlikely';
}

export function formatDelay(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded === 0) return 'at the same moment as the incident start';
  const abs = Math.abs(rounded);
  const span = abs >= 120 ? `${Math.round(abs / 60)} min` : `${abs} s`;
  return rounded > 0 ? `${span} after the incident start` : `${span} before the incident start`;
}

const clip = (text: string): string => (text.length > MAX_TEMPLATE_CHARS ? `${text.slice(0, MAX_TEMPLATE_CHARS)}…` : text);

export interface EvidenceClaim {
  text: string;
  /** Log ids that back the sentence. Empty when the lines carry no ids, or the claim is about an absence. */
  cites: string[];
  /** True for "nothing was found" sentences: an absence has no line to cite. */
  isAbsence: boolean;
}

/** The reasons shown for a candidate, each with the log ids behind it. Built only from engine fields. */
export function evidenceClaims(cause: Pick<RankedCause, 'evidence'>): EvidenceClaim[] {
  const { evidence } = cause;
  const out: EvidenceClaim[] = [];
  if (evidence.firstErrorAfter !== null) {
    out.push({
      text: `Logged its first error ${formatDelay(evidence.firstErrorAfter)} (${evidence.errorLines} error lines in total).`,
      cites: evidence.firstErrorId ? [evidence.firstErrorId] : [],
      isAbsence: false,
    });
  }
  for (const novel of evidence.novelTemplates) {
    out.push({
      text: `Logged a message it never logged before: "${clip(novel.template)}" (${novel.count}×).`,
      cites: novel.exampleId ? [novel.exampleId] : [],
      isAbsence: false,
    });
  }
  if (evidence.mentions > 0) {
    out.push({ text: `Other services mention it in ${evidence.mentions} log lines during the incident.`, cites: evidence.mentionIds ?? [], isAbsence: false });
  }
  if (out.length === 0) out.push({ text: 'No error lines, new messages or mentions from other services.', cites: [], isAbsence: true });
  return out;
}

/** The same reasons as plain sentences (the CLI and older views), with the ids written into the text. */
export function evidenceSentences(cause: Pick<RankedCause, 'evidence'>): string[] {
  return evidenceClaims(cause).map(({ text, cites }) => (cites.length === 0 ? text : `${text.slice(0, -1)} [log ${cites.join(', ')}].`));
}

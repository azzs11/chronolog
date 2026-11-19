import type { RankedCause, RankData } from './api';

const LIKELY_FROM = 0.6;
const POSSIBLE_FROM = 0.3;
const MAX_TEMPLATE_CHARS = 90;

/** A word for how strongly the model favours a candidate. The weight is relative, not a probability. */
export function confidenceWord(weight: number): 'likely' | 'possible' | 'unlikely' {
  if (weight >= LIKELY_FROM) return 'likely';
  if (weight >= POSSIBLE_FROM) return 'possible';
  return 'unlikely';
}

export function formatDelay(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded === 0) return 'at the same moment as the incident start';
  const abs = Math.abs(rounded);
  const span = abs >= 120 ? `${Math.round(abs / 60)} min` : `${abs} s`;
  return rounded > 0 ? `${span} after the incident start` : `${span} before the incident start`;
}

export const startSourceText: Record<RankData['startSource'], string> = {
  given: 'the start time you gave',
  estimated: 'estimated from the biggest change in the logs; set it yourself for best accuracy',
};

const clip = (text: string): string => (text.length > MAX_TEMPLATE_CHARS ? `${text.slice(0, MAX_TEMPLATE_CHARS)}…` : text);

/**
 * The reasons shown for a candidate. Each sentence is built only from fields the API computed;
 * nothing is added. Log ids are included where the API provides them.
 */
export function evidenceSentences(cause: RankedCause): string[] {
  const { evidence } = cause;
  const out: string[] = [];
  if (evidence.firstErrorAfter !== null) {
    out.push(`Logged its first error ${formatDelay(evidence.firstErrorAfter)} (${evidence.errorLines} error lines in total).`);
  }
  for (const novel of evidence.novelTemplates) {
    const id = novel.exampleId ? `, log ${novel.exampleId}` : '';
    out.push(`Logged a message it never logged before: "${clip(novel.template)}" (${novel.count}×${id}).`);
  }
  if (evidence.mentions > 0) {
    out.push(`Other services mention it in ${evidence.mentions} log lines during the incident.`);
  }
  if (out.length === 0) out.push('No error lines, new messages or mentions from other services.');
  return out;
}

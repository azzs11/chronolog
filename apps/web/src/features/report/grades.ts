import { REPORT_CARD } from './reportCard';

/** Grade words for a top-3 hit rate. Plain cut-offs for reading the card, not a statistical test. */
export const STRONG_FROM = 0.6;
export const OKAY_FROM = 0.4;

export type Grade = 'Strong' | 'Okay' | 'Weak';

export function gradeOf(rate: number): Grade {
  if (rate >= STRONG_FROM) return 'Strong';
  if (rate >= OKAY_FROM) return 'Okay';
  return 'Weak';
}

export const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;

/** What Tock says at the top of the card: every number comes from the generated REPORT_CARD. */
export function tockSummary(card: typeof REPORT_CARD = REPORT_CARD): string {
  const ours = card.headline.find((r) => r.isOurs);
  const baselines = card.headline.filter((r) => !r.isOurs && r.low !== null);
  const best = [...baselines].sort((a, b) => b.value - a.value)[0];
  const weakest = [...card.byFault].sort((a, b) => a.rootrank - b.rootrank)[0];
  if (!ours || !best || !weakest) return '';
  return (
    `On incidents from services I never trained on, the real cause is in my top 3 ${pct(ours.value)} of the time. ` +
    `The best simple rule, ${best.name.toLowerCase()}, manages ${pct(best.value)}. ` +
    `My weakest subject is ${weakest.name.toLowerCase()} faults: ${pct(weakest.rootrank)}.`
  );
}

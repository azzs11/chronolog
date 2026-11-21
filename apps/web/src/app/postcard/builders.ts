import { SERVICES } from '@chronolog/engine';
import type { DayResult } from '../../features/daily/record';
import { MAX_GUESSES } from '../../features/daily/record';
import { POSTCARD_URL, type PostcardSpec } from './spec';

/** The Daily Case postcard: score and Tock's result, never the culprit, so it spoils nothing. */
export function dailyPostcard(result: DayResult): PostcardSpec {
  const score = result.isSolved ? `${result.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return {
    eyebrow: `ChronoLog Daily #${result.number}`,
    title: result.isSolved ? `Solved in ${score}` : `Stumped: ${score}`,
    lines: [result.isSolved && !result.isTockRight ? 'I beat Tock today.' : result.isTockRight ? 'Tock got it too.' : 'Tock missed it as well.', 'Six services, one culprit. Can you find it?'],
    critters: SERVICES.map((name) => ({ name, mood: 'fine' as const, caption: name, isHighlighted: false })),
    stamp: result.isSolved ? 'Solved' : null,
    footer: POSTCARD_URL,
  };
}

interface CaseLike {
  id: string;
  status: 'unreviewed' | 'confirmed' | 'rejected';
  correctService: string | null;
  candidates: ReadonlyArray<{ service: string; rank: number; weight: number; mood: PostcardSpec['critters'][number]['mood'] }>;
}

/** A case file postcard: the top three suspects and the verdict. */
export function casePostcard(c: CaseLike): PostcardSpec {
  const top = c.candidates.slice(0, 3);
  const verdict = c.status === 'confirmed' ? `Confirmed: ${top[0]?.service ?? ''}` : c.status === 'rejected' ? `Real cause: ${c.correctService ?? 'another service'}` : 'Not reviewed yet';
  return {
    eyebrow: `Case ${c.id}`,
    title: `Best guess: ${top[0]?.service ?? 'none'}`,
    lines: [verdict, 'Ranked from logs alone by ChronoLog RootRank.'],
    critters: top.map((s) => ({ name: s.service, mood: s.mood, caption: `#${s.rank} ${s.service}`, isHighlighted: s.rank === 1 })),
    stamp: c.status === 'unreviewed' ? null : 'Case closed',
    footer: POSTCARD_URL,
  };
}

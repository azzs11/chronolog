import type { RankedCause } from './api';
import { confidenceWord, evidenceSentences, formatDelay } from './format';

const cause = (evidence: Partial<RankedCause['evidence']>): RankedCause => ({
  service: 'db',
  score: 1,
  weight: 0.7,
  rank: 1,
  evidence: { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0, ...evidence },
});

describe('confidenceWord', () => {
  it('maps the relative weight to a word at the documented thresholds', () => {
    expect(confidenceWord(0.71)).toBe('likely');
    expect(confidenceWord(0.6)).toBe('likely');
    expect(confidenceWord(0.45)).toBe('possible');
    expect(confidenceWord(0.1)).toBe('unlikely');
  });
});

describe('formatDelay', () => {
  it('says seconds, minutes and before/after', () => {
    expect(formatDelay(5)).toBe('5 s after the incident start');
    expect(formatDelay(300)).toBe('5 min after the incident start');
    expect(formatDelay(-12)).toBe('12 s before the incident start');
    expect(formatDelay(0)).toBe('at the same moment as the incident start');
  });
});

describe('evidenceSentences', () => {
  it('builds each sentence only from evidence fields, citing the log id', () => {
    const sentences = evidenceSentences(
      cause({
        firstErrorAfter: 5,
        errorLines: 2,
        novelTemplates: [{ template: 'disk write failed on volume <*>', firstSeen: 105, count: 2, exampleId: 'boom' }],
        mentions: 3,
      }),
    );
    expect(sentences).toEqual([
      'Logged its first error 5 s after the incident start (2 error lines in total).',
      'Logged a message it never logged before: "disk write failed on volume <*>" (2×, log boom).',
      'Other services mention it in 3 log lines during the incident.',
    ]);
  });

  it('says plainly when there is no evidence, and clips very long templates', () => {
    expect(evidenceSentences(cause({}))).toEqual(['No error lines, new messages or mentions from other services.']);
    const long = evidenceSentences(cause({ novelTemplates: [{ template: 'x'.repeat(200), firstSeen: 1, count: 1 }] }));
    expect(long[0]).toContain('…');
  });
});

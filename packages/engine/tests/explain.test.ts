import { confidenceWord, evidenceSentences, formatDelay } from '../src';

describe('confidenceWord', () => {
  it('uses the weight thresholds, and never calls the leader unlikely', () => {
    expect(confidenceWord(0.7)).toBe('likely');
    expect(confidenceWord(0.4)).toBe('possible');
    expect(confidenceWord(0.1)).toBe('unlikely');
    expect(confidenceWord(0.27, 1)).toBe('possible');
    expect(confidenceWord(0.27, 2)).toBe('unlikely');
    expect(confidenceWord(0.9, 4)).toBe('likely');
  });
});

describe('formatDelay and evidenceSentences', () => {
  it('words a delay in seconds or minutes, before or after', () => {
    expect(formatDelay(12)).toBe('12 s after the incident start');
    expect(formatDelay(-300)).toBe('5 min before the incident start');
    expect(formatDelay(0)).toBe('at the same moment as the incident start');
  });

  it('says plainly when there is nothing to report', () => {
    const evidence = { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0 };
    expect(evidenceSentences({ evidence })).toEqual(['No error lines, new messages or mentions from other services.']);
  });
});

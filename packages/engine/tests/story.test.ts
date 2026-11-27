import { describe, expect, it } from 'vitest';
import { buildStoryInput, checkStory, storyPrompt } from '../src/story/story';
import type { RankResult, RankedCause } from '../src/rootrank/types';

function cause(service: string, rank: number, weight: number, evidence: Partial<RankedCause['evidence']>): RankedCause {
  return {
    service, rank, weight, score: weight, features: {},
    evidence: { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0, ...evidence },
  };
}

const result: RankResult = {
  incidentStart: 1000, startSource: 'given', baselineLines: 500, incidentLines: 300, modelId: 'test',
  candidates: [
    cause('catalog', 1, 0.42, { firstErrorAfter: 12, errorLines: 31, firstErrorId: 'log-a', mentions: 4, mentionIds: ['log-b'] }),
    cause('gateway', 2, 0.3, { firstErrorAfter: 20, errorLines: 9, firstErrorId: 'log-c' }),
    cause('cart', 3, 0.1, {}),
    cause('db', 4, 0.05, {}),
  ],
};
const input = buildStoryInput(result);
const reply = (sentences: unknown[]) => JSON.stringify({ sentences });

describe('buildStoryInput / storyPrompt', () => {
  it('numbers the top-3 facts and keeps their log ids', () => {
    expect(input.suspects.map((s) => s.service)).toEqual(['catalog', 'gateway', 'cart']);
    expect(input.facts.map((f) => f.key)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(input.facts[0]).toMatchObject({ service: 'catalog', logIds: ['log-a'] });
    const { user } = storyPrompt(input);
    expect(user).toContain('E1 [catalog]');
    expect(user).toContain('out of 4 services');
  });
});

describe('checkStory', () => {
  it('keeps a supported sentence and expands its fact keys to log ids', () => {
    const check = checkStory(reply([{ text: 'catalog likely broke first: its first error came 12 s after the start, with 31 error lines.', cites: ['E1'] }]), input);
    expect(check.dropped).toEqual([]);
    expect(check.kept[0]?.logIds).toEqual(['log-a']);
    expect(check.stats).toEqual({ sentences: 1, kept: 1, cites: 1, validCites: 1 });
  });

  it('drops each kind of unsupported sentence with its reason', () => {
    const check = checkStory(
      reply([
        { text: 'catalog is the culprit.', cites: [] },
        { text: 'catalog failed.', cites: ['E9'] },
        { text: 'db ran out of disk.', cites: ['E1'] },
        { text: 'gateway logged errors.', cites: ['E1'] },
        { text: 'catalog logged 500 errors.', cites: ['E1'] },
        { text: 'catalog logged errors, likely due to a bad deploy.', cites: ['E1'] },
      ]),
      input,
    );
    expect(check.kept).toEqual([]);
    expect(check.dropped.map((d) => d.reason)).toEqual([
      'uncited', 'unknown_fact', 'unknown_service', 'off_topic_cite', 'unsupported_number', 'unsupported_cause',
    ]);
  });

  it('drops a sentence that is not {text, cites}', () => {
    expect(checkStory(reply([{ text: 42 }]), input).dropped[0]?.reason).toBe('malformed');
  });

  it('does not read fact keys written into the text as numbers', () => {
    const check = checkStory(reply([{ text: 'Other services mention catalog in 4 log lines (E4).', cites: ['E2'] }]), input);
    expect(check.kept).toHaveLength(1);
  });

  it('accepts the weight as a percentage and the rank', () => {
    const check = checkStory(reply([{ text: 'catalog is #1 with weight 42%.', cites: ['E1'] }]), input);
    expect(check.kept).toHaveLength(1);
  });

  it('marks a reply that is not the asked JSON as malformed and keeps nothing', () => {
    const check = checkStory('Sure! catalog is broken.', input);
    expect(check.isWellFormed).toBe(false);
    expect(check.kept).toEqual([]);
  });

  it('finds the JSON inside extra text around it', () => {
    const check = checkStory(`Here you go:\n${reply([{ text: 'gateway logged 9 error lines.', cites: ['E3'] }])}\nThanks`, input);
    expect(check.kept[0]?.logIds).toEqual(['log-c']);
  });
});

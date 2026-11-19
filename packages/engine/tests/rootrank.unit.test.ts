import { Drain, maskMessage, predict, rankRootCauses, rankPct, ROOTRANK_DRAIN, type TreeModel } from '../src';

const STUMP: TreeModel = {
  id: 'test',
  feature_names: ['t_first_novel'],
  tree_info: [
    {
      tree_structure: {
        split_feature: 0,
        threshold: 10,
        decision_type: '<=',
        default_left: true,
        missing_type: 'None',
        left_child: { leaf_value: 1 },
        right_child: { leaf_value: -1 },
      },
    },
  ],
};

describe('maskMessage', () => {
  it('masks numbers, ids, addresses and times, and caps the length', () => {
    expect(maskMessage('user 12 from 10.0.0.5:80 at 2024-01-24 03:43:56.336')).toBe('user <*> from <*> at <*>');
    expect(maskMessage('x '.repeat(100)).split(' ')).toHaveLength(40);
  });
});

describe('Drain', () => {
  it('groups messages that differ only in a parameter and generalises the template', () => {
    const drain = new Drain(ROOTRANK_DRAIN);
    const a = drain.addMessage('connect to cache failed');
    const b = drain.addMessage('connect to queue failed');
    expect(b).toBe(a);
    expect(drain.templates().get(a)).toBe('connect to <*> failed');
  });

  it('keeps different shapes apart and handles empty messages', () => {
    const drain = new Drain(ROOTRANK_DRAIN);
    const x = drain.addMessage('disk full');
    const y = drain.addMessage('completely different longer message here');
    const empty1 = drain.addMessage('   ');
    const empty2 = drain.addMessage('');
    expect(new Set([x, y]).size).toBe(2);
    expect(empty2).toBe(empty1);
  });

  it('rejects a depth that is too small', () => {
    expect(() => new Drain({ depth: 2, simThreshold: 0.4, maxChildren: 100 })).toThrow();
  });

  it('collapses new tokens into a wildcard once a node has reached max children', () => {
    const drain = new Drain({ depth: 4, simThreshold: 0.99, maxChildren: 3 });
    const ids = ['a', 'b', 'c', 'd', 'e'].map((word) => drain.addMessage(`${word} one two three`));
    expect(new Set(ids).size).toBe(5);
  });
});

describe('predict', () => {
  it('follows the split and sums the leaves', () => {
    expect(predict(STUMP, [3])).toBe(1);
    expect(predict(STUMP, [30])).toBe(-1);
  });

  it('sends missing values the default way and rejects unsupported splits', () => {
    const missing: TreeModel = JSON.parse(JSON.stringify(STUMP));
    (missing.tree_info[0]?.tree_structure as { missing_type: string; default_left: boolean }).missing_type = 'NaN';
    expect(predict(missing, [Number.NaN])).toBe(1);
    const bad: TreeModel = JSON.parse(JSON.stringify(STUMP));
    (bad.tree_info[0]?.tree_structure as { decision_type: string }).decision_type = '==';
    expect(() => predict(bad, [1])).toThrow(/Unsupported/);
  });
});

describe('rankPct', () => {
  it('gives ties their average rank, in both directions', () => {
    expect(rankPct([5, 1, 1, 9], true)).toEqual([0.75, 0.375, 0.375, 1]);
    expect(rankPct([5, 1, 1, 9], false)).toEqual([0.5, 0.875, 0.875, 0.25]);
  });
});

describe('rankRootCauses', () => {
  it('returns no candidates for no lines', () => {
    const result = rankRootCauses([], 100, STUMP);
    expect(result.candidates).toEqual([]);
    expect(result.baselineLines + result.incidentLines).toBe(0);
  });

  it('refuses a model that uses a feature it does not know', () => {
    const unknown = { ...STUMP, feature_names: ['nope'] };
    expect(() => rankRootCauses([{ timestamp: 1, service: 'a', message: 'm' }], 0, unknown)).toThrow(/unknown feature/);
  });

  it('ranks a service that logs something new first and explains why', () => {
    const lines = [];
    for (let t = 0; t < 100; t++) for (const service of ['api', 'db']) lines.push({ id: `${service}${t}`, timestamp: t, service, message: 'heartbeat ok' });
    lines.push({ id: 'boom', timestamp: 105, service: 'db', message: 'ERROR disk write failed on volume 3' });
    lines.push({ timestamp: 130, service: 'api', message: 'ERROR call to db failed' });
    const result = rankRootCauses(lines, 100, STUMP);
    expect(result.candidates[0]?.service).toBe('db');
    expect(result.candidates[0]?.evidence.firstNovelAfter).toBe(5);
    expect(result.candidates[0]?.evidence.novelTemplates[0]?.exampleId).toBe('boom');
    expect(result.candidates[0]?.evidence.firstErrorAfter).toBe(5);
    const weights = result.candidates.map((c) => c.weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(result.baselineLines).toBe(200);
  });
});

import type { CausalMeta } from '@chronolog/engine';
import { ServiceRanker } from '../src/ranker';

const meta = (rootId: string | null, blast: number): CausalMeta => ({
  causal_parent_id: rootId,
  causal_root_id: rootId,
  causal_chain_depth: rootId ? 1 : 0,
  blast_radius_score: blast,
});

const START = 1000 * 1000; // incident start in ms

describe('ServiceRanker', () => {
  it('credits blast radius to the service that started the chain', () => {
    const r = new ServiceRanker(START);
    r.observe('a', 'db', START + 1, meta(null, 5));
    r.observe('b', 'api', START + 2, meta('a', 8));
    r.observe('c', 'auth', START + 3, meta('a', 9.5));
    expect(r.ranking()).toEqual([{ service: 'db', score: 17.5 }]);
    expect(r.linkedLogsInWindow).toBe(2);
  });

  it('ranks by score, highest first, ties alphabetical', () => {
    const r = new ServiceRanker(START);
    r.observe('a', 'zeta', START, meta(null, 1));
    r.observe('b', 'alpha', START, meta(null, 1));
    r.observe('c', 'x', START, meta('a', 4));
    r.observe('d', 'y', START, meta('b', 4));
    r.observe('e', 'x', START, meta('b', 1));
    expect(r.ranking()).toEqual([
      { service: 'alpha', score: 5 },
      { service: 'zeta', score: 4 },
    ]);
  });

  it('ignores logs before the incident window, but still remembers them as possible roots', () => {
    const r = new ServiceRanker(START);
    r.observe('early', 'db', START - 5000, meta(null, 5));
    r.observe('late-child', 'api', START - 1, meta('early', 8)); // before the window: not counted
    r.observe('in-window', 'api', START + 1, meta('early', 9));
    expect(r.ranking()).toEqual([{ service: 'db', score: 9 }]);
  });

  it('skips logs whose chain root is unknown or that have no chain', () => {
    const r = new ServiceRanker(START);
    r.observe('a', 'db', START, meta(null, 5));
    r.observe('b', 'api', START, meta('ghost', 3));
    expect(r.ranking()).toEqual([]);
    expect(r.linkedLogsInWindow).toBe(0);
  });
});

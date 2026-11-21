import { fireEvent, render, screen } from '@testing-library/react';
import Rewind, { describeOffset, firstSignSentence, firstUnwellFrames, spreadSentence } from './Rewind';
import { layoutTown, spreadsAlong } from './layout';
import { defaultRoadOptions, priorRoads, type Road, townRoads } from './roads';

const graph = {
  services: ['db', 'api', 'cache'],
  mentions: [{ from: 'api', to: 'db', count: 40 }],
  correlations: [{ a: 'api', b: 'cache', corr: 0.6 }],
};
// 4 buckets before the burst start, 4 after; db breaks first.
const timeline = {
  bucketSeconds: 30,
  startOffset: -120,
  services: [
    { name: 'db', lines: [20, 20, 20, 20, 20, 20, 20, 20], errors: [0, 0, 0, 0, 6, 9, 9, 9] },
    { name: 'api', lines: [20, 20, 20, 20, 20, 20, 20, 20], errors: [0, 0, 0, 0, 0, 4, 6, 6] },
    { name: 'cache', lines: [20, 20, 20, 20, 20, 20, 20, 20], errors: [0, 0, 0, 0, 0, 0, 0, 0] },
  ],
};

describe('town layout and roads', () => {
  it('puts services on a ring in name order when no road has a direction', () => {
    const town = layoutTown(['db', 'api', 'cache']);
    expect(town.kind).toBe('ring');
    expect(town.places.map((p) => p.name)).toEqual(['api', 'cache', 'db']);
    expect(layoutTown(['cache', 'db', 'api'])).toEqual(town);
    for (const p of town.places) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(town.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(town.height);
    }
  });

  const mention = (a: string, b: string): Road => ({ a, b, kind: 'mention', strength: 1, label: '' });

  it('lays callers out to the left of what they call when logs name services', () => {
    const town = layoutTown(['gateway', 'orders', 'db', 'auth'], [mention('gateway', 'orders'), mention('orders', 'db'), mention('gateway', 'auth')]);
    expect(town.kind).toBe('columns');
    const x = Object.fromEntries(town.places.map((p) => [p.name, p.x]));
    expect(x.gateway).toBeLessThan(x.orders as number);
    expect(x.orders).toBeLessThan(x.db as number);
    expect(x.auth).toBe(x.orders);
  });

  it('survives cycles and grows taller for a crowded column', () => {
    const cyclic = layoutTown(['a', 'b'], [mention('a', 'b'), mention('b', 'a')]);
    expect(cyclic.places).toHaveLength(2);
    const fan = layoutTown(['hub', 's1', 's2', 's3', 's4', 's5'], ['s1', 's2', 's3', 's4', 's5'].map((s) => mention('hub', s)));
    expect(fan.height).toBeGreaterThan(380);
  });

  it('reads spread from the order services turned unwell, skipping ties', () => {
    const roads = [mention('gateway', 'db'), mention('orders', 'db'), mention('gateway', 'orders')];
    const first = new Map([
      ['db', 2],
      ['gateway', 4],
      ['orders', 4],
    ]);
    expect(spreadsAlong(roads, first)).toEqual([
      { from: 'db', to: 'gateway', frame: 4 },
      { from: 'db', to: 'orders', frame: 4 },
    ]);
  });

  it('turns the learned graph into roads with a strength and a sentence', () => {
    expect(townRoads(graph, defaultRoadOptions(graph))).toEqual([{ a: 'api', b: 'db', kind: 'mention', strength: 1, label: 'api names db in 40 lines' }]);
    const roads = townRoads(graph, { withCorrelations: true, withPrior: false });
    expect(roads).toEqual([
      { a: 'api', b: 'db', kind: 'mention', strength: 1, label: 'api names db in 40 lines' },
      { a: 'api', b: 'cache', kind: 'correlation', strength: 0.6, label: 'api and cache move together (0.60)' },
    ]);
  });

  it('shows volume roads by default only when the logs name no services', () => {
    expect(defaultRoadOptions(graph).withCorrelations).toBe(false);
    expect(defaultRoadOptions({ ...graph, mentions: [] }).withCorrelations).toBe(true);
  });

  it('adds hand-made map roads only between services that are present', () => {
    expect(priorRoads(['api', 'database', 'nothing'])).toEqual([{ a: 'api', b: 'database', kind: 'prior', strength: 1, label: 'hand-made map: api depends on database' }]);
    expect(priorRoads(['db', 'cart'])).toEqual([]);
  });
});

describe('describeOffset', () => {
  it('reads like a sentence', () => {
    expect(describeOffset(0)).toBe('at the start of the burst');
    expect(describeOffset(-30, 'the trouble')).toBe('30 s before the trouble');
    expect(describeOffset(-150)).toBe('2 min 30 s before the burst');
    expect(describeOffset(60)).toBe('1 min after the burst');
    expect(describeOffset(30)).toBe('30 s after the burst');
  });
});

describe('firstSignSentence', () => {
  it('names a tie instead of picking a winner', () => {
    const tie = { frames: [{ a: 'sick' as const, b: 'stressed' as const }], seconds: [0], baselineBuckets: 0, firstSign: { service: 'a', bucket: 0, seconds: 0, alsoUnwell: ['b'] } };
    expect(firstSignSentence(tie)).toBe('First signs: a and b turned unwell within the same 30 s, at the start of the burst. Counts cannot tell which came first.');
  });
});

describe('Rewind', () => {
  it('opens on the first sign and says who it was and when', () => {
    render(<Rewind timeline={timeline} graph={graph} />);
    expect(screen.getByText(/First sign: db looked sick at the start of the burst/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Town map at the start of the burst: db Sick, api Fine, cache Fine/ })).toBeInTheDocument();
  });

  it('moves through time with the slider', () => {
    render(<Rewind timeline={timeline} graph={graph} />);
    fireEvent.change(screen.getByLabelText('Time in the incident'), { target: { value: '6' } });
    expect(screen.getByRole('img', { name: /Town map 1 min after the burst: db Sick, api Sick, cache Fine/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Time in the incident'), { target: { value: '0' } });
    expect(screen.getByRole('img', { name: /2 min before the burst: db Fine/ })).toBeInTheDocument();
  });

  it('offers the hand-made map only when it knows some of these services', () => {
    const { rerender } = render(<Rewind timeline={timeline} graph={{ ...graph, services: ['db', 'cart'] }} />);
    expect(screen.queryByLabelText(/show the hand-made map/)).not.toBeInTheDocument();
    rerender(<Rewind timeline={timeline} graph={{ ...graph, services: ['api', 'database'] }} />);
    expect(screen.getByLabelText(/show the hand-made map/)).toBeInTheDocument();
  });
});

describe('spread in Rewind', () => {
  it('finds when each service first looks unwell', () => {
    expect(firstUnwellFrames([{ a: 'fine', b: 'fine' }, { a: 'sick', b: 'fine' }, { a: 'sick', b: 'stressed' }])).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
  });

  it('describes the order in time without calling it a cause', () => {
    expect(spreadSentence([])).toBeNull();
    expect(spreadSentence([{ from: 'db', to: 'orders', frame: 3 }, { from: 'orders', to: 'gateway', frame: 5 }])).toBe(
      'Along the roads, services turned unwell in this order: db, then orders, then gateway. That is order in time on roads guessed from the logs, not proof of cause.',
    );
  });

  it('draws an arrow along the road once trouble has moved, not before', () => {
    // api names db (one road); db breaks first, api follows a bucket later.
    const t = {
      bucketSeconds: 30,
      startOffset: -120,
      services: [
        { name: 'db', lines: [20, 20, 20, 20, 20, 20, 20, 20], errors: [0, 0, 0, 0, 9, 9, 9, 9] },
        { name: 'api', lines: [20, 20, 20, 20, 20, 20, 20, 20], errors: [0, 0, 0, 0, 0, 9, 9, 9] },
      ],
    };
    const { container } = render(<Rewind timeline={t} graph={{ services: ['api', 'db'], mentions: [{ from: 'api', to: 'db', count: 9 }], correlations: [] }} />);
    const arrows = () => container.querySelectorAll('path[d="M-9 -7 L7 0 L-9 7 Z"]').length;
    expect(arrows()).toBe(0);
    fireEvent.change(screen.getByLabelText('Time in the incident'), { target: { value: '5' } });
    expect(arrows()).toBe(1);
    expect(screen.getByText(/services turned unwell in this order: db, then api/)).toBeInTheDocument();
  });
});

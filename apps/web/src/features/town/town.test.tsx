import { fireEvent, render, screen } from '@testing-library/react';
import Rewind, { describeOffset } from './Rewind';
import { defaultRoadOptions, layoutTown, priorRoads, TOWN, townRoads } from './roads';

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
  it('places services in name order inside the drawing, the same every time', () => {
    const places = layoutTown(['db', 'api', 'cache']);
    expect(places.map((p) => p.name)).toEqual(['api', 'cache', 'db']);
    expect(layoutTown(['cache', 'db', 'api'])).toEqual(places);
    for (const p of places) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(TOWN.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(TOWN.height);
    }
    expect(layoutTown(['solo'])).toEqual([{ name: 'solo', x: TOWN.width / 2, y: TOWN.height / 2 }]);
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
    expect(describeOffset(0)).toBe('at the burst start');
    expect(describeOffset(-150)).toBe('2 min 30 s before the burst');
    expect(describeOffset(60)).toBe('1 min after the burst');
    expect(describeOffset(30)).toBe('30 s after the burst');
  });
});

describe('Rewind', () => {
  it('opens on the first sign and says who it was and when', () => {
    render(<Rewind timeline={timeline} graph={graph} />);
    expect(screen.getByText(/First sign: db looked sick at the burst start/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Town map at the burst start: db Sick, api Fine, cache Fine/ })).toBeInTheDocument();
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

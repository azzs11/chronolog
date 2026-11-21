import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { serviceMoods } from '@chronolog/engine';
import type { LiveLog } from './stats';
import TownStrip from './TownStrip';

/** The engine's moods for these lines, as GET /api/moods would return them. */
const moodsFor = (logs: LiveLog[], nowMs: number) =>
  serviceMoods(
    logs.map((l) => ({ id: l.id, timestamp: l.time / 1000, service: l.source, severity: l.severity, message: l.message })),
    nowMs / 1000,
  );

const NOW = 1_700_001_000_000; // ms
let n = 0;
const log = (secondsAgo: number, source: string, message: string, severity = 'info'): LiveLog => ({ id: `id-${n++}-abcdef`, time: NOW - secondsAgo * 1000, source, message, severity });
/** A steady service: a line every 5 s for the last 17 minutes. */
const steady = (source: string): LiveLog[] => Array.from({ length: 204 }, (_, i) => log(i * 5, source, 'GET /items 200 in 12 ms'));
const errors = (source: string, count: number): LiveLog[] => Array.from({ length: count }, (_, i) => log(i * 5, source, 'connection refused to store', 'error'));

describe('test moods', () => {
  it('put the sick service first', () => {
    const moods = moodsFor([...steady('api'), ...steady('db'), ...errors('db', 12)], NOW);
    expect(moods.map((m) => [m.service, m.mood])).toEqual([
      ['db', 'sick'],
      ['api', 'fine'],
    ]);
  });
});

describe('TownStrip', () => {
  const logs = [...steady('api'), ...steady('db'), ...errors('db', 12)];

  it('shows every service as a creature with its mood written out, worst first', () => {
    render(<TownStrip moods={moodsFor(logs, NOW)} selected="" onSelect={vi.fn()} />);
    const buttons = within(screen.getByRole('list', { name: 'Services' })).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['dbSick', 'apiFine']);
  });

  it('has Tock explain the most worrying service and cite its log lines', () => {
    render(<TownStrip moods={moodsFor(logs, NOW)} selected="" onSelect={vi.fn()} />);
    const section = screen.getByRole('region', { name: 'Service moods' });
    expect(section).toHaveTextContent('db · Sick. 12 error lines in the last 2 minutes');
    expect(within(section).getAllByTitle(/^Log id-/)).toHaveLength(5);
  });

  it('says everyone is fine when they are', () => {
    render(<TownStrip moods={moodsFor(steady('api'), NOW)} selected="" onSelect={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Service moods' })).toHaveTextContent('The one service logging looks fine.');
  });

  it('selects a service on click and clears it on a second click', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TownStrip moods={moodsFor(logs, NOW)} selected="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /api/ }));
    expect(onSelect).toHaveBeenLastCalledWith('api');
    rerender(<TownStrip moods={moodsFor(logs, NOW)} selected="api" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /api/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Service moods' })).toHaveTextContent('api · Fine.');
    fireEvent.click(screen.getByRole('button', { name: /api/ }));
    expect(onSelect).toHaveBeenLastCalledWith('');
  });
});

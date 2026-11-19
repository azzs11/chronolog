import { fireEvent, render, screen, within } from '@testing-library/react';
import { simulateIncident } from '@chronolog/engine';
import PlaygroundView, { peekLines } from './PlaygroundView';

const FIXED_SEED = () => 7;

describe('PlaygroundView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('explains itself, labels the demo as simulated and shows the random baseline before any round', () => {
    render(<PlaygroundView makeSeed={FIXED_SEED} />);
    expect(screen.getByText(/this is a demo, not the benchmark/i)).toBeInTheDocument();
    expect(screen.getByText(/random guessing among 6 services gets 17% and 50%/i)).toBeInTheDocument();
    expect(screen.queryByTestId('candidate')).not.toBeInTheDocument();
  });

  it('breaks something, shows a ranked guess without the answer, then reveals it and scores the round', async () => {
    render(<PlaygroundView makeSeed={FIXED_SEED} />);
    fireEvent.click(screen.getByRole('button', { name: /break something/i }));
    expect(await screen.findAllByTestId('candidate')).toHaveLength(3);
    expect(screen.queryByText(/the broken service was/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reveal the answer/i }));
    expect(screen.getByText(/the broken service was/i)).toBeInTheDocument();
    expect(screen.getByText(/Seed 7/)).toBeInTheDocument();
    expect(screen.getByText(/Your rounds: 1\./)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('chronolog.playground.tally.v1') ?? '{}').played).toBe(1);
  });

  it('plays the same incident for the same seed', async () => {
    render(<PlaygroundView makeSeed={FIXED_SEED} />);
    fireEvent.click(screen.getByRole('button', { name: /break something/i }));
    await screen.findAllByTestId('candidate');
    const first = screen.getAllByTestId('candidate').map((n) => n.textContent);
    fireEvent.click(screen.getByRole('button', { name: /break something/i }));
    await screen.findAllByTestId('candidate');
    expect(screen.getAllByTestId('candidate').map((n) => n.textContent)).toEqual(first);
  });

  it('lets the visitor pick a fault and a service, and offers only observable services', async () => {
    render(<PlaygroundView makeSeed={FIXED_SEED} />);
    fireEvent.change(screen.getByLabelText(/^fault$/i), { target: { value: 'delay' } });
    const services = screen.getByLabelText(/^service$/i) as HTMLSelectElement;
    expect([...services.options].map((o) => o.value)).not.toContain('gateway');
    fireEvent.change(services, { target: { value: 'db' } });
    fireEvent.click(screen.getByRole('button', { name: /break something/i }));
    await screen.findAllByTestId('candidate');
    fireEvent.click(screen.getByRole('button', { name: /reveal the answer/i }));
    const reveal = within(screen.getByRole('status'));
    expect(reveal.getByText(/network delay/i, { selector: 'p' })).toBeInTheDocument();
    expect(reveal.getByText('db')).toBeInTheDocument();
  });

  it('can reset the score', async () => {
    localStorage.setItem('chronolog.playground.tally.v1', JSON.stringify({ played: 2, top1: 1, top3: 2 }));
    render(<PlaygroundView makeSeed={FIXED_SEED} />);
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect(screen.getByText(/Your rounds: 0\./)).toBeInTheDocument();
  });
});

describe('peekLines', () => {
  it('shows warnings and errors after the start, and falls back to the broken service when there are none', () => {
    const loud = simulateIncident({ seed: 1, service: 'db', fault: 'disk' });
    expect(peekLines(loud).length).toBeGreaterThan(0);
    expect(peekLines(loud).every((l) => /error|warning/.test(l))).toBe(true);
    const quiet = { ...loud, lines: loud.lines.filter((l) => l.severity === 'info') };
    expect(peekLines(quiet).every((l) => l.startsWith('db'))).toBe(true);
  });
});

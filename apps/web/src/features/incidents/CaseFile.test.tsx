import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { RankedCause } from '../rootrank/api';
import CaseStamp from './CaseStamp';
import EvidenceBubbles from './EvidenceBubbles';
import SuspectLineup from './SuspectLineup';

const cause = (service: string, rank: number, weight: number, evidence: Partial<RankedCause['evidence']> = {}): RankedCause => ({
  service,
  score: 1,
  weight,
  rank,
  evidence: { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0, ...evidence },
});

const suspects = [
  cause('db', 1, 0.62, { errorLines: 40, firstErrorAfter: 4, firstErrorId: 'err-1' }),
  cause('api', 2, 0.25, { errorLines: 2, firstErrorAfter: 30 }),
  cause('cache', 3, 0.1),
  cause('auth', 4, 0.03),
];

describe('SuspectLineup', () => {
  it('shows the top three with rank, word, number and a face from their own evidence', () => {
    render(<SuspectLineup candidates={suspects} selected="db" onSelect={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Suspect lineup' })).getAllByRole('button');
    expect(items.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['#1 db likely, 0.62 Sick', '#2 api unlikely, 0.25 Stressed', '#3 cache unlikely, 0.10 Fine']);
    expect(items[0]).toHaveTextContent('Sick');
    expect(items[1]).toHaveTextContent('Stressed');
    expect(items[2]).toHaveTextContent('Fine');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
  });

  it('selects a suspect on click', () => {
    const onSelect = vi.fn();
    render(<SuspectLineup candidates={suspects} selected="db" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /#3 cache/ }));
    expect(onSelect).toHaveBeenCalledWith('cache');
  });
});

describe('EvidenceBubbles', () => {
  it('gives every claim its own bubble with the log ids it cites', () => {
    render(<EvidenceBubbles cause={suspects[0] as RankedCause} />);
    const bubbles = screen.getAllByRole('listitem');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]).toHaveTextContent('Logged its first error 4 s after the incident start (40 error lines in total).');
    expect(within(bubbles[0] as HTMLElement).getByText('log err-1')).toBeInTheDocument();
  });

  it('says plainly when a claim has no line to cite', () => {
    render(<EvidenceBubbles cause={suspects[1] as RankedCause} />);
    expect(screen.getByText('These lines carry no ids to cite.')).toBeInTheDocument();
  });

  it('labels "nothing found" as an absence, not as a cited fact', () => {
    render(<EvidenceBubbles cause={suspects[2] as RankedCause} />);
    expect(screen.getByText(/Nothing to cite: this is about what did not happen/)).toBeInTheDocument();
  });
});

describe('CaseStamp', () => {
  it('stamps nothing on an open case', () => {
    const { container } = render(<CaseStamp status="unreviewed" correctService={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stamps "Case closed" on a confirmed case and names the cause on a corrected one', () => {
    const { rerender } = render(<CaseStamp status="confirmed" correctService="db" />);
    expect(screen.getByRole('note')).toHaveTextContent('Case closed');
    rerender(<CaseStamp status="rejected" correctService="cache" />);
    expect(screen.getByRole('note')).toHaveTextContent('Solved: cache');
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { vi } from 'vitest';
import { EMPTY_PLAY, type Play } from './game';
import GameCase from './GameCase';
import ArcadePage from './ArcadePage';
import Drills, { drillPuzzle } from './modes/Drills';
import { simPuzzle } from './sim';
import { STAGES } from './training';

vi.mock('../incidents/api', async (orig) => ({ ...(await orig<typeof import('../incidents/api')>()), fetchIncidents: vi.fn(() => Promise.resolve([])) }));

const stage = STAGES[2] as (typeof STAGES)[number];
const data = simPuzzle(stage.service, stage.fault, stage.seed);

function Harness({ onDone = vi.fn() }: { onDone?: (p: Play) => void }) {
  const [play, setPlay] = useState<Play>(EMPTY_PLAY);
  return (
    <GameCase
      data={data}
      caseLabel="1-3"
      play={play}
      onPlay={(p) => {
        setPlay(p);
        onDone(p);
      }}
      intro="Hello detective."
      lesson="Faces show symptoms."
      actions={<button type="button">NEXT STAGE ▶</button>}
    />
  );
}

const suspect = (name: string) => within(screen.getByRole('list', { name: 'Suspects' })).getByRole('button', { name: new RegExp(`^${name},`) });

describe('GameCase', () => {
  beforeEach(() => localStorage.clear());

  it('starts with three guesses, two clues, the tape at the start and Tock talking', () => {
    render(<Harness />);
    expect(screen.getByText('3 of 3 left')).toBeInTheDocument();
    expect(screen.getByText(/^CLUES/)).toHaveTextContent('CLUES 2');
    expect(screen.getByText('Hello detective.')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Suspects' })).getAllByRole('button')).toHaveLength(6);
  });

  it('a wrong accusation costs a heart and Tock explains why, from the case', () => {
    render(<Harness />);
    fireEvent.click(suspect('gateway'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCUSE GATEWAY!' }));
    expect(screen.getByText('2 of 3 left')).toBeInTheDocument();
    expect(suspect('gateway')).toHaveAccessibleName(/not the culprit/);
  });

  it('clue items draw onto the scene and cost a clue', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'CLUE: WHO IS TALKED ABOUT' }));
    expect(screen.getByRole('button', { name: 'CLUE: WHO IS TALKED ABOUT' })).toBeDisabled();
    expect(suspect('cart')).toHaveAccessibleName(/named 216 times/);
    expect(screen.getByText(/^CLUES/)).toHaveTextContent('CLUES 1');
  });

  it('clicking a creature twice accuses it; a solve shows stars, the lesson, field notes and actions', () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    fireEvent.click(suspect('cart'));
    fireEvent.click(suspect('cart'));
    const outcome = screen.getByRole('region', { name: 'The outcome' });
    expect(outcome).toHaveTextContent('CASE CLOSED');
    expect(within(outcome).getByRole('img', { name: '3 of 3 stars' })).toBeInTheDocument();
    expect(outcome).toHaveTextContent('TOCKguessed gateway · MISS');
    expect(outcome).toHaveTextContent('WHAT YOU LEARNEDFaces show symptoms.');
    expect(outcome).toHaveTextContent(/FIELD NOTES: NETWORK DELAY/);
    expect(within(outcome).getByRole('button', { name: 'NEXT STAGE ▶' })).toBeInTheDocument();
    expect(onDone).toHaveBeenLastCalledWith({ guesses: ['cart'], clues: [] });
  });

  it('arrow keys move between creatures', () => {
    render(<Harness />);
    const first = within(screen.getByRole('list', { name: 'Suspects' })).getAllByRole('button')[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ArcadePage', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('opens on a world map with Training first and marked START HERE', () => {
    render(<ArcadePage />);
    const modes = within(screen.getByRole('navigation', { name: 'Arcade modes' })).getAllByRole('button');
    expect(modes[0]).toHaveTextContent('1 · TRAINING TOWNSTART HERE');
    expect(modes.map((m) => m.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/SANDBOX/)]));
    expect(modes.some((m) => /YOUR TEAM/.test(m.textContent ?? ''))).toBe(false);
  });

  it('offers team drills only with a backend, and opens a mode from the URL (old ?tab= links too)', async () => {
    window.history.replaceState(null, '', '/arcade?tab=simulated');
    render(<ArcadePage Team={Drills} />);
    expect(screen.getByRole('heading', { name: 'SANDBOX' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '◀ MAP' }));
    fireEvent.click(screen.getByRole('button', { name: /YOUR TEAM/ }));
    expect(await screen.findByText('NO DRILLS YET')).toBeInTheDocument();
  });

  it('training ends with a link into the app when there is one', () => {
    const onOpenApp = vi.fn();
    window.history.replaceState(null, '', '/arcade?mode=training');
    render(<ArcadePage onOpenApp={onOpenApp} />);
    const s = STAGES[0] as (typeof STAGES)[number];
    fireEvent.click(suspect(s.service));
    fireEvent.click(suspect(s.service));
    fireEvent.click(screen.getByRole('button', { name: 'SEE IT IN THE TOWN VIEW' }));
    expect(onOpenApp).toHaveBeenCalledWith('/town');
  });
});

describe('drillPuzzle', () => {
  it('uses the cause your team gave as the answer, and skips unreviewed incidents', () => {
    const detail = {
      incident: { id: 'inc-1', start: '', end: '', durationSeconds: 1, errorLines: 1, services: [], impact: 1, status: 'rejected' as const, correctService: 'cache' },
      ranking: { incidentStart: 0, startSource: 'given' as const, candidates: [{ service: 'db', score: 1, weight: 1, rank: 1, evidence: { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 3 } }], baselineLines: 1, incidentLines: 1, modelId: 'm' },
      timeline: { bucketSeconds: 30, startOffset: 0, services: [] },
      graph: { services: ['cache', 'db'], mentions: [], correlations: [] },
      windowLines: 2,
    };
    expect(drillPuzzle(detail)).toMatchObject({ answer: 'cache', tockGuess: 'db', services: ['cache', 'db'], fault: null });
    expect(drillPuzzle({ ...detail, incident: { ...detail.incident, correctService: null } })).toBeNull();
  });
});

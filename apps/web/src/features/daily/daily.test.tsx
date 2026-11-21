import { dailyCase, SERVICES } from '@chronolog/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import DailyCase from './DailyCase';
import { type DayResult, type History, loadHistory, saveHistory, shareText, statsOf } from './record';

const day = (over: Partial<DayResult> = {}): DayResult => ({ number: 1, guesses: ['db'], isSolved: true, isTockRight: true, ...over });

describe('Daily Case records', () => {
  beforeEach(() => localStorage.clear());

  it('shares a spoiler-free grid: no service names, one square per guess', () => {
    expect(shareText(day({ number: 7, guesses: ['db', 'cart'], isTockRight: false }))).toBe('ChronoLog Daily #7  2/3\n🟥🟩\nTock: 🟥\nchronolog.akchhya.xyz');
    const lost = shareText(day({ guesses: ['db', 'cart', 'auth'], isSolved: false }));
    expect(lost.split('\n').slice(0, 2)).toEqual(['ChronoLog Daily #1  X/3', '🟥🟥🟥']);
    for (const s of SERVICES) expect(lost).not.toContain(s);
  });

  it('counts played, solved, the streak and the days you beat Tock', () => {
    const history: History = {
      '2026-11-21': day(),
      '2026-11-22': day({ isTockRight: false }),
      '2026-11-23': day({ guesses: ['a', 'b', 'c'], isSolved: false }),
      '2026-11-24': day(),
      '2026-11-25': day({ guesses: ['a'], isSolved: false }),
    };
    expect(statsOf(history, '2026-11-25')).toEqual({ played: 4, solved: 3, streak: 1, beatTock: 1 });
    expect(statsOf(history, '2026-11-22')).toMatchObject({ streak: 2 });
  });

  it('survives storage that is missing or throws', () => {
    expect(loadHistory()).toEqual({});
    saveHistory({ '2026-11-21': day() });
    expect(loadHistory()).toEqual({ '2026-11-21': day() });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveHistory({})).not.toThrow();
    spy.mockRestore();
  });
});

describe('DailyCase', () => {
  const TODAY = '2026-11-21';
  const answer = dailyCase(TODAY).service;
  const wrong = SERVICES.filter((s) => s !== answer);
  beforeEach(() => localStorage.clear());

  it('starts with one clue open and the others locked', () => {
    render(<DailyCase today={TODAY} />);
    expect(screen.getByRole('heading', { name: 'Daily Case #1' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Clue 2: What they said' })).toHaveTextContent('Unlocks after a wrong guess');
    expect(screen.queryByRole('region', { name: 'The answer' })).not.toBeInTheDocument();
  });

  it('opens a clue per miss, reveals the answer and Tock on a hit, and keeps the result', () => {
    render(<DailyCase today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: wrong[0] }));
    expect(screen.getByRole('region', { name: 'Clue 2: What they said' })).not.toHaveTextContent('Unlocks');
    fireEvent.click(screen.getByRole('button', { name: answer }));
    const answerBox = screen.getByRole('region', { name: 'The answer' });
    expect(answerBox).toHaveTextContent('Solved in 2!');
    expect(answerBox).toHaveTextContent(`It was ${answer}`);
    expect(answerBox).toHaveTextContent(/Tock guessed \w+: (right|wrong)\./);
    expect(answerBox).toHaveTextContent(/ChronoLog Daily #1\s+2\/3/);
    expect(loadHistory()[TODAY]?.guesses).toEqual([wrong[0], answer]);
  });

  it('ends after three misses', () => {
    render(<DailyCase today={TODAY} />);
    for (const s of wrong.slice(0, 3)) fireEvent.click(screen.getByRole('button', { name: s }));
    expect(screen.getByRole('region', { name: 'The answer' })).toHaveTextContent('Not this time.');
    for (const s of SERVICES) expect(screen.getByRole('button', { name: new RegExp(`^${s}`) })).toBeDisabled();
  });
});

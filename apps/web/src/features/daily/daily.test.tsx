import { SERVICES } from '@chronolog/engine';
import { vi } from 'vitest';
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

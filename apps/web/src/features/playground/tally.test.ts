import { EMPTY_TALLY, loadTally, percent, randomBaseline, recordRound, saveTally } from './tally';

describe('tally', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('counts a first-place hit in both columns, a third place only in top 3, and a miss in neither', () => {
    let t = recordRound(EMPTY_TALLY, 1);
    t = recordRound(t, 3);
    t = recordRound(t, 5);
    expect(t).toEqual({ played: 3, top1: 1, top3: 2 });
  });

  it('saves and reloads', () => {
    saveTally({ played: 4, top1: 2, top3: 3 });
    expect(loadTally()).toEqual({ played: 4, top1: 2, top3: 3 });
  });

  it('starts empty when storage is missing, corrupt or impossible', () => {
    expect(loadTally()).toEqual(EMPTY_TALLY);
    localStorage.setItem('chronolog.playground.tally.v1', '{not json');
    expect(loadTally()).toEqual(EMPTY_TALLY);
    localStorage.setItem('chronolog.playground.tally.v1', JSON.stringify({ played: 1, top1: 2, top3: 2 }));
    expect(loadTally()).toEqual(EMPTY_TALLY);
  });

  it('survives a storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTally()).toEqual(EMPTY_TALLY);
    spy.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveTally(EMPTY_TALLY)).not.toThrow();
    set.mockRestore();
  });

  it('formats percentages and the random baseline', () => {
    expect(percent(0, 0)).toBe('–');
    expect(percent(1, 3)).toBe('33%');
    expect(randomBaseline(6)).toEqual({ top1: '17%', top3: '50%' });
  });
});

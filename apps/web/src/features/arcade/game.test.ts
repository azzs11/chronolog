import { arcadeLayout, clockLabel, clueLine, crackedBy, EMPTY_PLAY, endLine, isOver, starsFor, wrongGuessLine } from './game';
import type { PuzzleData } from '../puzzle/types';

const data: PuzzleData = {
  services: ['cart', 'gateway', 'db'],
  answer: 'cart',
  tockGuess: 'gateway',
  fault: 'delay',
  timeline: { bucketSeconds: 30, startOffset: 0, services: [] },
  graph: { services: [], mentions: [], correlations: [] },
  clues: [
    { service: 'cart', errorLines: 0, mentions: 216, newMessages: 0, examples: [] },
    { service: 'gateway', errorLines: 0, mentions: 0, newMessages: 1, examples: ['slow response from cart (<*>ms)'] },
    { service: 'db', errorLines: 0, mentions: 0, newMessages: 0, examples: [] },
  ],
};

describe('arcade rules', () => {
  it('gives 3 stars for a clean first guess and takes one per extra guess or clue', () => {
    expect(starsFor({ guesses: ['cart'], clues: [] }, 'cart')).toBe(3);
    expect(starsFor({ guesses: ['db', 'cart'], clues: [] }, 'cart')).toBe(2);
    expect(starsFor({ guesses: ['db', 'gateway', 'cart'], clues: ['said', 'talk'] }, 'cart')).toBe(1);
    expect(starsFor({ guesses: ['db', 'gateway', 'auth'], clues: [] }, 'cart')).toBe(0);
  });

  it('ends on a solve or the third miss', () => {
    expect(isOver(EMPTY_PLAY, 'cart')).toBe(false);
    expect(isOver({ guesses: ['cart'], clues: [] }, 'cart')).toBe(true);
    expect(isOver({ guesses: ['a', 'b', 'c'], clues: [] }, 'cart')).toBe(true);
  });

  it('names what cracked it and reads the tape clock', () => {
    expect(crackedBy({ guesses: ['cart'], clues: [] })).toBe('Reading the town');
    expect(crackedBy({ guesses: ['cart'], clues: ['said', 'talk'] })).toBe('Who is talked about');
    expect(clockLabel(-90)).toBe('T-01:30');
    expect(clockLabel(125)).toBe('T+02:05');
  });

  it('turns crowded towns into a grid that fits every service', () => {
    const many = Array.from({ length: 45 }, (_, i) => `svc-${i}`);
    const grid = arcadeLayout(many, []);
    expect(grid.isGrid).toBe(true);
    expect(grid.places).toHaveLength(45);
    for (const p of grid.places) {
      expect(p.x).toBeLessThan(grid.width);
      expect(p.y).toBeLessThan(grid.height);
    }
    expect(arcadeLayout(['a', 'b'], []).isGrid).toBe(false);
  });

  it('keeps callers to the left of what they call, with room for bubbles', () => {
    const road = (a: string, b: string) => ({ a, b, kind: 'mention' as const, strength: 1, label: '' });
    const town = arcadeLayout(['gateway', 'auth', 'catalog', 'cart', 'orders', 'db'], [road('gateway', 'cart'), road('cart', 'db')]);
    const x = Object.fromEntries(town.places.map((p) => [p.name, p.x]));
    expect(x.gateway).toBeLessThan(x.cart as number);
    expect(x.cart).toBeLessThanOrEqual(x.db as number);
    const ys = town.places.map((p) => p.y).sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - (ys[i] as number)).filter((g) => g > 0);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(150);
  });
});

describe("Tock's lines come from the case", () => {
  it('warns that a sick face is a symptom when the culprit looks fine', () => {
    expect(wrongGuessLine('gateway', data, { gateway: 'sick', cart: 'fine' }, { guesses: ['gateway'], clues: [] })).toMatch(/faces show symptoms/);
    expect(wrongGuessLine('db', data, { db: 'fine', cart: 'fine' }, { guesses: ['db'], clues: [] })).toBe('Not db. Try a clue: what they said.');
  });

  it('describes each clue with the real counts', () => {
    expect(clueLine('said', data)).toMatch(/1 of them said something new/);
    expect(clueLine('talk', data)).toMatch(/named 216 times/);
  });

  it('closes with the culprit, the fault and how Tock did', () => {
    expect(endLine(data, { guesses: ['cart'], clues: [] })).toBe('Got it! It was cart: network delay. I guessed gateway. You beat me.');
    expect(endLine(data, { guesses: ['a', 'b', 'c'], clues: [] })).toBe('Out of guesses. It was cart: network delay. I guessed gateway. I was fooled too.');
  });
});

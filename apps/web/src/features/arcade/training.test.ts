import { rewindMoods } from '@chronolog/engine';
import { simPuzzle } from './sim';
import { STAGES } from './training';

const firstUnwell = (stage: (typeof STAGES)[number]) => {
  const data = simPuzzle(stage.service, stage.fault, stage.seed);
  const r = rewindMoods(data.timeline);
  return { data, sign: r.firstSign };
};

describe('Training Town lessons are true of their cases', () => {
  it('1-1: db turns unwell first and alone, says something about a GC pause, and Tock gets it', () => {
    const { data, sign } = firstUnwell(STAGES[0] as (typeof STAGES)[number]);
    expect(sign?.service).toBe('db');
    expect(sign?.alsoUnwell).toEqual([]);
    expect(data.clues.find((c) => c.service === 'db')?.examples[0]).toMatch(/GC pause/);
    expect(data.tockGuess).toBe('db');
  });

  it('1-2: catalog and gateway tie; gateway talks about catalog, catalog says no space left', () => {
    const { data, sign } = firstUnwell(STAGES[1] as (typeof STAGES)[number]);
    expect([sign?.service, ...(sign?.alsoUnwell ?? [])].sort()).toEqual(['catalog', 'gateway']);
    expect(data.clues.find((c) => c.service === 'gateway')?.examples.join(' ')).toMatch(/catalog returned/);
    expect(data.clues.find((c) => c.service === 'catalog')?.examples[0]).toMatch(/no space left on device/);
    expect(data.tockGuess).toBe('catalog');
  });

  it('1-3: gateway gets sick, cart never does, everyone names cart, and Tock is fooled', () => {
    const { data, sign } = firstUnwell(STAGES[2] as (typeof STAGES)[number]);
    expect(sign?.service).toBe('gateway');
    const frames = rewindMoods(data.timeline).frames;
    expect(frames.every((f) => (f.cart ?? 'fine') === 'fine')).toBe(true);
    const mostNamed = [...data.clues].sort((a, b) => b.mentions - a.mentions)[0];
    expect(mostNamed?.service).toBe('cart');
    expect(data.tockGuess).toBe('gateway');
  });
});

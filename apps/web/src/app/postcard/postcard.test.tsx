import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { casePostcard, dailyPostcard } from './builders';
import { resolveVars } from './draw';
import PostcardButton from './PostcardButton';

vi.mock('./draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./draw')>()),
  drawPostcard: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));

describe('postcard builders', () => {
  it('never names the Daily Case culprit', () => {
    const spec = dailyPostcard({ number: 3, guesses: ['db', 'cart'], isSolved: true, isTockRight: false });
    expect(spec.title).toBe('Solved in 2/3');
    expect(spec.lines[0]).toBe('I beat Tock today.');
    expect(spec.critters.every((c) => c.mood === 'fine' && !c.isHighlighted)).toBe(true);
  });

  it('shows the top three suspects and the verdict of a case', () => {
    const spec = casePostcard({
      id: 'inc-1',
      status: 'rejected',
      correctService: 'cache',
      candidates: [
        { service: 'db', rank: 1, weight: 0.6, mood: 'sick' },
        { service: 'api', rank: 2, weight: 0.3, mood: 'stressed' },
        { service: 'cache', rank: 3, weight: 0.1, mood: 'fine' },
        { service: 'auth', rank: 4, weight: 0.0, mood: 'fine' },
      ],
    });
    expect(spec.critters.map((c) => c.caption)).toEqual(['#1 db', '#2 api', '#3 cache']);
    expect(spec.lines[0]).toBe('Real cause: cache');
    expect(spec.stamp).toBe('Case closed');
  });

  it('writes CSS variable values into SVG markup', () => {
    expect(resolveVars('<path fill="var(--pastel-mint)" stroke="var(--ink)"/>', (n) => ({ '--pastel-mint': ' #abc ', '--ink': '#123' })[n] ?? '')).toBe('<path fill="#abc" stroke="#123"/>');
  });
});

describe('PostcardButton', () => {
  it('draws on request and offers the image to save', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:postcard');
    URL.revokeObjectURL = vi.fn();
    render(<PostcardButton spec={dailyPostcard({ number: 1, guesses: ['db'], isSolved: true, isTockRight: true })} fileName="p.png" />);
    fireEvent.click(screen.getByRole('button', { name: 'Make a postcard' }));
    expect(await screen.findByRole('img', { name: /Postcard: Solved in 1\/3/ })).toHaveAttribute('src', 'blob:postcard');
    expect(screen.getByRole('link', { name: 'Save image' })).toHaveAttribute('download', 'p.png');
  });
});

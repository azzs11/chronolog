import { MOODS } from '@chronolog/engine';
import { render, screen } from '@testing-library/react';
import Critter from './Critter';
import { BODY_COLOURS, hashName, lookOf, MOOD_LOOK } from './looks';
import Tock from './Tock';

describe('creature looks', () => {
  it('are decided by the name alone, the same every time', () => {
    expect(hashName('catalog')).toBe(hashName('catalog'));
    expect(lookOf('catalog')).toEqual(lookOf('catalog'));
  });

  it('vary across names: twenty service names use at least four colours and three ear shapes', () => {
    const looks = Array.from({ length: 20 }, (_, i) => lookOf(`service-${i}`));
    expect(new Set(looks.map((l) => l.colour)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((l) => l.ears)).size).toBeGreaterThanOrEqual(3);
    for (const look of looks) expect(BODY_COLOURS).toContain(look.colour);
  });

  it('have a written label for every mood the engine can return', () => {
    for (const mood of MOODS) expect(MOOD_LOOK[mood].label.length).toBeGreaterThan(0);
  });
});

describe('Critter', () => {
  it.each(MOODS)('draws the %s mood with an accessible name', (mood) => {
    render(<Critter name="db" mood={mood} />);
    const img = screen.getByRole('img', { name: `db: ${MOOD_LOOK[mood].label}` });
    expect(img).toHaveAttribute('data-mood', mood);
  });

  it('is hidden from screen readers when decorative', () => {
    const { container } = render(<Critter name="db" mood="sick" decorative />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not bob while asleep', () => {
    const { container } = render(<Critter name="db" mood="quiet" decorative />);
    expect(container.querySelector('svg')?.getAttribute('class')).not.toContain('animate-bob');
  });

  it('Tock is decorative by default', () => {
    const { container } = render(<Tock />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

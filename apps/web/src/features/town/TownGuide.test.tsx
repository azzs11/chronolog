import { MOODS } from '@chronolog/engine';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MOOD_LOOK } from '../../app/critters/looks';
import TownGuide from './TownGuide';

describe('TownGuide', () => {
  beforeEach(() => localStorage.clear());

  it('explains every face, the roads, and that faces are symptoms', () => {
    render(<TownGuide />);
    const faces = within(screen.getByRole('list', { name: 'What the faces mean' })).getAllByRole('listitem');
    expect(faces).toHaveLength(MOODS.length);
    for (const [i, mood] of MOODS.entries()) expect(faces[i]).toHaveTextContent(MOOD_LOOK[mood].meaning);
    expect(screen.getByText('Roads')).toBeInTheDocument();
    expect(screen.getByText(/Faces are symptoms, not causes\./)).toBeInTheDocument();
  });

  it('is open at first and remembers being closed', () => {
    const { container, unmount } = render(<TownGuide />);
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    details.open = false;
    fireEvent(details, new Event('toggle'));
    unmount();
    const again = render(<TownGuide />).container.querySelector('details') as HTMLDetailsElement;
    expect(again.open).toBe(false);
  });
});

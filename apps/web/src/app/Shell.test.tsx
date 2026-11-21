import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../features/incidents/InboxView', () => ({ default: () => <h2>Incidents view</h2> }));
vi.mock('../features/live/LiveView', () => ({ default: () => <h2>Live view</h2> }));
vi.mock('../features/rootrank/RootRankView', () => ({ default: () => <h2>Root cause view</h2> }));
vi.mock('../features/playground/PlaygroundPage', () => ({ default: () => <h2>Playground view</h2> }));
vi.mock('../LegacyApp', () => ({ default: () => <h2>Legacy view</h2> }));
vi.mock('../features/incidents/api', () => ({ fetchIncidents: () => Promise.resolve([]) }));

import AppRoutes from './AppRoutes';

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('AppRoutes and Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('chronolog.onboarded.v1', 'yes');
    document.documentElement.removeAttribute('data-theme');
  });

  it('sends the root URL to the incidents inbox, and opens one incident at its own URL', () => {
    at('/');
    expect(screen.getByRole('heading', { name: 'Incidents view' })).toBeInTheDocument();
  });

  it('gives each incident a URL inside the same view', () => {
    at('/incidents/inc-1700000000');
    expect(screen.getByRole('heading', { name: 'Incidents view' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /incidents/i })).toHaveAttribute('aria-current', 'page');
  });

  it('gives every view its own URL and marks the current one', async () => {
    at('/playground');
    expect(await screen.findByRole('heading', { name: 'Playground view' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /playground/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /root cause/i })).not.toHaveAttribute('aria-current');
  });

  it('opens the previous UI without the shell, and falls back to home for unknown URLs', async () => {
    const { unmount } = at('/legacy');
    expect(await screen.findByRole('heading', { name: 'Legacy view' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    unmount();
    at('/nope/not/here');
    expect(screen.getByRole('heading', { name: 'Incidents view' })).toBeInTheDocument();
  });

  it('has landmarks and a skip link for keyboard users', () => {
    at('/root-cause');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
  });

  it('switches the theme and density, and remembers them', () => {
    at('/root-cause');
    fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /switch to compact density/i }));
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    expect(JSON.parse(localStorage.getItem('chronolog.preferences.v1') ?? '{}')).toEqual({ theme: 'light', density: 'compact' });
    fireEvent.click(screen.getByRole('button', { name: 'System theme' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('opens Ask Tock with Ctrl+K, finds a view by typing, and goes there on Enter', async () => {
    at('/incidents');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const box = screen.getByRole('combobox', { name: /Ask Tock/ });
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: 'play' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Playground');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'Playground view' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ask Tock' })).not.toBeInTheDocument();
  });

  it('closes Ask Tock with Escape, and changes the theme from it', () => {
    at('/incidents');
    fireEvent.click(screen.getByRole('button', { name: /Ask Tock/ }));
    const box = screen.getByRole('combobox', { name: /Ask Tock/ });
    fireEvent.change(box, { target: { value: 'night' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Ask Tock/ }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Ask Tock/ }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

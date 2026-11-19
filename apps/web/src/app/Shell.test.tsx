import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../features/live/LiveView', () => ({ default: () => <h2>Live view</h2> }));
vi.mock('../features/rootrank/RootRankView', () => ({ default: () => <h2>Root cause view</h2> }));
vi.mock('../features/playground/PlaygroundPage', () => ({ default: () => <h2>Playground view</h2> }));
vi.mock('../LegacyApp', () => ({ default: () => <h2>Legacy view</h2> }));

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
    document.documentElement.removeAttribute('data-theme');
  });

  it('sends the root URL to the live view', () => {
    at('/');
    expect(screen.getByRole('heading', { name: 'Live view' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Live view' })).toBeInTheDocument();
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
});

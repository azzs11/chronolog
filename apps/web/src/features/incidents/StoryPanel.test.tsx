import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import StoryPanel, { storyCaveat } from './StoryPanel';

afterEach(() => vi.restoreAllMocks());

describe('StoryPanel', () => {
  it('renders nothing when the server has no story model (the default)', async () => {
    const status = vi.spyOn(api, 'fetchStoryStatus').mockResolvedValue({ isEnabled: false, provider: null });
    const { container } = render(<StoryPanel incidentId="inc-1" />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('shows only checked sentences with their log ids, and says how many were removed', async () => {
    vi.spyOn(api, 'fetchStoryStatus').mockResolvedValue({ isEnabled: true, provider: 'ollama:qwen2.5:3b' });
    vi.spyOn(api, 'writeStory').mockResolvedValue({
      provider: 'ollama:qwen2.5:3b', seconds: 2, isWellFormed: true,
      kept: [{ text: 'catalog likely broke first.', factKeys: ['E1'], logIds: ['log-1'] }],
      dropped: [{ text: 'x', reason: 'unsupported_cause' }],
    });
    render(<StoryPanel incidentId="inc-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Write it up' }));
    expect(await screen.findByText(/catalog likely broke first/)).toBeTruthy();
    expect(screen.getByTitle('Log log-1')).toBeTruthy();
    expect(screen.getByText(/1 sentence removed by the checker \(unsupported cause\)/)).toBeTruthy();
  });

  it('states the measured keep rate with its model', () => {
    expect(storyCaveat()).toMatch(/qwen2\.5:3b.*kept \d+\.\d% of sentences/);
  });
});

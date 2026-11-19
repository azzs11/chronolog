import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { vi } from 'vitest';
import type { RankData } from './api';
import RootRankView from './RootRankView';

vi.mock('axios', () => ({
  default: { post: vi.fn(), isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean }).isAxiosError) },
}));

const candidate = (service: string, rank: number, weight: number) => ({
  service,
  score: 1,
  weight,
  rank,
  evidence: { firstErrorAfter: 5, firstNovelAfter: 5, novelTemplates: [], mentions: 0, errorLines: 1 },
});

const data: RankData = {
  incidentStart: 1_700_000_000,
  startSource: 'estimated',
  candidates: ['db', 'api', 'cache', 'auth', 'cart', 'ship'].map((s, i) => candidate(s, i + 1, i === 0 ? 0.7 : 0.06)),
  baselineLines: 300,
  incidentLines: 120,
  model: { id: 'rootrank-v1' },
  warnings: [],
};

describe('RootRankView', () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it('starts with a teaching empty state and no request', () => {
    render(<RootRankView />);
    expect(screen.getByText(/nothing ranked yet/i)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('ranks on click, shows the top five with a word and number, and can show all', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { data } });
    render(<RootRankView />);
    fireEvent.click(screen.getByRole('button', { name: /rank root causes/i }));
    await waitFor(() => expect(screen.getAllByTestId('candidate')).toHaveLength(5));
    expect(screen.getByText('likely, 0.70')).toBeInTheDocument();
    expect(screen.getByText(/estimated from the biggest change/)).toBeInTheDocument();
    expect(screen.getByText(/52\.6%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show all 6 services/i }));
    expect(screen.getAllByTestId('candidate')).toHaveLength(6);
  });

  it('sends the chosen look-back window', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { data } });
    render(<RootRankView />);
    fireEvent.change(screen.getByLabelText(/look back/i), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /rank root causes/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(vi.mocked(axios.post).mock.calls[0]?.[1]).toEqual({ lookback_minutes: 60 });
  });

  it('sends the incident start the user typed, as Unix seconds', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { data } });
    render(<RootRankView />);
    fireEvent.change(screen.getByLabelText(/incident started at/i), { target: { value: '2026-11-19T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /rank root causes/i }));
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    const sent = vi.mocked(axios.post).mock.calls[0]?.[1] as { incident_start: number };
    expect(sent.incident_start).toBe(new Date('2026-11-19T10:00').getTime() / 1000);
  });

  it("shows the server's own explanation when there is no incident", async () => {
    vi.mocked(axios.post).mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed',
      response: { data: { message: 'No incident found: pass incident_start.' } },
    });
    render(<RootRankView />);
    fireEvent.click(screen.getByRole('button', { name: /rank root causes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No incident found');
  });
});

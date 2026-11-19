import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReplayBundle } from './replays';
import ReplayView from './ReplayView';

const cause = (service: string, rank: number, weight: number) => ({
  service,
  score: 1,
  weight,
  rank,
  evidence: { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0 },
});
const result = (order: string[]) => ({
  incidentStart: 1_700_000_000,
  startSource: 'given' as const,
  candidates: order.map((s, i) => cause(s, i + 1, i === 0 ? 0.6 : 0.1)),
  baselineLines: 100,
  incidentLines: 80,
});

const bundle: ReplayBundle = {
  source: 'RCAEval (MIT), revision abc, logs only',
  modelNote: 'rootrank-v1-heldout: trained without these five incidents’ services',
  cases: [
    {
      caseId: 're2ob_currencyservice_delay_2',
      system: 'ob',
      fault: 'delay',
      truth: 'currencyservice',
      services: 4,
      rankGiven: 1,
      rankEstimated: 4,
      given: result(['currencyservice', 'frontend', 'adservice', 'cartservice']),
      estimated: result(['frontend', 'adservice', 'cartservice', 'currencyservice']),
      timeline: {
        bucketSeconds: 30,
        startOffset: -60,
        services: [
          { name: 'currencyservice', lines: [3, 4, 5, 4], errors: [0, 0, 1, 0] },
          { name: 'frontend', lines: [9, 9, 9, 9], errors: [0, 0, 0, 0] },
        ],
      },
    },
  ],
};
const load = () => Promise.resolve(bundle);

describe('ReplayView', () => {
  it('shows incidents by system, hides the answer, then reveals it with the right rank for the chosen start mode', async () => {
    render(<ReplayView load={load} />);
    fireEvent.click(await screen.findByRole('button', { name: /online boutique #1/i }));
    expect(screen.getByText(/52 log lines read/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /log volume per service/i })).toBeInTheDocument();
    expect(screen.queryByText(/the broken service was/i)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('candidate')[0]).toHaveTextContent('frontend'); // estimated start: a miss

    fireEvent.click(screen.getByRole('button', { name: /reveal the answer/i }));
    const panel = within(screen.getByRole('status'));
    expect(panel.getByText(/network delay/i, { selector: 'p' })).toBeInTheDocument();
    expect(panel.getByText(/#4 of 4 — a miss/)).toBeInTheDocument();
    expect(panel.getByText(/trained without these/i, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/tell chronolog when it broke/i));
    expect(screen.getAllByTestId('candidate')[0]).toHaveTextContent('currencyservice');
    expect(screen.getByText(/#1 of 4 — a hit/)).toBeInTheDocument();
  });

  it('says so when there is nothing bundled, and when loading fails', async () => {
    const { unmount } = render(<ReplayView load={() => Promise.resolve({ ...bundle, cases: [] })} />);
    expect(await screen.findByText(/no real incidents are bundled/i)).toBeInTheDocument();
    unmount();
    render(<ReplayView load={() => Promise.reject(new Error('offline'))} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i));
  });
});

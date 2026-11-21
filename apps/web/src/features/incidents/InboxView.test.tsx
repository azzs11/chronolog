import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiError, type IncidentDetail, type IncidentSummary } from './api';

const api = vi.hoisted(() => ({
  fetchIncidents: vi.fn(),
  fetchIncident: vi.fn(),
  fetchFeedbackSummary: vi.fn(),
  sendFeedback: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), ...api }));

import InboxView from './InboxView';

const NOW = new Date().toISOString();
const incident = (id: string, over: Partial<IncidentSummary> = {}): IncidentSummary => ({
  id,
  start: NOW,
  end: NOW,
  durationSeconds: 150,
  errorLines: 120,
  services: [{ service: 'db', errors: 100 }, { service: 'api', errors: 20 }],
  impact: 240,
  status: 'unreviewed',
  correctService: null,
  ...over,
});

const cause = (service: string, rank: number, weight: number) => ({
  service,
  score: 1,
  weight,
  rank,
  evidence: { firstErrorAfter: 5, firstNovelAfter: 5, novelTemplates: [{ template: 'no space left on device', firstSeen: 1, count: 40, exampleId: 'log-9' }], mentions: 3, errorLines: 40 },
});

const detail = (id = 'inc-1', status: IncidentSummary['status'] = 'unreviewed', correct: string | null = null): IncidentDetail => ({
  incident: incident(id, { status, correctService: correct }),
  ranking: { incidentStart: 1_700_000_000, startSource: 'given', candidates: [cause('db', 1, 0.7), cause('api', 2, 0.2), cause('cache', 3, 0.1)], baselineLines: 600, incidentLines: 900, modelId: 'rootrank-v1' },
  timeline: { bucketSeconds: 30, startOffset: -120, services: [{ name: 'db', lines: [5, 6, 7, 8], errors: [0, 0, 3, 4] }, { name: 'api', lines: [5, 5, 5, 5], errors: [0, 0, 0, 0] }] },
  graph: { services: ['api', 'cache', 'db'], mentions: [{ from: 'api', to: 'db', count: 12 }], correlations: [{ a: 'api', b: 'db', corr: 0.81 }] },
  windowLines: 1500,
});

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/incidents/:id?" element={<InboxView />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Incidents inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchFeedbackSummary.mockResolvedValue({ reviewed: 0, confirmed: 0, rejected: 0, top1: 0, top3: 0 });
    api.fetchIncidents.mockResolvedValue([incident('inc-1'), incident('inc-2', { impact: 60, services: [{ service: 'auth', errors: 20 }], status: 'confirmed', correctService: 'auth' })]);
    api.fetchIncident.mockResolvedValue(detail());
  });

  it('lists incidents with services, time, size and review status', async () => {
    at('/incidents');
    const rows = within(await screen.findByRole('list', { name: 'Incidents' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('db, api');
    expect(rows[0]).toHaveTextContent('120 error lines');
    expect(rows[0]).toHaveTextContent('Not reviewed');
    expect(rows[1]).toHaveTextContent('Confirmed');
    expect(screen.getByText(/Nothing reviewed yet/)).toBeInTheDocument();
  });

  it('opens an incident with j/k and Enter, and shows the ranking, evidence, timeline and relationships', async () => {
    at('/incidents');
    const list = await screen.findByRole('list', { name: 'Incidents' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(await screen.findByRole('region', { name: 'Best guess' })).toHaveTextContent('db');
    expect(api.fetchIncident).toHaveBeenCalledWith('inc-1');
    expect(screen.getByRole('region', { name: 'Evidence for db' })).toHaveTextContent('no space left on device');
    expect(screen.getByRole('img', { name: /log volume per service/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'How services relate' })).toHaveTextContent('api names db');
    expect(screen.getByText(/a burst is worth a look, not proof of an incident/i)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('list', { name: 'Incidents' }), { key: 'j' });
    fireEvent.keyDown(screen.getByRole('list', { name: 'Incidents' }), { key: 'Enter' });
    await waitFor(() => expect(api.fetchIncident).toHaveBeenCalledWith('inc-2'));
  });

  it('changes the evidence when another candidate is picked', async () => {
    at('/incidents/inc-1');
    const candidates = await screen.findByRole('region', { name: 'Candidates' });
    fireEvent.click(within(within(candidates).getByRole('list', { name: 'Suspect lineup' })).getByRole('button', { name: /api/ }));
    expect(screen.getByRole('region', { name: 'Evidence for api' })).toBeInTheDocument();
  });

  it('confirms the first choice with one click and shows the saved review', async () => {
    api.sendFeedback.mockResolvedValue({ verdict: 'confirm', correctService: 'db', rankOfCorrect: 1 });
    at('/incidents/inc-1');
    const form = await screen.findByRole('region', { name: 'Review this incident' });
    fireEvent.click(within(form).getByRole('button', { name: 'Close the case' }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('inc-1', { verdict: 'confirm', note: undefined }));
    expect(api.fetchIncidents.mock.calls.length).toBeGreaterThan(1); // the inbox refreshed
  });

  it('asks for the real cause when the answer is no, and sends it', async () => {
    api.sendFeedback.mockResolvedValue({ verdict: 'reject', correctService: 'cache', rankOfCorrect: 3 });
    at('/incidents/inc-1');
    const form = await screen.findByRole('region', { name: 'Review this incident' });
    fireEvent.click(within(form).getByLabelText(/No, it was another service/));
    expect(within(form).getByRole('button', { name: 'Close the case' })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('The real root cause'), { target: { value: 'cache' } });
    fireEvent.change(within(form).getByLabelText(/Note/), { target: { value: 'it was cache' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Close the case' }));
    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('inc-1', { verdict: 'reject', correct_service: 'cache', note: 'it was cache' }));
  });

  it('shows an earlier review and lets it be changed', async () => {
    api.fetchIncident.mockResolvedValue(detail('inc-2', 'confirmed', 'auth'));
    at('/incidents/inc-2');
    const review = await screen.findByRole('region', { name: 'Your review' });
    expect(review).toHaveTextContent('You confirmed auth');
    fireEvent.click(within(review).getByRole('button', { name: 'Change my answer' }));
    expect(screen.getByRole('region', { name: 'Review this incident' })).toBeInTheDocument();
  });

  it('teaches what an incident is when there are none, and reports errors', async () => {
    api.fetchIncidents.mockResolvedValueOnce([]);
    const { unmount } = at('/incidents');
    expect(await screen.findByText(/No incidents in the last hour/)).toBeInTheDocument();
    unmount();
    api.fetchIncidents.mockRejectedValue(new Error('offline'));
    at('/incidents');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load incidents: offline');
  });

  it('explains when an incident is gone', async () => {
    api.fetchIncident.mockRejectedValue(new ApiError('That incident is no longer in the stored logs.', 404));
    at('/incidents/inc-old');
    expect(await screen.findByRole('alert')).toHaveTextContent('That incident is no longer in the stored logs.');
  });
});

describe('Pro lens', () => {
  it('has a table of every suspect with its numbers, alongside the lineup', async () => {
    const { default: SuspectTable } = await import('./SuspectTable');
    const onSelect = vi.fn();
    render(<SuspectTable candidates={detail().ranking.candidates} selected="db" onSelect={onSelect} />);
    const rows = within(screen.getByRole('table', { name: 'Suspects, ranked by RootRank' })).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('1dblikely, 0.704013Sick');
    fireEvent.click(screen.getByRole('button', { name: 'api' }));
    expect(onSelect).toHaveBeenCalledWith('api');
  });
});

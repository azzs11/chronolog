import { render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn(), isAxiosError: () => false } }));
import TownPage from './TownPage';

const moods = [
  { service: 'db', mood: 'sick', reason: '40 error lines in the last 2 minutes; usually about none.', evidenceIds: ['abc12345-1'], newTemplates: [], recentLines: 80, recentProblems: 40, baselineLines: 300 },
  { service: 'api', mood: 'fine', reason: 'Normal amount of logs, no unusual errors, nothing new.', evidenceIds: [], newTemplates: [], recentLines: 80, recentProblems: 0, baselineLines: 300 },
];
const graph = { services: ['api', 'db'], mentions: [{ from: 'api', to: 'db', count: 12 }], correlations: [], lines: 500 };

function mockApi(graphResponse: unknown = { data: { data: graph } }) {
  vi.mocked(axios.get).mockImplementation((url: string) =>
    url.endsWith('/api/moods') ? Promise.resolve({ data: { data: { moods } } }) : graphResponse instanceof Error ? Promise.reject(graphResponse) : Promise.resolve(graphResponse),
  );
}

describe('TownPage', () => {
  it('summarises the town, draws the map and lists every service with its reason and cited lines', async () => {
    mockApi();
    render(<TownPage />);
    expect(await screen.findByText(/1 of 2 services look unwell. The most worrying is db/)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Town map: db Sick, api Fine' })).toBeInTheDocument();
    const who = screen.getByRole('region', { name: 'Who is who' });
    expect(within(who).getAllByRole('listitem')).toHaveLength(2);
    expect(within(who).getByText('log abc12345-1')).toBeInTheDocument();
  });

  it('still shows the creatures when the roads cannot be loaded', async () => {
    mockApi(new Error('No logs in the requested window.'));
    render(<TownPage />);
    expect(await screen.findByText(/Roads unavailable: request failed/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Town map: db Sick/ })).toBeInTheDocument();
  });
});

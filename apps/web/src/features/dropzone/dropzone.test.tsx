import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { analyseFiles, MAX_TOTAL_BYTES, sampleFiles } from './analyse';
import DropZone from './DropZone';

describe('analyseFiles', () => {
  it('ranks the sample incident with the broken service in the top 3 and cites file lines', () => {
    const result = analyseFiles(sampleFiles());
    if (!result.ok) throw new Error(result.message);
    const { ranking, services } = result.analysis;
    expect(services).toEqual(['auth', 'cart', 'catalog', 'db', 'gateway', 'orders']);
    expect(ranking.candidates.slice(0, 3).map((c) => c.service)).toContain('catalog');
    const catalog = ranking.candidates.find((c) => c.service === 'catalog');
    expect(catalog?.evidence.firstErrorId).toMatch(/^catalog\.log:\d+$/);
  });

  it('explains each way it can fail', () => {
    const one = analyseFiles([{ name: 'app.log', text: '2026-01-01T00:00:00Z hello\n2026-01-01T00:10:00Z bye' }]);
    expect(one).toEqual({ ok: false, message: expect.stringMatching(/Only one service found \(app\)/) });
    expect(analyseFiles([{ name: 'a.log', text: 'no times here' }])).toEqual({ ok: false, message: expect.stringMatching(/No log lines found/) });
    const short = analyseFiles([
      { name: 'a.log', text: '2026-01-01T00:00:00Z x\n2026-01-01T00:01:00Z y' },
      { name: 'b.log', text: '2026-01-01T00:00:30Z z' },
    ]);
    expect(short).toEqual({ ok: false, message: expect.stringMatching(/less than 4 minutes/) });
    expect(analyseFiles([{ name: 'big.log', text: 'x'.repeat(MAX_TOTAL_BYTES + 1) }])).toEqual({ ok: false, message: expect.stringMatching(/Use the CLI/) });
  });

  it('uses a start time when one is given', () => {
    const files = sampleFiles();
    const auto = analyseFiles(files);
    if (!auto.ok) throw new Error(auto.message);
    const given = analyseFiles(files, auto.analysis.ranking.incidentStart + 30);
    expect(given.ok && given.analysis.ranking.startSource).toBe('given');
  });
});

describe('DropZone', () => {
  it('runs the sample entirely in the browser: a lineup appears and no request is made', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<DropZone />);
    fireEvent.click(screen.getByRole('button', { name: 'Try a sample incident' }));
    expect(await screen.findByRole('list', { name: 'Suspect lineup' })).toBeInTheDocument();
    expect(screen.getByText(/I read [\d,]+ lines from 6 services/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

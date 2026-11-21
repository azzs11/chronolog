import { render, screen, within } from '@testing-library/react';
import { gradeOf, pct, tockSummary } from './grades';
import ReportCardPage from './ReportCardPage';
import { REPORT_CARD } from './reportCard';

describe('grades', () => {
  it('turns a hit rate into a word at stated cut-offs', () => {
    expect(gradeOf(0.65)).toBe('Strong');
    expect(gradeOf(0.6)).toBe('Strong');
    expect(gradeOf(0.45)).toBe('Okay');
    expect(gradeOf(0.218)).toBe('Weak');
    expect(pct(0.52647)).toBe('52.6%');
  });

  it('has Tock quote only numbers from the generated card', () => {
    const ours = REPORT_CARD.headline.find((r) => r.isOurs);
    const text = tockSummary();
    expect(text).toContain(pct(ours?.value ?? -1));
    expect(text).toMatch(/My weakest subject is .+ faults: \d+\.\d%\./);
  });
});

describe('ReportCardPage', () => {
  it('names the dataset and shows every method, ours included, with its value written out', () => {
    render(<ReportCardPage />);
    expect(screen.getAllByText(new RegExp(REPORT_CARD.dataset)).length).toBeGreaterThan(0);
    const overall = screen.getByRole('list', { name: 'Top-3 hit rate by method' });
    const rows = within(overall).getAllByRole('listitem');
    expect(rows).toHaveLength(REPORT_CARD.headline.length);
    for (const [i, row] of REPORT_CARD.headline.entries()) expect(rows[i]).toHaveTextContent(pct(row.value));
  });

  it('shows weak grades as well as strong ones', () => {
    render(<ReportCardPage />);
    const faults = screen.getByRole('list', { name: 'Top-3 hit rate by fault' });
    expect(within(faults).getAllByText('Weak').length).toBeGreaterThan(0);
    expect(within(faults).getAllByText('Strong').length).toBeGreaterThan(0);
  });

  it('links every section to the results file it came from', () => {
    render(<ReportCardPage />);
    for (const file of Object.values(REPORT_CARD.files)) expect(screen.getAllByRole('link', { name: file }).length).toBeGreaterThan(0);
  });
});

describe('faces on the report card', () => {
  it('compares faces with RootRank on the same incidents and states the paired verdict', () => {
    render(<ReportCardPage />);
    const faces = screen.getByRole('region', { name: 'The faces' });
    expect(within(faces).getByRole('list', { name: 'Faces against RootRank' })).toHaveTextContent(pct(REPORT_CARD.faces.ac3.value));
    expect(faces).toHaveTextContent(/Top 3: (RootRank is better|The faces are better|They cannot be told apart on these incidents)\./);
    expect(within(faces).getByRole('link', { name: REPORT_CARD.files.faces })).toBeInTheDocument();
  });
});

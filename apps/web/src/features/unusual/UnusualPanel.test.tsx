import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UnusualPanel, { unusualCaveat } from './UnusualPanel';

describe('UnusualPanel', () => {
  it('shows each unusual message with its count, services and cited line ids', () => {
    render(
      <UnusualPanel
        isOnlyNewTemplates={false}
        templates={[{ template: 'disk quota exceeded <*>', count: 4, baselineCount: 0, services: ['db'], firstSeen: 1, lastSeen: 2, lineIds: ['id-1', 'id-2'] }]}
      />,
    );
    expect(screen.getByText('disk quota exceeded <*>')).toBeTruthy();
    expect(screen.getByText(/4× from db; never seen in the hour before/)).toBeTruthy();
    expect(screen.getByTitle('Log id-1')).toBeTruthy();
  });

  it('states the benchmark caveat with generated numbers, never a placeholder', () => {
    expect(unusualCaveat()).toMatch(/F1 \d+\.\d%.*\(\d+\.\d%\)/);
  });
});

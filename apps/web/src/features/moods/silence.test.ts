import type { ServiceMood } from '@chronolog/engine';
import { isEverythingSilent } from './silence';

const mood = (service: string, m: ServiceMood['mood'], recentLines: number): ServiceMood => ({ service, mood: m, reason: '', evidenceIds: [], newTemplates: [], recentLines, recentProblems: 0, baselineLines: 300 });

describe('isEverythingSilent', () => {
  it('is true only when every service has gone completely quiet', () => {
    expect(isEverythingSilent([mood('a', 'quiet', 0), mood('b', 'quiet', 0)])).toBe(true);
    expect(isEverythingSilent([mood('a', 'quiet', 0), mood('b', 'quiet', 3)])).toBe(false);
    expect(isEverythingSilent([mood('a', 'quiet', 0), mood('b', 'sick', 40)])).toBe(false);
    expect(isEverythingSilent([mood('a', 'quiet', 0)])).toBe(false);
  });
});

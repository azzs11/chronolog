import { type RewindTimeline, rewindMoods, simulateIncident } from '../src';

const timeline = (services: RewindTimeline['services'], startOffset = -120): RewindTimeline => ({ bucketSeconds: 30, startOffset, services });
const flat = (n: number, v: number) => new Array<number>(n).fill(v);

describe('rewindMoods', () => {
  it('judges each bucket against the service own buckets before the start', () => {
    // 4 baseline buckets, then 4 incident buckets.
    const r = rewindMoods(
      timeline([
        { name: 'db', lines: flat(8, 20), errors: [0, 0, 0, 0, 0, 2, 9, 9] },
        { name: 'api', lines: [20, 20, 20, 20, 20, 20, 1, 0], errors: flat(8, 0) },
        { name: 'noisy', lines: flat(8, 20), errors: flat(8, 4) },
      ]),
    );
    expect(r.baselineBuckets).toBe(4);
    expect(r.seconds).toEqual([-120, -90, -60, -30, 0, 30, 60, 90]);
    expect(r.frames.map((f) => f.db)).toEqual(['fine', 'fine', 'fine', 'fine', 'fine', 'stressed', 'sick', 'sick']);
    expect(r.frames.map((f) => f.api)).toEqual(['fine', 'fine', 'fine', 'fine', 'fine', 'fine', 'quiet', 'quiet']);
    expect(r.frames.every((f) => f.noisy === 'fine')).toBe(true);
  });

  it('finds the first sign, up to two buckets before the start, preferring more errors on a tie', () => {
    const r = rewindMoods(
      timeline([
        { name: 'a', lines: flat(8, 20), errors: [0, 0, 0, 1, 5, 5, 5, 5] },
        { name: 'b', lines: flat(8, 20), errors: [0, 0, 0, 3, 5, 5, 5, 5] },
      ]),
    );
    expect(r.firstSign).toEqual({ service: 'b', bucket: 3, seconds: -30 });
  });

  it('ignores noise long before the start and returns null when nothing happens', () => {
    const early = rewindMoods(timeline([{ name: 'a', lines: flat(8, 20), errors: [4, 0, 0, 0, 0, 0, 0, 0] }], -240));
    expect(early.firstSign).toBeNull();
    expect(rewindMoods(timeline([])).frames).toEqual([]);
  });

  it('treats a window with no baseline as having a normal of zero', () => {
    const r = rewindMoods(timeline([{ name: 'a', lines: [5, 5], errors: [0, 3] }], 0));
    expect(r.baselineBuckets).toBe(0);
    expect(r.frames.map((f) => f.a)).toEqual(['fine', 'sick']);
  });
});

describe('rewindMoods on a simulated disk fault', () => {
  it('shows the broken service as the first sign', () => {
    const sim = simulateIncident({ seed: 2, service: 'catalog', fault: 'disk' });
    const bucket = 30;
    const first = Math.floor((Math.min(...sim.lines.map((l) => l.timestamp)) - sim.incidentStart) / bucket);
    const services = sim.services.map((name) => {
      const lines = new Array<number>(40).fill(0);
      const errors = new Array<number>(40).fill(0);
      for (const l of sim.lines) {
        if (l.service !== name) continue;
        const i = Math.floor((l.timestamp - sim.incidentStart) / bucket) - first;
        if (i < 0 || i >= 40) continue;
        lines[i] = (lines[i] as number) + 1;
        if (l.severity === 'error' || l.severity === 'critical') errors[i] = (errors[i] as number) + 1;
      }
      return { name, lines, errors };
    });
    const r = rewindMoods({ bucketSeconds: bucket, startOffset: first * bucket, services });
    expect(r.firstSign?.service).toBe('catalog');
  });
});

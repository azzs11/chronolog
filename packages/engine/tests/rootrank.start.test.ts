import { estimateIncidentStart, MIN_SEGMENT_BUCKETS, rankRootCauses, ROOTRANK_V1, START_BUCKET_S, WindowTooShortError, type PreparedLine } from '../src';

/** Steady traffic from two services; from `changeAt`, db starts logging a new message too. */
function lines(changeAt: number, length: number): PreparedLine[] {
  const out: PreparedLine[] = [];
  for (let t = 0; t < length; t++) {
    for (let i = 0; i < 5; i++) {
      out.push({ timestamp: t, service: 'api', severity: 'info', templateId: 0 });
      out.push({ timestamp: t, service: 'db', severity: 'info', templateId: 1 });
    }
    if (t >= changeAt) for (let i = 0; i < 10; i++) out.push({ timestamp: t, service: 'db', severity: 'info', templateId: 2 });
  }
  return out;
}

describe('estimateIncidentStart', () => {
  it('finds the change within a couple of buckets, wherever it sits in the window', () => {
    for (const change of [240, 300, 420]) {
      const start = estimateIncidentStart(lines(change, 600)) as number;
      expect(Math.abs(start - change)).toBeLessThanOrEqual(2 * START_BUCKET_S);
    }
  });

  it('finds a drop as well as a rise', () => {
    const drop: PreparedLine[] = [];
    for (let t = 0; t < 600; t++) {
      for (let i = 0; i < 10; i++) drop.push({ timestamp: t, service: 'api', severity: 'info', templateId: 0 });
      if (t < 300) for (let i = 0; i < 10; i++) drop.push({ timestamp: t, service: 'db', severity: 'info', templateId: 1 });
    }
    expect(Math.abs((estimateIncidentStart(drop) as number) - 300)).toBeLessThanOrEqual(2 * START_BUCKET_S);
  });

  it('returns null when there are too few lines or too little time', () => {
    expect(estimateIncidentStart([])).toBeNull();
    expect(estimateIncidentStart(lines(100, 2 * MIN_SEGMENT_BUCKETS * START_BUCKET_S - 30))).toBeNull();
  });
});

describe('rankRootCauses without a start time', () => {
  const rcaLines = lines(300, 600).map((l, i) => ({ timestamp: l.timestamp, service: l.service, message: ['ok', 'ok2', 'db slow now'][l.templateId] as string, id: String(i) }));

  it('estimates the start and says so', () => {
    const result = rankRootCauses(rcaLines, undefined, ROOTRANK_V1);
    expect(result.startSource).toBe('estimated');
    expect(Math.abs(result.incidentStart - 300)).toBeLessThanOrEqual(2 * START_BUCKET_S);
    expect(result.candidates[0]?.service).toBe('db');
  });

  it('reports a given start as given', () => {
    expect(rankRootCauses(rcaLines, 300, ROOTRANK_V1).startSource).toBe('given');
  });

  it('refuses windows that are too short to estimate from', () => {
    const short = rcaLines.filter((l) => l.timestamp < 100);
    expect(() => rankRootCauses(short, undefined, ROOTRANK_V1)).toThrow(WindowTooShortError);
  });
});

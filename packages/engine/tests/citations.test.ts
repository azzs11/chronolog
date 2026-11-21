import { evidenceClaims, MAX_CITES, type RcaLine, rankRootCauses, ROOTRANK_V1, suspectMood } from '../src';

const START = 1_700_000_600;
let n = 0;
const at = (t: number, service: string, message: string, severity = 'info'): RcaLine => ({ id: `${service}-${n++}`, timestamp: t, service, message, severity });

/** Ten minutes of calm traffic, then db breaks and api starts naming it. */
function incident(): RcaLine[] {
  const lines: RcaLine[] = [];
  for (let t = START - 600; t < START + 300; t += 5) {
    lines.push(at(t, 'api', `GET /items ${t % 7} ok`), at(t, 'db', `query ${t % 5} done`));
  }
  for (let t = START + 10; t < START + 300; t += 10) {
    lines.push(at(t, 'db', 'no space left on device', 'error'));
    lines.push(at(t + 1, 'api', 'call to db failed with timeout', 'error'));
  }
  return lines;
}

describe('evidence citations', () => {
  const lines = incident();
  const ranking = rankRootCauses(lines, START, ROOTRANK_V1);
  const db = ranking.candidates.find((c) => c.service === 'db');
  const api = ranking.candidates.find((c) => c.service === 'api');

  it('cites the first error line of the service at or after the start', () => {
    const firstError = lines.find((l) => l.service === 'db' && l.severity === 'error' && l.timestamp >= START);
    expect(db?.evidence.firstErrorId).toBe(firstError?.id);
    const apiFirstError = lines.find((l) => l.service === 'api' && l.severity === 'error');
    expect(api?.evidence.firstErrorId).toBe(apiFirstError?.id);
  });

  it('cites lines from other services that name the suspect, capped', () => {
    expect(db?.evidence.mentionIds?.length).toBe(MAX_CITES);
    const named = lines.filter((l) => l.message.includes('db failed')).map((l) => l.id);
    expect(db?.evidence.mentionIds).toEqual(named.slice(0, MAX_CITES));
    expect(api?.evidence.mentionIds).toEqual([]);
  });

  it('turns evidence into claims where every non-absence claim cites a line', () => {
    const claims = evidenceClaims(db as NonNullable<typeof db>);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    for (const claim of claims) {
      expect(claim.isAbsence).toBe(false);
      expect(claim.cites.length).toBeGreaterThan(0);
    }
  });

  it('marks "nothing found" as an absence with no citation', () => {
    const empty = { firstErrorAfter: null, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 0 };
    expect(evidenceClaims({ evidence: empty })).toEqual([{ text: 'No error lines, new messages or mentions from other services.', cites: [], isAbsence: true }]);
  });

  it('does not change the scores: ids on or off give the same ranking', () => {
    const withoutIds = rankRootCauses(
      lines.map(({ id: _id, ...rest }) => rest),
      START,
      ROOTRANK_V1,
    );
    expect(withoutIds.candidates.map((c) => [c.service, c.score])).toEqual(ranking.candidates.map((c) => [c.service, c.score]));
    expect(withoutIds.candidates.every((c) => c.evidence.firstErrorId === undefined && c.evidence.mentionIds?.length === 0)).toBe(true);
  });
});

describe('suspectMood', () => {
  const ev = (errorLines: number, templates: string[] = []) => ({ errorLines, novelTemplates: templates.map((template) => ({ template })) });
  it('maps incident evidence to a face, restart first', () => {
    expect(suspectMood(ev(50, ['service started on port <*>']))).toBe('restarted');
    expect(suspectMood(ev(50))).toBe('sick');
    expect(suspectMood(ev(2))).toBe('stressed');
    expect(suspectMood(ev(0, ['cache warmup took <*> ms']))).toBe('new-phrase');
    expect(suspectMood(ev(0))).toBe('fine');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assignTemplates,
  computeFeatures,
  estimateIncidentStart,
  FEATURE_NAMES,
  inferSeverity,
  learnServiceGraph,
  predict,
  rankRootCauses,
  ROOTRANK_V1,
  type PreparedLine,
  type RcaLine,
  type TreeModel,
} from '../src';

/**
 * Parity with the Python benchmark: slices of real RCAEval incidents, with what the Python
 * pipeline (bench/src/chronobench) computed for them. Regenerate with `uv run bench export-rootrank`.
 */
interface GoldenCase {
  case_id: string;
  incident_start: number;
  lines: Array<[number, string, string]>;
  expected: {
    severity: string[];
    template_ids: number[];
    templates: Record<string, string>;
    services: string[];
    features: number[][];
    scores: number[];
    estimated_start: number | null;
    graph: {
      services: string[];
      mentions: Array<{ from: string; to: string; count: number }>;
      correlations: Array<{ a: string; b: string; corr: number }>;
    };
  };
}

const read = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(__dirname, ...parts), 'utf8')) as T;
const golden = read<{ cases: GoldenCase[]; feature_names: string[] }>('fixtures', 'rootrank-golden.json');
const model: TreeModel = ROOTRANK_V1;

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe.each(golden.cases)('RootRank parity on $case_id', (c) => {
  const lines: RcaLine[] = c.lines.map(([timestamp, service, message]) => ({ timestamp, service, message }));
  const messages = lines.map((l) => l.message);

  it('infers the same severity for every line', () => {
    const got = messages.map(inferSeverity);
    expect(got).toEqual(c.expected.severity);
  });

  it('mines the same templates: same ids per line and same final template text', () => {
    const table = assignTemplates(messages);
    expect(table.ids).toEqual(c.expected.template_ids);
    const texts = Object.fromEntries([...table.texts].map(([id, text]) => [String(id), text]));
    expect(texts).toEqual(c.expected.templates);
  });

  it('computes the same 23 features for every service', () => {
    const table = assignTemplates(messages);
    const prepared: PreparedLine[] = lines.map((l, i) => ({
      timestamp: l.timestamp,
      service: l.service,
      severity: c.expected.severity[i] as string,
      templateId: table.ids[i] as number,
    }));
    const result = computeFeatures(prepared, table.texts, c.incident_start);
    expect(result.services).toEqual(c.expected.services);
    expect(golden.feature_names).toEqual([...FEATURE_NAMES]);
    result.rows.forEach((row, i) => {
      row.forEach((value, j) => {
        const want = (c.expected.features[i] as number[])[j] as number;
        expect(close(value, want), `${result.services[i]} ${FEATURE_NAMES[j]}: got ${value}, want ${want}`).toBe(true);
      });
    });
  });

  it('estimates the same incident start as Python', () => {
    const table = assignTemplates(messages);
    const prepared: PreparedLine[] = lines.map((l, i) => ({
      timestamp: l.timestamp,
      service: l.service,
      severity: c.expected.severity[i] as string,
      templateId: table.ids[i] as number,
    }));
    expect(estimateIncidentStart(prepared)).toBe(c.expected.estimated_start);
    expect(rankRootCauses(lines, undefined, model).incidentStart).toBe(c.expected.estimated_start);
  });

  it('learns the same service graph as Python', () => {
    const graph = learnServiceGraph(lines);
    expect(graph.services).toEqual(c.expected.graph.services);
    expect(graph.mentions).toEqual(c.expected.graph.mentions);
    expect(graph.correlations.map((e) => [e.a, e.b])).toEqual(c.expected.graph.correlations.map((e) => [e.a, e.b]));
    graph.correlations.forEach((e, i) => {
      expect(close(e.corr, (c.expected.graph.correlations[i] as { corr: number }).corr)).toBe(true);
    });
  });

  it('scores every service like LightGBM and ranks them in the same order', () => {
    const ranked = rankRootCauses(lines, c.incident_start, model);
    ranked.candidates.forEach((cause) => {
      const at = c.expected.services.indexOf(cause.service);
      const want = c.expected.scores[at] as number;
      expect(close(cause.score, want), `${cause.service}: got ${cause.score}, want ${want}`).toBe(true);
    });
    const wantOrder = c.expected.services
      .map((service, i) => ({ service, score: c.expected.scores[i] as number }))
      .sort((a, b) => b.score - a.score || (a.service < b.service ? -1 : 1))
      .map((x) => x.service);
    expect(ranked.candidates.map((x) => x.service)).toEqual(wantOrder);
  });

  it('scores the raw feature vector the same as the Python model', () => {
    const order = model.feature_names.map((name) => FEATURE_NAMES.indexOf(name));
    c.expected.features.forEach((row, i) => {
      const got = predict(model, order.map((at) => row[at] as number));
      expect(close(got, c.expected.scores[i] as number)).toBe(true);
    });
  });
});

describe('the parity fixture exercises the signals', () => {
  const column = (name: string): number => FEATURE_NAMES.indexOf(name);
  const any = (name: string, test: (v: number) => boolean): boolean =>
    golden.cases.some((c) => c.expected.features.some((row) => test(row[column(name)] as number)));

  it('contains novel templates, errors, mentions and a spread of scores', () => {
    expect(any('novel_templates', (v) => v > 0)).toBe(true);
    expect(any('error_ratio', (v) => v > 0)).toBe(true);
    expect(any('mentions', (v) => v > 0)).toBe(true);
    expect(any('in_degree', (v) => v > 0)).toBe(true);
    for (const c of golden.cases) expect(new Set(c.expected.scores).size).toBeGreaterThan(1);
    expect(golden.cases.some((c) => c.expected.graph.correlations.length > 0)).toBe(true);
  });
});

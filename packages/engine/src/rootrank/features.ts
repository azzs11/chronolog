/**
 * RootRank features: one row per candidate service, from logs only. A port of
 * bench/src/chronobench/features.py (the BASE_FEATURES set), kept numerically identical.
 *
 * Time is measured from the incident start. Lines before it are the baseline ("what normal looked
 * like"); lines at or after it are the incident window. Times that never happen are set to
 * MISSING_TIME_FACTOR x the window length, so "never" sorts last. Rank features compare services
 * within one case.
 */

const BUCKET_S = 10; // width of a rate bucket
const SPIKE_SIGMAS = 3; // a bucket spikes above baseline mean + 3 standard deviations
const MIN_SPIKE_COUNT = 5; // ...and has at least this many lines
const MISSING_TIME_FACTOR = 2;
const RATE_EPS = 0.01; // lines per second; keeps the rate ratio finite for silent services
const PAGERANK_DAMPING = 0.85; // the standard PageRank value
const PAGERANK_ITERATIONS = 50;
const ERROR_LEVELS = new Set(['error', 'critical']);
const WARN_LEVELS = new Set(['warning', 'error', 'critical']);

export const RAW_TIME = ['t_first_error', 't_first_novel', 't_first_spike', 't_first_mention'] as const;
export const RAW_COUNT = ['error_ratio', 'rate_ratio', 'novel_templates', 'mentions', 'mentions_warn'] as const;
export const RAW_OTHER = ['novel_fraction', 'in_degree', 'out_degree', 'pagerank'] as const;

/** The order the trained model expects. */
export const FEATURE_NAMES: readonly string[] = [
  ...RAW_TIME,
  ...RAW_COUNT,
  ...RAW_OTHER,
  ...[...RAW_TIME, ...RAW_COUNT, 'pagerank'].map((name) => `rank_${name}`),
];

export interface PreparedLine {
  timestamp: number;
  service: string;
  severity: string;
  templateId: number;
}

export interface NovelDetail {
  templateId: number;
  firstSeen: number;
  count: number;
  /** Index (into the prepared lines) of the first line with this template in the window. */
  firstIndex: number;
}

export interface ServiceDetails {
  novel: NovelDetail[];
  firstError: number | null;
  errorLines: number;
  mentions: number;
}

export interface FeatureResult {
  services: string[];
  /** One row per service, columns in FEATURE_NAMES order. */
  rows: number[][];
  details: ServiceDetails[];
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Template id -> indices of the services whose name the template contains (whole-name match). */
function mentionTable(services: string[], templates: Map<number, string>): Map<number, number[]> {
  const patterns = services.map((s) => new RegExp(`(?<![\\w-])${escapeRegExp(s.toLowerCase())}(?![\\w-])`));
  const table = new Map<number, number[]>();
  for (const [id, text] of templates) {
    const lower = text.toLowerCase();
    const found = patterns.flatMap((pattern, index) => (pattern.test(lower) ? [index] : []));
    if (found.length > 0) table.set(id, found);
  }
  return table;
}

function pageRank(count: number, edges: Set<number>): number[] {
  const link = Array.from({ length: count }, () => new Array<number>(count).fill(0));
  for (const key of edges) (link[Math.floor(key / count)] as number[])[key % count] = 1;
  const transition = link.map((row) => {
    const out = row.reduce((a, b) => a + b, 0);
    return out > 0 ? row.map((v) => v / out) : new Array<number>(count).fill(1 / count);
  });
  let rank = new Array<number>(count).fill(1 / count);
  for (let step = 0; step < PAGERANK_ITERATIONS; step++) {
    rank = rank.map((_, j) => (1 - PAGERANK_DAMPING) / count + PAGERANK_DAMPING * transition.reduce((sum, row, i) => sum + (rank[i] as number) * (row[j] as number), 0));
  }
  return rank;
}

/** Percentile rank in (0, 1]; ties share their average rank. Ascending: smallest value first. */
export function rankPct(values: number[], ascending: boolean): number[] {
  const n = values.length;
  const order = values.map((v, i) => [ascending ? v : -v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(n).fill(0);
  let start = 0;
  while (start < n) {
    let end = start;
    while (end + 1 < n && (order[end + 1] as readonly [number, number])[0] === (order[start] as readonly [number, number])[0]) end++;
    const average = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[(order[k] as readonly [number, number])[1]] = average / n;
    start = end + 1;
  }
  return ranks;
}

interface Bucketed {
  counts: Map<number, number>;
}

function serviceStats(lines: PreparedLine[], services: string[], inject: number) {
  const n = services.length;
  const index = new Map(services.map((s, i) => [s, i]));
  const make = <T>(f: () => T): T[] => Array.from({ length: n }, f);
  const s = {
    nBase: new Array<number>(n).fill(0),
    nWin: new Array<number>(n).fill(0),
    errBase: new Array<number>(n).fill(0),
    errWin: new Array<number>(n).fill(0),
    firstError: new Array<number>(n).fill(Number.POSITIVE_INFINITY),
    baseBuckets: make<Bucketed>(() => ({ counts: new Map() })),
    winBuckets: make<Bucketed>(() => ({ counts: new Map() })),
    baseTemplates: make<Set<number>>(() => new Set()),
    winTemplates: make<Map<number, NovelDetail>>(() => new Map()),
  };
  lines.forEach((line, lineIndex) => {
    const i = index.get(line.service) as number;
    const isError = ERROR_LEVELS.has(line.severity);
    const bucket = Math.floor((line.timestamp - inject) / BUCKET_S);
    if (line.timestamp < inject) {
      s.nBase[i] = (s.nBase[i] as number) + 1;
      if (isError) s.errBase[i] = (s.errBase[i] as number) + 1;
      const counts = (s.baseBuckets[i] as Bucketed).counts;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      (s.baseTemplates[i] as Set<number>).add(line.templateId);
      return;
    }
    s.nWin[i] = (s.nWin[i] as number) + 1;
    if (isError) {
      s.errWin[i] = (s.errWin[i] as number) + 1;
      s.firstError[i] = Math.min(s.firstError[i] as number, line.timestamp);
    }
    const counts = (s.winBuckets[i] as Bucketed).counts;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    const seen = s.winTemplates[i] as Map<number, NovelDetail>;
    const known = seen.get(line.templateId);
    if (known === undefined) {
      seen.set(line.templateId, { templateId: line.templateId, firstSeen: line.timestamp, count: 1, firstIndex: lineIndex });
    } else {
      known.count++;
      if (line.timestamp < known.firstSeen) known.firstSeen = line.timestamp;
    }
  });
  return { ...s, index };
}

/** Seconds after the incident start of the first window bucket above baseline mean + 3 sigma. */
function firstSpike(base: Map<number, number>, now: Map<number, number>, baselineSeconds: number, missing: number): number {
  const buckets = Math.max(Math.ceil(baselineSeconds / BUCKET_S), 1);
  let total = 0;
  let sumSquares = 0;
  for (const count of base.values()) {
    total += count;
    sumSquares += count * count;
  }
  const mean = total / buckets;
  const std = Math.sqrt(Math.max(sumSquares / buckets - mean * mean, 0));
  const limit = base.size > 0 ? Math.max(mean + SPIKE_SIGMAS * std, MIN_SPIKE_COUNT - 1) : MIN_SPIKE_COUNT - 1;
  let first = Number.POSITIVE_INFINITY;
  for (const [bucket, count] of now) if (count > limit && bucket < first) first = bucket;
  return Number.isFinite(first) ? first * BUCKET_S : missing;
}

export function computeFeatures(
  lines: PreparedLine[],
  templates: Map<number, string>,
  incidentStart: number,
): FeatureResult {
  const services = [...new Set(lines.map((l) => l.service))].sort();
  if (services.length === 0) return { services, rows: [], details: [] };
  const inject = incidentStart;
  const stamps = lines.map((l) => l.timestamp);
  const baselineSeconds = Math.max(inject - Math.min(...stamps), 1);
  const windowSeconds = Math.max(Math.max(...stamps) - inject + 1, 1);
  const missing = MISSING_TIME_FACTOR * windowSeconds;
  const st = serviceStats(lines, services, inject);
  const n = services.length;

  const mentionTargets = mentionTable(services, templates);
  const mentions = new Array<number>(n).fill(0);
  const mentionsWarn = new Array<number>(n).fill(0);
  const firstMention = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const pairs = new Set<number>();
  for (const line of lines) {
    const targets = mentionTargets.get(line.templateId);
    if (targets === undefined) continue;
    const from = st.index.get(line.service) as number;
    for (const to of targets) {
      if (to === from) continue;
      pairs.add(from * n + to);
      if (line.timestamp < inject) continue;
      mentions[to] = (mentions[to] as number) + 1;
      if (WARN_LEVELS.has(line.severity)) mentionsWarn[to] = (mentionsWarn[to] as number) + 1;
      firstMention[to] = Math.min(firstMention[to] as number, line.timestamp);
    }
  }
  const outDegree = new Array<number>(n).fill(0);
  const inDegree = new Array<number>(n).fill(0);
  for (const key of pairs) {
    outDegree[Math.floor(key / n)] = (outDegree[Math.floor(key / n)] as number) + 1;
    inDegree[key % n] = (inDegree[key % n] as number) + 1;
  }
  const pagerank = pageRank(n, pairs);

  const since = (first: number): number => (Number.isFinite(first) ? first - inject : missing);
  const columns: Record<string, number[]> = {};
  const details: ServiceDetails[] = [];
  const col = (name: string): number[] => (columns[name] ??= new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    const baseSet = st.baseTemplates[i] as Set<number>;
    const window = [...(st.winTemplates[i] as Map<number, NovelDetail>).values()];
    const novel = window.filter((t) => !baseSet.has(t.templateId));
    const firstNovel = novel.length > 0 ? Math.min(...novel.map((t) => t.firstSeen)) : Number.POSITIVE_INFINITY;
    const rateWin = (st.nWin[i] as number) / windowSeconds;
    const rateBase = (st.nBase[i] as number) / baselineSeconds;
    col('t_first_error')[i] = since(st.firstError[i] as number);
    col('t_first_novel')[i] = since(firstNovel);
    col('t_first_spike')[i] = firstSpike((st.baseBuckets[i] as Bucketed).counts, (st.winBuckets[i] as Bucketed).counts, baselineSeconds, missing);
    col('t_first_mention')[i] = since(firstMention[i] as number);
    col('error_ratio')[i] = Math.log1p(st.errWin[i] as number) - Math.log1p(((st.errBase[i] as number) * windowSeconds) / baselineSeconds);
    col('rate_ratio')[i] = Math.log((rateWin + RATE_EPS) / (rateBase + RATE_EPS));
    col('novel_templates')[i] = novel.length;
    col('mentions')[i] = mentions[i] as number;
    col('mentions_warn')[i] = mentionsWarn[i] as number;
    col('novel_fraction')[i] = novel.length / Math.max(window.length, 1);
    col('in_degree')[i] = inDegree[i] as number;
    col('out_degree')[i] = outDegree[i] as number;
    col('pagerank')[i] = pagerank[i] as number;
    details.push({
      novel: novel.sort((a, b) => a.firstSeen - b.firstSeen || b.count - a.count),
      firstError: Number.isFinite(st.firstError[i] as number) ? (st.firstError[i] as number) : null,
      errorLines: st.errWin[i] as number,
      mentions: mentions[i] as number,
    });
  }
  for (const name of RAW_TIME) columns[`rank_${name}`] = rankPct(col(name), true);
  for (const name of [...RAW_COUNT, 'pagerank']) columns[`rank_${name}`] = rankPct(col(name), false);
  const rows = services.map((_, i) => FEATURE_NAMES.map((name) => (columns[name] as number[])[i] as number));
  return { services, rows, details };
}

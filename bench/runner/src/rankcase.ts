/**
 * Rank one real incident with a given RootRank model, exactly as the app's engine does.
 *
 * argv[2]: path to a model JSON (LightGBM trees, as in rootrank_export.py).
 * stdin (JSON lines): first {"incident_start": <unix seconds>}, then one log per line:
 *                     {"t": <unix seconds>, "source": "...", "message": "...", "severity": "..."}
 * stdout (one JSON line): {"given": <RankResult>, "estimated": <RankResult>} without feature vectors.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { type RankResult, type RcaLine, rankRootCauses, type TreeModel } from '@chronolog/engine';

interface InputLog {
  t: number;
  source: string;
  message: string;
  severity: string;
}

const slim = (result: RankResult) => ({
  ...result,
  candidates: result.candidates.map(({ features: _features, ...rest }) => rest),
});

async function main(): Promise<void> {
  const modelPath = process.argv[2];
  if (!modelPath) throw new Error('Usage: rankcase <model.json>');
  const model = JSON.parse(readFileSync(modelPath, 'utf8')) as TreeModel;
  let start: number | null = null;
  const lines: RcaLine[] = [];
  for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!raw) continue;
    if (start === null) {
      start = (JSON.parse(raw) as { incident_start: number }).incident_start;
      continue;
    }
    const log = JSON.parse(raw) as InputLog;
    lines.push({ timestamp: log.t, service: log.source, message: log.message, severity: log.severity });
  }
  if (start === null) throw new Error('Missing header line with incident_start');
  const given = rankRootCauses(lines, start, model);
  const estimated = rankRootCauses(lines, undefined, model);
  process.stdout.write(`${JSON.stringify({ given: slim(given), estimated: slim(estimated) })}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

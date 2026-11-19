/**
 * Run the ChronoLog-H anomaly detector over a log stream.
 *
 * stdin  (JSON lines): {"t": <unix seconds>, "source": "...", "severity": "..."}
 * stdout (one JSON line): {"flagged": [<line index>, ...], "stats": {"logs", "seconds"}}
 */
import { createInterface } from 'node:readline';
import { type AnomalyLine, flagLines } from './anomaly';

async function readLines(): Promise<AnomalyLine[]> {
  const lines: AnomalyLine[] = [];
  for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (raw) lines.push(JSON.parse(raw) as AnomalyLine);
  }
  return lines;
}

async function main(): Promise<void> {
  const lines = await readLines();
  const started = performance.now();
  const flagged = flagLines(lines);
  const seconds = Math.round(performance.now() - started) / 1000;
  process.stdout.write(`${JSON.stringify({ flagged, stats: { logs: lines.length, seconds } })}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

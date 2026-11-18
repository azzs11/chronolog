/**
 * Replay one benchmark case through the ChronoLog engine.
 *
 * stdin  (JSON lines): first {"inject_time": <unix seconds>}, then one log per line:
 *                      {"t": <unix seconds>, "source": "...", "message": "...", "severity": "..."}
 * stdout (one JSON line, at end of input): {"ranking": [{"service", "score"}], "stats": {...}}
 */
import { createInterface } from 'node:readline';
import { CausalEngine } from '@chronolog/engine';
import { ServiceRanker } from './ranker';

interface Header {
  inject_time: number;
}
interface InputLog {
  t: number;
  source: string;
  message: string;
  severity: string;
}

async function main(): Promise<void> {
  const engine = new CausalEngine();
  let ranker: ServiceRanker | null = null;
  let total = 0;
  let linked = 0;
  const started = performance.now();

  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line) continue;
    if (ranker === null) {
      const header = JSON.parse(line) as Header;
      ranker = new ServiceRanker(header.inject_time * 1000);
      continue;
    }
    const log = JSON.parse(line) as InputLog;
    const id = String(total++);
    const timestampMs = log.t * 1000;
    const result = engine.analyzeLog({
      id,
      message: log.message,
      severity: log.severity,
      source: log.source,
      timestamp: new Date(timestampMs).toISOString(),
    });
    if (result.causal_parent_id !== null) linked++;
    ranker.observe(id, log.source, timestampMs, result);
  }

  if (ranker === null) throw new Error('Missing header line with inject_time');
  process.stdout.write(
    `${JSON.stringify({
      ranking: ranker.ranking(),
      stats: {
        logs: total,
        linked,
        linked_in_window: ranker.linkedLogsInWindow,
        seconds: Math.round((performance.now() - started)) / 1000,
      },
    })}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

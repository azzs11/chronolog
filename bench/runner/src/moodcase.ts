/**
 * Service moods through one real incident, with the app's engine (moodsFromTagged), at fixed steps.
 *
 * stdin (JSON lines):
 *   1. {"steps": [<unix seconds>, ...], "templates": {"<id>": "<text>", ...}}
 *   2+. one log per line: {"t": <unix seconds>, "s": "<service>", "v": "<severity>", "k": <template id>}
 * stdout (one JSON line): {"steps": [{"t": <unix>, "moods": {"<service>": "<mood>"}}, ...]}
 * Templates are mined once per incident by the benchmark (Drain, identical to the engine's port).
 */
import { createInterface } from 'node:readline';
import { moodsFromTagged, type TaggedMoodLine } from '@chronolog/engine';

interface Header {
  steps: number[];
  templates: Record<string, string>;
}

async function main(): Promise<void> {
  let header: Header | null = null;
  const lines: TaggedMoodLine[] = [];
  for await (const raw of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!raw) continue;
    if (header === null) {
      header = JSON.parse(raw) as Header;
      continue;
    }
    const l = JSON.parse(raw) as { t: number; s: string; v: string; k: number };
    lines.push({ timestamp: l.t, service: l.s, severity: l.v, template: l.k });
  }
  if (header === null) throw new Error('Missing header line');
  const texts = new Map(Object.entries(header.templates).map(([k, v]) => [Number(k), v]));
  const steps = header.steps.map((t) => ({
    t,
    moods: Object.fromEntries(moodsFromTagged(lines, texts, t).map((m) => [m.service, m.mood])),
  }));
  process.stdout.write(`${JSON.stringify({ steps })}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

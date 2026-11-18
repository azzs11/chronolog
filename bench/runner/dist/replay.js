"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Replay one benchmark case through the ChronoLog engine.
 *
 * stdin  (JSON lines): first {"inject_time": <unix seconds>}, then one log per line:
 *                      {"t": <unix seconds>, "source": "...", "message": "...", "severity": "..."}
 * stdout (one JSON line, at end of input): {"ranking": [{"service", "score"}], "stats": {...}}
 */
const node_readline_1 = require("node:readline");
const engine_1 = require("@chronolog/engine");
const ranker_1 = require("./ranker");
async function main() {
    const engine = new engine_1.CausalEngine();
    let ranker = null;
    let total = 0;
    let linked = 0;
    const started = performance.now();
    for await (const line of (0, node_readline_1.createInterface)({ input: process.stdin, crlfDelay: Infinity })) {
        if (!line)
            continue;
        if (ranker === null) {
            const header = JSON.parse(line);
            ranker = new ranker_1.ServiceRanker(header.inject_time * 1000);
            continue;
        }
        const log = JSON.parse(line);
        const id = String(total++);
        const timestampMs = log.t * 1000;
        const result = engine.analyzeLog({
            id,
            message: log.message,
            severity: log.severity,
            source: log.source,
            timestamp: new Date(timestampMs).toISOString(),
        });
        if (result.causal_parent_id !== null)
            linked++;
        ranker.observe(id, log.source, timestampMs, result);
    }
    if (ranker === null)
        throw new Error('Missing header line with inject_time');
    process.stdout.write(`${JSON.stringify({
        ranking: ranker.ranking(),
        stats: {
            logs: total,
            linked,
            linked_in_window: ranker.linkedLogsInWindow,
            seconds: Math.round((performance.now() - started)) / 1000,
        },
    })}\n`);
}
main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
});

/**
 * How well does RootRank do on the simulated incidents of the Fault Playground?
 *
 * Runs every observable (service, fault) pair with SEEDS seeds each, once with the true start given
 * and once with the start estimated, and prints one JSON object. The simulator is ours, so this is
 * illustrative: it says how the demo behaves, not how ChronoLog does on real incidents.
 */
import { FAULT_KINDS, isObservable, rankRootCauses, ROOTRANK_V1, SERVICES, simulateIncident } from '@chronolog/engine';

const SEEDS = 20;
type Mode = 'given' | 'estimated';
interface Tally {
  runs: number;
  top1: Record<Mode, number>;
  top3: Record<Mode, number>;
}

const empty = (): Tally => ({ runs: 0, top1: { given: 0, estimated: 0 }, top3: { given: 0, estimated: 0 } });
const byFault: Record<string, Tally> = {};
const overall = empty();

for (const fault of FAULT_KINDS) {
  for (const service of SERVICES) {
    if (!isObservable(service, fault)) continue;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const incident = simulateIncident({ seed, service, fault });
      const tally = byFault[fault] ?? empty();
      byFault[fault] = tally;
      tally.runs++;
      overall.runs++;
      for (const mode of ['given', 'estimated'] as const) {
        const start = mode === 'given' ? incident.incidentStart : undefined;
        const ranked = rankRootCauses(incident.lines, start, ROOTRANK_V1).candidates;
        const position = ranked.findIndex((c) => c.service === service) + 1;
        for (const t of [tally, overall]) {
          t.top1[mode] += position === 1 ? 1 : 0;
          t.top3[mode] += position >= 1 && position <= 3 ? 1 : 0;
        }
      }
    }
  }
}
process.stdout.write(`${JSON.stringify({ seeds: SEEDS, services: SERVICES.length, byFault, overall })}\n`);

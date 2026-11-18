/**
 * ChronoLog-H service ranking. Part of the benchmark definition, fixed before any result was measured.
 *
 * The engine links each log to a causal parent and gives it a chain root and a blast radius. To turn that
 * into a ranking of services:
 *
 *   score(service) = sum of blast_radius_score over every in-window log whose chain root was logged by `service`
 *
 * A log counts only if it was linked into a chain (it has a root) and is at or after the incident start.
 * Services are ranked by score, highest first; ties are broken alphabetically. The engine only remembers
 * the last 200 logs, so the totals have to be accumulated while the stream plays.
 */
import type { CausalMeta } from '@chronolog/engine';

export interface RankedService {
  service: string;
  score: number;
}

export class ServiceRanker {
  private readonly sourceById = new Map<string, string>();
  private readonly scores = new Map<string, number>();
  private linkedInWindow = 0;

  constructor(private readonly incidentStartMs: number) {}

  /** Record a log and the engine's verdict on it. Call once per log, in stream order. */
  observe(id: string, source: string, timestampMs: number, result: CausalMeta): void {
    this.sourceById.set(id, source);
    if (timestampMs < this.incidentStartMs || result.causal_root_id === null) return;
    const rootSource = this.sourceById.get(result.causal_root_id);
    if (rootSource === undefined) return;
    this.scores.set(rootSource, (this.scores.get(rootSource) ?? 0) + result.blast_radius_score);
    this.linkedInWindow++;
  }

  get linkedLogsInWindow(): number {
    return this.linkedInWindow;
  }

  ranking(): RankedService[] {
    return [...this.scores.entries()]
      .map(([service, score]) => ({ service, score: Math.round(score * 1000) / 1000 }))
      .sort((a, b) => b.score - a.score || a.service.localeCompare(b.service));
  }
}

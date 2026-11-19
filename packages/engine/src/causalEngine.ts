/**
 * Causal log engine (ChronoLog-H rules).
 *
 * For each incoming log, finds the most likely causal parent among the last
 * RING_SIZE logs using the scoring rules in ./scoring. Holds its own state, so
 * create one instance per stream. Does no I/O.
 */
import {
  CAUSAL_MAX_CHAIN_DEPTH,
  CAUSAL_WINDOW_MS,
  CAUSALITY_THRESHOLD,
  CHAIN_ALERT_DEPTH,
  RING_SIZE,
} from './constants';
import { EntityMemo } from './entities';
import { computeBlastRadius, computeCausalScore } from './scoring';
import {
  noopLogger,
  type ActiveChain,
  type CausalLog,
  type CausalMeta,
  type ChainDetectedEvent,
  type GraphData,
  type GraphNode,
  type Logger,
  type LogInput,
} from './types';

const LABEL_MAX = 45;
const PREVIEW_MESSAGE_MAX = 60;
const CHAIN_PREVIEW_SIZE = 6;
const AFFECTED_PREVIEW_SIZE = 5;

const round3 = (n: number): number => parseFloat(n.toFixed(3));
const byTime = (a: CausalLog, b: CausalLog): number =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

/** Distinct messages remembered by the entity cache. Speed only; never changes results. */
const DEFAULT_ENTITY_CACHE_SIZE = 10_000;

export interface CausalEngineOptions {
  logger?: Logger;
  /** Entity cache size. 0 disables the cache (used to prove it does not change results). */
  entityCacheSize?: number;
}

export class CausalEngine {
  private recentLogs: CausalLog[] = [];
  private chainListener: (event: ChainDetectedEvent) => void = () => undefined;
  private readonly logger: Logger;
  private readonly entities: EntityMemo;

  constructor(options: CausalEngineOptions = {}) {
    this.logger = options.logger ?? noopLogger;
    this.entities = new EntityMemo(options.entityCacheSize ?? DEFAULT_ENTITY_CACHE_SIZE);
  }

  /** Register the callback for chain-detected events. */
  onChainDetected(listener: (event: ChainDetectedEvent) => void): void {
    this.chainListener = listener;
  }

  /** Analyse a log and return the causal metadata to merge into its record. */
  analyzeLog(newLog: LogInput): CausalMeta {
    const match = this.findBestParent(newLog);
    const parent = match?.parent ?? null;

    const result: CausalMeta = {
      causal_parent_id: parent?.id ?? null,
      causal_root_id: parent ? (parent.causal_root_id ?? parent.id) : null,
      causal_chain_depth: parent ? Math.min((parent.causal_chain_depth ?? 0) + 1, CAUSAL_MAX_CHAIN_DEPTH) : 0,
      blast_radius_score: computeBlastRadius(newLog, parent),
    };

    if (parent && match) {
      this.logger.debug('Causal link established', {
        log: newLog.id?.slice(0, 8),
        parent: parent.id?.slice(0, 8),
        depth: result.causal_chain_depth,
        root: result.causal_root_id?.slice(0, 8),
        score: match.score.toFixed(2),
      });
    }

    this.recentLogs.push({ ...newLog, ...result });
    if (this.recentLogs.length > RING_SIZE) this.recentLogs.shift();

    if (result.causal_chain_depth >= CHAIN_ALERT_DEPTH && result.causal_root_id) {
      this.emitChain(result.causal_root_id, newLog.id, result.causal_chain_depth);
    }
    return result;
  }

  /** All active chains, largest blast radius first. */
  getActiveCausalChains(): ActiveChain[] {
    const chains = new Map<string, { logs: CausalLog[]; maxDepth: number; blastRadius: number }>();
    for (const log of this.recentLogs) {
      const rootId = log.causal_root_id;
      if (!rootId) continue;
      let c = chains.get(rootId);
      if (!c) {
        c = { logs: [], maxDepth: 0, blastRadius: 0 };
        chains.set(rootId, c);
      }
      c.logs.push(log);
      c.maxDepth = Math.max(c.maxDepth, log.causal_chain_depth ?? 0);
      c.blastRadius += log.blast_radius_score ?? 0;
    }

    const result: ActiveChain[] = [];
    for (const [rootId, data] of chains) {
      const rootLog = this.recentLogs.find((l) => l.id === rootId);
      if (!rootLog) continue;
      result.push({
        root_log_id: rootId,
        root_message: rootLog.message,
        root_severity: rootLog.severity,
        root_source: rootLog.source,
        root_timestamp: rootLog.timestamp,
        chain_depth: data.maxDepth,
        total_affected_logs: data.logs.length,
        blast_radius_score: round3(data.blastRadius),
        affected_preview: data.logs.slice(0, AFFECTED_PREVIEW_SIZE).map((l) => ({
          id: l.id,
          message: l.message,
          severity: l.severity,
          source: l.source,
          depth: l.causal_chain_depth,
        })),
      });
    }
    return result.sort((a, b) => b.blast_radius_score - a.blast_radius_score);
  }

  /** All logs in one chain, oldest first. */
  getChainById(rootId: string): CausalLog[] {
    return this.recentLogs.filter((l) => l.id === rootId || l.causal_root_id === rootId).sort(byTime);
  }

  /** Nodes and edges for the graph view. */
  getGraphData(): GraphData {
    const nodes = new Map<string, GraphNode>();
    const edges: { from: string; to: string }[] = [];
    // A root log has no causal_root_id of its own (that field names the root of a *child*), so a
    // log is a root when other logs name it as theirs.
    const rootIds = new Set(this.recentLogs.map((l) => l.causal_root_id).filter((id): id is string => Boolean(id)));
    const isRoot = (log: CausalLog): boolean => rootIds.has(log.id) || log.id === log.causal_root_id;

    for (const log of this.recentLogs) {
      if (!log.causal_root_id && !log.causal_parent_id) continue;
      if (!nodes.has(log.id)) {
        nodes.set(log.id, {
          id: log.id,
          label: log.message.slice(0, LABEL_MAX) + (log.message.length > LABEL_MAX ? '…' : ''),
          severity: log.severity,
          source: log.source,
          depth: log.causal_chain_depth ?? 0,
          isRoot: isRoot(log),
          blastRadius: log.blast_radius_score ?? 0,
        });
      }
      if (log.causal_parent_id) {
        const parent = this.recentLogs.find((l) => l.id === log.causal_parent_id);
        if (parent && !nodes.has(parent.id)) {
          nodes.set(parent.id, {
            id: parent.id,
            label: parent.message.slice(0, LABEL_MAX),
            severity: parent.severity,
            source: parent.source,
            depth: parent.causal_chain_depth ?? 0,
            isRoot: isRoot(parent),
            blastRadius: parent.blast_radius_score ?? 0,
          });
        }
        edges.push({ from: log.causal_parent_id, to: log.id });
      }
    }
    return { nodes: [...nodes.values()], edges };
  }

  reset(): void {
    this.recentLogs = [];
  }

  private findBestParent(newLog: LogInput): { parent: CausalLog; score: number } | null {
    const cutoffMs = new Date(newLog.timestamp).getTime() - CAUSAL_WINDOW_MS;
    let bestParent: CausalLog | null = null;
    let bestScore = CAUSALITY_THRESHOLD;
    for (const candidate of this.recentLogs) {
      if (candidate.id === newLog.id) continue;
      if (new Date(candidate.timestamp).getTime() < cutoffMs) continue;
      const score = computeCausalScore(candidate, newLog, (m) => this.entities.get(m));
      if (score > bestScore) {
        bestScore = score;
        bestParent = candidate;
      }
    }
    return bestParent ? { parent: bestParent, score: bestScore } : null;
  }

  private emitChain(rootId: string, triggeringLogId: string, depth: number): void {
    const chain = this.getChainById(rootId);
    this.chainListener({
      type: 'causal-chain-detected',
      root_id: rootId,
      triggering_log_id: triggeringLogId,
      chain_depth: depth,
      total_affected: chain.length,
      blast_radius_score: round3(chain.reduce((s, l) => s + (l.blast_radius_score ?? 0), 0)),
      chain_preview: chain.slice(0, CHAIN_PREVIEW_SIZE).map((l) => ({
        id: l.id,
        severity: l.severity,
        message: l.message.slice(0, PREVIEW_MESSAGE_MAX),
        source: l.source,
      })),
    });
  }
}

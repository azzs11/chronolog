import { isPgAvailable, requirePool } from './client';
import { MAX_LOGS_IN_MEMORY, DEFAULT_LOG_LIMIT } from '../config/constants';
import type { LogStats, ProcessedLog, StoredLog } from '../types';

let memLogs: StoredLog[] = [];

export interface LogQuery {
  limit?: number;
  offset?: number;
  severity?: string;
  source?: string;
  search?: string;
  onlyAnomalies?: boolean;
}

export interface CausalUpdate {
  causalParentId: string | null;
  causalRootId: string | null;
  chainDepth: number;
  blastRadiusScore: number;
}

export interface ChainRecord {
  rootLogId: string;
  chainDepth: number;
  totalAffectedLogs: number;
  blastRadiusScore: number;
  chainSummary: string;
}

interface StatsRow {
  total: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
  debug: number;
  anomaly_count: number;
  causal_chain_count: number;
}

const byTimestamp = (a: StoredLog, b: StoredLog): number =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

export const insertLog = async (log: ProcessedLog): Promise<ProcessedLog> => {
  if (!isPgAvailable()) {
    memLogs.push(log);
    if (memLogs.length > MAX_LOGS_IN_MEMORY) memLogs = memLogs.slice(-MAX_LOGS_IN_MEMORY);
    return log;
  }

  const pool = requirePool();
  const causal = log.causal;
  const { rows } = await pool.query<ProcessedLog>(
    `INSERT INTO logs (
      id, message, severity, source, timestamp,
      ml_predicted_severity, ml_confidence, ml_severity_match, ml_probabilities,
      causal_parent_id, causal_root_id, causal_chain_depth, blast_radius_score,
      fingerprint_hash, is_anomaly, anomaly_score
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (id) DO NOTHING
    RETURNING *`,
    [
      log.id, log.message, log.severity, log.source, log.timestamp,
      log.ml?.predicted_severity ?? null,
      log.ml?.confidence ?? null,
      log.ml?.severity_match ?? null,
      log.ml?.probabilities ? JSON.stringify(log.ml.probabilities) : null,
      causal?.causal_parent_id ?? null,
      causal?.causal_root_id ?? null,
      causal?.causal_chain_depth ?? 0,
      causal?.blast_radius_score ?? 0,
      log.fingerprint_hash ?? null,
      log.is_anomaly ?? false,
      log.anomaly_score ?? 0,
    ],
  );
  return rows[0] ?? log;
};

export const getLogs = async ({
  limit = DEFAULT_LOG_LIMIT,
  offset = 0,
  severity,
  source,
  search,
  onlyAnomalies,
}: LogQuery = {}): Promise<StoredLog[]> => {
  if (!isPgAvailable()) {
    let result = [...memLogs];
    if (severity) result = result.filter((l) => l.severity === severity);
    if (source) result = result.filter((l) => l.source === source);
    if (search) result = result.filter((l) => l.message.toLowerCase().includes(search.toLowerCase()));
    if (onlyAnomalies) result = result.filter((l) => l.is_anomaly);
    return result.slice(-limit);
  }

  const pool = requirePool();
  const whereClauses = ['1=1'];
  const params: (string | number)[] = [];

  if (severity) { params.push(severity); whereClauses.push(`severity = $${params.length}`); }
  if (source) { params.push(source); whereClauses.push(`source = $${params.length}`); }
  if (search) { params.push(`%${search}%`); whereClauses.push(`message ILIKE $${params.length}`); }
  if (onlyAnomalies) whereClauses.push('is_anomaly = TRUE');

  params.push(limit, offset);
  const query = `
    SELECT * FROM logs
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY timestamp DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await pool.query<StoredLog>(query, params);
  return rows.reverse();
};

/** Logs at or after `sinceIso`, oldest first, capped at the `limit` most recent. */
export const getLogsSince = async (sinceIso: string, limit: number): Promise<StoredLog[]> => {
  const sinceMs = new Date(sinceIso).getTime();
  if (!isPgAvailable()) {
    return memLogs.filter((l) => new Date(l.timestamp).getTime() >= sinceMs).slice(-limit);
  }
  const { rows } = await requirePool().query<StoredLog>(
    'SELECT * FROM logs WHERE timestamp >= $1 ORDER BY timestamp DESC LIMIT $2',
    [sinceIso, limit],
  );
  return rows.reverse();
};

export const getLogById = async (id: string): Promise<StoredLog | null> => {
  if (!isPgAvailable()) return memLogs.find((l) => l.id === id) ?? null;
  const { rows } = await requirePool().query<StoredLog>('SELECT * FROM logs WHERE id = $1', [id]);
  return rows[0] ?? null;
};

export const updateLogCausalData = async (
  id: string,
  { causalParentId, causalRootId, chainDepth, blastRadiusScore }: CausalUpdate,
): Promise<void> => {
  if (!isPgAvailable()) {
    const log = memLogs.find((l) => l.id === id);
    if (log) {
      log.causal_parent_id = causalParentId;
      log.causal_root_id = causalRootId;
      log.causal_chain_depth = chainDepth;
      log.blast_radius_score = blastRadiusScore;
    }
    return;
  }
  await requirePool().query(
    `UPDATE logs SET causal_parent_id=$2, causal_root_id=$3, causal_chain_depth=$4, blast_radius_score=$5 WHERE id=$1`,
    [id, causalParentId, causalRootId, chainDepth, blastRadiusScore],
  );
};

export const getStats = async (): Promise<LogStats> => {
  if (!isPgAvailable()) {
    const bySeverity = { critical: 0, error: 0, warning: 0, info: 0, debug: 0 };
    for (const l of memLogs) {
      if (l.severity in bySeverity) bySeverity[l.severity as keyof typeof bySeverity]++;
    }
    return {
      total: memLogs.length,
      bySeverity,
      anomalyCount: memLogs.filter((l) => l.is_anomaly).length,
      causalChainCount: new Set(memLogs.map((l) => l.causal_root_id).filter(Boolean)).size,
    };
  }

  const { rows } = await requirePool().query<StatsRow>(`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END)::int AS critical,
      SUM(CASE WHEN severity='error'    THEN 1 ELSE 0 END)::int AS error,
      SUM(CASE WHEN severity='warning'  THEN 1 ELSE 0 END)::int AS warning,
      SUM(CASE WHEN severity='info'     THEN 1 ELSE 0 END)::int AS info,
      SUM(CASE WHEN severity='debug'    THEN 1 ELSE 0 END)::int AS debug,
      SUM(CASE WHEN is_anomaly          THEN 1 ELSE 0 END)::int AS anomaly_count,
      COUNT(DISTINCT causal_root_id) FILTER (WHERE causal_root_id IS NOT NULL)::int AS causal_chain_count
    FROM logs
  `);
  const r = rows[0] as StatsRow;
  return {
    total: r.total,
    bySeverity: { critical: r.critical, error: r.error, warning: r.warning, info: r.info, debug: r.debug },
    anomalyCount: r.anomaly_count,
    causalChainCount: r.causal_chain_count,
  };
};

export const getCausalChain = async (rootLogId: string): Promise<StoredLog[]> => {
  if (!isPgAvailable()) {
    return memLogs.filter((l) => l.id === rootLogId || l.causal_root_id === rootLogId).sort(byTimestamp);
  }
  const { rows } = await requirePool().query<StoredLog>(
    `SELECT * FROM logs WHERE id=$1 OR causal_root_id=$1 ORDER BY timestamp ASC`,
    [rootLogId],
  );
  return rows;
};

export const insertCausalChain = async (chainData: ChainRecord): Promise<unknown> => {
  if (!isPgAvailable()) return null;
  const { rows } = await requirePool().query(
    `INSERT INTO causal_chains (root_log_id, chain_depth, total_affected_logs, blast_radius_score, chain_summary)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [chainData.rootLogId, chainData.chainDepth, chainData.totalAffectedLogs, chainData.blastRadiusScore, chainData.chainSummary],
  );
  return rows[0];
};

export const getRecentAnomalies = async (limit = 20): Promise<StoredLog[]> => {
  if (!isPgAvailable()) {
    return memLogs.filter((l) => l.is_anomaly).slice(-limit).reverse();
  }
  const { rows } = await requirePool().query<StoredLog>(
    `SELECT * FROM logs WHERE is_anomaly=TRUE ORDER BY timestamp DESC LIMIT $1`,
    [limit],
  );
  return rows;
};

export const getMemLogs = (): StoredLog[] => memLogs;

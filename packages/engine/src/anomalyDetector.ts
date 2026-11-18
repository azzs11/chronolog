/**
 * Temporal anomaly fingerprinting (ChronoLog-H rules).
 *
 * Learns the rhythm of the log stream and flags when it breaks. The score
 * (0-1) adds three signals: a severity-rate spike, a rare severity transition,
 * and a burst of logs arriving faster than baseline. The fingerprint is
 * SHA-256("severity:source:rounded_score"), so the same failure mode gets the
 * same fingerprint. Holds its own state and does no I/O.
 */
import {
  ANOMALY_THRESHOLD,
  ANOMALY_WINDOW_SIZE,
  BASELINE_UPDATE_EVERY,
  BIGRAM_RARE_THRESHOLD,
  BURST_FRACTION,
  BURST_WINDOW,
  DEFAULT_INTERARRIVAL_MS,
  MIN_BASELINE_LOGS,
  RECENT_RATE_WINDOW,
  SCORE_BIGRAM,
  SCORE_BURST,
  SCORE_FREQ,
  SEVERITY_FREQ_SPIKE_FACTOR,
} from './constants';
import { sha256Hex } from './sha256';
import { noopLogger, type AnomalyResult, type Fingerprint, type AnomalyInput, type Logger } from './types';

interface WindowEntry {
  severity: string;
  source: string;
  timestamp: string;
}

interface Baseline {
  severityRates: Record<string, number>;
  severityBigrams: Record<string, number>;
  interArrivalMean: number;
  interArrivalStddev: number;
  sourceDist: Record<string, number>;
}

export interface AnomalyDetectorOptions {
  /** Supplies "now" when a log has no timestamp. The engine never reads the system clock itself. */
  clock: () => Date;
  logger?: Logger;
}

const ms = (iso: string): number => new Date(iso).getTime();

function distribution(counts: Record<string, number>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) out[key] = count / total;
  return out;
}

export class AnomalyDetector {
  private window: WindowEntry[] = [];
  private baseline: Baseline | null = null;
  private logCount = 0;
  private readonly fingerprints = new Map<string, Fingerprint>();
  private readonly clock: () => Date;
  private readonly logger: Logger;

  constructor(options: AnomalyDetectorOptions) {
    this.clock = options.clock;
    this.logger = options.logger ?? noopLogger;
  }

  /** Analyse a log and return its anomaly score and fingerprint. */
  analyze(log: AnomalyInput): AnomalyResult {
    this.window.push({ severity: log.severity, source: log.source, timestamp: log.timestamp });
    if (this.window.length > ANOMALY_WINDOW_SIZE) this.window.shift();
    this.logCount++;
    if (this.logCount % BASELINE_UPDATE_EVERY === 0) this.updateBaseline();

    const freqScore = this.severityFrequencyAnomaly(log.severity);
    const bigramScore = this.bigramSequenceAnomaly(log.severity);
    const burstScore = this.burstAnomaly();
    const anomalyScore = Math.min(freqScore + bigramScore + burstScore, 1.0);
    const isAnomaly = anomalyScore >= ANOMALY_THRESHOLD;
    const fingerprintHash = this.generateFingerprint(log, anomalyScore);

    if (isAnomaly) {
      this.logger.debug('Temporal anomaly detected', {
        logId: log.id?.slice(0, 8),
        severity: log.severity,
        score: anomalyScore.toFixed(3),
        signals: { freq: freqScore, bigram: bigramScore, burst: burstScore },
        fingerprint: fingerprintHash.slice(0, 16),
      });
      this.trackFingerprint(fingerprintHash, log, anomalyScore);
    }
    return { isAnomaly, anomalyScore: parseFloat(anomalyScore.toFixed(4)), fingerprintHash };
  }

  getFingerprints(): Fingerprint[] {
    return [...this.fingerprints.values()].sort((a, b) => b.count - a.count);
  }

  reset(): void {
    this.window = [];
    this.baseline = null;
    this.logCount = 0;
    this.fingerprints.clear();
  }

  private trackFingerprint(hash: string, log: AnomalyInput, score: number): void {
    const seenAt = log.timestamp || this.clock().toISOString();
    const existing = this.fingerprints.get(hash);
    if (existing) {
      existing.count++;
      existing.lastSeen = seenAt;
      existing.lastSeverity = log.severity;
    } else {
      this.fingerprints.set(hash, {
        hash,
        firstSeen: seenAt,
        lastSeen: seenAt,
        count: 1,
        severity: log.severity,
        source: log.source,
        avgScore: score,
      });
    }
  }

  /** Recompute the baseline rhythm from the current window. */
  private updateBaseline(): void {
    const n = this.window.length;
    if (n < MIN_BASELINE_LOGS) return;

    const severityCounts: Record<string, number> = { critical: 0, error: 0, warning: 0, info: 0, debug: 0 };
    const sourceCounts: Record<string, number> = {};
    const bigramCounts: Record<string, number> = {};
    const intervals: number[] = [];

    this.window.forEach((entry, i) => {
      severityCounts[entry.severity] = (severityCounts[entry.severity] ?? 0) + 1;
      sourceCounts[entry.source] = (sourceCounts[entry.source] ?? 0) + 1;
      const prev = this.window[i - 1];
      if (prev) {
        const key = `${prev.severity}→${entry.severity}`;
        bigramCounts[key] = (bigramCounts[key] ?? 0) + 1;
        const delta = ms(entry.timestamp) - ms(prev.timestamp);
        if (delta >= 0) intervals.push(delta);
      }
    });

    const mean = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : DEFAULT_INTERARRIVAL_MS;
    const variance =
      intervals.length > 1 ? intervals.reduce((acc, d) => acc + (d - mean) ** 2, 0) / intervals.length : 0;

    this.baseline = {
      severityRates: distribution(severityCounts, n),
      severityBigrams: distribution(bigramCounts, n - 1),
      interArrivalMean: mean,
      interArrivalStddev: Math.sqrt(variance),
      sourceDist: distribution(sourceCounts, n),
    };
  }

  /** Signal 1: this severity is appearing at more than 2x its baseline rate. */
  private severityFrequencyAnomaly(severity: string): number {
    if (!this.baseline) return 0;
    const expectedRate = this.baseline.severityRates[severity] ?? 0;
    if (expectedRate === 0) return 0; // never seen before: skip (cold start)
    const recent = this.window.slice(-RECENT_RATE_WINDOW);
    const recentRate = recent.filter((l) => l.severity === severity).length / recent.length;
    return recentRate > expectedRate * SEVERITY_FREQ_SPIKE_FACTOR ? SCORE_FREQ : 0;
  }

  /** Signal 2: the severity transition is unusually rare. */
  private bigramSequenceAnomaly(severity: string): number {
    if (!this.baseline || this.window.length === 0) return 0;
    const prevSeverity = this.window[this.window.length - 1]?.severity;
    if (!prevSeverity) return 0;
    const freq = this.baseline.severityBigrams[`${prevSeverity}→${severity}`] ?? 0;
    return freq < BIGRAM_RARE_THRESHOLD ? SCORE_BIGRAM : 0;
  }

  /** Signal 3: logs are arriving much faster than baseline. */
  private burstAnomaly(): number {
    if (!this.baseline || this.baseline.interArrivalMean <= 0) return 0;
    const recent = this.window.slice(-BURST_WINDOW);
    if (recent.length < 2) return 0;
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      gaps.push(ms((recent[i] as WindowEntry).timestamp) - ms((recent[i - 1] as WindowEntry).timestamp));
    }
    const recentMean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return recentMean < this.baseline.interArrivalMean * BURST_FRACTION ? SCORE_BURST : 0;
  }

  private generateFingerprint(log: AnomalyInput, score: number): string {
    return sha256Hex(`${log.severity}:${log.source}:${Math.round(score * 10)}`);
  }
}

/** One log line as RootRank sees it. Times are Unix seconds. */
export interface RcaLine {
  /** Optional id, so evidence can point back at the exact line. */
  id?: string;
  timestamp: number;
  service: string;
  message: string;
  /** If missing, severity is inferred from the message text (see severity.ts). */
  severity?: string;
}

/** The first messages a service logged during the incident that it never logged before it. */
export interface NovelTemplate {
  template: string;
  firstSeen: number;
  count: number;
  exampleId?: string;
}

export interface CauseEvidence {
  /** Seconds after the incident start until this service first logged an error, or null. */
  firstErrorAfter: number | null;
  /** Seconds after the incident start until it first logged a message it never logged before. */
  firstNovelAfter: number | null;
  novelTemplates: NovelTemplate[];
  /** Lines from other services during the incident that name this service. */
  mentions: number;
  errorLines: number;
  /** Id of the first error line at or after the incident start, when lines carry ids. */
  firstErrorId?: string;
  /** Ids of a few lines from other services that name this one (empty when lines carry no ids). */
  mentionIds?: string[];
}

export interface RankedCause {
  service: string;
  /** Raw model score. Only the order and the differences are meaningful. */
  score: number;
  /** Softmax of the scores across candidates: a relative weight in 0-1, not a calibrated probability. */
  weight: number;
  rank: number;
  features: Record<string, number>;
  evidence: CauseEvidence;
}

export interface RankResult {
  incidentStart: number;
  /** 'given' if the caller supplied the start, 'estimated' if it was found from the logs. */
  startSource: 'given' | 'estimated';
  candidates: RankedCause[];
  /** Lines before the incident start, used as the baseline of what normal looked like. */
  baselineLines: number;
  incidentLines: number;
  modelId: string;
}

/**
 * The six faults a visitor can inject, and what each one does to the logs. They run from easy to
 * hard on purpose: a crash writes startup lines the service never wrote before, while a network
 * delay shows up only in the logs of the services that call the broken one. The simulator never
 * changes what a fault looks like to make RootRank win.
 */
export const FAULT_KINDS = ['crash', 'disk', 'memory', 'cpu', 'delay', 'loss'] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

export interface FaultInfo {
  label: string;
  /** What the engineer would say happened. */
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** How the fault leaves traces in logs, shown after the answer is revealed. */
  trace: string;
}

export const FAULTS: Record<FaultKind, FaultInfo> = {
  crash: {
    label: 'Crash and restart',
    description: 'The service is killed and starts again.',
    difficulty: 'easy',
    trace: 'The service writes shutdown and startup lines it never wrote before, and its callers log refused connections.',
  },
  disk: {
    label: 'Disk full',
    description: 'The service can no longer write to disk.',
    difficulty: 'easy',
    trace: 'The service logs a new error ("no space left on device") on many requests.',
  },
  memory: {
    label: 'Memory pressure',
    description: 'The service is running out of memory.',
    difficulty: 'medium',
    trace: 'The service logs a new, occasional warning about long garbage-collection pauses. Little else changes.',
  },
  cpu: {
    label: 'CPU saturation',
    description: 'The service is starved of CPU and answers slowly.',
    difficulty: 'medium',
    trace: 'The service logs the same messages as before, only slower. Its callers log timeouts that name it.',
  },
  delay: {
    label: 'Network delay',
    description: 'Calls to the service are slow on the network.',
    difficulty: 'hard',
    trace: 'The service itself logs nothing unusual. Its callers log slow-response warnings that name it.',
  },
  loss: {
    label: 'Packet loss',
    description: 'Some calls to the service are lost.',
    difficulty: 'hard',
    trace: 'The service logs a little less. Its callers log retries and failures that name it.',
  },
};

/** Seconds a crashed service is down. */
export const CRASH_OUTAGE_S = 8;
/** Calls slower than this time out (milliseconds). */
export const TIMEOUT_MS = 2000;

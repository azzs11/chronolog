/**
 * Field notes: what each kind of fault is in production, how it shows in logs, what fools people,
 * and what an on-call engineer checks first. Shown after every puzzle so a round teaches something
 * you can use at 3 a.m. General practice, no measured numbers.
 */

export interface FieldNote {
  title: string;
  inProduction: string;
  giveaway: string;
  trap: string;
  firstChecks: string[];
}

const NOTES: Record<string, FieldNote> = {
  crash: {
    title: 'Crash and restart',
    inProduction: 'A process or pod was killed (out of memory, a panic, a failed health check) and started again.',
    giveaway: 'Shutdown and startup lines the service never logs in normal running, and callers logging "connection refused" for a few seconds.',
    trap: 'The restart is over quickly. Look a few minutes later and everything seems fine again.',
    firstChecks: ['Restart count and exit reason (kubectl get pods; "OOMKilled" or an exit code)', 'Logs from before the restart (kubectl logs --previous)', 'What changed just before: deploys, config, traffic'],
  },
  disk: {
    title: 'Disk full',
    inProduction: 'A volume filled up (logs, a write-ahead log, temp files), so writes start failing.',
    giveaway: 'A brand-new error at the broken service, usually "no space left on device", on many requests.',
    trap: 'Every caller fails too, and the callers can be louder than the culprit.',
    firstChecks: ['Free space on the volume (df -h)', 'What grew: log rotation, WAL or cache size', 'Volume size and quotas'],
  },
  memory: {
    title: 'Memory pressure',
    inProduction: 'The service is close to its memory limit: long garbage-collection pauses, then often an out-of-memory kill.',
    giveaway: 'Occasional warnings about long GC pauses or slow requests. Little else changes until it crashes.',
    trap: 'Logs barely change, so it hides until the crash, which then looks like the cause.',
    firstChecks: ['Memory use against the container limit', 'GC logs and pause times', 'Recent deploys or traffic that added memory (caches, big payloads)'],
  },
  cpu: {
    title: 'CPU saturation',
    inProduction: 'The service is starved of CPU (a hot loop, too little CPU limit, a noisy neighbour) and answers slowly.',
    giveaway: 'The service logs the same messages as usual, only slower. Its callers log timeouts that name it.',
    trap: 'The culprit looks fine while the services calling it look sick.',
    firstChecks: ['CPU use and throttling against limits', 'Latency per service (p99), from traces or the mesh', 'Thread or worker pools that are full'],
  },
  delay: {
    title: 'Network delay',
    inProduction: 'Calls to the service are slow on the network: a congested link, DNS trouble, a misbehaving sidecar.',
    giveaway: 'Callers log slow-response warnings that name it. The service itself logs nothing unusual.',
    trap: 'The broken service never complains. Only who is talked about gives it away.',
    firstChecks: ['Latency between services (traces, service mesh metrics)', 'DNS resolution time', 'Recent network policy or mesh changes'],
  },
  loss: {
    title: 'Packet loss',
    inProduction: 'Some packets to the service are dropped, so some calls fail or are retried.',
    giveaway: 'Retries and scattered failures in callers that name it.',
    trap: 'Errors are sporadic and spread across callers, so no single burst stands out.',
    firstChecks: ['TCP retransmits and connection resets', 'Sidecar or mesh error rates', 'Health of the node and network interface'],
  },
  socket: {
    title: 'Socket exhaustion',
    inProduction: 'The service runs out of sockets or file descriptors, often through leaked connections.',
    giveaway: 'Errors like "too many open files" or a connection pool that cannot hand out connections.',
    trap: 'It builds up slowly and can look like a network problem.',
    firstChecks: ['Open file descriptors against the limit (ulimit -n)', 'Connection pool sizes and leaks', 'Connections stuck in TIME_WAIT or CLOSE_WAIT'],
  },
  code: {
    title: 'Bad code change',
    inProduction: 'A new version was deployed with a bug.',
    giveaway: 'Right after the restart the service logs messages it never logged before: new exceptions, new error text.',
    trap: 'Callers fail too and can be louder. The newest messages, not the loudest, point at the culprit.',
    firstChecks: ['What was deployed just before', 'Roll back first, debug after', 'The diff between the two versions'],
  },
};

const ALIASES: Record<string, string> = { mem: 'memory' };

/** The note for a fault kind: simulator names (crash, disk...) and RCAEval names (mem, socket, f1-f5). */
export function fieldNoteFor(fault: string): FieldNote | null {
  if (/^f\d$/.test(fault)) return NOTES.code ?? null;
  return NOTES[ALIASES[fault] ?? fault] ?? null;
}

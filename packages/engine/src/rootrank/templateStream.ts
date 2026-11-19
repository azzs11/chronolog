/**
 * Group a live stream of log lines by message template, one line at a time.
 *
 * Each distinct masked message is given to Drain once (as in the benchmark); later copies reuse its
 * template. Counts are kept per template: how many lines, which services, which severities, when it
 * was first and last seen, and a few recent raw examples. Pure: no I/O, no clock; time comes from the
 * lines.
 */
import { Drain, ROOTRANK_DRAIN } from './drain';
import { maskMessage } from './templates';

const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info', 'debug'] as const;
const DEFAULT_MAX_SAMPLES = 5;

export interface StreamLine {
  id?: string;
  /** Unix seconds. */
  timestamp: number;
  service: string;
  severity: string;
  message: string;
}

export interface TemplateGroup {
  id: number;
  /** The template text, with <*> for the parts that vary. */
  template: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  bySeverity: Record<string, number>;
  byService: Record<string, number>;
  /** The most severe level this template has been logged at. */
  highestSeverity: string;
  /** The most recent raw messages, oldest first. */
  samples: string[];
}

export interface AddResult {
  groupId: number;
  /** True when this line created a template nobody had logged before. */
  isNewTemplate: boolean;
}

const severityRank = (severity: string): number => {
  const at = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  return at < 0 ? SEVERITY_ORDER.length : at;
};

export class TemplateStream {
  private drain = new Drain(ROOTRANK_DRAIN);
  private idOfMasked = new Map<string, number>();
  private groupsById = new Map<number, TemplateGroup>();

  constructor(private readonly maxSamples: number = DEFAULT_MAX_SAMPLES) {}

  add(line: StreamLine): AddResult {
    const masked = maskMessage(line.message);
    let id = this.idOfMasked.get(masked);
    if (id === undefined) {
      id = this.drain.addMessage(masked);
      this.idOfMasked.set(masked, id);
    }
    let group = this.groupsById.get(id);
    const isNewTemplate = group === undefined;
    if (group === undefined) {
      group = {
        id,
        template: masked,
        count: 0,
        firstSeen: line.timestamp,
        lastSeen: line.timestamp,
        bySeverity: {},
        byService: {},
        highestSeverity: line.severity,
        samples: [],
      };
      this.groupsById.set(id, group);
    }
    group.count++;
    group.firstSeen = Math.min(group.firstSeen, line.timestamp);
    group.lastSeen = Math.max(group.lastSeen, line.timestamp);
    group.bySeverity[line.severity] = (group.bySeverity[line.severity] ?? 0) + 1;
    group.byService[line.service] = (group.byService[line.service] ?? 0) + 1;
    if (severityRank(line.severity) < severityRank(group.highestSeverity)) group.highestSeverity = line.severity;
    group.samples.push(line.message);
    if (group.samples.length > this.maxSamples) group.samples.shift();
    return { groupId: id, isNewTemplate };
  }

  /** A snapshot, most recently seen first. Template text is the current one (Drain generalises it over time). */
  groups(): TemplateGroup[] {
    return [...this.groupsById.values()]
      .map((g) => ({ ...g, template: this.drain.templateOf(g.id) ?? g.template }))
      .sort((a, b) => b.lastSeen - a.lastSeen || b.count - a.count);
  }

  get size(): number {
    return this.groupsById.size;
  }

  reset(): void {
    this.drain = new Drain(ROOTRANK_DRAIN);
    this.idOfMasked.clear();
    this.groupsById.clear();
  }
}

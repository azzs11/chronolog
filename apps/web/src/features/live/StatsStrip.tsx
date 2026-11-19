import type { LiveStats } from './stats';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** One slim strip of numbers, instead of a row of big counter cards. */
export default function StatsStrip({ stats }: { stats: LiveStats }) {
  const items: ReadonlyArray<[string, string]> = [
    ['Lines', fmt(stats.lines)],
    ['Per second', stats.perSecond.toFixed(1)],
    ['Errors', fmt(stats.errors)],
    ['Warnings', fmt(stats.warnings)],
    ['Templates', fmt(stats.templates)],
    ['New templates', fmt(stats.newTemplates)],
  ];
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 border-y border-border-dim py-2" aria-label="Stream statistics">
      {items.map(([name, value]) => (
        <div key={name} className="flex items-baseline gap-2">
          <dt className="text-xs text-text-muted">{name}</dt>
          <dd className="tabular text-sm font-medium text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

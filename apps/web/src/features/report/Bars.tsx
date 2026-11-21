/** Horizontal bars on one 0-100% axis. Values are always written out, so colour is never the only cue. */
import { pct } from './grades';

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export interface BarSeries {
  key: string;
  label: string;
  /** A Tailwind background class from the chart tokens. */
  fill: string;
}

export interface BarRowData {
  name: string;
  values: Record<string, number>;
  /** Optional 95% interval for the first series. */
  low?: number | null;
  high?: number | null;
  /** Extra text after the name (case count, grade chip). */
  aside?: React.ReactNode;
  /** Fill for this row's first bar, to pick out ChronoLog among the baselines. */
  fill?: string;
}

function Axis() {
  return (
    <div className="relative h-4 text-[11px] text-text-muted" aria-hidden="true">
      {TICKS.map((t) => (
        <span key={t} className="absolute -translate-x-1/2 tabular" style={{ left: `${t * 100}%` }}>
          {t * 100}%
        </span>
      ))}
    </div>
  );
}

export function Legend({ series }: { series: readonly BarSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-text-secondary" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-sm border border-ink ${s.fill}`} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** One row: the name on top, then one thin bar per series with its value at the end. */
function Row({ row, series }: { row: BarRowData; series: readonly BarSeries[] }) {
  const sentence = series.map((s) => `${s.label} ${pct(row.values[s.key] ?? 0)}`).join(', ');
  return (
    <li className="space-y-1" title={`${row.name}: ${sentence}${row.low != null && row.high != null ? ` (interval ${pct(row.low)} to ${pct(row.high)})` : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
        <span className="font-bold">{row.name}</span>
        {row.aside}
      </div>
      {series.map((s, i) => {
        const v = row.values[s.key] ?? 0;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className="relative h-3.5 flex-1 rounded-md bg-bg-elevated">
              <div className={`absolute inset-y-0 left-0 rounded-r-[4px] border-y border-r border-ink ${i === 0 && row.fill ? row.fill : s.fill}`} style={{ width: `${v * 100}%` }} />
              {i === 0 && row.low != null && row.high != null && (
                <div className="absolute -inset-y-1 border-x-2 border-ink/70" style={{ left: `${row.low * 100}%`, width: `${(row.high - row.low) * 100}%` }} aria-hidden="true">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink/70" />
                </div>
              )}
            </div>
            <span className="tabular w-14 shrink-0 text-right text-xs text-text-secondary">
              <span className="sr-only">{s.label} </span>
              {pct(v)}
            </span>
          </div>
        );
      })}
    </li>
  );
}

export default function Bars({ rows, series, label }: { rows: readonly BarRowData[]; series: readonly BarSeries[]; label: string }) {
  return (
    <div className="space-y-3">
      <Legend series={series} />
      <ul className="space-y-3" aria-label={label}>
        {rows.map((row) => (
          <Row key={row.name} row={row} series={series} />
        ))}
      </ul>
      <div className="flex gap-2">
        <div className="flex-1">
          <Axis />
        </div>
        <span className="w-14 shrink-0" />
      </div>
    </div>
  );
}

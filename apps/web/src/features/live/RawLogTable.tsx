import SeverityPill from '../../app/ui/SeverityPill';
import type { LiveLog } from './stats';

const ROWS_SHOWN = 500;
const timeOf = (ms: number): string => new Date(ms).toISOString().slice(11, 19);

/** The newest lines, one per row: a neutral row with a severity pill. Colour never fills a row. */
export default function RawLogTable({ logs }: { logs: LiveLog[] }) {
  const shown = logs.slice(-ROWS_SHOWN).reverse();
  return (
    <ol aria-label="Raw log lines" className="divide-y divide-border-dim">
      {shown.map((log) => (
        <li key={log.id} className="row-y grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 px-2 md:grid-cols-[5rem_8rem_6rem_1fr]">
          <span className="tabular log-text text-text-muted">{timeOf(log.time)}</span>
          <span className="log-text truncate text-text-secondary">{log.source}</span>
          <span>
            <SeverityPill severity={log.severity} />
          </span>
          <span className="log-text col-span-2 break-words text-text-primary md:col-span-1">{log.message}</span>
        </li>
      ))}
    </ol>
  );
}

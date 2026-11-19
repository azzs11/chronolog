import { SEVERITIES } from '../../app/ui/SeverityPill';
import type { Filters } from './filters';

export type Mode = 'grouped' | 'raw';

/** Severity toggles, a service filter, a search box and the grouped/raw switch, in one quiet row. */
export default function FilterBar({
  filters,
  onChange,
  services,
  mode,
  onMode,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  services: string[];
  mode: Mode;
  onMode: (mode: Mode) => void;
}) {
  const toggle = (severity: string) => {
    const next = new Set(filters.severities);
    if (next.has(severity)) next.delete(severity);
    else next.add(severity);
    onChange({ ...filters, severities: next });
  };
  const control = 'rounded-md border border-border-strong bg-bg-surface px-2 py-1.5 text-sm text-text-primary';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">Severities to show</legend>
        {SEVERITIES.map((severity) => (
          <button
            key={severity}
            type="button"
            aria-pressed={filters.severities.has(severity)}
            onClick={() => toggle(severity)}
            className={`rounded-md border px-2 py-1 text-xs ${
              filters.severities.has(severity) ? 'border-accent bg-bg-elevated text-text-primary' : 'border-border-dim text-text-secondary'
            }`}
          >
            {severity}
          </button>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor="live-service">
        Service
      </label>
      <select id="live-service" className={control} value={filters.service} onChange={(e) => onChange({ ...filters, service: e.target.value })}>
        <option value="">All services</option>
        {services.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="live-search">
        Search messages
      </label>
      <input
        id="live-search"
        type="search"
        placeholder="Search messages"
        className={`${control} w-full min-w-0 md:w-auto md:flex-1`}
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
      />
      <fieldset className="flex rounded-md border border-border-dim">
        <legend className="sr-only">View</legend>
        {(['grouped', 'raw'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onMode(m)}
            className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary'}`}
          >
            {m === 'grouped' ? 'Grouped' : 'Raw'}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

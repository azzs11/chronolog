import type { RoadOptions } from './roads';

/** The road key, and switches for the optional kinds. */
export default function RoadToggles({ options, onChange, hasPrior, hasCorrelations }: { options: RoadOptions; onChange: (o: RoadOptions) => void; hasPrior: boolean; hasCorrelations: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-1 w-5 rounded-full bg-chart-other/60" aria-hidden="true" />
        names it in logs
      </span>
      {hasCorrelations && (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={options.withCorrelations} onChange={(e) => onChange({ ...options, withCorrelations: e.target.checked })} />
          volumes move together (dashed)
        </label>
      )}
      {hasPrior && (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={options.withPrior} onChange={(e) => onChange({ ...options, withPrior: e.target.checked })} />
          show the hand-made map (dotted)
        </label>
      )}
    </div>
  );
}

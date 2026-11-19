import type { TimelineData } from './replays';

const LABEL_WIDTH = 150;
/** Rows and cells grow when there are few services or time buckets, and shrink for 45 services. */
const ROW_HEIGHT_RANGE = [7, 20] as const;
const CELL_WIDTH_RANGE = [6, 18] as const;
const TARGET_HEIGHT = 260;
const TARGET_WIDTH = 560;
const clamp = (value: number, [low, high]: readonly [number, number]): number => Math.min(high, Math.max(low, value));

/**
 * Log volume per service over time: darker means more lines in that half-minute, a red mark means
 * error-level lines. The dashed line is when the incident began. It is here to show how little the
 * logs sometimes change.
 */
export default function Timeline({ timeline, highlight }: { timeline: TimelineData; highlight?: string }) {
  const { services, bucketSeconds, startOffset } = timeline;
  const buckets = services[0]?.lines.length ?? 0;
  const ROW_HEIGHT = Math.round(clamp(TARGET_HEIGHT / Math.max(services.length, 1), ROW_HEIGHT_RANGE));
  const CELL_WIDTH = Math.round(clamp(TARGET_WIDTH / Math.max(buckets, 1), CELL_WIDTH_RANGE));
  const startX = LABEL_WIDTH + ((-startOffset) / bucketSeconds) * CELL_WIDTH;
  const width = LABEL_WIDTH + buckets * CELL_WIDTH;
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={services.length * ROW_HEIGHT + 4} role="img" aria-label="Log volume per service over time, with the incident start marked">
        {services.map((service, row) => {
          const peak = Math.max(...service.lines, 1);
          return (
            <g key={service.name}>
              <text x={LABEL_WIDTH - 6} y={row * ROW_HEIGHT + ROW_HEIGHT - 1} textAnchor="end" fontSize={Math.min(12, ROW_HEIGHT + 1)} style={{ fill: highlight === service.name ? 'var(--accent)' : 'var(--text-muted)' }} fontWeight={highlight === service.name ? 700 : 400}>
                {service.name}
              </text>
              {service.lines.map((count, col) => {
                const at = startOffset + col * bucketSeconds; // seconds from the incident start: a stable id for the cell
                const hasErrors = (service.errors[col] ?? 0) > 0;
                return (
                  <rect
                    key={`${service.name}@${at}`}
                    x={LABEL_WIDTH + col * CELL_WIDTH}
                    y={row * ROW_HEIGHT}
                    width={CELL_WIDTH - 1}
                    height={ROW_HEIGHT - 1}
                    style={{ fill: hasErrors ? 'var(--sev-error)' : 'var(--accent)' }}
                    opacity={hasErrors ? 0.9 : 0.08 + 0.85 * (count / peak)}
                  />
                );
              })}
            </g>
          );
        })}
        <line x1={startX} x2={startX} y1={0} y2={services.length * ROW_HEIGHT} style={{ stroke: 'var(--sev-warning)' }} strokeDasharray="3 2" />
      </svg>
    </div>
  );
}

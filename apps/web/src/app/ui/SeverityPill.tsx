/** The names of the five severities and how each one is drawn as a sticker. */
export const SEVERITIES = ['critical', 'error', 'warning', 'info', 'debug'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Each level has its own pastel AND its own shape, so it reads in greyscale and for colour-blind
 * readers: critical = diamond, error = square, warning = triangle, info = circle, debug = ring.
 */
const LOOK: Record<Severity, { fill: string; shape: string }> = {
  critical: { fill: 'bg-sev-critical-bg', shape: 'h-2 w-2 rotate-45 bg-on-pastel' },
  error: { fill: 'bg-sev-error-bg', shape: 'h-2 w-2 bg-on-pastel' },
  warning: { fill: 'bg-sev-warning-bg', shape: 'h-2 w-2.5 bg-on-pastel [clip-path:polygon(50%_0,100%_100%,0_100%)]' },
  info: { fill: 'bg-sev-info-bg', shape: 'h-2 w-2 rounded-full bg-on-pastel' },
  debug: { fill: 'bg-sev-debug-bg', shape: 'h-2 w-2 rounded-full border-2 border-on-pastel' },
};

const isSeverity = (value: string): value is Severity => (SEVERITIES as readonly string[]).includes(value);

/** A severity as a small pastel sticker: a shape and the level's name, always written out. */
export default function SeverityPill({ severity }: { severity: string }) {
  const look = isSeverity(severity) ? LOOK[severity] : LOOK.debug;
  return (
    <span className={`chip ${look.fill}`}>
      <span className={`inline-block shrink-0 ${look.shape}`} aria-hidden="true" />
      {severity}
    </span>
  );
}

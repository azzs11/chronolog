/** The names of the five severities and the token each one uses as its signal colour. */
export const SEVERITIES = ['critical', 'error', 'warning', 'info', 'debug'] as const;
export type Severity = (typeof SEVERITIES)[number];

const SIGNAL: Record<Severity, { dot: string; text: string }> = {
  critical: { dot: 'bg-sev-critical', text: 'text-sev-critical' },
  error: { dot: 'bg-sev-error', text: 'text-sev-error' },
  warning: { dot: 'bg-sev-warning', text: 'text-sev-warning' },
  info: { dot: 'bg-sev-info', text: 'text-sev-info' },
  debug: { dot: 'bg-sev-debug', text: 'text-sev-debug' },
};

const isSeverity = (value: string): value is Severity => (SEVERITIES as readonly string[]).includes(value);

/**
 * A severity as a small pill: a coloured dot and the level's name, on a neutral background. The name
 * is always written out, so the level never depends on colour alone.
 */
export default function SeverityPill({ severity }: { severity: string }) {
  const style = isSeverity(severity) ? SIGNAL[severity] : SIGNAL.debug;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border border-border-dim px-1.5 py-0.5 text-xs ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {severity}
    </span>
  );
}

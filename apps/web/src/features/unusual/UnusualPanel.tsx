import type { UnusualTemplate } from '@chronolog/engine';
import { CiteChip } from '../incidents/EvidenceBubbles';
import { REPORT_CARD } from '../report/reportCard';

const f1Of = (dataset: string, method: string): number | undefined =>
  REPORT_CARD.anomaly.find((d) => d.dataset === dataset)?.methods.find((m) => m.name === method)?.f1;

const pct = (x: number | undefined) => (x === undefined ? '?' : `${(100 * x).toFixed(1)}%`);

/** One honest sentence about how good this signal is, from the generated benchmark numbers. */
export function unusualCaveat(): string {
  const ours = f1Of('BGL', 'Unusual messages (new)');
  const rule = f1Of('BGL', 'Severity rule');
  return `Clues, not alerts: on Loghub BGL this signal scores F1 ${pct(ours)}, below a plain "flag error lines" rule (${pct(rule)}).`;
}

interface Props {
  templates: UnusualTemplate[];
  isOnlyNewTemplates: boolean;
}

/** Messages that are rare or new in the last 5 minutes versus the hour before, with the lines behind them. */
export default function UnusualPanel({ templates, isOnlyNewTemplates }: Props) {
  return (
    <details className="card-flat text-sm">
      <summary className="cursor-pointer font-medium text-text-primary">
        Unusual messages, last 5 minutes ({templates.length})
      </summary>
      <p className="mt-2 text-xs text-text-muted">
        {isOnlyNewTemplates ? 'Too little history to call anything rare, so only messages never seen in the hour before are listed. ' : ''}
        {unusualCaveat()}
      </p>
      {templates.length === 0 ? (
        <p className="mt-2 text-text-secondary">Nothing unusual: every recent message also appeared in the hour before.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {templates.map((t) => (
            <li key={t.template} className="space-y-1">
              <code className="log-text break-all text-text-primary">{t.template}</code>
              <p className="text-xs text-text-secondary">
                {t.count}× from {t.services.join(', ')}; {t.baselineCount === 0 ? 'never seen in the hour before' : `${t.baselineCount}× in the hour before`}
              </p>
              <div className="flex flex-wrap gap-1">
                {t.lineIds.map((id) => (
                  <CiteChip key={id} id={id} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

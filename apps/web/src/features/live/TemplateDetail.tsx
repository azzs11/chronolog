import type { TemplateGroup } from '@chronolog/engine';
import SeverityPill, { SEVERITIES } from '../../app/ui/SeverityPill';
import TemplateText from './TemplateText';
import { formatAgo } from './stats';

/** Everything known about one template: how often, where, at which severities, and recent examples. */
export default function TemplateDetail({ group, nowSeconds, isNew }: { group: TemplateGroup; nowSeconds: number; isNew: boolean }) {
  const services = Object.entries(group.byService).sort((a, b) => b[1] - a[1]);
  const severities = SEVERITIES.filter((s) => group.bySeverity[s]);
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <h3 className="text-base font-semibold text-text-primary">
          <TemplateText template={group.template} />
        </h3>
        <p className="text-sm text-text-secondary">
          {group.count.toLocaleString('en-US')} lines. First seen {formatAgo(nowSeconds - group.firstSeen)}, last seen {formatAgo(nowSeconds - group.lastSeen)}.
          {isNew && ' This message first appeared after you opened the page.'}
        </p>
      </header>

      <section aria-label="Severities">
        <h4 className="mb-1 text-xs text-text-muted">By severity</h4>
        <ul className="flex flex-wrap gap-2">
          {severities.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <SeverityPill severity={s} />
              <span className="tabular text-sm text-text-secondary">{(group.bySeverity[s] ?? 0).toLocaleString('en-US')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Services">
        <h4 className="mb-1 text-xs text-text-muted">By service</h4>
        <ul className="space-y-1 text-sm">
          {services.map(([name, count]) => (
            <li key={name} className="flex justify-between gap-4">
              <span className="font-mono text-text-primary">{name}</span>
              <span className="tabular text-text-secondary">{count.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Recent examples">
        <h4 className="mb-1 text-xs text-text-muted">Most recent examples</h4>
        <pre className="log-text overflow-x-auto rounded-md border border-border-dim bg-bg-surface p-3 text-text-primary">{[...group.samples].reverse().join('\n')}</pre>
      </section>
    </article>
  );
}

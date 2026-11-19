import type { TemplateGroup } from '@chronolog/engine';
import { type KeyboardEvent, useRef } from 'react';
import SeverityPill from '../../app/ui/SeverityPill';
import TemplateText from './TemplateText';
import { formatAgo } from './stats';

const SERVICES_SHOWN = 2;

/**
 * Message templates, most recently seen first: each row is one kind of message, with how often it
 * happened. Each row is a button; arrow keys or j/k also move through the list. The chosen row opens
 * in the detail pane and is marked with aria-current.
 */
export default function TemplateList({
  groups,
  baseline,
  selectedId,
  onSelect,
  nowSeconds,
}: {
  groups: TemplateGroup[];
  baseline: ReadonlySet<number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  nowSeconds: number;
}) {
  const list = useRef<HTMLUListElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const step = event.key === 'ArrowDown' || event.key === 'j' ? 1 : event.key === 'ArrowUp' || event.key === 'k' ? -1 : 0;
    if (step === 0 || groups.length === 0) return;
    event.preventDefault();
    const current = groups.findIndex((g) => g.id === selectedId);
    const next = Math.min(groups.length - 1, Math.max(0, (current < 0 ? (step > 0 ? -1 : 1) : current) + step));
    onSelect((groups[next] as TemplateGroup).id);
  };

  return (
    <ul ref={list} aria-label="Message templates" onKeyDown={onKeyDown} className="divide-y divide-border-dim">
      {groups.map((group) => {
        const services = Object.keys(group.byService);
        const isNew = !baseline.has(group.id);
        return (
          <li key={group.id}>
            <button
              type="button"
              aria-current={group.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(group.id)}
              className={`row-y flex w-full flex-col gap-1 px-2 text-left ${group.id === selectedId ? 'bg-bg-elevated' : 'hover:bg-bg-surface'}`}
            >
              <span className="flex items-center gap-2">
                <SeverityPill severity={group.highestSeverity} />
                {isNew && <span className="rounded border border-accent px-1.5 py-0.5 text-xs text-accent">new</span>}
                <span className="tabular ml-auto text-sm text-text-primary">{group.count.toLocaleString('en-US')}×</span>
              </span>
              <span className="text-text-primary">
                <TemplateText template={group.template} />
              </span>
              <span className="text-xs text-text-muted">
                {services.slice(0, SERVICES_SHOWN).join(', ')}
                {services.length > SERVICES_SHOWN && ` +${services.length - SERVICES_SHOWN}`} · {formatAgo(nowSeconds - group.lastSeen)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

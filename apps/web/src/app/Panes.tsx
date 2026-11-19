import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * A list on the left and a detail pane on the right, side by side on wide screens. On a phone only
 * one shows at a time: the list, or (once something is chosen) the detail with a Back button.
 */
export default function Panes({
  list,
  detail,
  onBack,
  detailLabel = 'Details',
}: {
  list: ReactNode;
  detail: ReactNode | null;
  onBack: () => void;
  detailLabel?: string;
}) {
  const hasDetail = detail !== null;
  return (
    <div className="flex h-full min-h-0 gap-4">
      <section aria-label="List" className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${hasDetail ? 'hidden md:block md:max-w-xl' : ''}`}>
        {list}
      </section>
      {hasDetail && (
        <section aria-label={detailLabel} className="min-h-0 min-w-0 flex-[1.4] overflow-y-auto md:border-l md:border-border-dim md:pl-4">
          <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary md:hidden">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          {detail}
        </section>
      )}
    </div>
  );
}

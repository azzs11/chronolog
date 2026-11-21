import Tock from '../../app/critters/Tock';
import type { RankedCause } from '../rootrank/api';
import { evidenceClaims } from '../rootrank/format';

const SHORT_ID = 8;
/** Ids like "api.log:42" (from the drop zone) are short and meaningful, so they are shown whole. */
const isFileLine = (id: string): boolean => /:\d+$/.test(id);

/** A log id as a small chip; the full id is in the tooltip and for screen readers. */
export function CiteChip({ id }: { id: string }) {
  return (
    <code title={`Log ${id}`} className="inline-block rounded-md border border-ink bg-pastel-sky px-1 text-xs text-on-pastel">
      <span aria-hidden="true">{isFileLine(id) ? id : `#${id.slice(0, SHORT_ID)}`}</span>
      <span className="sr-only">log {id}</span>
    </code>
  );
}

/**
 * Tock reads out the evidence for one suspect, one speech bubble per claim, each with the log ids it
 * rests on. Every sentence comes from evidenceClaims (engine fields only). A claim without a citation
 * is labelled as such, never dressed up as cited.
 */
export default function EvidenceBubbles({ cause }: { cause: RankedCause }) {
  const claims = evidenceClaims(cause);
  return (
    <div className="flex items-start gap-3">
      <Tock size={52} />
      <ul className="min-w-0 flex-1 space-y-2">
        {claims.map((claim) => (
          <li key={claim.text} className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">
            <p>{claim.text}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-text-muted">
              {claim.cites.length > 0 ? (
                <>
                  <span>From</span>
                  {claim.cites.map((id) => (
                    <CiteChip key={id} id={id} />
                  ))}
                </>
              ) : (
                <span>{claim.isAbsence ? 'Nothing to cite: this is about what did not happen.' : 'These lines carry no ids to cite.'}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

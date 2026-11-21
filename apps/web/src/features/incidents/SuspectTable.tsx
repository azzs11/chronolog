import { suspectMood } from '@chronolog/engine';
import { MOOD_LOOK } from '../../app/critters/looks';
import type { RankedCause } from '../rootrank/api';
import { confidenceWord } from '../rootrank/format';

/** Every candidate as a table row, for the Pro lens: the lineup's numbers without the podium. */
export default function SuspectTable({ candidates, selected, onSelect }: { candidates: readonly RankedCause[]; selected: string | null; onSelect: (s: string) => void }) {
  return (
    <div className="lens-pro overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Suspects, ranked by RootRank</caption>
        <thead className="text-xs uppercase tracking-wide text-text-muted">
          <tr className="border-b border-border-dim">
            <th className="row-y pr-3 font-semibold">#</th>
            <th className="row-y pr-3 font-semibold">Service</th>
            <th className="row-y pr-3 font-semibold">Weight</th>
            <th className="row-y pr-3 font-semibold">Errors</th>
            <th className="row-y pr-3 font-semibold">New messages</th>
            <th className="row-y pr-3 font-semibold">Named by others</th>
            <th className="row-y font-semibold">Face</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.service} className={`border-b border-border-dim ${c.service === selected ? 'bg-bg-elevated' : ''}`}>
              <td className="row-y tabular pr-3">{c.rank}</td>
              <td className="row-y pr-3">
                <button type="button" className="font-mono underline decoration-dotted" aria-current={c.service === selected ? 'true' : undefined} onClick={() => onSelect(c.service)}>
                  {c.service}
                </button>
              </td>
              <td className="row-y tabular pr-3">
                {confidenceWord(c.weight, c.rank)}, {c.weight.toFixed(2)}
              </td>
              <td className="row-y tabular pr-3">{c.evidence.errorLines}</td>
              <td className="row-y tabular pr-3">{c.evidence.novelTemplates.length}</td>
              <td className="row-y tabular pr-3">{c.evidence.mentions}</td>
              <td className="row-y">{MOOD_LOOK[suspectMood(c.evidence)].label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

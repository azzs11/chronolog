import { suspectMood } from '@chronolog/engine';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';
import type { RankedCause } from '../rootrank/api';
import { confidenceWord } from '../rootrank/format';

/** The lineup shows the top three side by side; everyone else is a compact list under it. */
export const LINEUP_SIZE = 3;
const CREATURE_SIZE = { lead: 84, other: 60 } as const;
/** On wide screens the leader stands in the middle, like a podium; on phones they simply stack 1, 2, 3. */
const PODIUM_ORDER: Record<number, string> = { 1: 'sm:order-2', 2: 'sm:order-1', 3: 'sm:order-3' };

interface LineupProps {
  candidates: readonly RankedCause[];
  selected: string | null;
  onSelect: (service: string) => void;
}

function Suspect({ cause, isSelected, onSelect }: { cause: RankedCause; isSelected: boolean; onSelect: () => void }) {
  const isLead = cause.rank === 1;
  const mood = suspectMood(cause.evidence);
  const word = confidenceWord(cause.weight, cause.rank);
  return (
    <li className={`flex min-w-0 flex-col justify-end ${PODIUM_ORDER[cause.rank] ?? ''}`}>
      <button
        type="button"
        aria-current={isSelected ? 'true' : undefined}
        onClick={onSelect}
        className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left sm:flex-col sm:gap-1.5 sm:px-2 sm:pb-3 sm:text-center ${
          isLead ? 'bg-pastel-butter text-on-pastel sm:pt-3' : 'bg-bg-surface sm:pt-6'
        } ${isSelected ? 'border-ink shadow-sticker' : 'border-border-dim hover:border-ink'}`}
      >
        <span className="w-8 shrink-0 font-display text-xl sm:w-auto">#{cause.rank}</span>{' '}
        <Critter name={cause.service} mood={mood} size={isLead ? CREATURE_SIZE.lead : CREATURE_SIZE.other} decorative className="h-12 w-12 sm:h-auto sm:w-auto" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:w-full sm:items-center">
          <span className="w-full truncate font-mono text-sm font-bold">{cause.service}</span>{' '}
          <span className="h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-bg-surface" aria-hidden="true">
            <span className="block h-full bg-accent-solid" style={{ width: `${Math.round(cause.weight * 100)}%` }} />
          </span>
          <span className="flex flex-wrap items-center gap-2 text-xs sm:justify-center">
            <span>
              {word}, {cause.weight.toFixed(2)}
            </span>{' '}
            <span className={`chip ${MOOD_LOOK[mood].chip}`}>{MOOD_LOOK[mood].label}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * RootRank's ranking as a police lineup. Order and bar length are the model's; the faces come from
 * each suspect's own evidence in the incident window (suspectMood), so a calm-looking suspect can
 * still rank first.
 */
export default function SuspectLineup({ candidates, selected, onSelect }: LineupProps) {
  const lineup = candidates.slice(0, LINEUP_SIZE);
  return (
    <ol aria-label="Suspect lineup" className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      {lineup.map((cause) => (
        <Suspect key={cause.service} cause={cause} isSelected={cause.service === selected} onSelect={() => onSelect(cause.service)} />
      ))}
    </ol>
  );
}

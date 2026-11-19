import type { RankedCause } from './api';
import { confidenceWord, evidenceSentences } from './format';

/** One ranked service: its rank, a word and number for how strongly it is favoured, and the evidence. */
export default function CandidateCard({ cause, highlight }: { cause: RankedCause; highlight?: boolean }) {
  const word = confidenceWord(cause.weight, cause.rank);
  return (
    <li className={`card ${highlight ? 'border-l-4 border-l-accent' : ''}`} data-testid="candidate">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-accent-secondary w-6">{cause.rank}</span>
        <span className="font-mono text-text-primary flex-1">{cause.service}</span>
        <span className="text-sm text-text-secondary">
          {word}, {cause.weight.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 rounded bg-bg-base mt-2" aria-hidden="true">
        <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round(cause.weight * 100)}%` }} />
      </div>
      <ul className="mt-3 space-y-1 text-sm text-text-secondary list-disc pl-5">
        {evidenceSentences(cause).map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
    </li>
  );
}


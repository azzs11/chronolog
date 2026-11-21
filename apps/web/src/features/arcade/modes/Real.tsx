import { useEffect, useState } from 'react';
import { loadRealCases, puzzleOf, type RealCaseBundle, SYSTEM_NAMES } from '../../realcases/data';
import { EMPTY_PLAY, isOver, isSolved } from '../game';
import GameCase from '../GameCase';
import { usePlays } from '../store';
import { ModeBar } from './common';
import Panel from './Panel';

export const REAL_KEY = 'chronolog.realcases.v2';

/** Real incidents from three open-source shops (RCAEval). Tock never trained on these services. */
export default function Real({ onHome, fetcher = fetch }: { onHome: () => void; fetcher?: typeof fetch }) {
  const [bundle, setBundle] = useState<RealCaseBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [plays, save] = usePlays(REAL_KEY);
  useEffect(() => {
    loadRealCases(fetcher).then(setBundle, (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the real cases.'));
  }, [fetcher]);

  if (error) return <p role="alert" className="card text-sm">{error}</p>;
  if (!bundle) return <p className="font-pixel text-text-muted">LOADING REAL INCIDENTS…</p>;
  const solved = bundle.cases.filter((c) => isSolved(plays[c.caseId] ?? EMPTY_PLAY, c.truth)).length;
  const tockRight = bundle.cases.filter((c) => c.tockGuess === c.truth).length;
  const score = `YOU ${solved} · TOCK ${tockRight} / ${bundle.cases.length}`;
  const current = index === null ? null : bundle.cases[index];

  if (!current || index === null) {
    return (
      <div className="space-y-4">
        <ModeBar title="REAL SYSTEMS" onHome={onHome}>
          <span className="font-pixel text-text-secondary">{score}</span>
        </ModeBar>
        <Panel
          title="PICK A CASE"
          tock={`Real logs from three open-source shops, with real faults injected (${bundle.source}). I never trained on these services and get ${tockRight} of ${bundle.cases.length} right on my first guess. Your turn.`}
        >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5" aria-label="Real cases">
          {bundle.cases.map((c, i) => {
            const p = plays[c.caseId] ?? EMPTY_PLAY;
            const mark = isSolved(p, c.truth) ? '✓' : isOver(p, c.truth) ? '✗' : '';
            return (
              <li key={c.caseId}>
                <button type="button" onClick={() => setIndex(i)} className={`px-btn w-full text-left ${mark === '✓' ? 'bg-pastel-mint' : mark === '✗' ? 'bg-pastel-pink' : 'bg-[color:var(--arcade-text)]'}`}>
                  <span className="block text-lg">
                    #{i + 1} {mark}
                  </span>
                  <span className="block font-sans text-xs">
                    {SYSTEM_NAMES[c.system]} · {c.services.length} services
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </Panel>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ModeBar title={`REAL SYSTEMS · CASE ${index + 1}`} onHome={() => setIndex(null)}>
        <span className="font-pixel text-text-secondary">{SYSTEM_NAMES[current.system]}</span>
      </ModeBar>
      <GameCase
        key={current.caseId}
        data={puzzleOf(current)}
        caseLabel={`REAL ${index + 1}`}
        play={plays[current.caseId] ?? EMPTY_PLAY}
        onPlay={(p) => save(current.caseId, p)}
        score={score}
        intro={`A real incident in ${SYSTEM_NAMES[current.system]}: ${current.services.length} services. Same tools as always. I never trained on these services, so this is a fair fight.`}
        actions={
          <>
            {index + 1 < bundle.cases.length && (
              <button type="button" className="px-btn bg-pastel-butter" onClick={() => setIndex(index + 1)}>
                NEXT CASE ▶
              </button>
            )}
            <button type="button" className="px-btn bg-pastel-lilac" onClick={() => setIndex(null)}>
              ALL CASES
            </button>
            <p className="w-full font-sans text-xs text-[color:var(--arcade-dim)]">
              {bundle.modelNote}. Case {current.caseId}.
            </p>
          </>
        }
      />
    </div>
  );
}

import { useState } from 'react';
import PlaygroundView from './PlaygroundView';
import ReplayView from './ReplayView';

type Tab = 'simulated' | 'real';

/** The playground's two halves: faults we simulate, and real incidents we replay. */
export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>('simulated');
  const tabClass = (t: Tab): string =>
    `rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${tab === t ? 'border-ink bg-pastel-butter text-on-pastel shadow-sticker-sm' : 'border-transparent text-text-secondary hover:text-text-primary'}`;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Playground mode" className="flex flex-wrap gap-2">
        <button type="button" role="tab" aria-selected={tab === 'simulated'} className={tabClass('simulated')} onClick={() => setTab('simulated')}>
          Simulated faults
        </button>
        <button type="button" role="tab" aria-selected={tab === 'real'} className={tabClass('real')} onClick={() => setTab('real')}>
          Real incidents
        </button>
      </div>
      {tab === 'simulated' ? <PlaygroundView /> : <ReplayView />}
    </div>
  );
}

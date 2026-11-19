import { useState } from 'react';
import PlaygroundView from './PlaygroundView';
import ReplayView from './ReplayView';

type Tab = 'simulated' | 'real';

/** The playground's two halves: faults we simulate, and real incidents we replay. */
export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>('simulated');
  const tabClass = (t: Tab): string =>
    `px-3 py-2 text-sm border-b-2 ${tab === t ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary'}`;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Playground mode" className="flex gap-2 border-b border-border-dim">
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

import { useState } from 'react';
import DailyCase from '../daily/DailyCase';
import DropZone from '../dropzone/DropZone';
import PlaygroundView from './PlaygroundView';
import ReplayView from './ReplayView';

type Tab = 'daily' | 'simulated' | 'real' | 'yours';

const TABS: readonly Tab[] = ['daily', 'simulated', 'real', 'yours'];
/** The tab named in ?tab=, so the palette and links can open a game directly. Works without a router (static demo). */
function tabFromUrl(): Tab {
  const asked = new URLSearchParams(window.location.search).get('tab');
  return TABS.find((t) => t === asked) ?? 'daily';
}

/** The Arcade: today's puzzle, faults you break yourself, and real incidents replayed. */
export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const tabClass = (t: Tab): string =>
    `rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${tab === t ? 'border-ink bg-pastel-butter text-on-pastel shadow-sticker-sm' : 'border-transparent text-text-secondary hover:text-text-primary'}`;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Playground mode" className="flex flex-wrap gap-2">
        <button type="button" role="tab" aria-selected={tab === 'daily'} className={tabClass('daily')} onClick={() => setTab('daily')}>
          Daily case
        </button>
        <button type="button" role="tab" aria-selected={tab === 'simulated'} className={tabClass('simulated')} onClick={() => setTab('simulated')}>
          Simulated faults
        </button>
        <button type="button" role="tab" aria-selected={tab === 'real'} className={tabClass('real')} onClick={() => setTab('real')}>
          Real incidents
        </button>
        <button type="button" role="tab" aria-selected={tab === 'yours'} className={tabClass('yours')} onClick={() => setTab('yours')}>
          Your logs
        </button>
      </div>
      {tab === 'daily' ? <DailyCase /> : tab === 'simulated' ? <PlaygroundView /> : tab === 'real' ? <ReplayView /> : <DropZone />}
    </div>
  );
}

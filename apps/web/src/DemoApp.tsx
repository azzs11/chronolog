import Tock from './app/critters/Tock';
import Onboarding, { shouldShowIntro } from './app/onboarding/Onboarding';
import { usePreferences } from './app/preferences';
import { useState } from 'react';
import ArcadePage from './features/arcade/ArcadePage';
import DropZone from './features/dropzone/DropZone';

const REPO_URL = 'https://github.com/azzs11/chronolog';

type DemoView = 'arcade' | 'files';

/**
 * The static demo (built with VITE_DEMO=true): the Arcade and the log-file analyser, no backend, no
 * socket. Everything, including the engine, runs in the visitor's browser.
 */
export default function DemoApp() {
  usePreferences(); // applies the saved or system theme
  const [isIntroOpen, setIntroOpen] = useState(shouldShowIntro);
  const [view, setView] = useState<DemoView>('arcade');
  const tab = (v: DemoView): string =>
    `rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${view === v ? 'border-ink bg-pastel-butter text-on-pastel shadow-sticker-sm' : 'border-transparent text-text-secondary'}`;
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <header className="flex items-center justify-between gap-3 border-b-2 border-ink bg-bg-surface px-4 py-3">
        <span className="flex items-center gap-2">
          <Tock size={32} />
          <span className="font-display text-xl">ChronoLog</span>
        </span>
        <a className="text-sm underline text-text-secondary" href={REPO_URL}>
          Source, benchmark and self-hosting
        </a>
      </header>
      {isIntroOpen && <Onboarding onFinish={() => setIntroOpen(false)} />}
      <nav aria-label="Demo" className="flex gap-2 px-4 pt-4">
        <button type="button" aria-pressed={view === 'arcade'} className={tab('arcade')} onClick={() => setView('arcade')}>
          Arcade
        </button>
        <button type="button" aria-pressed={view === 'files'} className={tab('files')} onClick={() => setView('files')}>
          Analyse your logs
        </button>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">{view === 'arcade' ? <ArcadePage /> : <DropZone />}</main>
    </div>
  );
}

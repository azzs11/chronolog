import Tock from './app/critters/Tock';
import { usePreferences } from './app/preferences';
import PlaygroundPage from './features/playground/PlaygroundPage';

const REPO_URL = 'https://github.com/azzs11/chronolog';

/**
 * The static demo (built with VITE_DEMO=true): just the Fault Playground, no backend, no socket.
 * Everything, including the engine, runs in the visitor's browser.
 */
export default function DemoApp() {
  usePreferences(); // applies the saved or system theme
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
      <main className="mx-auto max-w-3xl px-4 py-6">
        <PlaygroundPage />
      </main>
    </div>
  );
}

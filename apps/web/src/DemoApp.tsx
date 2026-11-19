import PlaygroundPage from './features/playground/PlaygroundPage';

const REPO_URL = 'https://github.com/azzs11/chronolog';

/**
 * The static demo (built with VITE_DEMO=true): just the Fault Playground, no backend, no socket.
 * Everything, including the engine, runs in the visitor's browser.
 */
export default function DemoApp() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <header className="border-b border-border-dim px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">ChronoLog</span>
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

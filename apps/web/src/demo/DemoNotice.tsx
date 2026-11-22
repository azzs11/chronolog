import { FAULTS } from '@chronolog/engine';
import { useState } from 'react';
import { demoBackend } from './instance';

const REPO_URL = 'https://github.com/azzs11/chronolog';

/**
 * Says, on every view, that the data is simulated: this page has no backend, so the incidents, town and
 * live stream come from the engine's simulator running in the browser. The answer key is behind a
 * click so it does not spoil the case file.
 */
export default function DemoNotice() {
  const [, setOpened] = useState(0); // re-read on open: an injected incident adds to the key
  const known = demoBackend.world.known;
  return (
    <aside aria-label="About this demo" className="mx-4 mt-3 rounded-xl border-2 border-ink bg-pastel-sky px-3 py-2 text-sm text-on-pastel md:mx-6">
      <strong>Demo with simulated logs.</strong> A six-service shop runs in your browser (no backend, nothing uploaded). The simulator is easier than real
      systems: see the Report card for real benchmark scores. <a className="font-bold underline" href={REPO_URL}>Self-host it on your own logs</a>.
      <details className="mt-1" onToggle={() => setOpened((n) => n + 1)}>
        <summary className="cursor-pointer font-bold">Answer key (spoilers)</summary>
        <ul className="mt-1 list-disc pl-5">
          {known.map((k) => (
            <li key={`${k.service}-${k.start}`}>
              {new Date(k.start * 1000).toLocaleTimeString()}: <span className="font-mono">{k.service}</span> had a {FAULTS[k.fault].label.toLowerCase()} fault.
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

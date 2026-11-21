import { MOODS } from '@chronolog/engine';
import { useState } from 'react';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';

const STORAGE_KEY = 'chronolog.townGuide.v1';
/** Example names, so the legend shows a few different creatures. */
const EXAMPLES = ['checkout', 'search', 'payments', 'inventory', 'emails', 'login'];

function isOpenByDefault(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** "How to read the town": the faces, the roads and what to do next, for anyone seeing this for the first time. */
export default function TownGuide() {
  const [isOpen, setOpen] = useState(isOpenByDefault);
  return (
    <details
      open={isOpen}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(open);
        try {
          localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
        } catch {
          // remembered only while storage works
        }
      }}
      className="card space-y-3"
    >
      <summary className="cursor-pointer font-display text-lg text-text-primary">How to read the town</summary>
      <div className="space-y-4 pt-2 text-sm text-text-secondary">
        <p>
          Each creature is one of your <b className="text-text-primary">services</b> (an app, an API, a database). Its look comes from its name, so the same
          service always looks the same. Its <b className="text-text-primary">face</b> shows how its logs look right now, compared with the 15 minutes before:
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="What the faces mean">
          {MOODS.map((mood, i) => (
            <li key={mood} className="flex items-center gap-3 rounded-2xl border-2 border-border-dim p-2">
              <Critter name={EXAMPLES[i] ?? 'service'} mood={mood} size={44} decorative />
              <span>
                <span className={`chip ${MOOD_LOOK[mood].chip}`}>{MOOD_LOOK[mood].label}</span>
                <span className="mt-1 block">{MOOD_LOOK[mood].meaning}</span>
              </span>
            </li>
          ))}
        </ul>
        <p>
          <b className="text-text-primary">Roads</b> join services that seem to work together. A solid road means one service&apos;s logs name the other (for
          example &ldquo;timeout calling db&rdquo;). Tick &ldquo;volumes move together&rdquo; for dashed roads between services whose log volume rises and falls at
          the same time. Roads are guessed from the logs, so they are a hint, not your real architecture.
        </p>
        <p>
          <b className="text-text-primary">Faces are symptoms, not causes.</b> A slow database can look fine while the services calling it get sick. When something
          breaks, open <b className="text-text-primary">Incidents</b>: the case file ranks the suspects, shows the log lines behind each claim, and lets you
          replay it with Rewind.
        </p>
      </div>
    </details>
  );
}

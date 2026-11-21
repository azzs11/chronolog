import '@fontsource-variable/pixelify-sans';
import { type ComponentType, useState } from 'react';
import Daily from './modes/Daily';
import Home, { type Mode } from './modes/Home';
import Real from './modes/Real';
import Sandbox from './modes/Sandbox';
import Training from './modes/Training';
import { STAGES } from './training';

const MODES: readonly Mode[] = ['training', 'daily', 'real', 'team', 'sandbox'];
/** Older links used ?tab=; they still land in the right place. */
const OLD_TABS: Record<string, Mode> = { daily: 'daily', simulated: 'sandbox', real: 'real' };

function modeFromUrl(): Mode | null {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get('mode') ?? OLD_TABS[params.get('tab') ?? ''] ?? null;
  return MODES.find((m) => m === asked) ?? null;
}

/** ?stage=1-3 opens that Training stage (for links from docs and the app). */
function stageFromUrl(): number {
  const asked = new URLSearchParams(window.location.search).get('stage');
  return Math.max(0, STAGES.findIndex((s) => s.id === asked));
}

interface ArcadeProps {
  /** Opens a place in the app ("see it in ChronoLog"); absent in the static demo. */
  onOpenApp?: (path: string) => void;
  /**
   * Team drills need the backend, so the app passes the screen in and the static demo does not: that
   * keeps the HTTP client out of the demo's bundle.
   */
  Team?: ComponentType<{ onHome: () => void }>;
}

/**
 * The Arcade: ChronoLog's training mode. A world map of five modes, each one case at a time on a
 * 16-bit game screen. Pixelify Sans is loaded here only, so the rest of the app never fetches it.
 */
export default function ArcadePage({ onOpenApp, Team }: ArcadeProps) {
  const [mode, setMode] = useState<Mode | null>(modeFromUrl);
  const [stage, setStage] = useState(stageFromUrl);
  const home = () => setMode(null);
  return (
    <div className="mx-auto max-w-5xl">
      {mode === null && <Home onOpen={setMode} hasTeam={Team !== undefined} />}
      {mode === 'training' && <Training stage={stage} onStage={setStage} onHome={home} onOpenApp={onOpenApp} />}
      {mode === 'daily' && <Daily onHome={home} />}
      {mode === 'real' && <Real onHome={home} />}
      {mode === 'team' && Team && <Team onHome={home} />}
      {mode === 'sandbox' && <Sandbox onHome={home} />}
    </div>
  );
}

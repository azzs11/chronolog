import { dailyCase, utcDate } from '@chronolog/engine';
import type { Look } from '../../../app/critters/looks';
import { TOCK_LOOK } from '../../../app/critters/Tock';
import { isFinished, loadHistory, statsOf } from '../../daily/record';
import Dialog from '../Dialog';
import { EMPTY_PLAY, starsFor } from '../game';
import PixelCritter from '../PixelCritter';
import { usePlays } from '../store';
import { STAGES } from '../training';
import { REAL_KEY } from './Real';
import { TRAINING_KEY } from './Training';

export type Mode = 'training' | 'daily' | 'real' | 'team' | 'sandbox';

interface Node {
  mode: Mode;
  number: string;
  title: string;
  status: string;
  who: string;
  look?: Look;
}

/** The Arcade's home: a world map of the modes, with Training first so newcomers learn before they are tested. */
export default function Home({ onOpen, hasTeam, today = utcDate(Date.now()) }: { onOpen: (mode: Mode) => void; hasTeam: boolean; today?: string }) {
  const [training] = usePlays(TRAINING_KEY);
  const [real] = usePlays(REAL_KEY);
  const stars = STAGES.reduce((n, s) => n + starsFor(training[s.id] ?? EMPTY_PLAY, s.service), 0);
  const isNew = Object.keys(training).length === 0;
  const history = loadHistory();
  const day = dailyCase(today);
  const daily = history[today];
  const realPlayed = Object.values(real).filter((p) => p.guesses.length > 0).length;
  const nodes: Node[] = [
    { mode: 'training', number: '1', title: 'TRAINING TOWN', status: isNew ? 'START HERE' : `★ ${stars} / ${STAGES.length * 3}`, who: 'Tock', look: TOCK_LOOK },
    { mode: 'daily', number: '2', title: `DAILY CASE #${day.number}`, status: isFinished(daily) ? (daily?.isSolved ? 'SOLVED TODAY ✓' : 'TRY AGAIN TOMORROW') : `STREAK ${statsOf(history, today).streak}`, who: 'catalog' },
    { mode: 'real', number: '3', title: 'REAL SYSTEMS', status: realPlayed > 0 ? `${realPlayed} PLAYED` : '30 REAL INCIDENTS', who: 'checkoutservice' },
    ...(hasTeam ? [{ mode: 'team' as const, number: '★', title: 'YOUR TEAM', status: 'DRILLS FROM YOUR INCIDENTS', who: 'payments' }] : []),
    { mode: 'sandbox', number: '∞', title: 'SANDBOX', status: 'BREAK SOMETHING', who: 'db' },
  ];
  const intro = isNew
    ? 'Welcome to the Arcade! Here you learn to find what broke, the way ChronoLog does. New here? Start with Training Town: three short cases.'
    : 'Back again! Today’s Daily Case is waiting, and the real incidents are tougher than they look.';

  return (
    <div className="arcade-cabinet">
      <div className="arcade-screen" data-scanlines="on">
        <div className="bg-[color:var(--arcade-deep)] px-4 py-3 text-center text-2xl tracking-widest text-[color:var(--arcade-gold)] sm:text-3xl">CHRONOLOG ARCADE</div>
        <nav aria-label="Arcade modes" className="arcade-grass px-4 py-8">
          <ol className="flex flex-wrap items-stretch justify-center gap-x-3 gap-y-6">
            {nodes.map((n, i) => (
              <li key={n.mode} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(n.mode)}
                  className={`px-btn flex w-40 flex-col items-center gap-1 py-3 text-center ${i === 0 && isNew ? 'bg-[color:var(--arcade-gold)]' : 'bg-[color:var(--arcade-text)]'}`}
                >
                  <PixelCritter name={n.who} mood="fine" size={56} look={n.look} />
                  <span className="text-sm">
                    {n.number} · {n.title}
                  </span>
                  <span className="font-sans text-xs">{n.status}</span>
                </button>
                {i < nodes.length - 1 && (
                  <span aria-hidden="true" className="hidden text-2xl text-[color:var(--arcade-path)] sm:inline">
                    ···
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <Dialog text={intro} />
      </div>
    </div>
  );
}

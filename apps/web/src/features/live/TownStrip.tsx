import { BASELINE_S, RECENT_S, type ServiceMood } from '@chronolog/engine';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';
import Tock from '../../app/critters/Tock';

/** Log ids are UUIDs; the first characters are enough to tell them apart on screen. */
const SHORT_ID = 6;

/** What Tock says: about the chosen service, else the worst one, else that everyone is fine. */
function tockSays(moods: readonly ServiceMood[], selected: string): { text: string; cites: string[] } {
  const focus = moods.find((m) => m.service === selected) ?? moods[0];
  if (!focus) return { text: `No services have logged in the last ${(RECENT_S + BASELINE_S) / 60} minutes.`, cites: [] };
  if (!selected && focus.mood === 'fine') return { text: moods.length === 1 ? 'The one service logging looks fine.' : `All ${moods.length} services look fine.`, cites: [] };
  return { text: `${focus.service} · ${MOOD_LOOK[focus.mood].label}. ${focus.reason}`, cites: focus.evidenceIds };
}

interface TownStripProps {
  /** From GET /api/moods: computed over the stored logs, not only the lines this page holds. */
  moods: readonly ServiceMood[];
  /** The service the live view is filtered to ('' for all). */
  selected: string;
  onSelect: (service: string) => void;
}

/**
 * Every service as a creature whose face is its mood, with Tock explaining the most worrying one.
 * Clicking a creature filters the stream to that service. Moods describe symptoms: a service that
 * looks fine can still be the cause (a slow service makes its callers sick, not itself).
 */
export default function TownStrip({ moods, selected, onSelect }: TownStripProps) {
  const says = tockSays(moods, selected);

  return (
    <section aria-label="Service moods" className="card flex flex-col gap-3 p-3 md:flex-row md:items-center">
      <div className="flex min-w-0 items-start gap-2 md:w-80 md:shrink-0">
        <Tock size={44} />
        <div className="min-w-0 space-y-1">
        <p aria-live="polite" className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm">
          {says.text}{' '}
          {says.cites.map((id) => (
            <code key={id} title={`Log ${id}`} className="mr-1 inline-block rounded-md border border-ink bg-pastel-sky px-1 text-xs text-on-pastel">
              #{id.slice(0, SHORT_ID)}
            </code>
          ))}
        </p>
        <p className="px-1 text-xs text-text-muted">Faces show symptoms. A slow service can look fine while its callers get sick, so the Root cause view ranks causes.</p>
        </div>
      </div>
      <ul aria-label="Services" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {moods.map((m) => {
          const isSelected = m.service === selected;
          return (
            <li key={m.service} className="shrink-0">
              <button
                type="button"
                aria-pressed={isSelected}
                title={m.reason}
                onClick={() => onSelect(isSelected ? '' : m.service)}
                className={`flex w-24 flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 ${isSelected ? 'border-ink bg-bg-elevated shadow-sticker-sm' : 'border-transparent hover:border-border-dim'}`}
              >
                <Critter name={m.service} mood={m.mood} size={44} decorative />
                <span className="w-full truncate text-xs font-bold">{m.service}</span>
                <span className={`chip ${MOOD_LOOK[m.mood].chip}`}>{MOOD_LOOK[m.mood].label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

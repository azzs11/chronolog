import type { ServiceMood } from '@chronolog/engine';
import { MOOD_LOOK } from '../critters/looks';

/** Moods as a dense table, for the Pro lens: service, mood, why, and the log ids behind it. */
export default function MoodTable({ moods, caption }: { moods: readonly ServiceMood[]; caption: string }) {
  return (
    <div className="lens-pro overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs uppercase tracking-wide text-text-muted">
          <tr className="border-b border-border-dim">
            <th className="row-y pr-3 font-semibold">Service</th>
            <th className="row-y pr-3 font-semibold">Mood</th>
            <th className="row-y pr-3 font-semibold">Why</th>
            <th className="row-y font-semibold">Log ids</th>
          </tr>
        </thead>
        <tbody>
          {moods.map((m) => (
            <tr key={m.service} className="border-b border-border-dim align-top">
              <td className="row-y pr-3 font-mono">{m.service}</td>
              <td className="row-y pr-3">
                <span className={`chip ${MOOD_LOOK[m.mood].chip}`}>{MOOD_LOOK[m.mood].label}</span>
              </td>
              <td className="row-y pr-3 text-text-secondary">{m.reason}</td>
              <td className="row-y font-mono text-xs text-text-muted">{m.evidenceIds.join(' ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

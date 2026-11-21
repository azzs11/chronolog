import { BASELINE_S, RECENT_S, type ServiceMood } from '@chronolog/engine';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';
import Tock from '../../app/critters/Tock';
import { API_URL } from '../../env';
import { CiteChip } from '../incidents/EvidenceBubbles';
import { isEverythingSilent, SILENCE_LINE } from '../moods/silence';
import { useMoods } from '../moods/useMoods';
import { defaultRoadOptions, type GraphData, priorRoads, type RoadOptions, townRoads } from './roads';
import RoadToggles from './RoadToggles';
import MoodTable from '../../app/ui/MoodTable';
import TownGuide from './TownGuide';
import TownMap from './TownMap';

/** The roads are learned from the last 15 minutes (the API's default window). */
const GRAPH_MINUTES = 15;

const isGraph = (v: unknown): v is GraphData =>
  typeof v === 'object' && v !== null && Array.isArray((v as GraphData).services) && Array.isArray((v as GraphData).mentions) && Array.isArray((v as GraphData).correlations);

/** The learned graph, fetched on open and on request (the endpoint has a strict rate limit, so no polling). */
function useGraph(): { graph: GraphData | null; error: string | null; reload: () => void } {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    axios.get(`${API_URL}/api/rca/graph`, { params: { lookback_minutes: GRAPH_MINUTES } }).then(
      (res) => {
        const data: unknown = res.data?.data;
        if (isGraph(data)) {
          setGraph(data);
          setError(null);
        } else setError('unexpected response');
      },
      (err: unknown) => setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? err.message) : 'request failed'),
    );
  }, []);
  useEffect(reload, [reload]);
  return { graph, error, reload };
}

function summary(moods: readonly ServiceMood[]): string {
  const unwell = moods.filter((m) => m.mood !== 'fine');
  if (moods.length === 0) return `Nobody has logged anything in the last ${(RECENT_S + BASELINE_S) / 60} minutes. The town is asleep.`;
  if (unwell.length === 0) return `All ${moods.length} services look fine right now.`;
  if (isEverythingSilent(moods)) return SILENCE_LINE;
  const worst = unwell[0] as ServiceMood;
  return `${unwell.length} of ${moods.length} services look unwell. The most worrying is ${worst.service}: ${worst.reason}`;
}

/**
 * The town right now: every service as a creature with its current mood, on roads learned from the
 * last quarter hour of logs. A place to see the whole system at a glance; the case file is where
 * causes are ranked.
 */
export default function TownPage() {
  const { moods, error: moodError } = useMoods();
  const { graph, error: graphError, reload } = useGraph();
  const [chosenOptions, setRoadOptions] = useState<RoadOptions | null>(null);
  const roadOptions = chosenOptions ?? (graph ? defaultRoadOptions(graph) : { withCorrelations: false, withPrior: false });
  const moodOf = useMemo(() => Object.fromEntries((moods ?? []).map((m) => [m.service, m.mood])), [moods]);
  const services = useMemo(() => [...new Set([...(graph?.services ?? []), ...(moods ?? []).map((m) => m.service)])], [graph, moods]);
  const roads = useMemo(() => (graph ? townRoads(graph, roadOptions) : []), [graph, roadOptions]);
  const hasPrior = priorRoads(services).length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1">
        <h2 className="text-3xl text-text-primary">Town</h2>
        <p className="text-sm text-text-secondary">Every service, how it is doing right now, and which ones seem to talk to each other.</p>
      </header>

      {moodError && !moods && (
        <p role="alert" className="text-sm text-sev-warning">
          Could not load the moods: {moodError}.
        </p>
      )}
      {moods && (
        <div className="flex items-start gap-3">
          <Tock size={52} />
          <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">{summary(moods)}</p>
        </div>
      )}

      {services.length > 0 && (
        <section aria-label="Town map" className="lens-cute card space-y-2 p-2 md:p-4">
          <TownMap services={services} roads={roads} moods={moodOf} label={`Town map: ${(moods ?? []).map((m) => `${m.service} ${MOOD_LOOK[m.mood].label}`).join(', ')}`} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-xs text-text-muted">
            <RoadToggles options={roadOptions} onChange={setRoadOptions} hasPrior={hasPrior} hasCorrelations={(graph?.correlations.length ?? 0) > 0} />
            <span>Roads: last {GRAPH_MINUTES} minutes of logs, not the real architecture.</span>
            <button type="button" className="btn btn-secondary ml-auto" onClick={reload}>
              Redraw roads
            </button>
          </div>
          {graphError && <p className="px-2 text-xs text-sev-warning">Roads unavailable: {graphError}.</p>}
        </section>
      )}

      <div className="lens-cute">
        <TownGuide />
      </div>

      {moods && moods.length > 0 && <MoodTable moods={moods} caption="Every service and its mood" />}
      {moods && moods.length > 0 && (
        <section aria-label="Who is who" className="lens-cute space-y-2">
          <h3 className="text-base text-text-primary">Who&apos;s who</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {moods.map((m) => (
              <li key={m.service} className="card-flat flex items-start gap-3 p-3">
                <Critter name={m.service} mood={m.mood} size={44} decorative />
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold">{m.service}</span>
                    <span className={`chip ${MOOD_LOOK[m.mood].chip}`}>{MOOD_LOOK[m.mood].label}</span>
                  </p>
                  <p className="text-sm text-text-secondary">{m.reason}</p>
                  {m.evidenceIds.length > 0 && (
                    <p className="flex flex-wrap gap-1 text-xs text-text-muted">
                      <span>From</span>
                      {m.evidenceIds.map((id) => (
                        <CiteChip key={id} id={id} />
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">Moods compare the last 2 minutes with the 15 before. They are symptoms: a slow service can look fine while its callers get sick.</p>
        </section>
      )}
    </div>
  );
}

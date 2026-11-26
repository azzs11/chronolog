import Tock from '../../app/critters/Tock';
import Bars, { type BarSeries } from './Bars';
import { type Grade, gradeOf, OKAY_FROM, pairedVerdict, pct, STRONG_FROM, tockSummary } from './grades';
import { REPORT_CARD } from './reportCard';

const REPO_FILE = 'https://github.com/azzs11/chronolog/blob/main/';
const ROOTRANK: BarSeries = { key: 'rootrank', label: 'RootRank', fill: 'bg-chart-ours' };
const FIRST_ERROR: BarSeries = { key: 'firstError', label: 'First error (simple rule)', fill: 'bg-chart-other' };
const PAIR = [ROOTRANK, FIRST_ERROR] as const;
const GRADE_CHIP: Record<Grade, string> = { Strong: 'bg-pastel-mint', Okay: 'bg-pastel-butter', Weak: 'bg-pastel-pink' };

function GradeChip({ rate }: { rate: number }) {
  const grade = gradeOf(rate);
  return <span className={`chip ${GRADE_CHIP[grade]}`}>{grade}</span>;
}

function Subject({ title, note, file, children }: { title: string; note: string; file: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="card space-y-3">
      <h3 className="text-xl text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary">{note}</p>
      {children}
      <p className="text-xs text-text-muted">
        Source:{' '}
        <a className="underline" href={`${REPO_FILE}${file}`}>
          {file}
        </a>
      </p>
    </section>
  );
}

type PairRow = { name: string; rootrank: number; firstError: number; cases?: number };
const pairRows = (rows: readonly PairRow[], graded = true) =>
  rows.map((r) => ({
    name: r.name,
    values: { rootrank: r.rootrank, firstError: r.firstError },
    aside: (
      <>
        {r.cases !== undefined && <span className="text-xs text-text-muted">{r.cases} incidents</span>}
        {graded && <GradeChip rate={r.rootrank} />}
      </>
    ),
  }));

/**
 * The benchmark as a school report card, bad grades included. Every number comes from the generated
 * REPORT_CARD (bench/results), with its dataset named; nothing here is typed in by hand.
 */
export default function ReportCardPage() {
  const card = REPORT_CARD;
  const clean = card.robustness.find((r) => r.name === 'clean');
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h2 className="text-3xl text-text-primary">Report card</h2>
        <p className="text-sm text-text-secondary">
          How often ChronoLog finds the real cause, measured on {card.dataset}. Grades: strong from {pct(STRONG_FROM)}, okay from {pct(OKAY_FROM)}, weak below.
        </p>
      </header>

      <div className="flex items-start gap-3">
        <Tock size={56} />
        <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">{tockSummary(card)}</p>
      </div>

      <Subject title="Overall" note={card.protocol} file={card.files.ranking}>
        <Bars
          label="Top-3 hit rate by method"
          series={[{ key: 'value', label: 'Top-3 hit rate', fill: 'bg-chart-other' }]}
          rows={card.headline.map((r) => ({
            name: r.name,
            values: { value: r.value },
            low: r.low,
            high: r.high,
            fill: r.isOurs ? 'bg-chart-ours' : undefined,
            aside: r.isOurs ? <span className="chip bg-pastel-pink">ChronoLog today</span> : undefined,
          }))}
        />
        <p className="text-xs text-text-muted">The black whiskers are 95% intervals. Random guessing has no interval: it is averaged over 5 seeds.</p>
      </Subject>

      <Subject
        title="The faces"
        note="The creatures' moods used as a ranking: services in the order they first look unwell after the fault. No training, so every incident is new to them."
        file={card.files.faces}
      >
        <Bars
          label="Faces against RootRank"
          series={[
            { key: 'rootrank', label: 'RootRank', fill: 'bg-chart-ours' },
            { key: 'faces', label: 'Faces (first to look unwell)', fill: 'bg-chart-other' },
          ]}
          rows={[
            // RootRank's means on the same incidents = faces + the paired difference (exact).
            { name: 'Right service first (AC@1)', values: { rootrank: card.faces.ac1.value + card.faces.rootrankMinusFacesAc1.value, faces: card.faces.ac1.value } },
            { name: 'Right service in the top 3 (AC@3)', values: { rootrank: card.faces.ac3.value + card.faces.rootrankMinusFacesAc3.value, faces: card.faces.ac3.value } },
          ]}
        />
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
          <li>Top 3: {pairedVerdict(card.faces.rootrankMinusFacesAc3, 'RootRank', 'The faces')}</li>
          <li>Top 1: {pairedVerdict(card.faces.rootrankMinusFacesAc1, 'RootRank', 'The faces')} The gap is {(100 * card.faces.rootrankMinusFacesAc1.value).toFixed(1)} points in RootRank's favour.</li>
          <li>
            The broken service looks unwell within 5 minutes in {pct(card.faces.rootUnwellWithin5Min)} of incidents
            {card.faces.medianDelaySeconds !== null ? `, after a median of ${card.faces.medianDelaySeconds} s` : ''}.
          </li>
          <li>Before anything broke, {pct(card.faces.unwellBeforeFault)} of services already looked unwell (false alarms).</li>
        </ul>
      </Subject>

      <Subject title="By kind of fault" note="Code changes make a service log brand-new messages after a restart, which is easy to spot. Resource faults are the hard part." file={card.files.breakdown}>
        <Bars label="Top-3 hit rate by kind of fault" series={PAIR} rows={pairRows(card.byKind)} />
        <h4 className="text-sm font-bold text-text-primary">Resource faults, one by one</h4>
        <Bars label="Top-3 hit rate by fault" series={PAIR} rows={pairRows(card.byFault.filter((r) => !r.name.startsWith('Code')))} />
      </Subject>

      <Subject title="By system" note="The three microservice demo systems in RCAEval." file={card.files.breakdown}>
        <Bars label="Top-3 hit rate by system" series={PAIR} rows={pairRows(card.bySystem)} />
      </Subject>

      <Subject
        title="With messy logs"
        note={`Lines dropped, gaps and clock skew, applied to the held-out incidents only.${clean ? ` Clean logs score ${pct(clean.rootrank)}.` : ''}`}
        file={card.files.robustness}
      >
        <Bars label="Top-3 hit rate with degraded logs" series={PAIR} rows={pairRows(card.robustness, false)} />
      </Subject>

      <Subject
        title="Spotting trouble at all"
        note={`F1 on ${card.anomalyDataset}; the new detectors learn from the first half without labels. The new signals beat the old rules, but on BGL a plain severity rule still beats them all.`}
        file={card.files.anomaly}
      >
        {card.anomaly.map((d) => (
          <div key={d.dataset} className="space-y-2">
            <h4 className="text-sm font-bold text-text-primary">{d.dataset}</h4>
            <Bars
              label={`F1 on ${d.dataset}`}
              series={[{ key: 'f1', label: 'F1', fill: 'bg-chart-other' }]}
              rows={[...d.methods].sort((a, b) => b.f1 - a.f1).map((m) => ({ name: m.name, values: { f1: m.f1 } }))}
            />
          </div>
        ))}
      </Subject>

      <p className="text-xs text-text-muted">
        Reproduce every number with <code className="log-text">uv run bench all --subset full</code> and the other <code className="log-text">bench</code> commands; the
        card is regenerated by <code className="log-text">uv run bench export-facts</code>.
      </p>
    </div>
  );
}

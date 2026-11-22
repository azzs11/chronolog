import { Monitor, Moon, Rows3, Search, Sun, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { fetchIncidents, type IncidentSummary } from '../features/incidents/api';
import Onboarding, { shouldShowIntro } from './onboarding/Onboarding';
import CommandPalette from './palette/CommandPalette';
import { type Command, isLensShortcut, isPaletteShortcut } from './palette/commands';
import Tock from './critters/Tock';
import DemoNotice from '../demo/DemoNotice';
import { NAV_ITEMS } from './nav';
import { type Density, type Lens, type Theme, usePreferences } from './preferences';

const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
];

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex-1 flex-col items-center gap-1 rounded-xl border-2 px-2 py-1.5 text-xs font-bold transition-transform md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm ${
    isActive
      ? 'border-ink bg-pastel-butter text-on-pastel shadow-sticker-sm'
      : 'border-transparent text-text-secondary hover:-translate-y-px hover:border-border-dim hover:text-text-primary'
  }`;

/** The wordmark: Tock and the name in the display face. */
function Wordmark() {
  return (
    <span className="hidden items-center gap-2 px-2 pb-4 pt-1 md:flex">
      <Tock size={36} />
      <span className="font-display text-xl">ChronoLog</span>
    </span>
  );
}

/**
 * The frame every view lives in: a nav rail on wide screens, a bottom tab bar on phones, and a thin
 * header with the display preferences. Views fill the main area and may split it into a list and a
 * detail pane.
 */
const ARCADE_TABS = [
  ['training', 'Training Town', 'learn tutorial how to'],
  ['daily', 'Daily case', 'puzzle game today'],
  ['real', 'Real systems', 'rcaeval real incidents'],
  ['team', 'Team drills', 'practice on-call our incidents'],
  ['sandbox', 'Break something', 'simulated faults sandbox playground'],
] as const;
const RECENT_INCIDENTS = 5;

/** The palette's commands: views, Arcade games, display settings and the latest incidents. */
function useCommands(isOpen: boolean, setPreferences: (p: { theme?: Theme; density?: Density; lens?: Lens }) => void): Command[] {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  useEffect(() => {
    if (isOpen) fetchIncidents().then((list) => setIncidents(list.slice(0, RECENT_INCIDENTS)), () => setIncidents([]));
  }, [isOpen]);
  return useMemo(
    () => [
      ...NAV_ITEMS.map((item) => ({ id: `go${item.path}`, label: item.label, group: 'Go to', run: () => navigate(item.path) })),
      ...ARCADE_TABS.map(([tab, label, keywords]) => ({ id: `arcade-${tab}`, label, group: 'Arcade', keywords, run: () => navigate(`/arcade?mode=${tab}`) })),
      { id: 'analyse-files', label: 'Analyse my log files', group: 'Go to', keywords: 'drop upload files local', run: () => navigate('/root-cause#files') },
      ...incidents.map((i) => ({ id: `inc-${i.id}`, label: `${i.services.map((s) => s.service).join(', ')} · ${new Date(i.start).toLocaleTimeString()}`, group: 'Incidents', keywords: i.id, run: () => navigate(`/incidents/${i.id}`) })),
      ...THEMES.map(({ value, label }) => ({ id: `theme-${value}`, label, group: 'Display', keywords: value === 'dark' ? 'night' : value === 'light' ? 'day' : '', run: () => setPreferences({ theme: value }) })),
      { id: 'lens-pro', label: 'Pro lens: tables instead of the town', group: 'Display', keywords: 'dense table serious plain hide creatures', run: () => setPreferences({ lens: 'pro', density: 'compact' }) },
      { id: 'lens-town', label: 'Town lens: creatures and maps', group: 'Display', keywords: 'cute creatures map', run: () => setPreferences({ lens: 'town' }) },
      { id: 'density-compact', label: 'Compact rows', group: 'Display', keywords: 'density pro', run: () => setPreferences({ density: 'compact' }) },
      { id: 'density-comfortable', label: 'Comfortable rows', group: 'Display', keywords: 'density', run: () => setPreferences({ density: 'comfortable' }) },
    ],
    [navigate, incidents, setPreferences],
  );
}

export default function Shell() {
  const [preferences, setPreferences] = usePreferences();
  const nextDensity: Density = preferences.density === 'comfortable' ? 'compact' : 'comfortable';
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const commands = useCommands(isPaletteOpen, setPreferences);
  const [isIntroOpen, setIntroOpen] = useState(shouldShowIntro);
  const navigate = useNavigate();
  /** The Pro lens also turns on compact rows; turning it off leaves density as the reader set it. */
  const setLens = (lens: Lens) => setPreferences(lens === 'pro' ? { lens, density: 'compact' } : { lens });
  const lensRef = useRef(preferences.lens);
  lensRef.current = preferences.lens;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteShortcut(e)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (isLensShortcut(e)) {
        e.preventDefault();
        setPreferences(lensRef.current === 'pro' ? { lens: 'town' } : { lens: 'pro', density: 'compact' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPreferences]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>

      <nav
        aria-label="Main"
        className="order-last flex shrink-0 justify-around gap-1 border-t-2 border-ink bg-bg-surface p-1.5 md:order-first md:w-56 md:flex-col md:justify-start md:gap-1.5 md:border-r-2 md:border-t-0 md:p-3"
      >
        <Wordmark />
        {NAV_ITEMS.map(({ path, label, shortLabel, icon: Icon, hideOnPhone }) => (
          <NavLink key={path} to={path} className={(state) => `${hideOnPhone ? 'hidden md:flex' : 'flex'} ${linkClass(state)}`}>
            <Icon size={18} aria-hidden="true" />
            {shortLabel ? (
              <>
                <span className="md:hidden">{shortLabel}</span>
                <span className="hidden md:inline">{label}</span>
              </>
            ) : (
              <span>{label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end gap-2 px-4 py-2">
          <button type="button" onClick={() => setPaletteOpen(true)} className="btn btn-secondary mr-auto md:mr-0" aria-keyshortcuts="Meta+K Control+K">
            <Search size={16} aria-hidden="true" />
            Ask Tock
            <kbd className="hidden rounded border border-border-dim px-1 text-xs text-text-muted md:inline">⌘K</kbd>
          </button>
          <fieldset className="flex overflow-hidden rounded-xl border-2 border-ink bg-bg-surface shadow-sticker-sm">
            <legend className="sr-only">Theme</legend>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={preferences.theme === value}
                title={label}
                onClick={() => setPreferences({ theme: value })}
                className={`p-2 ${preferences.theme === value ? 'bg-pastel-lilac text-on-pastel' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            aria-label={`Switch to ${nextDensity} density`}
            aria-pressed={preferences.density === 'compact'}
            title={`Density: ${preferences.density}`}
            onClick={() => setPreferences({ density: nextDensity })}
            className={`rounded-xl border-2 border-ink p-2 shadow-sticker-sm ${preferences.density === 'compact' ? 'bg-pastel-lilac text-on-pastel' : 'bg-bg-surface text-text-secondary'}`}
          >
            <Rows3 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={preferences.lens === 'pro'}
            aria-keyshortcuts="Shift+P"
            title="Pro lens: the same data as dense tables (Shift+P)"
            onClick={() => setLens(preferences.lens === 'pro' ? 'town' : 'pro')}
            className={`flex items-center gap-1.5 rounded-xl border-2 border-ink px-2 py-1.5 text-sm font-bold shadow-sticker-sm ${preferences.lens === 'pro' ? 'bg-pastel-lilac text-on-pastel' : 'bg-bg-surface text-text-secondary'}`}
          >
            <Table2 size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Pro lens</span>
            <span className="sr-only sm:hidden">Pro lens</span>
          </button>
        </header>
        {import.meta.env.VITE_DEMO === 'true' && <DemoNotice />}
        {isIntroOpen && (
          <Onboarding
            onFinish={(play) => {
              setIntroOpen(false);
              if (play) navigate('/arcade?mode=training');
            }}
          />
        )}
        <CommandPalette isOpen={isPaletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
